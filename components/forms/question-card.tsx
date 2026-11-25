import { ArrowDown, ArrowUp, ChevronDown, Copy, GripVertical, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { fieldTypes, isChoice, isContent, type FormBlock } from "@/lib/form-schema";
import { ChoiceSelect } from "./fields";
import { typeIcons, typeLabels } from "./block-picker";

type Props = {
  block: FormBlock; controllers: FormBlock[]; index: number; count: number; expanded: boolean; disabled: boolean;
  dropTarget: boolean; onSelect: () => void; onChange: (next: FormBlock) => void;
  onMove: (direction: number) => void; onDuplicate: () => void; onDelete: () => void;
  onDragStart: () => void; onDragEnd: () => void; onDragOver: () => boolean; onDrop: () => void;
};

export function QuestionCard(props: Props) {
  const { block, controllers, index, count, expanded, disabled } = props;
  const controller = controllers.find(item => item.id === block.followUp?.controllerId);
  const hasMatchingAnswer = Boolean(controller?.options?.includes(block.followUp?.equals ?? ""));
  const selectClass = "h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring";
  const Icon = typeIcons[block.type];
  const labelId = index === 0 ? "question" : `label-${block.id}`;
  const update = (change: Partial<FormBlock>) => props.onChange({ ...block, ...change });
  return <section className={`fold-question ${expanded ? "is-selected" : ""} ${props.dropTarget ? "is-drop-target" : ""}`} data-block-id={block.id}
    onDragOver={event => { if (props.onDragOver()) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
    onDrop={event => { event.preventDefault(); props.onDrop(); }}>
    {block.startsPage && <div className="fold-page-break">New page</div>}
    <div className="fold-question-heading">
      <button type="button" className="fold-drag-handle" draggable={!disabled} disabled={disabled} aria-label={`Drag block ${index + 1} to reorder`} aria-describedby="fold-reorder-help"
        onDragStart={event => { event.dataTransfer.setData("text/plain", block.id); event.dataTransfer.effectAllowed = "move"; props.onDragStart(); }} onDragEnd={props.onDragEnd}><GripVertical className="size-4" aria-hidden="true" /></button>
      <span className="fold-block-number">{index + 1}</span>
      <div className="fold-inline-label"><Label htmlFor={labelId} className="sr-only">{isContent(block) ? "Content" : "Question"}{expanded ? "" : ` ${index + 1}`}</Label><Textarea id={labelId} rows={1} className="fold-inline-question" value={block.label} placeholder={isContent(block) ? "Add some context…" : "Type your question…"} disabled={disabled} maxLength={2000} onFocus={() => { if (!expanded) props.onSelect(); }} onChange={event => update({ label: event.target.value })} /></div>
      <button type="button" aria-label={`Settings for block ${index + 1}`} aria-expanded={expanded} aria-controls={`settings-${block.id}`} className="fold-question-row" onClick={props.onSelect}>
        <Icon className="size-4 shrink-0" /><ChevronDown className={`size-4 shrink-0 ${expanded ? "rotate-180" : ""}`} />
      </button>
    </div>
    {expanded && <div id={`settings-${block.id}`} className="fold-question-settings space-y-4">
      <div className="fold-question-tools"><span className="text-xs text-muted-foreground">{typeLabels[block.type]}</span><div className="flex gap-1">
        <Button size="icon-sm" variant="ghost" aria-label={`Move block ${index + 1} up`} disabled={disabled || index === 0} onClick={() => props.onMove(-1)}><ArrowUp /></Button>
        <Button size="icon-sm" variant="ghost" aria-label={`Move block ${index + 1} down`} disabled={disabled || index === count - 1} onClick={() => props.onMove(1)}><ArrowDown /></Button>
        <Button size="icon-sm" variant="ghost" aria-label={`Duplicate block ${index + 1}`} disabled={disabled || count >= 50} onClick={props.onDuplicate}><Copy /></Button>
        <Button size="icon-sm" variant="ghost" aria-label={`Delete block ${index + 1}`} disabled={disabled} onClick={props.onDelete}><Trash2 /></Button>
      </div></div>
      {isChoice(block.type) && <div className="space-y-2">{block.options?.map((option, position) => <div key={position} className="fold-option-row"><span aria-hidden="true">{String.fromCharCode(65 + position)}</span><Label htmlFor={`option-${block.id}-${position}`} className="sr-only">Option {position + 1}</Label><Input id={`option-${block.id}-${position}`} value={option} maxLength={200} disabled={disabled} onChange={event => update({ options: block.options!.map((value, item) => item === position ? event.target.value : value) })} /><Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove option ${position + 1}`} disabled={disabled || (block.options?.length ?? 0) <= 2} onClick={() => update({ options: block.options!.filter((_, item) => item !== position) })}><X /></Button></div>)}<Button type="button" size="sm" variant="ghost" disabled={disabled || (block.options?.length ?? 0) >= 50} onClick={() => update({ options: [...block.options!, `Option ${(block.options?.length ?? 0) + 1}`] })}><Plus />Add option</Button></div>}
      {!isContent(block) && <div className="flex items-center justify-between gap-4"><Label htmlFor={index === 0 ? "required" : `required-${block.id}`}>Required question</Label><Switch id={index === 0 ? "required" : `required-${block.id}`} checked={block.required} disabled={disabled} onCheckedChange={required => update({ required })} /></div>}
      {index > 0 && <div className="flex items-center justify-between gap-4"><Label htmlFor={`new-page-${block.id}`}>Start a new page here</Label><Switch id={`new-page-${block.id}`} checked={Boolean(block.startsPage)} disabled={disabled} onCheckedChange={enabled => update({ startsPage: enabled ? true : undefined })} /></div>}
      <details className="fold-question-more"><summary>Question settings</summary><div className="space-y-4 pt-4">
        <ChoiceSelect label={`Type of block ${index + 1}`} value={typeLabels[block.type]} options={fieldTypes.map(type => typeLabels[type])} disabled={disabled} onChange={value => {
          const type = fieldTypes.find(item => typeLabels[item] === value)!;
          props.onChange({ id: block.id, type, label: block.label, required: !["heading", "description"].includes(type) && block.required, description: block.description, startsPage: block.startsPage, followUp: type === "heading" || type === "description" ? undefined : block.followUp,
            ...(isChoice(type) ? { options: block.options ?? ["Option 1", "Option 2"] } : {}), ...(type === "rating" ? { min: 1, max: 5 } : {}) });
        }} />
        {!isContent(block) && (controllers.length > 0 || block.followUp) && <div className="space-y-3 border-t pt-3">
          <div className="space-y-2">
            <Label htmlFor={`controller-${block.id}`}>Show this question when</Label>
            <select id={`controller-${block.id}`} className={selectClass} disabled={disabled} value={controller?.id ?? (block.followUp ? "invalid" : "")} onChange={event => {
              const next = controllers.find(item => item.id === event.target.value);
              update({ followUp: next ? { controllerId: next.id, equals: next.options?.[0] ?? "" } : undefined });
            }}>
              <option value="">Always visible</option>
              {block.followUp && !controller && <option value="invalid" disabled>Choose a valid controller</option>}
              {controllers.map(item => <option key={item.id} value={item.id}>{item.label || "Untitled question"}</option>)}
            </select>
          </div>
          {controller && block.followUp && <div className="space-y-2">
            <Label htmlFor={`matching-answer-${block.id}`}>Answer is</Label>
            <select id={`matching-answer-${block.id}`} className={selectClass} disabled={disabled} value={hasMatchingAnswer ? block.followUp.equals : ""} onChange={event => update({ followUp: { controllerId: controller.id, equals: event.target.value } })}>
              {!hasMatchingAnswer && <option value="" disabled>Choose an existing answer</option>}
              {controller.options?.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>}
          {block.followUp && (!controller || !hasMatchingAnswer) && <p role="status" className="text-sm text-destructive">Choose an earlier unconditional choice on this page and an existing answer, or set this question to Always visible.</p>}
        </div>}
        {!isContent(block) && <div className="space-y-2"><Label htmlFor={`description-${block.id}`}>Help text</Label><Textarea id={`description-${block.id}`} value={block.description ?? ""} disabled={disabled} maxLength={2000} onChange={event => update({ description: event.target.value })} /></div>}
        {(block.type === "number" || block.type === "rating") && <div className="grid grid-cols-2 gap-3">{(["min", "max"] as const).map(bound => <div key={bound} className="space-y-2"><Label htmlFor={`${bound}-${block.id}`}>{bound === "min" ? "Minimum" : "Maximum"}</Label><Input id={`${bound}-${block.id}`} type="number" step={block.type === "rating" ? 1 : "any"} value={block[bound] ?? ""} disabled={disabled} onChange={event => update({ [bound]: event.target.value === "" ? undefined : Number(event.target.value) })} /></div>)}</div>}
      </div></details>
    </div>}
  </section>;
}
