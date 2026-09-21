import { NextApiRequest, NextApiResponse } from "next";

import { execFile } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";

import { DocumentPage } from "@prisma/client";
import { get } from "@vercel/edge-config";
import { waitUntil } from "@vercel/functions";
import * as mupdf from "mupdf";

import { putFileServer } from "@/lib/files/put-file-server";
import prisma from "@/lib/prisma";
import { log } from "@/lib/utils";

const execFileAsync = promisify(execFile);

// This function can run for a maximum of 120 seconds
export const config = {
  maxDuration: 180,
};

// mupdf warning strings that indicate the source PDF has a malformed/corrupted
// image stream (most commonly from aggressive PDF compression tools like
// Acrobat's PDF Optimizer producing a non-conformant stream length). mupdf's
// decoder is strict about these and aborts partway through, leaving garbage
// pixel data in the render. Other renderers (Preview, Acrobat, poppler) are
// more tolerant and decode the same stream cleanly, so when we see one of
// these warnings we re-render the page with poppler instead of trusting
// mupdf's output. See build-status.md, 2026-09-21, for the investigation.
const CORRUPTION_WARNING_PATTERNS = [
  "premature end of data in flate filter",
  "premature end of data in jbig2",
  "premature end of data in jpx",
  "error: format error",
  "broken jpx",
  "broken jbig2",
];

// Runs `fn` while capturing anything mupdf writes to stdout/stderr (mupdf's
// native warnings are surfaced this way, not as thrown errors), and reports
// whether any capture line matched a known corruption warning.
async function runWithMupdfWarningCapture<T>(
  fn: () => T,
): Promise<{ result: T; hasCorruptionWarning: boolean; warnings: string[] }> {
  const warnings: string[] = [];
  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  const origStderrWrite = process.stderr.write.bind(process.stderr);

  const capture = (chunk: unknown) => {
    warnings.push(String(chunk));
  };

  process.stdout.write = ((chunk: unknown, ...args: unknown[]) => {
    capture(chunk);
    return (origStdoutWrite as any)(chunk, ...args);
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown, ...args: unknown[]) => {
    capture(chunk);
    return (origStderrWrite as any)(chunk, ...args);
  }) as typeof process.stderr.write;

  try {
    const result = fn();
    const hasCorruptionWarning = warnings.some((w) =>
      CORRUPTION_WARNING_PATTERNS.some((pattern) => w.includes(pattern)),
    );
    return { result, hasCorruptionWarning, warnings };
  } finally {
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
  }
}

