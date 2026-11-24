"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api-client";
import { parseAnswers, type Answers, type FormSchema } from "@/lib/form-schema";
import { ErrorNotice, Loading } from "./shared";
import { FormBody, FormConfirmation } from "./form-body";

export function PublicForm({ id }: { id: string }) {
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  useEffect(() => { api<FormSchema>(`/api/public/forms/${id}`).then(setSchema).catch((cause) => setError(cause.message)).finally(() => setLoading(false)); }, [id]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!schema || busy) return;
    setBusy(true); setError("");
    try { await api(`/api/public/forms/${id}`, "POST", { answers: parseAnswers(answers, schema) }); setSuccess(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not submit. Please try again."); }
    finally { setBusy(false); }
  }
  return <div className="fold-public fold-form-surface" data-form-appearance={schema?.appearance ?? "classic"}><header className="fold-public-header"><span className="fold-brand">Fold</span></header><main className="fold-public-sheet">
    {loading ? <Loading /> : success && schema ? <FormConfirmation schema={schema} /> : schema ? <FormBody schema={schema} answers={answers} onChange={setAnswers} onSubmit={submit} busy={busy} error={error} /> : <div className="py-12"><h1>Form unavailable</h1><div className="mt-6"><ErrorNotice message={error || "This form is not accepting responses."} /></div></div>}
    <p className="mt-auto pt-20 text-xs text-muted-foreground">Made with Fold</p>
  </main></div>;
}
