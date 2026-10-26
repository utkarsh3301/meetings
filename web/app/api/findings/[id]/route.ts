import { z } from "zod";
import { apiUser, body, Ctx, route } from "@/lib/api";
import { db } from "@/lib/db";

export const PATCH = route(async (req, { params }: Ctx) => {
  await apiUser();
  const b = await body(req, z.object({ review: z.enum(["UNREVIEWED", "CONFIRMED", "DISMISSED"]) }));
  return Response.json(await db.finding.update({ where: { id: (await params).id }, data: b }));
});
