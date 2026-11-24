"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, Plus } from "lucide-react";
import { authClient } from "@/app/auth-client";
import { api } from "@/lib/api-client";
import type { SavedForm } from "@/lib/form-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ErrorNotice, Loading, OwnerShell } from "./shared";
import { AuthShell } from "./auth-shell";
import { NewFormDialog } from "./new-form-dialog";

function SignIn() {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const fields = new FormData(event.currentTarget);
    const credentials = { email: String(fields.get("email")), password: String(fields.get("password")) };
    try {
      const result = register
        ? await authClient.signUp.email({ ...credentials, name: String(fields.get("name")).trim() })
        : await authClient.signIn.email(credentials);
      if (result.error) throw new Error(result.error.message || "Unable to sign in.");
      window.location.assign("/");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to sign in."); }
    finally { setBusy(false); }
  }
  return <AuthShell titleId="auth-title">
    <h1 id="auth-title">{register ? "Create your Fold account" : "Log in to Fold"}</h1>
    <form onSubmit={submit} className="fold-auth-form space-y-6" aria-busy={busy}>
      {register && <div className="space-y-2"><Label htmlFor="name">Your name</Label><Input id="name" name="name" autoComplete="name" required maxLength={100} /></div>}
      <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} /></div>
      <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" autoComplete={register ? "new-password" : "current-password"} required minLength={10} maxLength={128} />{register && <p className="text-xs text-muted-foreground">Use at least 10 characters.</p>}</div>
      {!register && <Button asChild variant="link" className="fold-auth-link px-0"><Link href="/forgot-password">Forgot password?</Link></Button>}
      {error && <ErrorNotice message={error} />}
      <Button className="w-full" size="lg" disabled={busy}>{busy ? "Please wait…" : register ? "Create your workspace" : "Log in"}</Button>
    </form>
    <Button variant="link" className="fold-auth-link mt-6 self-start px-0" onClick={() => { setRegister(!register); setError(""); }}>{register ? "Already have an account? Log in" : "New to Fold? Create an account."}</Button>
  </AuthShell>;
}

function Dashboard() {
  const router = useRouter();
  const [forms, setForms] = useState<SavedForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [archived, setArchived] = useState(false);
  const [renaming, setRenaming] = useState<SavedForm | null>(null);
  const [title, setTitle] = useState("");
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    api<SavedForm[]>("/api/forms").then(setForms).catch((cause) => setError(cause.message)).finally(() => setLoading(false));
  }, []);
  async function create(starter?: string) {
    setBusy(true);
    setError("");
    try {
      const form = await api<SavedForm>("/api/forms", "POST", starter ? { starter } : {});
      router.push(`/forms/${form.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create form."); setBusy(false); }
  }
  async function manage(form: SavedForm, operation: "duplicate" | "archive" | "restore" | "rename") {
    setBusy(true); setError("");
    try {
      await api(`/api/forms/${form.id}/${operation}`, "POST", operation === "rename" ? { title } : {});
      setForms(await api<SavedForm[]>("/api/forms")); setRenaming(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update form."); }
    finally { setBusy(false); }
  }
  const visible = forms.filter((form) => Boolean(form.archived) === archived);
  return <OwnerShell>
    <NewFormDialog open={starting} onOpenChange={open => { setStarting(open); setError(""); }} busy={busy} error={error} onCreate={starter => void create(starter)} />
    <div className="mb-10 flex flex-wrap items-start justify-between gap-5"><div><p className="mb-2 text-sm text-muted-foreground">Your private workspace</p><h1>My forms</h1><p className="mt-3 text-muted-foreground">Thoughtful questions. Answers that stay with you.</p></div><Button onClick={() => setStarting(true)} disabled={busy}><Plus />New form</Button></div>
    <div className="mb-6 flex gap-2" aria-label="Form status filter"><Button variant={archived ? "outline" : "secondary"} onClick={() => setArchived(false)}>Active forms</Button><Button variant={archived ? "secondary" : "outline"} onClick={() => setArchived(true)}>Archived forms</Button></div>
    {error && <div className="mb-6"><ErrorNotice message={error} /></div>}
    {loading ? <Loading /> : visible.length === 0 ? <Card className="border-dashed shadow-none"><CardContent className="flex flex-col items-center px-6 py-16 text-center"><FileText className="mb-5 size-8 text-muted-foreground" /><h2>{archived ? "No archived forms" : "Your first form starts here"}</h2><p className="mb-6 mt-2 max-w-sm text-muted-foreground">{archived ? "Archived forms keep their responses and can be restored." : "Build a form, share your link, and keep every answer in one place."}</p>{!archived && <Button onClick={() => setStarting(true)} disabled={busy}>Create a form<ArrowRight /></Button>}</CardContent></Card> : <div className="grid gap-4 sm:grid-cols-2">{visible.map((form) => <Card key={form.id} className="min-w-0 shadow-none">
      <CardContent className="p-6">
        <div className="mb-6 flex items-center justify-between"><FileText className="size-5 text-muted-foreground" /><Badge variant={form.isPublished ? "default" : "secondary"}>{form.archived ? "Archived" : form.isPublished ? "Published" : "Draft"}</Badge></div>
        <Link href={`/forms/${form.id}`} className="rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"><h2 className="break-words text-lg hover:underline">{form.draft.title}</h2></Link>
        <Link href={`/forms/${form.id}/responses`} className="mt-3 block text-sm text-primary underline">{form.responseCount ?? 0} {form.responseCount === 1 ? "response" : "responses"}</Link>
        <p className="mt-2 text-xs text-muted-foreground">Edited {new Date(form.updatedAt).toLocaleDateString()}</p>
        <div className="mt-5 flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={() => { setRenaming(form); setTitle(form.draft.title); }}>Rename</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => manage(form, "duplicate")}>Duplicate</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => manage(form, form.archived ? "restore" : "archive")}>{form.archived ? "Restore" : "Archive"}</Button></div>
      </CardContent>
    </Card>)}</div>}
    <Dialog open={Boolean(renaming)} onOpenChange={(open) => { if (!open) setRenaming(null); }}><DialogContent><DialogHeader><DialogTitle>Rename form</DialogTitle><DialogDescription>This changes the draft title. Republish to update the public form.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (renaming) manage(renaming, "rename"); }}><Label htmlFor="rename-title">Form name</Label><Input id="rename-title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} /><Button disabled={busy}>Save name</Button></form></DialogContent></Dialog>
  </OwnerShell>;
}

export function Workspace() {
  const { data: session, isPending, error } = authClient.useSession();
  if (isPending) return <div className="mx-auto max-w-5xl px-6"><Loading /></div>;
  if (error) return <main className="mx-auto max-w-md p-8"><ErrorNotice message="Could not load your session. Please refresh to try again." /></main>;
  return session ? <Dashboard /> : <SignIn />;
}
