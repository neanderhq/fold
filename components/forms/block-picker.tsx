import { AlignLeft, Calendar, CheckSquare, Hash, Heading, List, Mail, Star, Type } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { FieldType } from "@/lib/form-schema";

export const typeLabels: Record<FieldType, string> = {
  short_text: "Short text", long_text: "Long text", email: "Email", number: "Number", date: "Date",
  single_choice: "Single choice", multi_choice: "Multiple choice", dropdown: "Dropdown", rating: "Rating",
  consent: "Consent", heading: "Heading", description: "Description",
};
export const typeIcons = {
  short_text: Type, long_text: AlignLeft, email: Mail, number: Hash, date: Calendar,
  single_choice: List, multi_choice: CheckSquare, dropdown: List, rating: Star,
  consent: CheckSquare, heading: Heading, description: AlignLeft,
};
const groups: { name: string; types: FieldType[] }[] = [
  { name: "Text & details", types: ["short_text", "long_text", "email", "number", "date"] },
  { name: "Choices & feedback", types: ["single_choice", "multi_choice", "dropdown", "rating", "consent"] },
  { name: "Content", types: ["heading", "description"] },
];

export function BlockPicker({ open, onOpenChange, onSelect }: {
  open: boolean; onOpenChange: (open: boolean) => void; onSelect: (type: FieldType) => void;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="fold-block-picker">
      <DialogHeader><DialogTitle>Add a block</DialogTitle><DialogDescription>Choose a question, or add context with a heading or description.</DialogDescription></DialogHeader>
      {groups.map(group => <section key={group.name}>
        <h3 className="fold-picker-heading">{group.name}</h3>
        <div className="fold-picker-grid">{group.types.map(type => {
          const Icon = typeIcons[type];
          return <button key={type} type="button" className="fold-picker-option" onClick={() => { onSelect(type); onOpenChange(false); }}>
            <Icon aria-hidden="true" /><span>{typeLabels[type]}</span>
          </button>;
        })}</div>
      </section>)}
    </DialogContent>
  </Dialog>;
}
