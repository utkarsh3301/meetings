import { z } from "zod";
import { apiUser, body, Ctx, route } from "@/lib/api";
import { db } from "@/lib/db";

export const PATCH = route(async (req, { params }: Ctx) => {
  await apiUser(true);
  const b = await body(req, z.object({ name: z.string().trim().min(1).max(200) }));
  return Response.json(await db.client.update({ where: { id: (await params).id }, data: b }));
});

export const DELETE = route(async (_req, { params }: Ctx) => {
  await apiUser(true);
  await db.client.delete({ where: { id: (await params).id } });
  return new Response(null, { status: 204 });
});
