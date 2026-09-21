/**
 * On-disk cache of the source PDF for a document version while its pages are
 * being converted.
 *
 * /api/mupdf/convert-page is called once per page, and used to re-download
 * the *entire* PDF from object storage on every call (and then write it to a
 * fresh temp file for poppler). For a 76-page, ~80MB deck that is ~6GB of
 * pointless transfer and 76 temp-file writes per upload, all of it added
 * directly to how long the document -- and every share link created for it --
 * sits in its "processing" state. Download once, reuse for every page.
 */
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

const CACHE_DIR = path.join(os.tmpdir(), "docket-pdf-cache");
const MAX_AGE_MS = 2 * 60 * 60 * 1000; // safety net; normally cleared explicitly

// De-duplicates concurrent first requests for the same version (pages are
// converted two at a time -- see process-pdf-inline.ts).
const inFlight = new Map<string, Promise<string>>();

const cachePathFor = (documentVersionId: string) =>
  path.join(
    CACHE_DIR,
    `${documentVersionId.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`,
  );

async function sweepStale() {
  try {
    const now = Date.now();
    for (const name of await fs.readdir(CACHE_DIR)) {
      const file = path.join(CACHE_DIR, name);
      const stat = await fs.stat(file).catch(() => null);
      if (stat && now - stat.mtimeMs > MAX_AGE_MS) {
        await fs.rm(file, { force: true });
      }
    }
  } catch {
    // best effort
  }
}

export async function getCachedPdfPath(
  documentVersionId: string,
  url: string,
): Promise<string> {
  const target = cachePathFor(documentVersionId);

  const stat = await fs.stat(target).catch(() => null);
  if (stat && stat.size > 0 && Date.now() - stat.mtimeMs < MAX_AGE_MS) {
    return target;
  }

  let pending = inFlight.get(target);
  if (!pending) {
    pending = (async () => {
      await fs.mkdir(CACHE_DIR, { recursive: true });
      await sweepStale();
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download PDF (status: ${response.status})`);
      }
      const data = Buffer.from(await response.arrayBuffer());
      // write-then-rename so a concurrent reader never sees a partial file
      const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tmp, data);
      await fs.rename(tmp, target);
      return target;
    })().finally(() => inFlight.delete(target));
    inFlight.set(target, pending);
  }
  return pending;
}

export async function clearCachedPdf(documentVersionId: string) {
  await fs.rm(cachePathFor(documentVersionId), { force: true }).catch(() => {});
}
