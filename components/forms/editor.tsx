"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlignLeft, ArrowDown, ArrowLeft, ArrowUp, Calendar, CheckSquare, ChevronDown, Copy, ExternalLink, GripVertical, Hash, Heading, List, Mail, Monitor, Plus, Save, Send, Settings2, Smartphone, Star, Trash2, Type } from "lucide-react";
import { api } from "@/lib/api-client";
import type { SavedForm } from "@/lib/form-types";
import { blocksOf, fieldTypes, isChoice, isContent, parseAnswers, parseSchema, type Answers, type FieldType, type FormBlock, type FormSchema } from "@/lib/form-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ErrorNotice, FormNav, Loading, OwnerShell } from "./shared";
import { ChoiceSelect } from "./fields";
import { FormBody, FormConfirmation } from "./form-body";

const typeLabels: Record<FieldType, string> = { short_text: "Short text", long_text: "Long text", email: "Email", number: "Number", date: "Date", single_choice: "Single choice", multi_choice: "Multiple choice", dropdown: "Dropdown", rating: "Rating", consent: "Consent", heading: "Heading", description: "Description" };

const typeIcons = { short_text: Type, long_text: AlignLeft, email: Mail, number: Hash, date: Calendar, single_choice: List, multi_choice: CheckSquare, dropdown: List, rating: Star, consent: CheckSquare, heading: Heading, description: AlignLeft };

function validatePreview(schema: FormSchema) {
  try { return { schema: parseSchema(schema), error: "" }; }
  catch (cause) { return { schema: null, error: cause instanceof Error ? cause.message : "Fix the draft configuration to preview this form." }; }
}

