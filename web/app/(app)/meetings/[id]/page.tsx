import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadMeeting } from "@/lib/meeting";
import { MeetingView } from "./MeetingView";

export default async function MeetingPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ seg?: string }>;
}) {
  const [user, { id }, { seg }] = await Promise.all([requireUser(), params, searchParams]);
  const meeting = await loadMeeting(id);
  if (!meeting) notFound();
  return <MeetingView meeting={meeting} isAdmin={user.role === "ADMIN"} initialSeg={seg} />;
}
