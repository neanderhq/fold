import { createHash, randomBytes } from "node:crypto";
import { JWT } from "google-auth-library";
import { answerText, blocksOf, isContent, isRecord, type FormSchema } from "../lib/form-schema";
import type { SheetsConnection, SheetsField, SheetsSettings } from "../lib/response-delivery";
import { HttpError } from "./http";
import type { responses } from "./schema";

const scope = "https://www.googleapis.com/auth/spreadsheets";
let credentials: { email: string; key: string; client: JWT } | undefined;

function serviceIdentity() {
  const email = process.env.GOOGLE_SHEETS_SERVICE_EMAIL?.trim();
  const key = process.env.GOOGLE_SHEETS_SERVICE_KEY?.replace(/\\n/g, "\n").trim();
  if (!email?.endsWith(".gserviceaccount.com") || !key?.startsWith("-----BEGIN PRIVATE KEY-----")) return null;
  if (!credentials || credentials.email !== email || credentials.key !== key) {
    credentials = { email, key, client: new JWT({
      email, key, scopes: [scope],
      transporterOptions: { timeout: 7000, retry: false, fetchImplementation: (input, init) => fetch(input, init) },
    }) };
  }
  return credentials;
}

export function sheetsServiceEmail() {
  return serviceIdentity()?.email ?? null;
}

export function publishedFields(schema: FormSchema | null): SheetsField[] {
  return schema ? blocksOf(schema).filter(block => !isContent(block)).map(({ id, label, type }) => ({ id, label, type })) : [];
}

export function mappingIssue(connection: SheetsConnection, schema: FormSchema | null) {
  const fields = publishedFields(schema);
  const removed = connection.fields.find(field => !fields.some(current => current.id === field.id && current.type === field.type));
  return removed ? `The mapped field “${removed.label}” was removed or changed type. Restore and republish it, or disconnect and choose new columns.` : null;
}

function spreadsheetId(input: unknown) {
  if (typeof input !== "string" || input.length > 400) return null;
  const candidate = input.trim();
  if (/^[\w-]{15,100}$/.test(candidate)) return candidate;
  try {
    const url = new URL(candidate);
    if (url.origin !== "https://docs.google.com" || url.username || url.password) return null;
    return /^\/spreadsheets\/d\/([\w-]{15,100})(?:\/|$)/.exec(url.pathname)?.[1] ?? null;
  } catch { return null; }
}

