import { z } from "zod";
import { apiUser, body, route } from "@/lib/api";
import { db } from "@/lib/db";

export const GET = route(async () => {
  await apiUser();
  return Response.json(
    await db.client.findMany({ include: { projects: true, vocabulary: true }, orderBy: { name: "asc" } }),
  );
});

export const POST = route(async (req) => {
  await apiUser(true);
  const b = await body(req, z.object({ name: z.string().trim().min(1).max(200) }));
  return Response.json(await db.client.create({ data: b }), { status: 201 });
});
