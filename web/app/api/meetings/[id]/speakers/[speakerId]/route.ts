import { z } from "zod";
import { apiUser, body, Ctx, HttpError, route } from "@/lib/api";
import { db } from "@/lib/db";
import { SIDES } from "@/lib/format";

export const PATCH = route(async (req, { params }: Ctx<{ id: string; speakerId: string }>) => {
  await apiUser();
  const { id, speakerId } = await params;
  const b = await body(
    req,
    z.object({ displayName: z.string().trim().max(100).nullable().optional(), side: z.enum(SIDES).optional() }),
  );
  const sp = await db.speaker.findUnique({ where: { id: speakerId } });
  if (!sp || sp.meetingId !== id) throw new HttpError(404, "Not found");
  const updated = await db.speaker.update({
    where: { id: speakerId },
    data: { displayName: b.displayName === undefined ? undefined : b.displayName || null, side: b.side },
  });
  return Response.json(updated);
});
