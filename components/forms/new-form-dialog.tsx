import { ArrowRight, Calendar, FileText, MessageSquare, Star } from "lucide-react";
import { formStarters } from "@/lib/form-starters";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorNotice } from "./shared";

const icons = [Star, Calendar, MessageSquare];

export function NewFormDialog({ open, onOpenChange, busy, onCreate, error }: { open: boolean; onOpenChange: (open: boolean) => void; busy: boolean; onCreate: (starter?: string) => void; error: string }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="fold-new-form-dialog">
    <DialogHeader><DialogTitle>Start your next form</DialogTitle><DialogDescription>Start fresh or make one of these forms your own.</DialogDescription></DialogHeader>
    <div className="fold-starter-grid">
      <button type="button" className="fold-starter" disabled={busy} onClick={() => onCreate()}><FileText aria-hidden="true" /><span><strong>Blank form</strong><span>A clean page for your own questions.</span></span><ArrowRight aria-hidden="true" /></button>
      {formStarters.map((starter, index) => { const Icon = icons[index]; return <button key={starter.id} type="button" className="fold-starter" disabled={busy} onClick={() => onCreate(starter.id)}><Icon aria-hidden="true" /><span><strong>{starter.title}</strong><span>{starter.description}</span><small>{starter.blocks.length} questions</small></span><ArrowRight aria-hidden="true" /></button>; })}
    </div>
    {busy && <p role="status" className="text-sm text-muted-foreground">Creating your draft…</p>}
    {error && <ErrorNotice message={error} />}
  </DialogContent></Dialog>;
}
