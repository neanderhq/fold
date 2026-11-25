"use client";

import { useState, type KeyboardEvent } from "react";
import { Star } from "lucide-react";
import { isContent, safeLogo, type Answers, type FormBlock, type FormSchema } from "@/lib/form-schema";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type FieldState = { "aria-describedby"?: string; "aria-invalid"?: boolean };

export function ChoiceSelect({ value, options, onChange, label, disabled = false, ...state }: { value: string; options: string[]; onChange: (value: string) => void; label: string; disabled?: boolean } & FieldState) {
  return <Select value={value || undefined} onValueChange={onChange} disabled={disabled}><SelectTrigger aria-label={label} className="w-full" {...state}><SelectValue placeholder="Choose an option" /></SelectTrigger><SelectContent className="max-w-[calc(100vw-3rem)]">{options.map(option => <SelectItem key={option} value={option} className="whitespace-normal break-words">{option}</SelectItem>)}</SelectContent></Select>;
}

function moveRadioSelection(event: KeyboardEvent<HTMLDivElement>, select: (index: number) => void) {
  const offsets: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  const offset = offsets[event.key];
  if (event.altKey || event.ctrlKey || event.metaKey || (offset === undefined && event.key !== "Home" && event.key !== "End")) return;
  const radios = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)')];
  const current = radios.indexOf(event.target as HTMLButtonElement);
  if (current < 0) return;
  const next = event.key === "Home" ? 0 : event.key === "End" ? radios.length - 1 : (current + offset + radios.length) % radios.length;
  // Commit the choice before moving focus, even if the key is released quickly.
  event.preventDefault();
  select(next);
  radios[next].focus();
}

function RatingField({ id, max, value, onChange, disabled, state }: { id: string; max: number; value: string; onChange: (value: string) => void; disabled: boolean; state: FieldState }) {
  const [hover, setHover] = useState<number | null>(null);
  return <div><RadioGroup aria-labelledby={`${id}-label`} {...state} value={value} onValueChange={onChange} disabled={disabled} orientation="horizontal" className="fold-rating" onMouseLeave={() => setHover(null)} onKeyDownCapture={event => moveRadioSelection(event, next => onChange(String(next + 1)))}>
    {Array.from({ length: max }, (_, index) => <RadioGroupItem key={index} id={`${id}-${index}`} value={String(index + 1)} aria-label={String(index + 1)} className="fold-rating-star" data-filled={index < (hover ?? Number(value))} onMouseEnter={() => setHover(index + 1)}><Star aria-hidden="true" /></RadioGroupItem>)}
  </RadioGroup><p className="mt-2 text-xs text-muted-foreground">{value ? `${value} of ${max} stars` : `Choose 1 to ${max} stars`}</p></div>;
}

function AnswerField({ block, id, value, set, disabled, state }: { block: FormBlock; id: string; value: Answers[string] | undefined; set: (answer: Answers[string]) => void; disabled: boolean; state: FieldState }) {
  if (block.type === "rating") return <RatingField id={id} max={block.max ?? 5} value={value === undefined ? "" : String(value)} onChange={set} disabled={disabled} state={state} />;
  if (block.type === "multi_choice") return <fieldset aria-labelledby={`${id}-label`} {...state} className="fold-choices" disabled={disabled}>{block.options?.map((option, index) => <Label key={option} htmlFor={`${id}-${index}`} className="fold-choice" data-selected={Array.isArray(value) && value.includes(option)}><Checkbox id={`${id}-${index}`} {...state} checked={Array.isArray(value) && value.includes(option)} onCheckedChange={checked => set(checked ? [...(Array.isArray(value) ? value : []), option] : (Array.isArray(value) ? value : []).filter(item => item !== option))} /><span>{option}</span></Label>)}</fieldset>;
  if (block.type === "single_choice") return <RadioGroup aria-labelledby={`${id}-label`} {...state} value={typeof value === "string" ? value : ""} onValueChange={set} disabled={disabled} className="fold-choices" onKeyDownCapture={event => moveRadioSelection(event, index => set(block.options![index]))}>{block.options?.map((option, index) => <Label key={option} htmlFor={`${id}-${index}`} className="fold-choice" data-selected={value === option}><RadioGroupItem value={option} id={`${id}-${index}`} {...state} /><span>{option}</span></Label>)}</RadioGroup>;
  if (block.type === "dropdown") return <ChoiceSelect label={block.label} value={typeof value === "string" ? value : ""} options={block.options ?? []} onChange={set} disabled={disabled} {...state} />;
  if (block.type === "consent") return <Label htmlFor={id} className="fold-choice" data-selected={value === true}><Checkbox id={id} checked={value === true} onCheckedChange={checked => set(checked === true)} disabled={disabled} {...state} /><span>I agree</span></Label>;
  if (block.type === "long_text") return <Textarea id={id} {...state} value={typeof value === "string" ? value : ""} onChange={event => set(event.target.value)} required={block.required} maxLength={10000} disabled={disabled} rows={5} />;
  return <Input id={id} {...state} type={block.type === "short_text" ? "text" : block.type} value={typeof value === "string" || typeof value === "number" ? value : ""} onChange={event => set(event.target.value)} required={block.required} min={block.min} max={block.max} step={block.type === "number" ? "any" : undefined} maxLength={block.type === "email" ? 254 : 2000} disabled={disabled} autoComplete="off" />;
}

export function FormFields({ blocks, answers, onChange, disabled = false, prefix = "", errors = {} }: { blocks: FormBlock[]; answers: Answers; onChange: (answers: Answers) => void; disabled?: boolean; prefix?: string; errors?: Record<string, string> }) {
  return <>{blocks.map(block => {
    const id = `${prefix}${block.id}`, value = answers[block.id];
    if (isContent(block)) return block.type === "heading" ? <h2 key={id} className="break-words text-xl">{block.label}</h2> : <p key={id} className="whitespace-pre-wrap break-words text-muted-foreground">{block.label}</p>;
    const state: FieldState = { "aria-describedby": [block.description ? `${id}-help` : "", errors[block.id] ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined, "aria-invalid": Boolean(errors[block.id]) };
    return <div key={id} id={`${id}-field`} data-field-id={block.id} className="fold-field min-w-0 space-y-3">
      <Label htmlFor={id} id={`${id}-label`} className="block break-words text-base font-semibold leading-relaxed">{block.label} {block.required ? <span aria-label="required" className="text-destructive">*</span> : <span className="text-sm font-normal text-muted-foreground">(optional)</span>}</Label>
      {block.description && <p id={`${id}-help`} className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{block.description}</p>}
      <AnswerField block={block} id={id} value={value} set={answer => onChange({ ...answers, [block.id]: answer })} disabled={disabled} state={state} />
      {!block.required && ["dropdown", "single_choice", "rating"].includes(block.type) && value !== undefined && value !== "" && <button type="button" className="text-xs text-primary underline" disabled={disabled} onClick={() => onChange({ ...answers, [block.id]: "" })}>Clear answer</button>}
      {errors[block.id] && <p id={`${id}-error`} className="fold-field-error">{errors[block.id]}</p>}
    </div>;
  })}</>;
}

export function FormHeading({ schema }: { schema: FormSchema }) {
  return <header className="space-y-4">{schema.logoUrl && safeLogo(schema.logoUrl) && <img src={schema.logoUrl} alt="Form logo" referrerPolicy="no-referrer" className="max-h-20 max-w-48 object-contain" />}<h1 className="break-words">{schema.title}</h1>{schema.description && <p className="whitespace-pre-wrap break-words text-muted-foreground">{schema.description}</p>}</header>;
}
