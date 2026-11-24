import { ArrowDown, ArrowUp, ChevronDown, Copy, GripVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { fieldTypes, isChoice, isContent, type FormBlock } from "@/lib/form-schema";
import { ChoiceSelect } from "./fields";
import { typeIcons, typeLabels } from "./block-picker";

type Props = {
  block: FormBlock; index: number; count: number; expanded: boolean; disabled: boolean;
  dropTarget: boolean; onSelect: () => void; onChange: (next: FormBlock) => void;
  onMove: (direction: number) => void; onDuplicate: () => void; onDelete: () => void;
  onDragStart: () => void; onDragEnd: () => void; onDragOver: () => boolean; onDrop: () => void;
};

export function QuestionCard(props: Props) {
  const { block, index, count, expanded, disabled } = props;
  const Icon = typeIcons[block.type];
  const update = (change: Partial<FormBlock>) => props.onChange({ ...block, ...change });
  return <section className={`fold-question ${expanded ? "is-selected" : ""} ${props.dropTarget ? "is-drop-target" : ""}`}
    data-block-id={block.id}
    onDragOver={event => { if (props.onDragOver()) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
    onDrop={event => { event.preventDefault(); props.onDrop(); }}>
    <div className="fold-question-heading">
      <button type="button" className="fold-drag-handle" draggable={!disabled} disabled={disabled}
        aria-label={`Drag block ${index + 1} to reorder`} aria-describedby="fold-reorder-help"
        onDragStart={event => { event.dataTransfer.setData("text/plain", block.id); event.dataTransfer.effectAllowed = "move"; props.onDragStart(); }}
        onDragEnd={props.onDragEnd}>
        <GripVertical className="size-4" aria-hidden="true" />
      </button>
      <button type="button" aria-expanded={expanded} aria-controls={`settings-${block.id}`} className="fold-question-row" onClick={props.onSelect}>
        <span className="fold-block-number">{index + 1}</span>
        <span className="min-w-0 flex-1 break-words text-left font-semibold">{block.label || "Untitled question"}</span>
        <span className="fold-type-label"><Icon className="size-4 shrink-0" /><span>{typeLabels[block.type]}</span></span>
        <ChevronDown className={`size-4 shrink-0 ${expanded ? "rotate-180" : ""}`} />
      </button>
    </div>
    {expanded && <div id={`settings-${block.id}`} className="fold-question-settings space-y-4">
      <div className="fold-question-tools"><h3 className="text-sm">{typeLabels[block.type]}</h3><div className="flex gap-1">
        <Button size="icon" variant="ghost" aria-label={`Move block ${index + 1} up`} disabled={disabled || index === 0} onClick={() => props.onMove(-1)}><ArrowUp /></Button>
        <Button size="icon" variant="ghost" aria-label={`Move block ${index + 1} down`} disabled={disabled || index === count - 1} onClick={() => props.onMove(1)}><ArrowDown /></Button>
        <Button size="icon" variant="ghost" aria-label={`Duplicate block ${index + 1}`} disabled={disabled || count >= 50} onClick={props.onDuplicate}><Copy /></Button>
        <Button size="icon" variant="ghost" aria-label={`Delete block ${index + 1}`} disabled={disabled} onClick={props.onDelete}><Trash2 /></Button>
      </div></div>
      <ChoiceSelect label={`Type of block ${index + 1}`} value={typeLabels[block.type]} options={fieldTypes.map(type => typeLabels[type])} disabled={disabled} onChange={value => {
        const type = fieldTypes.find(item => typeLabels[item] === value)!;
        props.onChange({ id: block.id, type, label: block.label, required: !["heading", "description"].includes(type) && block.required,
          description: block.description, ...(isChoice(type) ? { options: block.options ?? ["Option 1", "Option 2"] } : {}),
          ...(type === "rating" ? { min: 1, max: 5 } : {}) });
      }} />
      <div className="space-y-2"><Label htmlFor={index === 0 ? "question" : `label-${block.id}`}>{isContent(block) ? "Content" : "Question"}</Label>
        <Input id={index === 0 ? "question" : `label-${block.id}`} value={block.label} disabled={disabled} maxLength={2000} onChange={event => update({ label: event.target.value })} /></div>
      {!isContent(block) && <>
        <div className="space-y-2"><Label htmlFor={`description-${block.id}`}>Help text</Label><Textarea id={`description-${block.id}`} value={block.description ?? ""} disabled={disabled} maxLength={2000} onChange={event => update({ description: event.target.value })} /></div>
        <div className="flex items-center justify-between gap-4"><Label htmlFor={index === 0 ? "required" : `required-${block.id}`}>Required question</Label><Switch id={index === 0 ? "required" : `required-${block.id}`} checked={block.required} disabled={disabled} onCheckedChange={required => update({ required })} /></div>
      </>}
      {isChoice(block.type) && <div className="space-y-2"><Label htmlFor={`options-${block.id}`}>Options (one per line)</Label><Textarea id={`options-${block.id}`} value={block.options?.join("\n") ?? ""} disabled={disabled} onChange={event => update({ options: event.target.value.split("\n") })} /></div>}
      {(block.type === "number" || block.type === "rating") && <div className="grid grid-cols-2 gap-3">{(["min", "max"] as const).map(bound => <div key={bound} className="space-y-2">
        <Label htmlFor={`${bound}-${block.id}`}>{bound === "min" ? "Minimum" : "Maximum"}</Label><Input id={`${bound}-${block.id}`} type="number" step={block.type === "rating" ? 1 : "any"} value={block[bound] ?? ""} disabled={disabled} onChange={event => update({ [bound]: event.target.value === "" ? undefined : Number(event.target.value) })} />
      </div>)}</div>}
    </div>}
  </section>;
}
