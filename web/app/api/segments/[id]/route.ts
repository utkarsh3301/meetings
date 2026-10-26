import { z } from "zod";
import { apiUser, body, Ctx, route } from "@/lib/api";
import { db } from "@/lib/db";

export const PATCH = route(async (req, { params }: Ctx) => {
  await apiUser();
  const b = await body(req, z.object({ editedText: z.string().max(20000).nullable() }));
  const seg = await db.segment.findUniqueOrThrow({ where: { id: (await params).id } });
  // Saving text identical to the original clears the edit.
  const editedText = b.editedText === null || b.editedText.trim() === seg.text.trim() ? null : b.editedText;
  return Response.json(await db.segment.update({ where: { id: seg.id }, data: { editedText } }));
});
