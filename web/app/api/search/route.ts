import { apiUser, route } from "@/lib/api";
import { searchSegments } from "@/lib/search";

export const GET = route(async (req) => {
  await apiUser();
  const sp = new URL(req.url).searchParams;
  return Response.json(await searchSegments((sp.get("q") ?? "").slice(0, 200), sp.get("clientId"), sp.get("projectId")));
});
