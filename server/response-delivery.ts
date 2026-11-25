import { and, desc, eq, inArray } from "drizzle-orm";
import type { DeliveryKind } from "../lib/response-delivery";
import { getDb, type FoldTransaction } from "./db";
import { forms, responseDeliveries, responses, responseSettings, user, workspaces } from "./schema";
import { alertRetryAllowed, alertsEnabled, sendResponseAlert } from "./response-alerts";

async function currentOwnerEmail(db: FoldTransaction, workspaceId: string) {
  const [owner] = await db.select({ email: user.email }).from(workspaces)
    .innerJoin(user, eq(user.id, workspaces.ownerId)).where(eq(workspaces.id, workspaceId));
  return owner?.email ?? "";
}

export async function queueResponseDeliveries(db: FoldTransaction, form: typeof forms.$inferSelect, responseId: string) {
  const [settings] = await db.select().from(responseSettings).where(eq(responseSettings.formId, form.id));
  const kinds: DeliveryKind[] = [];
  if (settings?.alert.enabled && alertsEnabled(settings.alert, await currentOwnerEmail(db, form.workspaceId))) {
    kinds.push("alert");
  }
  if (kinds.length) await db.insert(responseDeliveries).values(kinds.map(kind => ({ responseId, formId: form.id, kind })));
  return kinds;
}

export function cancelDeliveries(db: FoldTransaction, formId: string, kind: DeliveryKind) {
  return db.update(responseDeliveries)
    .set({ status: "cancelled", detail: null, updatedAt: new Date() })
    .where(and(eq(responseDeliveries.formId, formId), eq(responseDeliveries.kind, kind),
      inArray(responseDeliveries.status, ["pending", "failed"])));
}

export function recentDeliveries(formId: string) {
  return getDb().select({ responseId: responseDeliveries.responseId, kind: responseDeliveries.kind,
    status: responseDeliveries.status, detail: responseDeliveries.detail, updatedAt: responseDeliveries.updatedAt })
    .from(responseDeliveries).where(eq(responseDeliveries.formId, formId))
    .orderBy(desc(responseDeliveries.updatedAt)).limit(40);
}

export async function dispatchDelivery(formId: string, responseId: string, kind: DeliveryKind) {
  return getDb().transaction(async db => {
    // Keep configuration changes and all attempts for a form ordered with the public write.
    const [form] = await db.select().from(forms).where(eq(forms.id, formId)).for("update");
    if (!form) return;
    const [row] = await db.select({ delivery: responseDeliveries, response: responses }).from(responseDeliveries)
      .innerJoin(responses, eq(responses.id, responseDeliveries.responseId))
      .where(and(eq(responseDeliveries.formId, formId), eq(responseDeliveries.responseId, responseId), eq(responseDeliveries.kind, kind)));
    if (!row || row.delivery.status === "delivered" || row.delivery.status === "cancelled") return;
    const [settings] = await db.select().from(responseSettings).where(eq(responseSettings.formId, formId));
    let detail: string | null;
    const email = await currentOwnerEmail(db, form.workspaceId);
    if (!settings || !alertsEnabled(settings.alert, email)) {
      await cancelDeliveries(db, formId, "alert");
      return;
    }
    if (!alertRetryAllowed(row.response.createdAt)) {
      detail = "The safe mail retry window closed. Check the inbox before taking any further action.";
    } else {
      detail = await sendResponseAlert(formId, responseId, email);
    }
    await db.update(responseDeliveries).set({ detail, status: detail ? "failed" : "delivered", updatedAt: new Date() })
      .where(and(eq(responseDeliveries.responseId, responseId), eq(responseDeliveries.kind, kind)));
  });
}
