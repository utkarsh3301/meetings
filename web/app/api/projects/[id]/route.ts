import { z } from "zod";
import { apiUser, body, Ctx, route } from "@/lib/api";
import { db } from "@/lib/db";

export const PATCH = route(async (req, { params }: Ctx) => {
  await apiUser(true);
  const b = await body(
    req,
    z.object({ name: z.string().trim().min(1).max(200).optional(), scopeBaseline: z.string().max(100000).nullable().optional() }),
  );
  const scopeBaseline = b.scopeBaseline === undefined ? undefined : b.scopeBaseline?.trim() || null;
  return Response.json(await db.project.update({ where: { id: (await params).id }, data: { ...b, scopeBaseline } }));
});

export const DELETE = route(async (_req, { params }: Ctx) => {
  await apiUser(true);
  await db.project.delete({ where: { id: (await params).id } });
  return new Response(null, { status: 204 });
});
