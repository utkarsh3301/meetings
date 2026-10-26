import { z } from "zod";
import { apiUser, body, id, route } from "@/lib/api";
import { db } from "@/lib/db";

export const GET = route(async (req) => {
  await apiUser();
  const clientId = new URL(req.url).searchParams.get("clientId") ?? undefined;
  return Response.json(await db.vocabTerm.findMany({ where: { clientId }, orderBy: { term: "asc" } }));
});

// Accepts one term or several separated by commas or new lines.
export const POST = route(async (req) => {
  await apiUser(true);
  const b = await body(req, z.object({ clientId: id, terms: z.string().max(20000) }));
  const terms = [...new Set(b.terms.split(/[,\n]/).map((t) => t.trim()).filter(Boolean))];
  await db.vocabTerm.createMany({ data: terms.map((term) => ({ clientId: b.clientId, term })) });
  return Response.json({ added: terms.length }, { status: 201 });
});
