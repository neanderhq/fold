"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import type { AlertView, DeliveryKind, DeliveryRow } from "@/lib/response-delivery";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorNotice, FormNav, Loading, OwnerShell } from "./shared";

type DeliverySettingsView = {
  alert: AlertView;
  recent: DeliveryRow[];
};

export function DeliverySettings({ id }: { id: string }) {
  const [settings, setSettings] = useState<DeliverySettingsView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const path = `/api/forms/${id}/integrations`;

  useEffect(() => {
    api<DeliverySettingsView>(path).then(setSettings).catch(cause => setError(cause.message));
  }, [path]);

  async function perform(body?: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      if (body) await api(path, "POST", body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update delivery.");
    }
    try { setSettings(await api<DeliverySettingsView>(path)); }
    catch { setError("Unable to refresh delivery settings."); }
    finally { setBusy(false); }
  }

  const alert = settings?.alert;
  return <OwnerShell navigation={<FormNav id={id} active="integrations" />}>
    <div className="mb-8">
      <h1>Integrations</h1>
      <p className="mt-3 text-muted-foreground">Choose where this form sends new responses.</p>
    </div>
    {error && <div className="mb-5"><ErrorNotice message={error} /></div>}
    {!settings && !error && <Loading />}
    {alert && <div className="max-w-3xl space-y-6">
      <Card className="min-w-0 shadow-none">
        <CardHeader><CardTitle><h2 id="alert-heading">Response alerts</h2></CardTitle></CardHeader>
        <CardContent aria-labelledby="alert-heading" className="space-y-4">
          <p className="text-sm text-muted-foreground">Email the workspace owner a private response link. Answers stay in Fold.</p>
          <div role="status" aria-label="Alert status" className="space-y-1 text-sm">
            <p><strong>{!alert.configured ? "Sender unconfigured" : alert.enabled ? "Alerts on" : alert.awaitingCode ? "Verification required" : "Alerts off"}</strong></p>
            <p className="break-all text-muted-foreground">{alert.address}</p>
          </div>
          {!alert.configured && <p className="text-sm text-muted-foreground">Ask your deployment operator to configure a verified mail sender.</p>}
          {alert.enabled ? <Button variant="outline" disabled={busy} onClick={() => void perform({ action: "alert-disable" })}>Disable alerts</Button>
            : alert.configured && <div className="space-y-3">
              {alert.awaitingCode && <form className="space-y-3" onSubmit={event => {
                event.preventDefault();
                void perform({ action: "alert-confirm", code });
                setCode("");
              }}>
                <div className="max-w-xs space-y-2">
                  <Label htmlFor="alert-code">Verification code</Label>
                  <Input id="alert-code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={event => setCode(event.target.value)} />
                </div>
                <Button disabled={busy || !/^\d{8}$/.test(code)}>Verify and enable alerts</Button>
              </form>}
              <Button variant={alert.awaitingCode ? "outline" : "default"} disabled={busy} onClick={() => void perform({ action: "alert-start" })}>
                {alert.available ? "Enable alerts" : alert.awaitingCode ? "Request another code" : "Send verification code"}
              </Button>
            </div>}
        </CardContent>
      </Card>
      <DeliveryActivity id={id} items={settings.recent.filter(row => row.kind === "alert")} kind="alert" busy={busy} onAction={perform} />
    </div>}
  </OwnerShell>;
}

export function DeliveryActivity({ id, items, kind, busy, onAction }: {
  id: string;
  items: DeliveryRow[];
  kind: DeliveryKind;
  busy: boolean;
  onAction: (body?: Record<string, unknown>) => Promise<void>;
}) {
  return <Card className="min-w-0 shadow-none">
    <CardHeader><CardTitle><h2>{kind === "alert" ? "Recent alerts" : "Recent Sheets writes"}</h2></CardTitle></CardHeader>
    <CardContent className="space-y-4 text-sm">
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void onAction()}>Refresh activity</Button>
      {items.length === 0 ? <p className="text-muted-foreground">No delivery attempts yet.</p>
        : <ul className="divide-y">{items.map(item => <li key={item.responseId} className="flex flex-wrap items-start justify-between gap-3 py-3">
          <div className="min-w-0 space-y-1">
            <p className="font-medium">{item.status === "delivered" ? kind === "alert" ? "Accepted by mail provider" : "Synced" : item.status === "failed" ? "Delivery failed" : item.status === "cancelled" ? "Cancelled" : "Pending"}</p>
            {item.detail && <p className="break-words text-muted-foreground">{item.detail}</p>}
            <Link className="text-primary underline" href={`/forms/${id}/responses?response=${item.responseId}`}>Open response</Link>
            <p className="text-xs text-muted-foreground">{new Date(item.updatedAt).toLocaleString()}</p>
          </div>
          {(item.status === "pending" || item.status === "failed") &&
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void onAction({ action: "retry", responseId: item.responseId, kind })}>Retry delivery</Button>}
        </li>)}</ul>}
    </CardContent>
  </Card>;
}
