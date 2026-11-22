"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { authClient } from "@/app/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorNotice } from "./shared";
import { AuthShell } from "./auth-shell";

export function PasswordRecovery({ reset = false, enabled }: { reset?: boolean; enabled: boolean }) {
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(!reset);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const initialized = useRef(false);
  useEffect(() => {
    if (!reset) return;
    function readLink() {
      const query = new URLSearchParams(window.location.search);
      const supplied = new URLSearchParams(window.location.hash.slice(1)).get("token") || query.get("token") || "";
      if (initialized.current && !supplied && !query.has("error")) return;
      initialized.current = true;
      setToken(supplied);
      setInvalid(!supplied || Boolean(query.get("error")));
      setDone(false); setError(""); setReady(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
    readLink();
    window.addEventListener("hashchange", readLink);
    return () => window.removeEventListener("hashchange", readLink);
  }, [reset]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const password = String(fields.get("password") || "");
    if (reset && password !== fields.get("confirmation")) { setError("Your passwords don’t match."); return; }
    setBusy(true); setError("");
    try {
      const result = reset
        ? await authClient.resetPassword({ token, newPassword: password })
        : await authClient.requestPasswordReset({ email: String(fields.get("email")), redirectTo: `${window.location.origin}/reset-password` });
      if (result.error) {
        if (result.error.status === 429) setError("Too many requests. Please wait before trying again.");
        else if (result.error.status === 503) setError("Password recovery is currently unavailable. Please try again later.");
        else if (reset && result.error.code === "INVALID_TOKEN") { setInvalid(true); setToken(""); }
        else setError(reset ? "Unable to reset your password right now. Please try again or request a new link." : "Unable to request a reset right now. Please try again later.");
        return;
      }
      setDone(true); setToken("");
    } catch { setError("We couldn’t connect. Please try again."); }
    finally { setBusy(false); }
  }
  const title = done ? (reset ? "Password updated." : "Check your inbox.") : invalid && ready && enabled ? "Let’s get you a new link." : reset ? "Choose a new password." : "Forgot your password?";
  return <AuthShell titleId="recovery-title">
    <h1 id="recovery-title">{title}</h1>
    {!enabled ? <div className="fold-recovery-card mt-7"><p role="status">Password recovery is currently unavailable. Please try again later.</p></div>
      : !ready ? <div className="fold-recovery-card mt-7"><p role="status">Checking your link…</p></div>
      : done ? <div className="fold-recovery-card mt-7 space-y-5">
        <p role="status">{reset ? "Your password has changed and all previous sessions have been signed out. Log in with your new password." : "If an account exists for that email, a reset link will be sent. Check your inbox and spam folder. The link expires in 30 minutes and works once."}</p>
        {reset && <Button asChild size="lg" className="w-full"><Link href="/">Log in with your new password<ArrowRight aria-hidden="true" /></Link></Button>}
      </div>
      : invalid ? <div className="fold-recovery-card mt-7 space-y-5"><ErrorNotice message="This reset link is invalid, expired or already used. Request a new link to continue." /><Button asChild size="lg" className="w-full"><Link href="/forgot-password">Request a new link<ArrowRight aria-hidden="true" /></Link></Button></div>
      : <><p id="recovery-description" className="fold-recovery-intro">{reset ? "Use 10–128 characters. You’ll sign in again on every device." : "Enter your email and we’ll help you get back to your workspace."}</p>
        <form onSubmit={submit} className="fold-recovery-card space-y-6" aria-describedby="recovery-description" aria-busy={busy}>
          {reset ? <><div className="space-y-2"><Label htmlFor="password">New password</Label><Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} aria-describedby="recovery-description" /></div><div className="space-y-2"><Label htmlFor="confirmation">Confirm new password</Label><Input id="confirmation" name="confirmation" type="password" autoComplete="new-password" required minLength={10} maxLength={128} /></div></>
            : <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" /></div>}
          {error && <ErrorNotice message={error} />}
          <Button className="w-full" size="lg" disabled={busy}>{busy ? "Please wait…" : reset ? "Reset password" : "Send reset link"}<ArrowRight aria-hidden="true" /></Button>
          {!reset && <p className="fold-recovery-note">Your reset link expires in 30 minutes and works once.</p>}
        </form></>}
    <Button asChild variant="link" className="fold-auth-link mt-6 self-start px-0"><Link href="/">Back to log in</Link></Button>
  </AuthShell>;
}