export function Editor({ id }: { id: string }) {
  const [form, setForm] = useState<SavedForm | null>(null);
  const [draft, setDraft] = useState<FormSchema | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");
  const [addType, setAddType] = useState<FieldType>("short_text");
  const [preview, setPreview] = useState<"desktop" | "mobile">("desktop");
  const [selected, setSelected] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [previewSuccess, setPreviewSuccess] = useState(false);
  const [copyNotice, setCopyNotice] = useState("");
  const [previewAnswers, setPreviewAnswers] = useState<Answers>({});
  const [previewNotice, setPreviewNotice] = useState("");
  useEffect(() => { setOrigin(window.location.origin); api<SavedForm>(`/api/forms/${id}`).then((saved) => { setForm(saved); setDraft(saved.draft); setSelected(blocksOf(saved.draft)[0]?.id ?? null); }).catch((cause) => setError(cause.message)); }, [id]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(form?.draft);
  const unpublishedChanges = form?.isPublished && JSON.stringify(draft) !== JSON.stringify(form.published);
  const blocks = draft ? blocksOf(draft) : [];
  const previewState = draft ? validatePreview(draft) : null;
  function updateDraft(next: FormSchema) { setDraft(next); setPreviewSuccess(false); setPreviewNotice(""); }
  function changeBlocks(next: FormBlock[]) { if (draft) { const { question: _question, ...rest } = draft; updateDraft({ ...rest, blocks: next }); setPreviewAnswers({}); setPreviewNotice(""); } }
  function updateBlock(index: number, update: Partial<FormBlock>) { changeBlocks(blocks.map((block, position) => position === index ? { ...block, ...update } : block)); }
  function move(index: number, direction: number) { const next = [...blocks]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; changeBlocks(next); }
  async function action(operation: "save" | "publish" | "unpublish") {
    setBusy(true); setError(""); setNotice("");
    try {
      if (operation === "save") parseSchema(draft);
      const saved = await api<SavedForm>(`/api/forms/${id}${operation === "save" ? "" : `/${operation}`}`, operation === "save" ? "PATCH" : "POST", operation === "save" ? draft : {});
      setForm(saved); if (operation === "save") setDraft(saved.draft);
      setNotice(operation === "save" ? "Draft saved. Your live form hasn’t changed." : operation === "publish" ? "Published. Your link is ready to share." : "Unpublished. New responses are now blocked.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save changes."); }
    finally { setBusy(false); }
  }
  const publicUrl = `${origin}/f/${id}`;
  const embedCode = `<iframe src="${publicUrl}" title="Fold form" width="100%" height="800" style="border:0" loading="lazy"></iframe>`;
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setCopyNotice(`${label} copied.`); }
    catch { setCopyNotice(`Could not copy ${label.toLowerCase()}. Select and copy the text below instead.`); }
  }
  function addBlock() {
    const block: FormBlock = { id: crypto.randomUUID(), type: addType, label: ["heading", "description"].includes(addType) ? "Your content" : "Your question", required: !["heading", "description"].includes(addType), ...(isChoice(addType) ? { options: ["Option 1", "Option 2"] } : {}), ...(addType === "rating" ? { min: 1, max: 5 } : {}) };
    changeBlocks([...blocks, block]); setSelected(block.id);
  }
  const toolbar = form && draft ? <>
    <div className="fold-save-status" role="status"><span className={`fold-status-dot ${form.isPublished ? "is-published" : ""}`} />{form.archived ? "Archived" : form.isPublished ? "Published" : "Draft"}<span className="fold-save-detail"> · {dirty ? "Unsaved changes" : unpublishedChanges ? "Saved changes not yet published" : `Last saved ${new Date(form.updatedAt).toLocaleString()}`}</span></div>
    <div className="fold-save-actions"><Button variant="outline" disabled={busy || !dirty} onClick={() => action("save")}><Save />Save draft</Button><Button disabled={busy || dirty || form.archived} title={dirty ? "Save your draft before publishing" : undefined} onClick={() => action("publish")}><Send />{form.isPublished ? "Republish" : "Publish"}</Button></div>
  </> : undefined;
  return <OwnerShell wide navigation={<FormNav id={id} active="editor" />} toolbar={toolbar}>
    {error && <div className="p-5"><ErrorNotice message={error} /></div>}
    {!form || !draft ? error ? <Link href="/" className="p-5 text-primary underline">Back to your workspace</Link> : <Loading /> : <>
      {notice && <p role="status" className="fold-notice">{notice}</p>}
      <div className="fold-mobile-switch" role="group" aria-label="Builder view"><Button variant={mobileView === "edit" ? "secondary" : "ghost"} aria-pressed={mobileView === "edit"} onClick={() => setMobileView("edit")}>Edit</Button><Button variant={mobileView === "preview" ? "secondary" : "ghost"} aria-pressed={mobileView === "preview"} onClick={() => setMobileView("preview")}>Preview</Button></div>
      <div className="fold-split" data-view={mobileView}>
        <section aria-label="Form editor" className="fold-edit-pane">
          <Link href="/" className="mb-5 inline-flex items-center gap-2 text-sm hover:underline"><ArrowLeft className="size-4" />All forms</Link>
          <div className="mb-8 space-y-2"><Label htmlFor="title" className="sr-only">Form title</Label><Input id="title" value={draft.title} disabled={busy} maxLength={200} className="fold-title-input" onChange={event => updateDraft({ ...draft, title: event.target.value })} /><Label htmlFor="form-description" className="sr-only">Form description</Label><Textarea id="form-description" value={draft.description ?? ""} disabled={busy} maxLength={2000} placeholder="Add a description for your respondents…" className="fold-description-input" onChange={event => updateDraft({ ...draft, description: event.target.value })} /></div>
          <h2 className="mb-5 text-lg">Questions ({blocks.filter(block => !isContent(block)).length}){blocks.some(isContent) && <span className="ml-2 text-sm font-normal text-muted-foreground">· {blocks.length} blocks</span>}</h2>
          <div className="space-y-3">{blocks.map((block, index) => {
            const expanded = selected === block.id;
            const Icon = typeIcons[block.type];
            return <section key={block.id} className={`fold-question ${expanded ? "is-selected" : ""}`}>
              <button type="button" aria-expanded={expanded} aria-controls={`settings-${block.id}`} className="fold-question-row" onClick={() => setSelected(expanded ? null : block.id)}><GripVertical className="fold-grip size-4" /><span className="min-w-0 flex-1 break-words text-left font-semibold">{index + 1}. {block.label || "Untitled question"}</span><span className="fold-type-label"><Icon className="size-4 shrink-0" /><span>{typeLabels[block.type]}</span></span><ChevronDown className={`size-4 shrink-0 ${expanded ? "rotate-180" : ""}`} /></button>
              {expanded && <div id={`settings-${block.id}`} className="fold-question-settings space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm">{index + 1}. {typeLabels[block.type]}</h3><div className="flex gap-1"><Button size="icon" variant="ghost" aria-label={`Move block ${index + 1} up`} disabled={busy || index === 0} onClick={() => move(index, -1)}><ArrowUp /></Button><Button size="icon" variant="ghost" aria-label={`Move block ${index + 1} down`} disabled={busy || index === blocks.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button><Button size="icon" variant="ghost" aria-label={`Delete block ${index + 1}`} disabled={busy} onClick={() => { changeBlocks(blocks.filter(item => item.id !== block.id)); setSelected(blocks[index + 1]?.id ?? blocks[index - 1]?.id ?? null); }}><Trash2 /></Button></div></div>
            <ChoiceSelect label={`Type of block ${index + 1}`} value={typeLabels[block.type]} options={fieldTypes.map((type) => typeLabels[type])} disabled={busy} onChange={(value) => { const type = fieldTypes.find((item) => typeLabels[item] === value) ?? "short_text"; const next: FormBlock = { id: block.id, type, label: block.label, required: !["heading", "description"].includes(type) && block.required, description: block.description, ...(isChoice(type) ? { options: block.options ?? ["Option 1", "Option 2"] } : {}), ...(type === "rating" ? { min: 1, max: 5 } : {}) }; changeBlocks(blocks.map((item, position) => position === index ? next : item)); }} />
            <div className="space-y-2"><Label htmlFor={index === 0 ? "question" : `label-${block.id}`}>{isContent(block) ? "Content" : "Question"}</Label><Input id={index === 0 ? "question" : `label-${block.id}`} value={block.label} disabled={busy} maxLength={2000} onChange={(event) => updateBlock(index, { label: event.target.value })} /></div>
            {!isContent(block) && <><div className="space-y-2"><Label htmlFor={`description-${block.id}`}>Help text</Label><Textarea id={`description-${block.id}`} value={block.description ?? ""} disabled={busy} maxLength={2000} onChange={(event) => updateBlock(index, { description: event.target.value })} /></div><div className="flex items-center justify-between gap-4"><Label htmlFor={index === 0 ? "required" : `required-${block.id}`}>Required question</Label><Switch id={index === 0 ? "required" : `required-${block.id}`} checked={block.required} disabled={busy} onCheckedChange={(required) => updateBlock(index, { required })} /></div></>}
            {isChoice(block.type) && <div className="space-y-2"><Label htmlFor={`options-${block.id}`}>Options (one per line)</Label><Textarea id={`options-${block.id}`} value={block.options?.join("\n") ?? ""} disabled={busy} onChange={(event) => updateBlock(index, { options: event.target.value.split("\n") })} /></div>}
            {(block.type === "number" || block.type === "rating") && <div className="grid grid-cols-2 gap-3">{(["min", "max"] as const).map((bound) => <div key={bound} className="space-y-2"><Label htmlFor={`${bound}-${block.id}`}>{bound === "min" ? "Minimum" : "Maximum"}</Label><Input id={`${bound}-${block.id}`} type="number" step={block.type === "rating" ? 1 : "any"} value={block[bound] ?? ""} disabled={busy} onChange={(event) => updateBlock(index, { [bound]: event.target.value === "" ? undefined : Number(event.target.value) })} /></div>)}</div>}

              </div>}
            </section>;
          })}</div>
          <div className="my-6 flex flex-wrap gap-3"><div className="min-w-40 flex-1"><ChoiceSelect value={typeLabels[addType]} label="Block type" options={fieldTypes.map(type => typeLabels[type])} onChange={value => setAddType(fieldTypes.find(type => typeLabels[type] === value) ?? "short_text")} disabled={busy} /></div><Button disabled={busy || blocks.length >= 50} onClick={addBlock}><Plus />Add block</Button></div>
          <details className="fold-settings" open><summary><Settings2 className="size-4" />Form settings<span className="ml-auto text-xs font-normal text-muted-foreground">Logo & confirmation</span></summary><div className="space-y-3 pt-5"><Label htmlFor="logo">Logo URL (HTTPS)</Label><Input id="logo" type="url" disabled={busy} value={draft.logoUrl ?? ""} onChange={event => updateDraft({ ...draft, logoUrl: event.target.value })} /><p className="text-xs text-muted-foreground">Use a trusted hosted image. External images can see a visitor’s IP address; Fold sends no referrer and does not fetch images on its server.</p><Label htmlFor="confirmation">Confirmation message</Label><Textarea id="confirmation" maxLength={2000} disabled={busy} value={draft.confirmation ?? ""} placeholder="Your response has been saved." onChange={event => updateDraft({ ...draft, confirmation: event.target.value })} /></div></details>
          <details className="fold-settings" open><summary><ExternalLink className="size-4" />Share your form</summary><div className="space-y-3 pt-5"><p className="text-sm text-muted-foreground">Save, then publish. Draft edits stay private until republished.{!form.isPublished && " This link is not accepting responses yet."}</p><Label htmlFor="public-link">Public link</Label><Input id="public-link" readOnly value={publicUrl} /><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => copy(publicUrl, "Link")}><Copy />Copy link</Button>{form.isPublished && <Button asChild variant="outline"><a href={publicUrl} target="_blank" rel="noreferrer">Open live form<ExternalLink /></a></Button>}</div><Label htmlFor="embed">Iframe embed</Label><Textarea id="embed" readOnly value={embedCode} /><Button variant="outline" onClick={() => copy(embedCode, "Embed code")}><Copy />Copy embed code</Button>{copyNotice && <p role="status" className="text-sm">{copyNotice}</p>}{form.isPublished && <div><Button variant="ghost" disabled={busy} onClick={() => action("unpublish")}>Unpublish form</Button></div>}</div></details>
        </section>
        <section aria-label="Draft preview" className="fold-preview-pane"><div className="fold-preview-toolbar"><div><h2 className="text-xl">Live preview</h2><p className="mt-2 text-sm text-muted-foreground">Your unsaved draft, just as respondents will see it.</p></div><div className="fold-device-switch" role="group" aria-label="Preview device"><Button size="sm" variant={preview === "desktop" ? "secondary" : "ghost"} aria-pressed={preview === "desktop"} onClick={() => setPreview("desktop")}><Monitor />Desktop</Button><Button size="sm" variant={preview === "mobile" ? "secondary" : "ghost"} aria-pressed={preview === "mobile"} onClick={() => setPreview("mobile")}><Smartphone />Mobile</Button></div></div><p className="mb-5 text-xs text-muted-foreground">Preview only · Test submissions never enter your responses.</p>
          <div className={`fold-preview-sheet ${preview === "mobile" ? "is-mobile" : ""}`}>{previewState?.schema ? previewSuccess ? <><FormConfirmation schema={previewState.schema} preview /><Button variant="outline" onClick={() => { setPreviewSuccess(false); setPreviewNotice(""); }}>Back to form</Button></> : <FormBody schema={previewState.schema} answers={previewAnswers} onChange={setPreviewAnswers} preview error={previewNotice} onSubmit={event => { event.preventDefault(); try { parseAnswers(previewAnswers, previewState.schema!); setPreviewNotice(""); setPreviewSuccess(true); } catch (cause) { setPreviewNotice(cause instanceof Error ? cause.message : "Invalid preview."); } }} /> : <ErrorNotice message={previewState?.error || "Fix the draft configuration to preview this form."} />}</div>
        </section>
      </div>
    </>}
  </OwnerShell>;
}
