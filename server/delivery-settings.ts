import { and, eq } from "drizzle-orm";
import { isRecord, validId } from "../lib/form-schema";
import { getDb } from "./db";
import { HttpError, json, readJson } from "./http";
import { forms, responseDeliveries, responseSettings } from "./schema";
import { alertConfiguration, alertsEnabled, changeAlerts } from "./response-alerts";
import { changeSheets, mappingIssue, publishedFields, sheetsServiceEmail } from "./google-sheets";
import { cancelDeliveries, dispatchDelivery, recentDeliveries } from "./response-delivery";

type Owner = { id: string; email: string; emailVerified: boolean };

export async function deliverySettingsApi(request: Request, owner: Owner, workspaceId: string, formId: string) {
  const db = getDb();
  const owned = and(eq(forms.id, formId), eq(forms.workspaceId, workspaceId));
  if (request.method === "GET") {
    const [form] = await db.select({ id: forms.id, published: forms.published, isPublished: forms.isPublished }).from(forms).where(owned);
    if (!form) throw new HttpError(404, "Form not found.");
    const [row] = await db.select().from(responseSettings).where(eq(responseSettings.formId, formId));
    const settings = row?.alert ?? {};
    const address = owner.email.toLowerCase();
    const configured = alertConfiguration().configured;
    const sheets = row?.sheets;
    return json({ alert: {
      configured, address, available: owner.emailVerified || settings.address === address,
      enabled: alertsEnabled(settings, address),
      awaitingCode: settings.challenge?.address === address && settings.challenge.expiresAt > Date.now(),
    }, sheets: {
      serviceEmail: sheetsServiceEmail(),
      code: sheets?.setup && sheets.setup.expiresAt > Date.now() ? sheets.setup.code : null,
      connection: sheets?.connection ?? null,
      publishedFields: publishedFields(form.isPublished ? form.published : null),
      mappingIssue: sheets?.connection ? mappingIssue(sheets.connection, form.published) : null,
    }, recent: await recentDeliveries(formId) });
  }
  if (request.method !== "POST") throw new HttpError(405, "Method not allowed.");
  const body = await readJson(request);
  if (!isRecord(body) || typeof body.action !== "string") throw new HttpError(400, "Choose a delivery action.");
  const action = body.action;
  if (action === "retry") {
    const { responseId, kind } = body;
    if (!validId(responseId) || (kind !== "alert" && kind !== "sheets")) throw new HttpError(400, "Choose a delivery to retry.");
    const [form] = await db.select({ id: forms.id }).from(forms).where(owned);
    if (!form) throw new HttpError(404, "Form not found.");
    const [delivery] = await db.select({ responseId: responseDeliveries.responseId }).from(responseDeliveries)
      .where(and(eq(responseDeliveries.responseId, responseId), eq(responseDeliveries.formId, formId), eq(responseDeliveries.kind, kind)));
    if (!delivery) throw new HttpError(404, "Delivery not found.");
    await dispatchDelivery(formId, responseId, kind);
    return json({ success: true });
  }
  const isAlert = ["alert-start", "alert-confirm", "alert-disable"].includes(action);
  if (!isAlert && !["sheets-start", "sheets-connect", "sheets-disconnect"].includes(action)) throw new HttpError(400, "Unknown delivery action.");
  const failure = await db.transaction(async tx => {
    const [form] = await tx.select().from(forms).where(owned).for("update");
    if (!form) throw new HttpError(404, "Form not found.");
    const [row] = await tx.select().from(responseSettings).where(eq(responseSettings.formId, formId));
    const alert = isAlert ? await changeAlerts(tx, form, row?.alert ?? {}, owner, action, body.code) : null;
    const sheets = isAlert ? null : await changeSheets(row?.sheets ?? {}, form.isPublished ? form.published : null, body);
    const setting = alert ? { alert: alert.settings } : { sheets: sheets!.settings };
    await tx.insert(responseSettings).values({ formId, ...setting }).onConflictDoUpdate({
      target: responseSettings.formId, set: setting,
    });
    if (action === "alert-disable") await cancelDeliveries(tx, formId, "alert");
    if (action === "sheets-disconnect") await cancelDeliveries(tx, formId, "sheets");
    return alert?.error ?? sheets?.error;
  });
  if (failure) throw failure;
  return json({ success: true });
}
