import { Prisma } from "@prisma/client";
import { z } from "zod";
import { currentUser } from "./auth";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type Ctx<P = { id: string }> = { params: Promise<P> };

export function route<C>(fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      if (e instanceof z.ZodError) return Response.json({ error: "Invalid input", issues: e.issues }, { status: 400 });
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2025") return Response.json({ error: "Not found" }, { status: 404 });
        if (e.code === "P2002") return Response.json({ error: "Already exists" }, { status: 409 });
        if (e.code === "P2003") return Response.json({ error: "Still in use by other records" }, { status: 409 });
      }
      console.error(e);
      return Response.json({ error: "Server error" }, { status: 500 });
    }
  };
}

export async function apiUser(admin = false) {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "Not signed in");
  if (admin && u.role !== "ADMIN") throw new HttpError(403, "Admin only");
  return u;
}

export async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  return schema.parse(await req.json().catch(() => ({})));
}

export const id = z.string().min(1).max(64);
export const optDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional()
  .transform((v) => (v ? new Date(`${v}T00:00:00Z`) : v));
