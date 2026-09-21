import { NextApiRequest, NextApiResponse } from "next";

import { DocumentPage } from "@prisma/client";
import { get } from "@vercel/edge-config";
import { waitUntil } from "@vercel/functions";
import { execFile } from "child_process";
import * as fs from "fs/promises";
import * as mupdf from "mupdf";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";

import { getCachedPdfPath } from "@/lib/documents/pdf-cache";
import { putFileServer } from "@/lib/files/put-file-server";
import prisma from "@/lib/prisma";
import { log } from "@/lib/utils";

const execFileAsync = promisify(execFile);

// This function can run for a maximum of 120 seconds
export const config = {
  maxDuration: 180,
};

// --- PRIMARY renderer: Ghostscript at 16 bit/channel + dither (2026-09-21) ---
//
// Why a third renderer, after poppler had just replaced mupdf the same day:
// poppler fixed page 1 of the services book (where mupdf's 8-bit soft-mask
// compositing rounded a same-colour-over-itself fade into ±1-level steps)
// but NOT pages 37-39. Those pages carry a genuine, very subtle gradient
// (#2E4F66 fading into #224B66: ~12 levels of red, ~4 of green across
// ~500 px). Any renderer that outputs 8-bit colour without dithering has to
// draw that as wide plateaus with 1-level steps, and because R and G step
// on different rows the plateaus shift hue -- the "thick discoloured
// lines". poppler, mupdf and Ghostscript-at-8-bit all do this; Acrobat and
// Preview hide it by dithering. Dithering an 8-bit render after the fact
// does nothing (the sub-level information is already gone), so the only
// real fix is to render with more than 8 bits and dither on the way down.
// Ghostscript's tiff48nc device is the cheapest 16-bit rasterizer we can
// shell out to (uncompressed TIFF: ~1.0s/page here vs ~1.5s for pdftoppm's
// PPM; png48 is slower because of the PNG encode). sharp reads it as
// ushort, ditherTo8Bit() below adds ±1 LSB triangular noise to pixels that
// sit on a gentle slope only, and sharp encodes the 8-bit result.
//
// Verified on the services book: page 1 flat, page 37 smooth under a ×10
// contrast stretch. Text/photo pages look the same as poppler's output.
//
// Falls through to poppler, then mupdf, if `gs` is missing or errors.
// Set PDF_RENDERER=poppler to skip Ghostscript entirely.

