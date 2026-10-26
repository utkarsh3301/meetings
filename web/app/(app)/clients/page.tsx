import { PageTitle } from "@/components/PageTitle";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ClientsAdmin } from "./ClientsAdmin";

export default async function Clients() {
  await requireAdmin();
  const clients = await db.client.findMany({
    include: {
      projects: { orderBy: { name: "asc" }, include: { _count: { select: { meetings: true } } } },
      vocabulary: { orderBy: { term: "asc" } },
    },
    orderBy: { name: "asc" },
  });
  return (
    <>
      <PageTitle sub="Projects, scope baselines and vocabulary">Clients</PageTitle>
      <ClientsAdmin clients={clients} />
    </>
  );
}
