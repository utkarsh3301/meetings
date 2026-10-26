import { apiUser, Ctx, HttpError, route } from "@/lib/api";
import { db } from "@/lib/db";
import { presignGet } from "@/lib/r2";

export const GET = route(async (_req, { params }: Ctx) => {
  await apiUser();
  const m = await db.meeting.findUniqueOrThrow({ where: { id: (await params).id } });
  if (!m.audioKey) throw new HttpError(404, "Audio has been deleted after the retention period.");
  return Response.json({ url: await presignGet(m.audioKey) });
});
