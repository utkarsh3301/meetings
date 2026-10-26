import { randomUUID } from "crypto";
import { z } from "zod";
import { apiUser, body, HttpError, route } from "@/lib/api";
import { presignPut } from "@/lib/r2";

const EXTS = ["mp3", "m4a", "wav", "mp4", "webm"];

export const POST = route(async (req) => {
  await apiUser();
  const b = await body(req, z.object({ filename: z.string().min(1), contentType: z.string(), size: z.number().int().positive() }));
  const ext = b.filename.split(".").pop()?.toLowerCase() ?? "";
  if (!EXTS.includes(ext)) throw new HttpError(400, `Unsupported file type. Use ${EXTS.join(", ")}.`);
  const maxMb = Number(process.env.MAX_UPLOAD_MB ?? 1024);
  if (b.size > maxMb * 1024 * 1024) throw new HttpError(400, `File is over ${maxMb} MB.`);
  const contentType = b.contentType || "application/octet-stream";
  const key = `uploads/${randomUUID()}.${ext}`;
  return Response.json({ key, url: await presignPut(key, contentType), contentType });
});
