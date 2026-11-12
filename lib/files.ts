import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { query } from "./db";
import { HttpError } from "./http";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per screenshot
const MAX_FILES = 6;

export type PreparedFile = { buf: Buffer; mime: string; ext: string; name: string };

export function uploadDir() {
  const d = process.env.UPLOAD_DIR;
  if (!d) throw new Error("UPLOAD_DIR is not set");
  return path.resolve(d);
}

/** Identify the real image type from the first bytes — never trust the browser's claim. */
function sniff(b: Buffer): { mime: string; ext: string } | null {
  if (b.length > 12 && b[0] === 0x89 && b.toString("ascii", 1, 4) === "PNG") return { mime: "image/png", ext: "png" };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b.length > 6 && b.toString("ascii", 0, 4) === "GIF8") return { mime: "image/gif", ext: "gif" };
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP")
    return { mime: "image/webp", ext: "webp" };
  return null;
}

/** Validate every file first, so a bad file never leaves a half-saved ticket behind. */
export async function prepareFiles(files: File[]): Promise<PreparedFile[]> {
  if (files.length > MAX_FILES) throw new HttpError(400, `Maximum ${MAX_FILES} screenshots at a time.`);
  const out: PreparedFile[] = [];
  for (const f of files) {
    if (f.size > MAX_BYTES) throw new HttpError(413, `${f.name || "A file"} is larger than 10 MB.`);
    const buf = Buffer.from(await f.arrayBuffer());
    const kind = sniff(buf);
    if (!kind) throw new HttpError(400, `${f.name || "A file"}: only PNG, JPG, GIF or WebP images are allowed.`);
    out.push({ buf, mime: kind.mime, ext: kind.ext, name: (f.name || "screenshot").replace(/[^\w.\- ]/g, "_").slice(0, 150) });
  }
  return out;
}

export async function storeFiles(
  ticketId: string,
  commentId: string | null,
  userId: string,
  files: PreparedFile[]
) {
  if (!files.length) return;
  const dir = path.join(uploadDir(), ticketId);
  await fs.mkdir(dir, { recursive: true });
  for (const f of files) {
    const stored = `${crypto.randomUUID()}.${f.ext}`;
    await fs.writeFile(path.join(/*turbopackIgnore: true*/ dir, stored), f.buf, { flag: "wx" });
    await query(
      `INSERT INTO dbo.ticket_attachments (ticket_id, comment_id, stored_name, file_name, mime, size_bytes, uploaded_by)
       VALUES (@t, @c, @s, @n, @m, @z, @u)`,
      { t: ticketId, c: commentId, s: stored, n: f.name, m: f.mime, z: f.buf.length, u: userId }
    );
  }
}

export async function readStored(ticketId: string, storedName: string) {
  const base = uploadDir();
  const full = path.resolve(base, ticketId, storedName);
  if (!full.startsWith(base + path.sep)) throw new HttpError(404, "Not found");
  return fs.readFile(full);
}

export function formFiles(form: FormData): File[] {
  return form.getAll("files").filter((f): f is File => typeof f !== "string" && f.size > 0);
}

/** Remove a ticket's screenshots from disk (used when an admin deletes the ticket). Missing folder is fine. */
export async function removeTicketFiles(ticketId: string) {
  const base = uploadDir();
  const dir = path.resolve(base, ticketId);
  if (!dir.startsWith(base + path.sep)) return;
  await fs.rm(dir, { recursive: true, force: true });
}
