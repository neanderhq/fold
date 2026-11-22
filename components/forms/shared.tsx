"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { FileText, LogOut } from "lucide-react";
import { authClient } from "@/app/auth-client";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

export function ErrorNotice({ message }: { message: string }) {
  return <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>;
}

export function Loading() {
  return <div role="status" className="space-y-4 py-12"><span className="sr-only">Loading…</span><Skeleton className="h-8 w-48" /><Skeleton className="h-32 w-full" /></div>;
}

export function OwnerShell({ children, navigation, toolbar, wide = false }: { children: ReactNode; navigation?: ReactNode; toolbar?: ReactNode; wide?: boolean }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message || "Could not sign out.");
      window.location.assign("/");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not sign out."); }
    finally { setBusy(false); }
  }
  return <div className="fold-workspace min-h-screen text-foreground">
    <header className="fold-header"><div className="fold-header-inner">
      <Link href="/" className="fold-brand"><FileText className="size-6" /> Fold</Link>
      {navigation || <Link href="/" className="fold-workspace-link">My forms</Link>}
      {toolbar ? <div className="fold-toolbar">{toolbar}</div> : <Button className="ml-auto" variant="ghost" onClick={logout} disabled={busy}><LogOut />{busy ? "Signing out…" : "Log out"}</Button>}
    </div></header>
    <main className={wide ? "fold-builder" : "mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-12"}>{error && <div className="mb-6"><ErrorNotice message={error} /></div>}{children}</main>
  </div>;
}

export function FormNav({ id, active }: { id: string; active: "editor" | "responses" }) {
  return <nav aria-label="Form navigation" className="fold-form-nav">
    <Button asChild variant={active === "editor" ? "secondary" : "ghost"}><Link aria-current={active === "editor" ? "page" : undefined} href={`/forms/${id}`}>Editor</Link></Button>
    <Button asChild variant={active === "responses" ? "secondary" : "ghost"}><Link aria-current={active === "responses" ? "page" : undefined} href={`/forms/${id}/responses`}>Responses</Link></Button>
  </nav>;
}
