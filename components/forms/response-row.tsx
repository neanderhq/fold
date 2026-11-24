import { Star } from "lucide-react";
import { answerText, blocksOf, isChoice, isContent } from "@/lib/form-schema";
import type { SavedResponse } from "@/lib/form-types";

export function ResponseRow({ record, selected, onSelect }: { record: SavedResponse; selected: boolean; onSelect: () => void }) {
  const fields = blocksOf(record.schemaSnapshot).filter(block => !isContent(block));
  const text = (id: string) => answerText(record.answers[id]);
  const primary = fields.find(block => block.type === "short_text" && text(block.id)) ?? fields.find(block => text(block.id));
  const email = fields.find(block => block.type === "email" && block.id !== primary?.id);
  const detail = fields.find(block => block.type === "long_text" && block.id !== primary?.id);
  const highlights = fields.filter(block => (isChoice(block.type) || block.type === "rating") && text(block.id)).slice(0, 2);
  return <button type="button" onClick={onSelect} aria-pressed={selected} className={`fold-response-row ${selected ? "is-selected" : ""}`}>
    <span className="fold-response-identity"><strong>{primary ? text(primary.id) || "No answer" : "No answer"}</strong><time dateTime={record.createdAt}>{new Date(record.createdAt).toLocaleString()}</time></span>
    {email && text(email.id) && <span className="fold-response-email">{text(email.id)}</span>}
    {detail && text(detail.id) && <span className="fold-response-excerpt">{text(detail.id)}</span>}
    {highlights.length > 0 && <span className="fold-response-highlights">{highlights.map(block => <span key={block.id} title={block.label}>{block.type === "rating" && <Star className="size-3" aria-hidden="true" />}{text(block.id)}{block.type === "rating" ? ` / ${block.max ?? 5}` : ""}</span>)}</span>}
  </button>;
}
