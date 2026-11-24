"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Check, CircleDot, LoaderCircle, Monitor, Plus, Save, Send, Settings2, Smartphone } from "lucide-react";
import { api } from "@/lib/api-client";
import type { SavedForm } from "@/lib/form-types";
import { blocksOf, isChoice, isContent, parseAnswers, type Answers, type FieldType, type FormBlock, type FormSchema } from "@/lib/form-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorNotice, FormNav, Loading, OwnerShell } from "./shared";
import { FormBody, FormConfirmation } from "./form-body";
import { BlockPicker } from "./block-picker";
import { QuestionCard } from "./question-card";
import { ShareDialog } from "./share-dialog";
import { sameDraft, useFormDraft } from "./use-form-draft";
import { AppearancePicker } from "./appearance-picker";

export function Editor({ id }: { id: string }) {
  const { form, setForm, draft, updateDraft, dirty, saving, save, saveError, loadError, issue, validatedDraft, confirmLeave } = useFormDraft(id);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");
  const [picker, setPicker] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [preview, setPreview] = useState<"desktop" | "mobile">("desktop");
  const [selected, setSelected] = useState<string | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [previewSuccess, setPreviewSuccess] = useState(false);
  const [previewAnswers, setPreviewAnswers] = useState<Answers>({});
  const [previewNotice, setPreviewNotice] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  useEffect(() => { if (form) setSelected(blocksOf(form.draft)[0]?.id ?? null); }, [form?.id]);
  const unpublishedChanges = Boolean(form?.isPublished && !sameDraft(draft, form.published));
  const blocks = draft ? blocksOf(draft) : [];
  const previewState = { schema: validatedDraft, error: issue };
  const saveStatus = saving ? "Saving…" : saveError ? "Save failed" : dirty ? issue ? "Finish editing to save" : "Unsaved changes" : "All changes saved";

  function edit(next: FormSchema) {
    updateDraft(next); setPreviewSuccess(false); setPreviewNotice(""); setError(""); setNotice("");
  }
  function changeBlocks(next: FormBlock[]) {
    if (!draft) return;
    const { question: _question, ...rest } = draft;
    edit({ ...rest, blocks: next }); setPreviewAnswers({});
  }
  function move(from: number, to: number) {
    const next = [...blocks]; const [block] = next.splice(from, 1); next.splice(to, 0, block); changeBlocks(next);
  }
  function addBlock(type: FieldType) {
    const block: FormBlock = { id: crypto.randomUUID(), type, label: ["heading", "description"].includes(type) ? "Your content" : "Your question",
      required: !["heading", "description"].includes(type), ...(isChoice(type) ? { options: ["Option 1", "Option 2"] } : {}), ...(type === "rating" ? { min: 1, max: 5 } : {}) };
    changeBlocks([...blocks, block]); setSelected(block.id);
  }
  function duplicate(index: number) {
    const block = { ...blocks[index], id: crypto.randomUUID(), ...(blocks[index].options ? { options: [...blocks[index].options!] } : {}) };
    const next = [...blocks]; next.splice(index + 1, 0, block); changeBlocks(next); setSelected(block.id);
  }
  async function action(operation: "publish" | "unpublish") {
    if (saving || (operation === "publish" && dirty)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = await api<SavedForm>(`/api/forms/${id}/${operation}`, "POST", {});
      setForm(saved);
      setNotice(operation === "publish" ? "Published. Your link is ready to share." : "Unpublished. New responses are now blocked.");
      if (operation === "publish") setSharing(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update publication."); }
    finally { setBusy(false); }
  }

  const toolbar = form && draft ? <>
    <div className="fold-save-status" role="status" aria-label="Draft save status" data-save-state={saveError ? "error" : saving ? "saving" : dirty ? "unsaved" : "saved"}>
      {saving ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : saveError ? <AlertCircle className="size-3.5" aria-hidden="true" /> : dirty ? <CircleDot className="size-3.5" aria-hidden="true" /> : <Check className="size-3.5" aria-hidden="true" />}<span>{saveStatus}</span>
    </div>
    <div className="fold-save-actions">
      <Button variant="ghost" aria-label={saveError ? "Retry save" : "Save draft"} disabled={busy || saving || !dirty} onClick={() => { if (issue) setError(issue); else void save(); }}><Save /><span className="fold-action-label">{saveError ? "Retry save" : "Save draft"}</span></Button>
      <ShareDialog form={form} origin={origin} busy={busy || saving} open={sharing} onOpenChange={setSharing} onUnpublish={() => void action("unpublish")} />
      <Button disabled={busy || saving || dirty || form.archived} title={dirty ? "Your draft must finish saving before publishing" : undefined} onClick={() => void action("publish")}><Send />{busy ? "Publishing…" : form.isPublished ? "Republish" : "Publish"}</Button>
    </div>
  </> : undefined;

  return <OwnerShell wide confirmLeave={confirmLeave} navigation={<FormNav id={id} active="editor" confirmLeave={confirmLeave} />} toolbar={toolbar}>
    {(error || loadError || saveError) && <div className="px-5 pt-5"><ErrorNotice message={error || loadError || `Draft not saved: ${saveError} Your edits are still here. Use Retry save.`} /></div>}
    {!form || !draft ? loadError ? <Link href="/" className="p-5 text-primary underline">Back to your workspace</Link> : <Loading /> : <>
      {notice && <p role="status" className="fold-notice">{notice}</p>}
      <div className="fold-mobile-switch" role="group" aria-label="Builder view"><Button variant={mobileView === "edit" ? "secondary" : "ghost"} aria-pressed={mobileView === "edit"} onClick={() => setMobileView("edit")}>Edit</Button><Button variant={mobileView === "preview" ? "secondary" : "ghost"} aria-pressed={mobileView === "preview"} onClick={() => setMobileView("preview")}>Preview</Button></div>
      <div className="fold-split" data-view={mobileView}>
        <section aria-label="Form editor" className="fold-edit-pane">
          <Link href="/" className="fold-back-link" onNavigate={event => { if (!confirmLeave()) event.preventDefault(); }}><ArrowLeft className="size-4" />All forms</Link>
          <div className="fold-editor-intro"><p className="fold-editor-eyebrow">{form.archived ? "Archived form" : form.isPublished ? "Published form" : "Draft form"}</p>
            <Label htmlFor="title" className="sr-only">Form title</Label><Input id="title" value={draft.title} disabled={busy} maxLength={200} className="fold-title-input" onChange={event => edit({ ...draft, title: event.target.value })} />
            <Label htmlFor="form-description" className="sr-only">Form description</Label><Textarea id="form-description" value={draft.description ?? ""} disabled={busy} maxLength={2000} placeholder="Add a description for your respondents…" className="fold-description-input" onChange={event => edit({ ...draft, description: event.target.value })} />
            <p className="fold-draft-hint">{dirty && issue ? issue : unpublishedChanges ? "Your draft has changes. Republish when you’re ready to make them live." : "Drafts save automatically. You choose when to publish."}</p>
          </div>
          <Tabs defaultValue="questions" className="fold-editor-tabs">
            <TabsList aria-label="Editor sections"><TabsTrigger value="questions">Questions <span className="fold-count">{blocks.filter(block => !isContent(block)).length}</span></TabsTrigger><TabsTrigger value="settings"><Settings2 />Settings</TabsTrigger></TabsList>
            <TabsContent value="questions" className="space-y-3 pt-5">
              <p id="fold-reorder-help" className="sr-only">Drag blocks to reorder, or open a block and use its Move up and Move down buttons.</p>
              {blocks.map((block, index) => <QuestionCard key={block.id} block={block} index={index} count={blocks.length} expanded={selected === block.id} disabled={busy}
                dropTarget={dropTarget === block.id} onSelect={() => setSelected(selected === block.id ? null : block.id)}
                onChange={next => changeBlocks(blocks.map((item, position) => position === index ? next : item))}
                onMove={direction => move(index, index + direction)} onDuplicate={() => duplicate(index)}
                onDelete={() => { changeBlocks(blocks.filter(item => item.id !== block.id)); setSelected(blocks[index + 1]?.id ?? blocks[index - 1]?.id ?? null); }}
                onDragStart={() => setDragged(block.id)} onDragEnd={() => { setDragged(null); setDropTarget(null); }}
                onDragOver={() => { if (!dragged || dragged === block.id) return false; setDropTarget(block.id); return true; }}
                onDrop={() => { const from = blocks.findIndex(item => item.id === dragged); if (from >= 0 && from !== index) move(from, index); setDragged(null); setDropTarget(null); }} />)}
              <Button className="fold-add-block" variant="outline" disabled={busy || blocks.length >= 50} onClick={() => setPicker(true)}><Plus />Add block</Button>
              <p className="fold-block-help">Choose from 12 question and content types. Drag to reorder or use the arrow buttons.</p>
            </TabsContent>
            <TabsContent value="settings" className="fold-form-settings">
              <div><h2>Make it yours</h2><p className="text-sm text-muted-foreground">Set the finishing touches for this form.</p></div>
              <AppearancePicker value={draft.appearance} disabled={busy} onChange={appearance => edit({ ...draft, appearance })} />
              <div className="space-y-2"><Label htmlFor="logo">Logo URL (HTTPS)</Label><Input id="logo" type="url" disabled={busy} value={draft.logoUrl ?? ""} placeholder="https://example.com/logo.png" onChange={event => edit({ ...draft, logoUrl: event.target.value })} /><p className="text-xs text-muted-foreground">Use a trusted hosted image. The image host can see visitors’ IP addresses. Fold sends no referrer and doesn’t fetch the image on its server.</p></div>
              <div className="space-y-2"><Label htmlFor="confirmation">Confirmation message</Label><Textarea id="confirmation" maxLength={2000} disabled={busy} value={draft.confirmation ?? ""} placeholder="Your response has been saved." onChange={event => edit({ ...draft, confirmation: event.target.value })} /><p className="text-xs text-muted-foreground">Shown after a successful submission. Try it in the preview.</p></div>
            </TabsContent>
          </Tabs>
        </section>
        <section aria-label="Draft preview" className="fold-preview-pane">
          <div className="fold-preview-toolbar"><div><p className="fold-editor-eyebrow">Respondent view</p><h2 className="text-xl">Live preview</h2></div><div className="fold-device-switch" role="group" aria-label="Preview device"><Button size="sm" variant={preview === "desktop" ? "secondary" : "ghost"} aria-pressed={preview === "desktop"} onClick={() => setPreview("desktop")}><Monitor />Desktop</Button><Button size="sm" variant={preview === "mobile" ? "secondary" : "ghost"} aria-pressed={preview === "mobile"} onClick={() => setPreview("mobile")}><Smartphone />Mobile</Button></div></div>
          <p className="fold-preview-caption">Try your draft here. Test submissions never enter your responses.</p>
          <div className={`fold-preview-sheet fold-form-surface ${preview === "mobile" ? "is-mobile" : ""}`} data-form-appearance={draft.appearance ?? "classic"}>
            {previewState?.schema ? previewSuccess ? <><FormConfirmation schema={previewState.schema} preview /><Button variant="outline" onClick={() => { setPreviewSuccess(false); setPreviewNotice(""); }}>Back to form</Button></> : <FormBody schema={previewState.schema} answers={previewAnswers} onChange={setPreviewAnswers} preview error={previewNotice} onSubmit={event => { event.preventDefault(); try { parseAnswers(previewAnswers, previewState.schema!); setPreviewNotice(""); setPreviewSuccess(true); } catch (cause) { setPreviewNotice(cause instanceof Error ? cause.message : "Invalid preview."); } }} /> : <ErrorNotice message={previewState?.error || "Fix the draft configuration to preview this form."} />}
          </div>
        </section>
      </div>
      <BlockPicker open={picker} onOpenChange={setPicker} onSelect={addBlock} />
    </>}
  </OwnerShell>;
}
