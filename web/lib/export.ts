import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { isoDate, label, mmss, speakerName } from "./format";
import type { LoadedMeeting } from "./meeting";

export type Part = "both" | "summary" | "transcript";

type Block =
  | { kind: "h1"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "p"; text: string }
  | { kind: "li"; text: string; refs: string }
  | { kind: "line"; time: string; who: string; text: string };

// One neutral structure feeds markdown, docx and the print page, so all three stay in sync.
export function buildBlocks(m: LoadedMeeting, part: Part): Block[] {
  const time = Object.fromEntries(m.segments.map((s) => [s.id, s.startMs]));
  const refs = (ids: string[]) => ids.filter((i) => i in time).map((i) => mmss(time[i])).join(", ");
  const speakers = Object.fromEntries(m.speakers.map((s) => [s.id, s]));
  const b: Block[] = [
    { kind: "h1", text: m.title },
    { kind: "p", text: `${m.project.client.name} / ${m.project.name}  ·  ${isoDate(m.meetingDate)}  ·  ${label(m.type)}` },
  ];
  const list = (title: string, items: { text: string; segmentIds: string[] }[]) => {
    if (!items.length) return;
    b.push({ kind: "h2", text: title });
    items.forEach((i) => b.push({ kind: "li", text: i.text, refs: refs(i.segmentIds) }));
  };

  if (part !== "transcript") {
    if (m.summary) b.push({ kind: "h2", text: "Summary" }, ...m.summary.split(/\n+/).map((t) => ({ kind: "p" as const, text: t })));
    list("Decisions", m.decisions);
    list(
      "Action items",
      m.actionItems.filter((a) => a.status !== "DROPPED").map((a) => ({
        text: [a.text, a.owner && `Owner: ${a.owner}`, a.dueDate && `Due: ${isoDate(a.dueDate)}`, a.status === "DONE" && "Done"]
          .filter(Boolean)
          .join(". "),
        segmentIds: a.segmentIds,
      })),
    );
    list("Open questions", m.openQuestions);
    const live = m.findings.filter((f) => f.review !== "DISMISSED");
    const asItem = (f: (typeof live)[number]) => ({ text: f.detail ? `${f.text}. ${f.detail}` : f.text, segmentIds: f.segmentIds });
    list("Commitments", live.filter((f) => f.kind === "COMMITMENT").map(asItem));
    list("Scope flags", live.filter((f) => f.kind === "SCOPE_CHANGE").map(asItem));
  }
  if (part !== "summary" && m.segments.length) {
    b.push({ kind: "h2", text: "Transcript" });
    m.segments.forEach((s) =>
      b.push({ kind: "line", time: mmss(s.startMs), who: speakerName(s.speakerId ? speakers[s.speakerId] : null), text: s.editedText ?? s.text }),
    );
  }
  return b;
}

export function toMarkdown(blocks: Block[]) {
  return blocks
    .map((x) => {
      if (x.kind === "h1") return `# ${x.text}\n`;
      if (x.kind === "h2") return `\n## ${x.text}\n`;
      if (x.kind === "p") return `${x.text}\n`;
      if (x.kind === "li") return `- ${x.text}${x.refs ? ` (${x.refs})` : ""}`;
      return `**[${x.time}] ${x.who}:** ${x.text}\n`;
    })
    .join("\n");
}

export function toDocx(blocks: Block[]) {
  const children = blocks.map((x) => {
    if (x.kind === "h1") return new Paragraph({ text: x.text, heading: HeadingLevel.TITLE });
    if (x.kind === "h2") return new Paragraph({ text: x.text, heading: HeadingLevel.HEADING_1 });
    if (x.kind === "p") return new Paragraph({ text: x.text });
    if (x.kind === "li")
      return new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun(x.text), ...(x.refs ? [new TextRun({ text: ` (${x.refs})`, color: "6C6459" })] : [])],
      });
    return new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: `[${x.time}] `, color: "6C6459" }), new TextRun({ text: `${x.who}: `, bold: true }), new TextRun(x.text)],
    });
  });
  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}
