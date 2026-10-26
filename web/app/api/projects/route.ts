import { z } from "zod";
import { apiUser, body, id, route } from "@/lib/api";
import { db } from "@/lib/db";

export const GET = route(async () => {
  await apiUser();
  return Response.json(await db.project.findMany({ include: { client: true }, orderBy: { name: "asc" } }));
});

export const POST = route(async (req) => {
  await apiUser(true);
  const b = await body(
    req,
    z.object({ clientId: id, name: z.string().trim().min(1).max(200), scopeBaseline: z.string().max(100000).nullable().optional() }),
  );
  return Response.json(await db.project.create({ data: b }), { status: 201 });
});
