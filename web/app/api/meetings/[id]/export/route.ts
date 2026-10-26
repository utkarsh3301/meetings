import { z } from "zod";
import { apiUser, Ctx, HttpError, route } from "@/lib/api";
import { buildBlocks, toDocx, toMarkdown } from "@/lib/export";
import { loadMeeting } from "@/lib/meeting";

export const GET = route(async (req, { params }: Ctx) => {
  await apiUser();
  const sp = new URL(req.url).searchParams;
  const format = z.enum(["md", "docx", "pdf"]).parse(sp.get("format"));
  const part = z.enum(["both", "summary", "transcript"]).catch("both").parse(sp.get("part"));
  const { id } = await params;

  // PDF uses the browser's print to PDF, which renders Devanagari correctly.
  if (format === "pdf") return new Response(null, { status: 303, headers: { location: `/print/${id}?part=${part}` } });

  const m = await loadMeeting(id);
  if (!m) throw new HttpError(404, "Not found");
  const blocks = buildBlocks(m, part);
  const name = `${m.title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "meeting"}-${part}`;
  const [body, type] =
    format === "md"
      ? [toMarkdown(blocks), "text/markdown; charset=utf-8"]
      : [new Uint8Array(await toDocx(blocks)), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
  return new Response(body, {
    headers: { "content-type": type, "content-disposition": `attachment; filename="${name}.${format}"` },
  });
});
