import { useState } from "react";
import { Copy, ExternalLink, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { SavedForm } from "@/lib/form-types";

export function ShareDialog({ form, origin, busy, open, onOpenChange, onUnpublish }: {
  form: SavedForm; origin: string; busy: boolean; open: boolean; onOpenChange: (open: boolean) => void; onUnpublish: () => void;
}) {
  const [notice, setNotice] = useState("");
  const url = `${origin}/f/${form.id}`;
  const embed = `<iframe src="${url}" title="Fold form" width="100%" height="800" style="border:0" loading="lazy"></iframe>`;
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setNotice(`${label} copied.`); }
    catch { setNotice(`Could not copy ${label.toLowerCase()}. Select and copy the text below instead.`); }
  }
  return <Dialog open={open} onOpenChange={value => { setNotice(""); onOpenChange(value); }}>
    <DialogTrigger asChild><Button variant="outline" className="fold-share-trigger" aria-label="Share"><Link2 /><span className="fold-action-label">Share</span></Button></DialogTrigger>
    <DialogContent className="fold-share-dialog">
      <DialogHeader><DialogTitle>Share your form</DialogTitle><DialogDescription>{form.isPublished ? "Your form is live. Share a link or embed it on your website." : "Publish your form to start collecting responses at this link."}</DialogDescription></DialogHeader>
      <div className="space-y-3"><Label htmlFor="public-link">Public link</Label><Input id="public-link" readOnly value={url} onFocus={event => event.currentTarget.select()} />
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => copy(url, "Link")}><Copy />Copy link</Button>{form.isPublished && <Button asChild variant="outline"><a href={url} target="_blank" rel="noreferrer">Open live form<ExternalLink /></a></Button>}</div></div>
      <div className="space-y-3 border-t pt-5"><Label htmlFor="embed">Iframe embed</Label><Textarea id="embed" readOnly value={embed} onFocus={event => event.currentTarget.select()} /><Button variant="outline" onClick={() => copy(embed, "Embed code")}><Copy />Copy embed code</Button></div>
      {notice && <p role="status" className="text-sm">{notice}</p>}
      <p className="text-sm text-muted-foreground">Only published changes appear on the live form. Draft edits stay private until you republish.</p>
      {form.isPublished && <div className="border-t pt-4"><Button variant="ghost" disabled={busy} onClick={onUnpublish}>Unpublish form</Button><p className="mt-2 text-xs text-muted-foreground">Stops new responses. Existing responses are kept.</p></div>}
    </DialogContent>
  </Dialog>;
}
