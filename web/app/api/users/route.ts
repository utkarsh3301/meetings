import bcrypt from "bcryptjs";
import { z } from "zod";
import { apiUser, body, route } from "@/lib/api";
import { db } from "@/lib/db";

const publicFields = { id: true, name: true, email: true, role: true, active: true, createdAt: true } as const;

export const GET = route(async () => {
  await apiUser(true);
  return Response.json(await db.user.findMany({ select: publicFields, orderBy: { name: "asc" } }));
});

export const POST = route(async (req) => {
  await apiUser(true);
  const b = await body(
    req,
    z.object({
      name: z.string().trim().min(1).max(100),
      email: z.email().transform((e) => e.toLowerCase()),
      password: z.string().min(8).max(200),
      role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
    }),
  );
  const user = await db.user.create({
    data: { name: b.name, email: b.email, role: b.role, passwordHash: await bcrypt.hash(b.password, 12) },
    select: publicFields,
  });
  return Response.json(user, { status: 201 });
});
