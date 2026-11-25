"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { answerErrors, pagesOf, type Answers, type FormSchema } from "@/lib/form-schema";
import { Button } from "@/components/ui/button";
import { ErrorNotice } from "./shared";
import { FormFields, FormHeading } from "./fields";

export function FormConfirmation({ schema, preview = false }: { schema: FormSchema; preview?: boolean }) {
  return <div role="status" className="py-12"><span className="mb-6 inline-flex rounded-full bg-success p-3 text-success-foreground"><Check className="size-6" /></span><h1>Thank you!</h1><p className="mt-4 whitespace-pre-wrap break-words text-muted-foreground">{schema.confirmation || "Your response has been saved."}</p>{preview && <p className="mt-6 text-sm text-muted-foreground">Preview only — no response was stored.</p>}</div>;
}

export function FormBody({ schema, answers, onChange, onComplete, busy = false, error = "", preview = false }: { schema: FormSchema; answers: Answers; onChange: (answers: Answers) => void; onComplete: () => void; busy?: boolean; error?: string; preview?: boolean }) {
  const [page, setPage] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const nextFocus = useRef<string | null>(null);
  const pages = pagesOf(schema);
  const current = Math.min(page, pages.length - 1);
  const blocks = pages[current];
  const last = current === pages.length - 1;
  const errors = attempted ? answerErrors(answers, schema, blocks) : {};
  const invalid = blocks.filter(block => errors[block.id]);

  function focusField(id: string) {
    form.current?.querySelector(`[data-field-id="${id}"]`)
      ?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, button')?.focus();
  }

  useEffect(() => {
    if (nextFocus.current === "heading") pageHeading.current?.focus();
    else if (nextFocus.current) focusField(nextFocus.current);
    nextFocus.current = null;
  }, [current]);

  function goTo(index: number, field?: string) {
    nextFocus.current = field ?? "heading";
    setAttempted(Boolean(field));
    setPage(index);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const first = Object.keys(answerErrors(answers, schema, last ? undefined : blocks))[0];
    if (first) {
      const invalidPage = pages.findIndex(items => items.some(block => block.id === first));
      if (invalidPage !== current) goTo(invalidPage, first);
      else {
        setAttempted(true);
        focusField(first);
      }
      return;
    }
    if (last) onComplete();
    else goTo(current + 1);
  }

  const submitButton = <Button size="lg" disabled={busy}>{busy ? "Submitting…" : !last ? "Next" : preview ? "Test submission" : "Submit"}<ArrowRight /></Button>;
  return <form ref={form} noValidate onSubmit={submit} className="fold-form-body min-w-0 space-y-7">
    <FormHeading schema={schema} />
    {pages.length > 1 && <h2 ref={pageHeading} tabIndex={-1} className="fold-page-progress">Page {current + 1} of {pages.length}</h2>}
    {invalid.length > 0 && <div role="alert" className="fold-error-summary"><p className="font-semibold">{invalid.length} {invalid.length === 1 ? "question needs" : "questions need"} your attention.</p><ul className="mt-2 space-y-1">{invalid.map(block => <li key={block.id}><button type="button" onClick={() => focusField(block.id)} className="text-left underline underline-offset-2">{block.label}</button></li>)}</ul></div>}
    <FormFields blocks={blocks} answers={answers} onChange={onChange} disabled={busy} prefix={preview ? "preview-" : ""} errors={errors} />
    {error && <ErrorNotice message={error} />}
    {pages.length === 1 ? submitButton : <div className="flex flex-wrap items-center gap-3">
      {current > 0 && <Button type="button" size="lg" variant="outline" disabled={busy} onClick={() => goTo(current - 1)}><ArrowLeft />Back</Button>}
      {submitButton}
    </div>}
  </form>;
}
