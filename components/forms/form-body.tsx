"use client";

import type { FormEventHandler } from "react";
import { ArrowRight, Check } from "lucide-react";
import type { Answers, FormSchema } from "@/lib/form-schema";
import { Button } from "@/components/ui/button";
import { ErrorNotice } from "./shared";
import { FormFields, FormHeading } from "./fields";

export function FormConfirmation({ schema, preview = false }: { schema: FormSchema; preview?: boolean }) {
  return <div role="status" className="py-12"><span className="mb-6 inline-flex rounded-full bg-success p-3 text-success-foreground"><Check className="size-6" /></span><h1>Thank you!</h1><p className="mt-4 whitespace-pre-wrap break-words text-muted-foreground">{schema.confirmation || "Your response has been saved."}</p>{preview && <p className="mt-6 text-sm text-muted-foreground">Preview only — no response was stored.</p>}</div>;
}

export function FormBody({ schema, answers, onChange, onSubmit, busy = false, error = "", preview = false }: { schema: FormSchema; answers: Answers; onChange: (answers: Answers) => void; onSubmit: FormEventHandler<HTMLFormElement>; busy?: boolean; error?: string; preview?: boolean }) {
  return <form onSubmit={onSubmit} className="fold-form-body min-w-0 space-y-7"><FormHeading schema={schema} /><FormFields schema={schema} answers={answers} onChange={onChange} disabled={busy} prefix={preview ? "preview-" : ""} />{error && <ErrorNotice message={error} />}<Button size="lg" disabled={busy}>{busy ? "Submitting…" : preview ? "Test submission" : "Submit"}<ArrowRight /></Button></form>;
}
