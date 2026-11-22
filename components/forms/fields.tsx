"use client";

import { blocksOf, isContent, safeLogo, type Answers, type FormSchema } from "@/lib/form-schema";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ChoiceSelect({ value, options, onChange, label, disabled = false }: { value: string; options: string[]; onChange: (value: string) => void; label: string; disabled?: boolean }) {
  return <Select value={value || undefined} onValueChange={onChange} disabled={disabled}><SelectTrigger aria-label={label} className="w-full"><SelectValue placeholder="Choose an option" /></SelectTrigger><SelectContent className="max-w-[calc(100vw-3rem)]">{options.map((option) => <SelectItem key={option} value={option} className="whitespace-normal break-words">{option}</SelectItem>)}</SelectContent></Select>;
}

export function FormFields({ schema, answers, onChange, disabled = false, prefix = "" }: { schema: FormSchema; answers: Answers; onChange: (answers: Answers) => void; disabled?: boolean; prefix?: string }) {
  return <>{blocksOf(schema).map((block) => {
    const id = `${prefix}${block.id}`;
    const value = answers[block.id];
    const set = (answer: Answers[string]) => onChange({ ...answers, [block.id]: answer });
    if (isContent(block)) return block.type === "heading" ? <h2 key={id} className="break-words text-xl">{block.label}</h2> : <p key={id} className="whitespace-pre-wrap break-words text-muted-foreground">{block.label}</p>;
    const label = <span>{block.label} {block.required ? <span aria-label="required" className="text-destructive">*</span> : <span className="text-sm text-muted-foreground">(optional)</span>}</span>;
    return <div key={id} className="min-w-0 space-y-3"><Label htmlFor={id} id={`${id}-label`} className="block break-words text-base leading-relaxed">{label}</Label>{block.description && <p id={`${id}-help`} className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{block.description}</p>}
      {block.type === "multi_choice" ? <fieldset aria-labelledby={`${id}-label`} className="space-y-3" disabled={disabled}>{block.options?.map((option, index) => <div key={option} className="flex items-start gap-3"><Checkbox id={`${id}-${index}`} checked={Array.isArray(value) && value.includes(option)} onCheckedChange={(checked) => set(checked ? [...(Array.isArray(value) ? value : []), option] : (Array.isArray(value) ? value : []).filter((item) => item !== option))} /><Label htmlFor={`${id}-${index}`} className="break-words leading-snug">{option}</Label></div>)}</fieldset>
        : block.type === "single_choice" || block.type === "rating" ? <RadioGroup aria-labelledby={`${id}-label`} value={value === undefined ? "" : String(value)} onValueChange={set} disabled={disabled} className="space-y-2">{(block.type === "rating" ? Array.from({ length: block.max ?? 5 }, (_, index) => String(index + 1)) : block.options ?? []).map((option, index) => <div key={option} className="flex items-center gap-3"><RadioGroupItem value={option} id={`${id}-${index}`} /><Label htmlFor={`${id}-${index}`} className="break-words">{option}</Label></div>)}</RadioGroup>
          : block.type === "dropdown" ? <ChoiceSelect label={block.label} value={typeof value === "string" ? value : ""} options={block.options ?? []} onChange={set} disabled={disabled} />
            : block.type === "consent" ? <div className="flex items-center gap-3"><Checkbox id={id} checked={value === true} onCheckedChange={(checked) => set(checked === true)} disabled={disabled} /><Label htmlFor={id}>I agree</Label></div>
              : block.type === "long_text" ? <Textarea id={id} aria-describedby={block.description ? `${id}-help` : undefined} value={typeof value === "string" ? value : ""} onChange={(event) => set(event.target.value)} required={block.required} maxLength={10000} disabled={disabled} rows={5} />
                : <Input id={id} aria-describedby={block.description ? `${id}-help` : undefined} type={block.type === "short_text" ? "text" : block.type} value={typeof value === "string" || typeof value === "number" ? value : ""} onChange={(event) => set(event.target.value)} required={block.required} min={block.min} max={block.max} step={block.type === "number" ? "any" : undefined} maxLength={block.type === "email" ? 254 : 2000} disabled={disabled} autoComplete="off" />}
      {!block.required && (block.type === "dropdown" || block.type === "single_choice" || block.type === "rating") && value !== undefined && value !== "" && <button type="button" className="text-xs text-primary underline" disabled={disabled} onClick={() => set("")}>Clear answer</button>}
    </div>;
  })}</>;
}

export function FormHeading({ schema }: { schema: FormSchema }) {
  return <header className="space-y-4">{schema.logoUrl && safeLogo(schema.logoUrl) && <img src={schema.logoUrl} alt="Form logo" referrerPolicy="no-referrer" className="max-h-20 max-w-48 object-contain" />}<h1 className="break-words">{schema.title}</h1>{schema.description && <p className="whitespace-pre-wrap break-words text-muted-foreground">{schema.description}</p>}</header>;
}
