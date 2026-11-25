import { useState } from "react";
import type { SheetsView } from "@/lib/response-delivery";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SheetsSettings({ settings, busy, onAction }: {
  settings: SheetsView;
  busy: boolean;
  onAction: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [spreadsheet, setSpreadsheet] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const { connection, mappingIssue, publishedFields, serviceEmail, code } = settings;

  return <Card className="min-w-0 shadow-none">
    <CardHeader><CardTitle><h2 id="sheets-heading">Google Sheets</h2></CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Send selected answers from new responses to one spreadsheet. Existing responses stay in Fold.</p>
      <div role="status" aria-label="Sheets status" className="space-y-2 text-sm">
        <p className="font-semibold">{!serviceEmail ? "Google Sheets unconfigured" : connection ? mappingIssue ? "Mapping needs attention" : "Connected" : code ? "Verification required" : "Disconnected"}</p>
        {mappingIssue && <p className="break-words text-destructive">{mappingIssue}</p>}
      </div>
      {!serviceEmail && <p className="text-sm text-muted-foreground">Ask your deployment operator to configure the Google service account.</p>}
      {connection && <>
        <a className="inline-block break-words text-sm text-primary underline" href={`https://docs.google.com/spreadsheets/d/${connection.spreadsheetId}/edit#gid=${connection.sheetId}`} target="_blank" rel="noreferrer">{connection.title} ↗</a>
        <div className="space-y-2 text-sm">
          <h3 className="font-medium">Selected columns</h3>
          <ul className="list-inside list-disc break-words text-muted-foreground">
            <li>Response ID</li><li>Submitted (UTC)</li>
            {connection.fields.map(field => <li key={field.id}>{field.label}</li>)}
          </ul>
        </div>
        <p className="text-sm text-muted-foreground">Disconnecting stops new writes and cancels outstanding attempts. Existing rows remain. Remove the service account’s access in Google when you no longer need it.</p>
        <Button variant="outline" disabled={busy} onClick={() => void onAction({ action: "sheets-disconnect" })}>Disconnect Google Sheets</Button>
      </>}
      {!connection && serviceEmail && (publishedFields.length === 0
        ? <p className="text-sm text-muted-foreground">Publish the form before selecting spreadsheet columns.</p>
        : !code ? <Button disabled={busy} onClick={() => void onAction({ action: "sheets-start" })}>Start Google Sheets setup</Button>
        : <form className="space-y-4" onSubmit={event => {
          event.preventDefault();
          void onAction({ action: "sheets-connect", spreadsheet, fieldIds: selected });
        }}>
          <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
            <li>Share your spreadsheet with <strong className="break-all text-foreground">{serviceEmail}</strong> as Editor.</li>
            <li>Create a sheet named <strong className="text-foreground">Fold setup</strong>. Paste this verification code into cell A1.</li>
          </ol>
          <div className="space-y-2">
            <Label htmlFor="sheets-proof">Sheet verification code</Label>
            <Input id="sheets-proof" value={code} readOnly onFocus={event => event.currentTarget.select()} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sheets-spreadsheet">Spreadsheet link or ID</Label>
            <Input id="sheets-spreadsheet" autoComplete="off" maxLength={400} value={spreadsheet} onChange={event => setSpreadsheet(event.target.value)} required />
          </div>
          <fieldset className="min-w-0 space-y-2">
            <legend className="mb-2 text-sm font-medium">Published fields to send</legend>
            <p className="text-sm text-muted-foreground">Fold also writes the response ID and submission time in UTC.</p>
            {publishedFields.map(field => <label key={field.id} className="flex min-w-0 items-start gap-2 break-words text-sm">
              <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={selected.includes(field.id)} disabled={busy} onChange={event => {
                setSelected(event.target.checked ? [...selected, field.id] : selected.filter(id => id !== field.id));
              }} />
              <span className="min-w-0">{field.label}</span>
            </label>)}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !spreadsheet.trim() || selected.length === 0}>Verify and connect</Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void onAction({ action: "sheets-disconnect" })}>Cancel setup</Button>
          </div>
        </form>)}
    </CardContent>
  </Card>;
}
