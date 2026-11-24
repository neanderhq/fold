import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { parseSchema, type FormSchema } from "@/lib/form-schema";
import type { SavedForm } from "@/lib/form-types";

// Compare the validated shape: PostgreSQL JSONB may return object keys in a
// different order, and saving trims text without changing the editable input.
export function sameDraft(left: FormSchema | null, right: FormSchema | null) {
  if (!left || !right) return left === right;
  try { return JSON.stringify(parseSchema(left)) === JSON.stringify(parseSchema(right)); }
  catch { return JSON.stringify(left) === JSON.stringify(right); }
}

export function useFormDraft(id: string) {
  const [form, setForm] = useState<SavedForm | null>(null);
  const [draft, setDraft] = useState<FormSchema | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const latest = useRef<FormSchema | null>(null);
  const inFlight = useRef(false);
  let issue = "";
  let validatedDraft: FormSchema | null = null;
  if (draft) {
    try { validatedDraft = parseSchema(draft); }
    catch (cause) { issue = cause instanceof Error ? cause.message : "Complete the draft before saving."; }
  }

  const dirty = Boolean(draft && !sameDraft(draft, form?.draft ?? null));

  useEffect(() => {
    let active = true;
    api<SavedForm>(`/api/forms/${id}`).then(saved => {
      if (!active) return;
      setForm(saved);
      latest.current = saved.draft;
      setDraft(saved.draft);
    }).catch(cause => { if (active) setLoadError(cause.message); });
    return () => { active = false; };
  }, [id]);

  function updateDraft(next: FormSchema) {
    latest.current = next;
    setDraft(next);
  }

  const save = useCallback(async () => {
    const snapshot = latest.current;
    if (!snapshot || inFlight.current) return;
    try { parseSchema(snapshot); }
    catch { return; } // Incomplete question settings stay local until valid.
    inFlight.current = true;
    setSaving(true);
    setSaveError("");
    try {
      const saved = await api<SavedForm>(`/api/forms/${id}`, "PATCH", snapshot);
      setForm(saved);
      // Keep the editable input intact, including text typed while saving and
      // trailing spaces that the server normalizes in its saved schema.
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Could not save your draft.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }, [id]);

  useEffect(() => {
    if (!dirty || saving || issue || saveError) return;
    const timeout = setTimeout(() => { void save(); }, 800);
    return () => clearTimeout(timeout);
  }, [draft, dirty, saving, issue, saveError, save]);

  useEffect(() => {
    if (!dirty && !saving) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);

  function confirmLeave() {
    return (!dirty && !saving) || window.confirm("Your latest edits haven’t been saved. Leave this form?");
  }

  return { form, setForm, draft, updateDraft, dirty, saving, save, saveError, loadError, issue, validatedDraft, confirmLeave };
}