type SheetsResponse = { ok: boolean; status: number; data: unknown };
async function sheetsRequest(file: string, path: string, requests?: object[]): Promise<SheetsResponse> {
  const identity = serviceIdentity();
  if (!identity) throw new HttpError(409, "Google Sheets is not configured on this deployment.");
  try {
    const access = await identity.client.getAccessToken();
    if (!access.token) throw new Error("Missing service access token");
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${file}${path}`, {
      method: requests ? "POST" : "GET",
      headers: { authorization: `Bearer ${access.token}`, ...(requests ? { "content-type": "application/json" } : {}) },
      body: requests ? JSON.stringify({ requests }) : undefined,
      signal: AbortSignal.timeout(7000),
      redirect: "error",
      cache: "no-store",
    });
    return { ok: response.ok, status: response.status, data: response.ok ? await response.json() : null };
  } catch {
    throw new HttpError(502, "Google did not confirm the request. Check access and retry.");
  }
}

function values(result: SheetsResponse) {
  return result.ok && isRecord(result.data) && Array.isArray(result.data.values) ? result.data.values : [];
}

function getRange(spreadsheet: string, range: string) {
  return sheetsRequest(spreadsheet, `/values/${encodeURIComponent(range)}`);
}

function cells(values: string[]) {
  return { values: values.map(stringValue => ({ userEnteredValue: { stringValue } })) };
}

function header(connection: SheetsConnection) {
  return ["Response ID", "Submitted (UTC)", ...connection.fields.map(field => field.label)];
}

async function readOutputHeader(connection: SheetsConnection) {
  const response = await getRange(connection.spreadsheetId, `'${connection.title}'!1:1`);
  return response.ok && JSON.stringify(values(response)[0]) === JSON.stringify(header(connection));
}

type SheetsUpdate = { settings: SheetsSettings; error?: HttpError };

export async function changeSheets(current: SheetsSettings, published: FormSchema | null, body: Record<string, unknown>): Promise<SheetsUpdate> {
  const action = body.action;
  if (action === "sheets-disconnect") return { settings: {} };
  if (!serviceIdentity()) throw new HttpError(409, "Google Sheets is not configured on this deployment.");
  if (current.connection) throw new HttpError(409, "Disconnect the current destination before choosing a new one.");
  if (action === "sheets-start") {
    if (!published) throw new HttpError(409, "Publish the form before selecting spreadsheet columns.");
    if (current.setup && current.setup.expiresAt > Date.now()) return { settings: current };
    return { settings: { setup: { code: "fold-" + randomBytes(16).toString("hex"), expiresAt: Date.now() + 30 * 60 * 1000 } } };
  }
  const id = spreadsheetId(body.spreadsheet);
  const fieldIds = body.fieldIds;
  if (!id || !Array.isArray(fieldIds) || fieldIds.length === 0 || fieldIds.length > 50 ||
    new Set(fieldIds).size !== fieldIds.length) throw new HttpError(400, "Choose a Google spreadsheet and at least one published field.");
  const available = publishedFields(published);
  const selected = available.filter(field => fieldIds.includes(field.id));
  if (selected.length !== fieldIds.length) throw new HttpError(400, "Choose fields from the current published form.");
  if (!current.setup || current.setup.expiresAt <= Date.now()) throw new HttpError(409, "Start setup again to get a new verification code.");
  const setup = current.setup;
  if (setup.spreadsheetId && setup.spreadsheetId !== id) {
    throw new HttpError(409, "Retry with the same spreadsheet, or cancel setup to choose another.");
  }
  const configurationHash = createHash("sha256").update(setup.code).digest();
  const connection: SheetsConnection = {
    spreadsheetId: id,
    sheetId: (configurationHash.readUInt32BE() & 0x7fffffff) || 1,
    title: `Fold responses ${configurationHash.toString("hex").slice(0, 12)}`,
    fields: selected,
  };
  try {
    const proof = await getRange(id, "'Fold setup'!A1");
    if (values(proof)[0]?.[0] !== setup.code) {
      return { settings: current, error: new HttpError(422, "Share this spreadsheet with the service account as Editor and paste your code in Fold setup!A1.") };
    }
    let created = false;
    try {
      const result = await sheetsRequest(id, ":batchUpdate", [
        { addSheet: { properties: { sheetId: connection.sheetId, title: connection.title,
          gridProperties: { frozenRowCount: 1, columnCount: selected.length + 2, rowCount: 1000 } } } },
        { updateCells: { start: { sheetId: connection.sheetId, rowIndex: 0, columnIndex: 0 },
          rows: [cells(header(connection))], fields: "userEnteredValue" } },
      ]);
      created = result.ok;
    } catch { /* Check for a tab created by an earlier request with a lost acknowledgment. */ }
    if (created || await readOutputHeader(connection)) return { settings: { connection } };
  } catch { /* Keep the setup available after provider/authentication failures. */ }
  return { settings: { setup: { ...setup, spreadsheetId: id } },
    error: new HttpError(502, "Google did not confirm creating the response tab. Check Editor access and retry with the same spreadsheet.") };
}

export async function syncResponse(connection: SheetsConnection, response: typeof responses.$inferSelect) {
  try {
    if (!await readOutputHeader(connection)) {
      return "Cannot verify the Fold-managed tab. Restore its original header and Editor access, then retry.";
    }
    // Google rejects a duplicate named range ID atomically with the append. The
    // stable marker lets a retry distinguish an accepted write from a lost reply.
    const key = response.id.replaceAll("-", "");
    const name = `fold_response_${key}`;
    const row = [response.id, response.createdAt.toISOString(),
      ...connection.fields.map(field => answerText(response.answers[field.id]))];
    try {
      const result = await sheetsRequest(connection.spreadsheetId, ":batchUpdate", [
        { addNamedRange: { namedRange: { namedRangeId: key, name,
          range: { sheetId: connection.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 } } } },
        { appendCells: { sheetId: connection.sheetId, rows: [cells(row)], fields: "userEnteredValue" } },
      ]);
      if (result.ok) return null;
    } catch { /* A failed HTTP exchange may still have committed the atomic write. */ }
    const marker = await getRange(connection.spreadsheetId, name);
    if (values(marker)[0]?.[0] === header(connection)[0]) return null;
  } catch { /* Keep the response and provide an owner retry. */ }
  return "Google Sheets did not confirm this write. Check Editor access and the Fold tab, then retry.";
}