function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 16-bit RGB samples -> 8-bit. A sample is dithered (±1 LSB, triangular
// distribution: rand() - rand()) only when it sits on a gentle slope, i.e.
// it differs from the sample DITHER_LOOKBACK rows above or columns to the
// left by a non-zero amount smaller than two 8-bit levels. Flat fills and
// hard edges are rounded plainly. This keeps solid areas noise-free so PNG
// output for simple pages stays as small as before (dithering every pixel
// tripled PNG size on a text page), while gradients get the noise that
// hides their 8-bit steps. The look-back distance is larger than 1 because
// Ghostscript evaluates shadings in small plateaus (~4 px at 2x), and a
// 1-px look-back would leave every other plateau row undithered.
const DITHER_LOOKBACK_PX = 8;
const DITHER_SLOPE_LIMIT = 257 * 2; // two 8-bit levels, in 16-bit units

function ditherTo8Bit(u16: Uint16Array, width: number, seed: number): Buffer {
  const out = Buffer.allocUnsafe(u16.length);
  const rand = mulberry32(seed);
  const stride = width * 3;
  const back = DITHER_LOOKBACK_PX * stride;
  const left = DITHER_LOOKBACK_PX * 3;
  const T = DITHER_SLOPE_LIMIT;

  for (let i = 0; i < u16.length; i++) {
    const v = u16[i];
    let slope = false;
    if (i >= back) {
      const d = v - u16[i - back];
      slope = d !== 0 && d > -T && d < T;
    }
    if (!slope) {
      const x = ((i / 3) | 0) % width;
      if (x >= DITHER_LOOKBACK_PX) {
        const d = v - u16[i - left];
        slope = d !== 0 && d > -T && d < T;
      }
    }
    let q = v / 257;
    if (slope) q += rand() - rand();
    out[i] = q <= 0 ? 0 : q >= 255 ? 255 : (q + 0.5) | 0;
  }
  return out;
}

async function renderPageWithGhostscript(
  pdfPath: string,
  pageNumber: number,
  targetWidthPx: number,
  targetHeightPx: number,
  widthInPoints: number,
  heightInPoints: number,
): Promise<{ pngBuffer: Buffer; jpegBuffer: Buffer }> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pdf-gs-"));
  const outFile = path.join(tmpDir, "page.tif");

  try {
    // Separate X/Y DPI so the raster lands on the exact target size; gs
    // may still round by a pixel, which the resize below corrects.
    const dpiX = (targetWidthPx / widthInPoints) * 72;
    const dpiY = (targetHeightPx / heightInPoints) * 72;

    await execFileAsync(
      "gs",
      [
        "-q",
        "-dNOPAUSE",
        "-dBATCH",
        "-dSAFER",
        "-dNOPROMPT",
        "-sDEVICE=tiff48nc",
        "-sCompression=none",
        `-r${dpiX.toFixed(4)}x${dpiY.toFixed(4)}`,
        `-dFirstPage=${pageNumber}`,
        `-dLastPage=${pageNumber}`,
        "-dTextAlphaBits=4",
        "-dGraphicsAlphaBits=4",
        `-sOutputFile=${outFile}`,
        pdfPath,
      ],
      { maxBuffer: 16 * 1024 * 1024 },
    );

    const sharp = (await import("sharp")).default;

    // toColourspace("rgb16") is required: without it sharp converts the
    // input to 8-bit sRGB internally and raw({depth:"ushort"}) would just
    // upcast 8-bit values, throwing away exactly the precision we need.
    const { data, info } = await sharp(outFile, { limitInputPixels: false })
      .toColourspace("rgb16")
      .raw({ depth: "ushort" })
      .toBuffer({ resolveWithObject: true });

    // sharp's OutputInfo typings don't expose `depth`, so validate the
    // buffer size instead: 3 channels x 2 bytes per sample.
    if (info.channels !== 3 || data.length !== info.width * info.height * 6) {
      throw new Error(
        `ghostscript: unexpected raster ${info.width}x${info.height} ${info.channels}ch, ${data.length} bytes`,
      );
    }

    const u16 = new Uint16Array(data.buffer, data.byteOffset, data.length / 2);
    const pixels8 = ditherTo8Bit(u16, info.width, 0x9e3779b9 ^ pageNumber);

    const raw = {
      raw: { width: info.width, height: info.height, channels: 3 as const },
    };
    const exact =
      info.width === targetWidthPx && info.height === targetHeightPx;
    const fit = (s: import("sharp").Sharp) =>
      exact ? s : s.resize(targetWidthPx, targetHeightPx, { fit: "fill" });

    // JPEG at q85 with 4:4:4 chroma, not the q80 4:2:0 used elsewhere: the
    // gradient banding is partly a hue shift, and chroma subsampling plus
    // q80 quantization put visible structure back into the dithered ramp.
    const [pngBuffer, jpegBuffer] = await Promise.all([
      fit(sharp(pixels8, raw)).png({ adaptiveFiltering: true }).toBuffer(),
      fit(sharp(pixels8, raw))
        .jpeg({ quality: 85, chromaSubsampling: "4:4:4" })
        .toBuffer(),
    ]);
    return { pngBuffer, jpegBuffer };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

// --- poppler renderer (fallback #1 as of the Ghostscript change above) ---
//
// Renders one page of a PDF with poppler's pdftoppm, producing both a PNG
// and a JPEG so the caller can pick whichever is smaller (matches the
// existing PNG-vs-JPEG choice this endpoint has always made). This was the
// primary renderer for part of 2026-09-21 -- see the long comment on
// renderPageWithPoppler below for why mupdf's own toPixmap() was replaced
// here rather than patched around, and the Ghostscript comment above for
// why poppler in turn is now the fallback.
//
// -scale-to-x/-scale-to-y (rather than -r/DPI) is used so the output image
// has *exactly* the pixel dimensions we ask for -- poppler's DPI-based
// scaling can be off by a pixel or two from naive width*scaleFactor math,
// and we want `metadata.width`/`metadata.height` to always match the
// actual rendered image.
async function renderPageWithPoppler(
  pdfPath: string,
  pageNumber: number,
  targetWidthPx: number,
  targetHeightPx: number,
): Promise<{ pngBuffer: Buffer; jpegBuffer: Buffer }> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pdf-render-"));

  const pageArgs = [
    "-f",
    String(pageNumber),
    "-l",
    String(pageNumber),
    "-scale-to-x",
    String(targetWidthPx),
    "-scale-to-y",
    String(targetHeightPx),
  ];

  const runPdftoppm = async (
    formatArgs: string[],
    prefixName: string,
    extRegex: RegExp,
  ): Promise<Buffer> => {
    await execFileAsync("pdftoppm", [
      ...pageArgs,
      ...formatArgs,
      pdfPath,
      path.join(tmpDir, prefixName),
    ]);
    const files = await fs.readdir(tmpDir);
    const outputFile = files.find(
      (f) => f.startsWith(prefixName) && extRegex.test(f),
    );
    if (!outputFile) {
      throw new Error(
        `poppler: no output file produced for prefix ${prefixName} (is poppler-utils installed?)`,
      );
    }
    return await fs.readFile(path.join(tmpDir, outputFile));
  };

  try {
    // Fast path (2026-09-21, "links take ages to load"): rasterize the page
    // ONCE to an uncompressed PPM, then encode PNG + JPEG from those pixels
    // with sharp (libvips, off the main thread, both in parallel). The
    // previous version ran pdftoppm twice -- a full parse + rasterize of the
    // page for each format, plus pdftoppm's slow single-threaded PNG
    // encoder -- which measured ~3.5x slower per page. Pixels are identical
    // either way: same poppler rasterizer, same output dimensions.
    try {
      const ppm = await runPdftoppm([], "page-ppm", /\.ppm$/);
      const header = /^P6\s+(\d+)\s+(\d+)\s+255\s/.exec(
        ppm.subarray(0, 64).toString("latin1"),
      );
      if (!header) throw new Error("unexpected PPM header");
      const sharp = (await import("sharp")).default;
      const raw = {
        raw: {
          width: Number(header[1]),
          height: Number(header[2]),
          channels: 3 as const,
        },
      };
      const pixels = ppm.subarray(header[0].length);
      const [pngBuffer, jpegBuffer] = await Promise.all([
        sharp(pixels, raw).png({ adaptiveFiltering: true }).toBuffer(),
        sharp(pixels, raw).jpeg({ quality: 80 }).toBuffer(),
      ]);
      return { pngBuffer, jpegBuffer };
    } catch (fastPathError) {
      // sharp missing/broken on this box, or an unexpected PPM -- fall back
      // to letting pdftoppm do the encoding itself (slower, same result).
      console.warn(
        "[convert-page] fast PPM+sharp path failed, using pdftoppm encoders:",
        fastPathError,
      );
    }

    const pngBuffer = await runPdftoppm(["-png"], "page-png", /\.png$/);
    const jpegBuffer = await runPdftoppm(
      ["-jpeg", "-jpegopt", "quality=80"],
      "page-jpeg",
      /\.jpe?g$/,
    );
    return { pngBuffer, jpegBuffer };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

// --- mupdf-render fallback (only used if poppler itself is unavailable or errors) ---
//
// mupdf is still used above for page count/dimensions/links/orientation --
// none of that goes through its rasterizer, so none of it is affected by
// what's below. This section is only a safety net for the rare case where
// pdftoppm fails outright (not installed, crashes on a specific malformed
// PDF, etc.); if that happens we fall back to mupdf's own toPixmap() render
// rather than failing the page.
//
// Why poppler became the primary renderer instead of mupdf (2026-09-21):
// Savvas reported visible horizontal banding on specific pages of a design
// deck (pages 1/37/38). The first two fixes here treated it as an 8-bit
// color-precision limit on a long gradient and tried to paper over it with
// post-render dithering (first an 8x8 Bayer pattern, then per-pixel random
// noise once the Bayer version turned out to be silently erased by JPEG
// compression -- see the git history of this file and build-status.md,
// 2026-09-21, for both write-ups). That diagnosis was wrong. Inspecting the
// PDF's content stream directly (via pikepdf) showed the affected pages
// don't contain a literal smooth gradient at all -- they draw a solid
// color through an ExtGState with /BM /Color blend mode and a /Luminosity
// soft mask whose alpha value is itself driven by an axial (linear)
// shading pattern. mupdf composites that soft mask in 8-bit integer math,
// which rounds unevenly across the ramp and produces real stepping: a
// direct column-by-column pixel comparison on page 1 found exactly 93
// stepped rows in mupdf's lossless render at column x=3400, vs 0 stepped
// rows in poppler's render of the same page at the same resolution --
// poppler composites the same soft mask without the rounding artifact.
// Dithering was never going to fix this properly: it just adds noise on
// top of a compositing bug, rather than removing the bug. Switching the
// actual rasterization to poppler (already a required dependency as of the
// corrupted-stream fix, commit a2356e64) fixes it at the source, for this
// bug and for the unrelated corrupted-image-stream bug a2356e64 targeted --
// poppler was already shown to handle that case cleanly too. Text and
// photo rendering quality were compared directly between the two renderers
// on this test deck and are visually equivalent at the same output
// resolution.
//
// (Ghostscript then replaced poppler as primary later the same day, because
// poppler fixed the page-1 rounding bug but still bands genuine subtle
// gradients on pages 37-39 -- see the top of this file. mulberry32() used
// by applyDitherToPixmap below is defined up there now.)

// Applies a subtle per-pixel random dither to every color channel of a
// rendered pixmap, in place. Kept only as cheap insurance on the mupdf
// fallback path below -- it doesn't fix the soft-mask compositing bug
// described above (nothing short of a different renderer does), but it
// does soften plain 8-bit gradient banding a little if that fallback path
// is ever hit on an affected page. Pixmap.getPixels() returns a live view
// into mupdf's own pixel buffer, so no copy/re-set step is needed.
function applyDitherToPixmap(
  pixmap: mupdf.Pixmap,
  ditherAmplitude: number = 4,
): void {
  const pixels = pixmap.getPixels();
  const width = pixmap.getWidth();
  const height = pixmap.getHeight();
  const stride = pixmap.getStride();
  const numComponents = pixmap.getNumberOfComponents();
  const hasAlpha = pixmap.getAlpha() !== 0;
  const colorComponents = hasAlpha ? numComponents - 1 : numComponents;
  const rand = mulberry32(0x9e3779b9);

  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    for (let x = 0; x < width; x++) {
      const noise = (rand() - 0.5) * 2 * ditherAmplitude;
      const pixelStart = rowStart + x * numComponents;
      for (let c = 0; c < colorComponents; c++) {
        const idx = pixelStart + c;
        const value = pixels[idx] + noise;
        pixels[idx] = value < 0 ? 0 : value > 255 ? 255 : value;
      }
    }
  }
}

// Renders via mupdf's own toPixmap(), retrying once at a reduced scale
// factor if the first attempt throws (this mirrors the retry mupdf's
// primary render used to do when it was the main renderer -- kept here
// since large/complex pages can still fail the same way in this fallback
// path). Returns the chosen PNG/JPEG buffer plus the actual scale factor
// used, so the caller can correct `metadata` if a retry happened.
async function renderPageWithMupdfFallback(
  page: mupdf.PDFPage,
  scaleFactor: number,
): Promise<{
  buffer: Buffer | Uint8Array;
  format: string;
  actualScaleFactor: number;
}> {
  let scaledPixmap: mupdf.Pixmap;
  let actualScaleFactor = scaleFactor;

  try {
    const doc_to_screen = mupdf.Matrix.scale(scaleFactor, scaleFactor);
    scaledPixmap = page.toPixmap(
      doc_to_screen,
      mupdf.ColorSpace.DeviceRGB,
      false,
      true,
    );
  } catch (error) {
    console.error(
      "mupdf fallback: pixmap creation failed, retrying with reduced scale factor:",
      error,
    );
    actualScaleFactor = Math.max(1, scaleFactor * 0.5);
    const reduced_doc_to_screen = mupdf.Matrix.scale(
      actualScaleFactor,
      actualScaleFactor,
    );
    scaledPixmap = page.toPixmap(
      reduced_doc_to_screen,
      mupdf.ColorSpace.DeviceRGB,
      false,
      true,
    );
  }

  try {
    applyDitherToPixmap(scaledPixmap);

    const pngBuffer = scaledPixmap.asPNG();
    const jpegBuffer = scaledPixmap.asJPEG(80, false);

    const buffer =
      pngBuffer.byteLength < jpegBuffer.byteLength ? pngBuffer : jpegBuffer;
    const format =
      pngBuffer.byteLength < jpegBuffer.byteLength ? "png" : "jpeg";

    return { buffer, format, actualScaleFactor };
  } finally {
    scaledPixmap.destroy();
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
    // Get the PDF -- downloaded once per document version and cached on
    // disk, not re-fetched from object storage for every single page (see
    // lib/documents/pdf-cache.ts).
    let pdfPath: string;
    let pdfData: Buffer;
    try {
      pdfPath = await getCachedPdfPath(documentVersionId, url);
      pdfData = await fs.readFile(pdfPath);
    } catch (error) {
      log({
        message: `Failed to fetch PDF in conversion process with error: \n\n Error: ${error} \n\n \`Metadata: {teamId: ${teamId}, documentVersionId: ${documentVersionId}, pageNumber: ${pageNumber}}\``,
        type: "error",
        mention: true,
      });
      throw new Error(`Failed to fetch pdf on document page ${pageNumber}`);
    }

    // Create a MuPDF instance -- used for page metadata (dimensions,
    // orientation, links) only. Rasterization is done by poppler below;
    // see the fallback section's comment for why.
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

    // Will be updated if we fall back to mupdf with a reduced scale factor
    let actualScaleFactor = scaleFactor;

    // Target pixel dimensions we ask poppler to render at exactly (see
    // renderPageWithPoppler's comment on -scale-to-x/-scale-to-y).
    const targetWidthPx = Math.max(1, Math.round(widthInPoints * scaleFactor));
    const targetHeightPx = Math.max(
      1,
      Math.round(heightInPoints * scaleFactor),
    );

    const metadata = {
      originalWidth: widthInPoints,
      originalHeight: heightInPoints,
      width: targetWidthPx,
      height: targetHeightPx,
      scaleFactor: actualScaleFactor,
    };

    // Estimate memory usage before rendering (rough, both renderers are in
    // the same ballpark for uncompressed RGB).
    const estimatedMemoryMB =
      (targetWidthPx * targetHeightPx * 3) / (1024 * 1024);

    console.log(
      `Estimated memory usage: ${estimatedMemoryMB.toFixed(1)}MB for ${targetWidthPx} × ${targetHeightPx} pixels`,
    );

    if (estimatedMemoryMB > 200) {
      console.warn(
        `High memory usage expected: ${estimatedMemoryMB.toFixed(1)}MB. Consider reducing document size.`,
      );
    }

    let chosenBuffer: Buffer | Uint8Array;
    let chosenFormat: string;

    console.time("render");
    try {
      let rendered: { pngBuffer: Buffer; jpegBuffer: Buffer } | null = null;

      // Ghostscript (16-bit + dither) first, unless disabled. See the
      // comment at the top of this file.
      if (process.env.PDF_RENDERER !== "poppler") {
        try {
          rendered = await renderPageWithGhostscript(
            pdfPath,
            pageNumber,
            targetWidthPx,
            targetHeightPx,
            widthInPoints,
            heightInPoints,
          );
          console.log("Renderer: ghostscript");
        } catch (gsError) {
          console.warn(
            `[convert-page] ghostscript render failed for page ${pageNumber}, using poppler:`,
            gsError,
          );
        }
      }

      if (!rendered) {
        rendered = await renderPageWithPoppler(
          pdfPath,
          pageNumber,
          targetWidthPx,
          targetHeightPx,
        );
        console.log("Renderer: poppler");
      }

      const { pngBuffer, jpegBuffer } = rendered;
      if (pngBuffer.byteLength < jpegBuffer.byteLength) {
        chosenBuffer = pngBuffer;
        chosenFormat = "png";
      } else {
        chosenBuffer = jpegBuffer;
        chosenFormat = "jpeg";
      }
    } catch (popplerError) {
      // poppler itself failed (not installed, crashed on this specific
      // file, etc.) -- fall back to mupdf's own renderer rather than
      // failing the whole page. See the fallback section's comment above
      // for why poppler is preferred when available.
      log({
        message: `Poppler render failed for page ${pageNumber}, falling back to mupdf: \n\n Error: ${popplerError} \n\n \`Metadata: {teamId: ${teamId}, documentVersionId: ${documentVersionId}, pageNumber: ${pageNumber}}\``,
        type: "error",
        mention: true,
      });

      const fallback = await renderPageWithMupdfFallback(page, scaleFactor);
      chosenBuffer = fallback.buffer;
      chosenFormat = fallback.format;
      actualScaleFactor = fallback.actualScaleFactor;
      metadata.scaleFactor = actualScaleFactor;
      metadata.width = Math.floor(widthInPoints * actualScaleFactor);
      metadata.height = Math.floor(heightInPoints * actualScaleFactor);
    }
    console.timeEnd("render");

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
