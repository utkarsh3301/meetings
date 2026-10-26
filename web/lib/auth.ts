import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "./db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(c) {
        const email = String(c?.email ?? "").trim().toLowerCase();
        const user = await db.user.findUnique({ where: { email } });
        if (!user || !user.active) return null;
        if (!(await bcrypt.compare(String(c?.password ?? ""), user.passwordHash))) return null;
        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
  callbacks: {
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

// Re-read from DB on every request so deactivation takes effect immediately.
export async function currentUser() {
  const s = await auth();
  if (!s?.user?.id) return null;
  const u = await db.user.findUnique({ where: { id: s.user.id } });
  return u?.active ? u : null;
}

export async function requireUser() {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin() {
  const u = await requireUser();
  if (u.role !== "ADMIN") redirect("/");
  return u;
}
