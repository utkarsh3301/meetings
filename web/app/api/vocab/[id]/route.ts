import { apiUser, Ctx, route } from "@/lib/api";
import { db } from "@/lib/db";

export const DELETE = route(async (_req, { params }: Ctx) => {
  await apiUser(true);
  await db.vocabTerm.delete({ where: { id: (await params).id } });
  return new Response(null, { status: 204 });
});
