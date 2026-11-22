import { answerText, blocksOf, isContent } from "./form-schema";
import type { SavedResponse } from "./form-types";

export function csvCell(value: string) {
  const safe = /^[\s\u0000-\u001f]*[=+@-]/u.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function responseCsv(records: SavedResponse[]) {
  const columns = new Map<string, { id: string; label: string }>();
  for (const record of records) for (const block of blocksOf(record.schemaSnapshot).filter((item) => !isContent(item))) columns.set(`${block.id}\u0000${block.label}`, { id: block.id, label: block.label });
  const fields = [...columns.values()];
  const rows = [["Response ID", "Submitted (UTC)", "Form title", ...fields.map((field) => `${field.label} [${field.id}]`)]];
  for (const record of records) {
    const present = blocksOf(record.schemaSnapshot);
    rows.push([record.id, record.createdAt, record.schemaSnapshot.title, ...fields.map((field) => present.some((block) => block.id === field.id && block.label === field.label) ? answerText(record.answers[field.id]) : "")]);
  }
  return "\ufeff" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
