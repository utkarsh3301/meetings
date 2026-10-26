import { db } from "./db";

// segmentId -> startMs, for showing source timestamps on cross-meeting pages.
export async function segmentTimes(ids: string[]) {
  if (!ids.length) return {};
  const segs = await db.segment.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, startMs: true } });
  return Object.fromEntries(segs.map((s) => [s.id, s.startMs])) as Record<string, number>;
}
