import { and, eq } from "drizzle-orm";
import { isRecord, validId } from "../lib/form-schema";
import { getDb } from "./db";
import { HttpError, json, readJson } from "./http";
import { forms, responseDeliveries, responseSettings } from "./schema";
import { alertConfiguration, alertsEnabled, changeAlerts } from "./response-alerts";
import { cancelDeliveries, dispatchDelivery, recentDeliveries } from "./response-delivery";

type Owner = { id: string; email: string; emailVerified: boolean };

export async function deliverySettingsApi(request: Request, owner: Owner, workspaceId: string, formId: string) {
  const db = getDb();
  const owned = and(eq(forms.id, formId), eq(forms.workspaceId, workspaceId));
  if (request.method === "GET") {
    const [form] = await db.select({ id: forms.id }).from(forms).where(owned);
    if (!form) throw new HttpError(404, "Form not found.");
    const [row] = await db.select().from(responseSettings).where(eq(responseSettings.formId, formId));
    const settings = row?.alert ?? {};
    const address = owner.email.toLowerCase();
    const configured = alertConfiguration().configured;
    return json({ alert: {
      configured, address, available: owner.emailVerified || settings.address === address,
      enabled: alertsEnabled(settings, address),
      awaitingCode: settings.challenge?.address === address && settings.challenge.expiresAt > Date.now(),
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
  if (!["alert-start", "alert-confirm", "alert-disable"].includes(action)) throw new HttpError(400, "Unknown delivery action.");
  const failure = await db.transaction(async tx => {
    const [form] = await tx.select().from(forms).where(owned).for("update");
    if (!form) throw new HttpError(404, "Form not found.");
    const [row] = await tx.select().from(responseSettings).where(eq(responseSettings.formId, formId));
    const { settings, error } = await changeAlerts(tx, form, row?.alert ?? {}, owner, action, body.code);
    await tx.insert(responseSettings).values({ formId, alert: settings }).onConflictDoUpdate({
      target: responseSettings.formId, set: { alert: settings },
    });
    if (action === "alert-disable") await cancelDeliveries(tx, formId, "alert");
    return error;
  });
  if (failure) throw failure;
  return json({ success: true });
}