// Fallback renderer for pages where mupdf reports a corrupted image stream.
// Shells out to poppler's pdftoppm (a different, more tolerant PDF decoder)
// to rasterize just this one page, at roughly the same DPI mupdf would have
// used (72pt/inch * scaleFactor). Requires poppler-utils installed on the
// server (`apt install poppler-utils`).
async function renderPageWithPoppler(
  pdfData: ArrayBuffer,
  pageNumber: number,
  scaleFactor: number,
): Promise<Buffer> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pdf-fallback-"));
  const pdfPath = path.join(tmpDir, "input.pdf");
  const outputPrefix = path.join(tmpDir, "page");
  const dpi = Math.round(72 * scaleFactor);

  try {
    await fs.writeFile(pdfPath, Buffer.from(pdfData));

    await execFileAsync("pdftoppm", [
      "-f",
      String(pageNumber),
      "-l",
      String(pageNumber),
      "-r",
      String(dpi),
      "-jpeg",
      "-jpegopt",
      "quality=80",
      pdfPath,
      outputPrefix,
    ]);

    const files = await fs.readdir(tmpDir);
    const outputFile = files.find(
      (f) => f.startsWith("page") && /\.jpe?g$/.test(f),
    );
    if (!outputFile) {
      throw new Error(
        "poppler fallback: no output file produced (is poppler-utils installed?)",
      );
    }

    return await fs.readFile(path.join(tmpDir, outputFile));
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

// Classic 8x8 Bayer ordered-dither threshold matrix (values 0-63). Tiled
// across the image, it gives each pixel a small, deterministic offset that
// breaks up hard color steps without adding visible grain or requiring a
// per-pixel RNG call (fast: ~50ms for a 2000x1125 page).
const BAYER_8X8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

// Applies a subtle Bayer dither to every color channel of a rendered
// pixmap, in place. Very gentle/long color gradients (common in flattened
// background illustrations exported from design tools) can't be
// represented smoothly in 8-bit color and render with visible stepped
// banding -- confirmed this is true across different PDF renderers
// (mupdf and poppler both show identical banding on the same source
// gradient), so it isn't a corruption/decoder issue like the one above,
// just an 8-bit precision limit. A tiny amount of dither noise
// decorrelates the quantization error that otherwise shows up as hard
// color steps. Pixmap.getPixels() returns a live view into mupdf's own
// pixel buffer (confirmed empirically -- mutating it changes what
// asPNG()/asJPEG() subsequently encode), so no copy/re-set step is
// needed. See build-status.md, 2026-09-21, for the investigation.
function applyDitherToPixmap(
  pixmap: mupdf.Pixmap,
  ditherAmplitude: number = 2,
): void {
  const pixels = pixmap.getPixels();
  const width = pixmap.getWidth();
  const height = pixmap.getHeight();
  const stride = pixmap.getStride();
  const numComponents = pixmap.getNumberOfComponents();
  const hasAlpha = pixmap.getAlpha() !== 0;
  const colorComponents = hasAlpha ? numComponents - 1 : numComponents;

  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    const bayerRow = BAYER_8X8[y & 7];
    for (let x = 0; x < width; x++) {
      const noise = (bayerRow[x & 7] / 63 - 0.5) * 2 * ditherAmplitude;
      const pixelStart = rowStart + x * numComponents;
      for (let c = 0; c < colorComponents; c++) {
        const idx = pixelStart + c;
        const value = pixels[idx] + noise;
        pixels[idx] = value < 0 ? 0 : value > 255 ? 255 : value;
      }
    }
  }
}

