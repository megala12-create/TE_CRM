import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

// Local-disk storage. In Docker this directory is a named volume (see docker-compose.yml).
// Swap for S3-compatible storage later by keeping the same three functions.
// turbopackIgnore: the upload folder is runtime data, not something to bundle/trace.
const ROOT = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.UPLOAD_DIR ?? "storage/uploads");
const KEY = /^[a-z-]+\/\d{4}-\d{2}\/[0-9a-f-]{36}\.(pdf|png|jpg|webp)$/;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const SIGNATURES: { type: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { type: "application/pdf", ext: "pdf", test: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  { type: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/webp", ext: "webp", test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
];

export type StoredFile = { key: string; name: string; type: string; size: number };

/**
 * Validates and stores an uploaded receipt/document. The file type is decided
 * from its content (magic bytes), never from the browser-supplied name or MIME.
 */
export async function saveUpload(file: File, folder: string): Promise<StoredFile | { error: string }> {
  if (file.size === 0) return { error: "The file is empty." };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "File is larger than 10 MB." };
  const buf = Buffer.from(await file.arrayBuffer());
  const sig = SIGNATURES.find((s) => s.test(buf));
  if (!sig) return { error: "Only PDF, JPG, PNG or WEBP files are allowed." };
  const month = new Date().toISOString().slice(0, 7);
  const key = `${folder}/${month}/${randomUUID()}.${sig.ext}`;
  const full = resolveKey(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buf, { flag: "wx" });
  const name = (file.name || `file.${sig.ext}`).replace(/[^\w.\- ()]/g, "_").slice(0, 120);
  return { key, name, type: sig.type, size: buf.length };
}

export async function readUpload(key: string): Promise<Buffer | null> {
  try {
    return await readFile(resolveKey(key));
  } catch {
    return null;
  }
}

export async function deleteUpload(key: string | null | undefined) {
  if (!key) return;
  await unlink(resolveKey(key)).catch(() => undefined);
}

function resolveKey(key: string) {
  if (!KEY.test(key)) throw new Error("Invalid storage key");
  const full = path.resolve(/* turbopackIgnore: true */ ROOT, key);
  if (!full.startsWith(ROOT + path.sep)) throw new Error("Invalid storage key");
  return full;
}
