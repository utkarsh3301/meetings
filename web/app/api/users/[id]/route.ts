import bcrypt from "bcryptjs";
import { z } from "zod";
import { apiUser, body, Ctx, HttpError, route } from "@/lib/api";
import { db } from "@/lib/db";

export const PATCH = route(async (req, { params }: Ctx) => {
  const me = await apiUser(true);
  const { id } = await params;
  const b = await body(
    req,
    z.object({
      name: z.string().trim().min(1).max(100).optional(),
      role: z.enum(["ADMIN", "MEMBER"]).optional(),
      active: z.boolean().optional(),
      password: z.string().min(8).max(200).optional(),
    }),
  );
  if (id === me.id && (b.active === false || b.role === "MEMBER"))
    throw new HttpError(400, "You cannot deactivate or demote yourself.");
  const { password, ...rest } = b;
  await db.user.update({
    where: { id },
    data: { ...rest, ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}) },
  });
  return Response.json({ ok: true });
});