export default async (req: NextApiRequest, res: NextApiResponse) => {
  // check if post method
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  // Extract the API Key from the Authorization header
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1]; // Assuming the format is "Bearer [token]"

  // Check if the API Key matches
  if (token !== process.env.INTERNAL_API_KEY) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const { documentVersionId, pageNumber, url, teamId, trustedTeam } =
    req.body as {
      documentVersionId: string;
      pageNumber: number;
      url: string;
      teamId: string;
      trustedTeam?: boolean;
    };

  try {
    // Fetch the PDF data
    let response: Response;
    try {
      response = await fetch(url);
    } catch (error) {
      log({
        message: `Failed to fetch PDF in conversion process with error: \n\n Error: ${error} \n\n \`Metadata: {teamId: ${teamId}, documentVersionId: ${documentVersionId}, pageNumber: ${pageNumber}}\``,
        type: "error",
        mention: true,
      });
      throw new Error(`Failed to fetch pdf on document page ${pageNumber}`);
    }

    // Convert the response to a buffer
    const pdfData = await response.arrayBuffer();
    // Create a MuPDF instance
    var doc = new mupdf.PDFDocument(pdfData);
    console.log("Original document size:", pdfData.byteLength);

    const page = doc.loadPage(pageNumber - 1); // 0-based page index
    // get the bounds of the page for orientation and scaling
    const bounds = page.getBounds();
    const [ulx, uly, lrx, lry] = bounds;
    const widthInPoints = Math.abs(lrx - ulx);
    const heightInPoints = Math.abs(lry - uly);

    // Validate document dimensions
    if (widthInPoints <= 0 || heightInPoints <= 0) {
      throw new Error(
        `Invalid page dimensions: ${widthInPoints} × ${heightInPoints} points`,
      );
    }

    // Log original dimensions for debugging
    console.log(
      `Original page dimensions: ${widthInPoints} × ${heightInPoints} points (${(widthInPoints / 72).toFixed(1)}" × ${(heightInPoints / 72).toFixed(1)}")`,
    );

    if (pageNumber === 1) {
      // get the orientation of the document and update document version
      const isVertical = heightInPoints > widthInPoints;

      await prisma.documentVersion.update({
        where: { id: documentVersionId },
        data: { isVertical },
      });
    }

    // Calculate optimal scale factor based on document dimensions and memory constraints
    const getOptimalScaleFactor = (width: number, height: number): number => {
      // Maximum reasonable pixel dimensions to prevent memory issues
      const MAX_PIXEL_DIMENSION = 8000;
      const MAX_TOTAL_PIXELS = 32_000_000; // ~32MP to stay within memory limits

      // Start with default scaling logic
      // Note: Avoid scale factor 3 exactly due to mupdf 1.26.4 rendering bug with tiling patterns
      let scaleFactor = width >= 1600 ? 2 : 2.95;

      // Check if scaled dimensions would exceed limits
      const scaledWidth = width * scaleFactor;
      const scaledHeight = height * scaleFactor;
      const totalPixels = scaledWidth * scaledHeight;

      // Reduce scale factor if dimensions are too large
      if (
        scaledWidth > MAX_PIXEL_DIMENSION ||
        scaledHeight > MAX_PIXEL_DIMENSION ||
        totalPixels > MAX_TOTAL_PIXELS
      ) {
        // Calculate maximum safe scale factor
        const maxScaleByWidth = MAX_PIXEL_DIMENSION / width;
        const maxScaleByHeight = MAX_PIXEL_DIMENSION / height;
        const maxScaleByTotal = Math.sqrt(MAX_TOTAL_PIXELS / (width * height));

        scaleFactor = Math.min(
          maxScaleByWidth,
          maxScaleByHeight,
          maxScaleByTotal,
        );

        // Ensure minimum scale factor of 1
        scaleFactor = Math.max(1, Math.floor(scaleFactor * 10) / 10); // Round down to 1 decimal

        console.log(
          `Large document detected. Reduced scale factor from ${width >= 1600 ? 2 : 2.95} to ${scaleFactor}`,
        );
      }

      return scaleFactor;
    };

    const scaleFactor = getOptimalScaleFactor(widthInPoints, heightInPoints);
    const doc_to_screen = mupdf.Matrix.scale(scaleFactor, scaleFactor);

    console.log("Scale factor:", scaleFactor);
    console.log(
      "Final dimensions:",
      `${widthInPoints * scaleFactor} × ${heightInPoints * scaleFactor}`,
    );

    // get links
    const links = page.getLinks();
    const embeddedLinks = links.map((link) => {
      const coords = link.getBounds().join(",");

      // Check if this is an internal link (GoTo action for TOC, etc.)
      if (!link.isExternal()) {
        try {
          // Resolve internal link to page number (0-indexed from mupdf)
          const targetPage = doc.resolveLink(link);
          if (targetPage >= 0) {
            return {
              href: `#page=${targetPage + 1}`, // Convert to 1-indexed for frontend
              coords,
              isInternal: true,
              targetPage: targetPage + 1,
            };
          }
        } catch (e) {
          console.log("Failed to resolve internal link:", e);
        }
        // Fallback for unresolvable internal links
        return { href: "", coords, isInternal: true };
      }

      // External URI link
      return { href: link.getURI(), coords, isInternal: false };
    });

    // Check embedded links for blocked keywords (skip for trusted teams)
    if (embeddedLinks.length > 0 && !trustedTeam) {
      try {
        const keywords = await get("keywords");
        if (Array.isArray(keywords) && keywords.length > 0) {
          for (const link of embeddedLinks) {
            if (link.href) {
              const matchedKeyword = keywords.find(
                (keyword) =>
                  typeof keyword === "string" &&
                  link.href.toLowerCase().includes(keyword.toLowerCase()),
              );

              if (matchedKeyword) {
                waitUntil(
                  log({
                    message: `Document processing blocked: ${matchedKeyword} \n\n \`Metadata: {teamId: ${teamId}, documentVersionId: ${documentVersionId}, pageNumber: ${pageNumber}}\``,
                    type: "error",
                    mention: true,
                  }),
                );
                res.status(400).json({
                  error: "Document processing blocked",
                  matchedUrl: link.href,
                  matchedKeyword: matchedKeyword,
                  pageNumber: pageNumber,
                });
                return;
              }
            }
          }
        }
      } catch (error) {
        // Log error but continue processing if check fails
        console.log("Failed to check keywords:", error);
      }
    }

    // Will be updated if we use a reduced scale factor
    let actualScaleFactor = scaleFactor;

    const metadata = {
      originalWidth: widthInPoints,
      originalHeight: heightInPoints,
      width: widthInPoints * actualScaleFactor,
      height: heightInPoints * actualScaleFactor,
      scaleFactor: actualScaleFactor,
    };

    // Estimate memory usage before creating pixmap
    const finalWidth = Math.floor(widthInPoints * scaleFactor);
    const finalHeight = Math.floor(heightInPoints * scaleFactor);
    const estimatedMemoryMB = (finalWidth * finalHeight * 3) / (1024 * 1024); // RGB = 3 bytes per pixel

    console.log(
      `Estimated memory usage: ${estimatedMemoryMB.toFixed(1)}MB for ${finalWidth} × ${finalHeight} pixels`,
    );

    // Warn if memory usage is high
    if (estimatedMemoryMB > 200) {
      console.warn(
        `High memory usage expected: ${estimatedMemoryMB.toFixed(1)}MB. Consider reducing document size.`,
      );
    }

    console.time("toPixmap");
    let scaledPixmap;
    let mupdfHadCorruptionWarning = false;
    try {
      const capture = await runWithMupdfWarningCapture(() =>
        page.toPixmap(doc_to_screen, mupdf.ColorSpace.DeviceRGB, false, true),
      );
      scaledPixmap = capture.result;
      mupdfHadCorruptionWarning = capture.hasCorruptionWarning;
      if (mupdfHadCorruptionWarning) {
        console.warn(
          `mupdf reported a corrupted image stream on page ${pageNumber}, will fall back to poppler:`,
          capture.warnings.filter((w) =>
            CORRUPTION_WARNING_PATTERNS.some((p) => w.includes(p)),
          ),
        );
      }
    } catch (error) {
      // If pixmap creation fails, try with a smaller scale factor
      console.error(
        "Pixmap creation failed, attempting with reduced scale factor:",
        error,
      );
      const reducedScaleFactor = Math.max(1, scaleFactor * 0.5);
      console.log(`Retrying with reduced scale factor: ${reducedScaleFactor}`);

      const reduced_doc_to_screen = mupdf.Matrix.scale(
        reducedScaleFactor,
        reducedScaleFactor,
      );
      const capture = await runWithMupdfWarningCapture(() =>
        page.toPixmap(
          reduced_doc_to_screen,
          mupdf.ColorSpace.DeviceRGB,
          false,
          true,
        ),
      );
      scaledPixmap = capture.result;
      mupdfHadCorruptionWarning = capture.hasCorruptionWarning;

      // Update metadata with actual scale factor used
      actualScaleFactor = reducedScaleFactor;
      metadata.width = widthInPoints * actualScaleFactor;
      metadata.height = heightInPoints * actualScaleFactor;
      metadata.scaleFactor = actualScaleFactor;
      console.log(
        "Successfully created pixmap with reduced scale factor:",
        actualScaleFactor,
      );
    }
    console.timeEnd("toPixmap");

    console.time("dither");
    applyDitherToPixmap(scaledPixmap);
    console.timeEnd("dither");

    let chosenBuffer: Buffer | Uint8Array;
    let chosenFormat: string;

    if (mupdfHadCorruptionWarning) {
      // mupdf's decoder choked on an image stream on this page. Re-render
      // the page with poppler (pdftoppm), which is more tolerant of the
      // kind of malformed streams that non-conformant PDF exporters (e.g.
      // Acrobat's PDF Optimizer) sometimes produce.
      console.time("popplerFallback");
      try {
        chosenBuffer = await renderPageWithPoppler(
          pdfData,
          pageNumber,
          actualScaleFactor,
        );
        chosenFormat = "jpeg";
        console.log(
          `Used poppler fallback for page ${pageNumber} due to mupdf stream warning`,
        );
      } catch (fallbackError) {
        // If the fallback itself fails (e.g. poppler-utils not installed),
        // log it clearly and fall back to mupdf's own (possibly glitched)
        // output rather than failing the whole page.
        log({
          message: `Poppler fallback failed for page ${pageNumber}, using mupdf output despite corruption warning: \n\n Error: ${fallbackError} \n\n \`Metadata: {teamId: ${teamId}, documentVersionId: ${documentVersionId}, pageNumber: ${pageNumber}}\``,
          type: "error",
          mention: true,
        });
        const pngBuffer = scaledPixmap.asPNG();
        const jpegBuffer = scaledPixmap.asJPEG(80, false);
        if (pngBuffer.byteLength < jpegBuffer.byteLength) {
          chosenBuffer = pngBuffer;
          chosenFormat = "png";
        } else {
          chosenBuffer = jpegBuffer;
          chosenFormat = "jpeg";
        }
      }
      console.timeEnd("popplerFallback");
    } else {
      console.time("compare");
      console.time("asPNG");
      const pngBuffer = scaledPixmap.asPNG(); // as PNG
      console.timeEnd("asPNG");
      console.time("asJPEG");
      const jpegBuffer = scaledPixmap.asJPEG(80, false); // as JPEG
      console.timeEnd("asJPEG");

      const pngSize = pngBuffer.byteLength;
      const jpegSize = jpegBuffer.byteLength;

      if (pngSize < jpegSize) {
        chosenBuffer = pngBuffer;
        chosenFormat = "png";
      } else {
        chosenBuffer = jpegBuffer;
        chosenFormat = "jpeg";
      }
      console.timeEnd("compare");
    }

    console.log("Chosen format:", chosenFormat);

    let buffer = Buffer.from(chosenBuffer);

    // get docId from url with starts with "doc_" with regex
    const match = url.match(/(doc_[^\/]+)\//);
    const docId = match ? match[1] : undefined;

    const { type, data } = await putFileServer({
      file: {
        name: `page-${pageNumber}.${chosenFormat}`,
        type: `image/${chosenFormat}`,
        buffer: buffer,
      },
      teamId: teamId,
      docId: docId,
    });

    buffer = Buffer.alloc(0); // free memory
    chosenBuffer = Buffer.alloc(0); // free memory
    scaledPixmap.destroy(); // free memory
    page.destroy(); // free memory

    if (!data || !type) {
      throw new Error(`Failed to upload document page ${pageNumber}`);
    }

    let documentPage: DocumentPage | null = null;

    // Check if a documentPage with the same pageNumber and versionId already exists
    const existingPage = await prisma.documentPage.findUnique({
      where: {
        pageNumber_versionId: {
          pageNumber: pageNumber,
          versionId: documentVersionId,
        },
      },
    });

    if (!existingPage) {
      // Only create a new documentPage if it doesn't already exist
      documentPage = await prisma.documentPage.create({
        data: {
          versionId: documentVersionId,
          pageNumber: pageNumber,
          file: data,
          storageType: type,
          pageLinks: embeddedLinks,
          metadata: metadata,
        },
      });
    } else {
      documentPage = existingPage;
    }

    // Send the images as a response
    res.status(200).json({ documentPageId: documentPage.id });
    return;
  } catch (error) {
    log({
      message: `Failed to convert page with error: \n\n Error: ${error} \n\n \`Metadata: {teamId: ${teamId}, documentVersionId: ${documentVersionId}, pageNumber: ${pageNumber}}\``,
      type: "error",
      mention: true,
    });
    throw error;
  }
};
