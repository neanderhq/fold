"use client";

import { useRef, useState, type FormEventHandler } from "react";
import { ArrowRight, Check } from "lucide-react";
import { answerErrors, blocksOf, type Answers, type FormSchema } from "@/lib/form-schema";
import { Button } from "@/components/ui/button";
import { ErrorNotice } from "./shared";
import { FormFields, FormHeading } from "./fields";

export function FormConfirmation({ schema, preview = false }: { schema: FormSchema; preview?: boolean }) {
  return <div role="status" className="py-12"><span className="mb-6 inline-flex rounded-full bg-success p-3 text-success-foreground"><Check className="size-6" /></span><h1>Thank you!</h1><p className="mt-4 whitespace-pre-wrap break-words text-muted-foreground">{schema.confirmation || "Your response has been saved."}</p>{preview && <p className="mt-6 text-sm text-muted-foreground">Preview only — no response was stored.</p>}</div>;
}

export function FormBody({ schema, answers, onChange, onSubmit, busy = false, error = "", preview = false }: { schema: FormSchema; answers: Answers; onChange: (answers: Answers) => void; onSubmit: FormEventHandler<HTMLFormElement>; busy?: boolean; error?: string; preview?: boolean }) {
  const [attempted, setAttempted] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const errors = attempted ? answerErrors(answers, schema) : {};
  const invalid = blocksOf(schema).filter(block => errors[block.id]);
  function focus(id: string) {
    form.current?.querySelector(`[data-field-id="${id}"]`)?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, button')?.focus();
  }
  return <form ref={form} noValidate onSubmit={event => {
    event.preventDefault();
    if (busy) return;
    setAttempted(true);
    const first = Object.keys(answerErrors(answers, schema))[0];
    if (first) { focus(first); return; }
    onSubmit(event);
  }} className="fold-form-body min-w-0 space-y-7">
    <FormHeading schema={schema} />
    {invalid.length > 0 && <div role="alert" className="fold-error-summary"><p className="font-semibold">{invalid.length} {invalid.length === 1 ? "question needs" : "questions need"} your attention.</p><ul className="mt-2 space-y-1">{invalid.map(block => <li key={block.id}><button type="button" onClick={() => focus(block.id)} className="text-left underline underline-offset-2">{block.label}</button></li>)}</ul></div>}
    <FormFields schema={schema} answers={answers} onChange={onChange} disabled={busy} prefix={preview ? "preview-" : ""} errors={errors} />
    {error && <ErrorNotice message={error} />}<Button size="lg" disabled={busy}>{busy ? "Submitting…" : preview ? "Test submission" : "Submit"}<ArrowRight /></Button>
  </form>;
}
