import { apiUser, Ctx, HttpError, route } from "@/lib/api";
import { db } from "@/lib/db";
import { loadMeeting } from "@/lib/meeting";
import { deleteObject } from "@/lib/r2";

export const GET = route(async (_req, { params }: Ctx) => {
  await apiUser();
  const m = await loadMeeting((await params).id);
  if (!m) throw new HttpError(404, "Not found");
  return Response.json(m);
});

export const DELETE = route(async (_req, { params }: Ctx) => {
  await apiUser(true);
  const { id } = await params;
  const m = await db.meeting.findUnique({ where: { id } });
  if (!m) throw new HttpError(404, "Not found");
  if (m.audioKey) await deleteObject(m.audioKey);
  await db.meeting.delete({ where: { id } });
  return new Response(null, { status: 204 });
});
