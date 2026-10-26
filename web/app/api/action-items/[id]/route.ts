import { z } from "zod";
import { apiUser, body, Ctx, optDate, route } from "@/lib/api";
import { db } from "@/lib/db";
import { ACTION_STATUSES, SIDES } from "@/lib/format";

export const PATCH = route(async (req, { params }: Ctx) => {
  await apiUser();
  const b = await body(
    req,
    z.object({
      text: z.string().trim().min(1).max(2000).optional(),
      owner: z.string().trim().max(100).nullable().optional(),
      side: z.enum(SIDES).optional(),
      dueDate: optDate,
      status: z.enum(ACTION_STATUSES).optional(),
    }),
  );
  return Response.json(
    await db.actionItem.update({ where: { id: (await params).id }, data: { ...b, owner: b.owner === "" ? null : b.owner } }),
  );
});
