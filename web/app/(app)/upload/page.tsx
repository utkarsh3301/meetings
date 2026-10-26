import { PageTitle } from "@/components/PageTitle";
import { db } from "@/lib/db";
import { UploadForm } from "./UploadForm";

export default async function Upload() {
  const clients = await db.client.findMany({
    include: { projects: { select: { id: true, name: true }, orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
  return (
    <>
      <PageTitle sub="mp3, m4a, wav, mp4 or webm">Upload</PageTitle>
      <UploadForm clients={clients.map((c) => ({ id: c.id, name: c.name, projects: c.projects }))} maxMb={Number(process.env.MAX_UPLOAD_MB ?? 1024)} />
    </>
  );
}
