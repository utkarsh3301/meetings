import { PageTitle } from "@/components/PageTitle";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { UsersAdmin } from "./UsersAdmin";

export default async function Users() {
  const me = await requireAdmin();
  const users = await db.user.findMany({
    select: { id: true, name: true, email: true, role: true, active: true },
    orderBy: { name: "asc" },
  });
  return (
    <>
      <PageTitle sub="No public signup. Accounts are created here.">Users</PageTitle>
      <UsersAdmin users={users} meId={me.id} />
    </>
  );
}
