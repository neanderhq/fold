import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { AlertSettings } from "../lib/response-delivery";
import type { FoldTransaction } from "./db";
import { resolveAuthBaseURL } from "./auth-base-url";
import { HttpError } from "./http";
import { forms, responseSettings } from "./schema";
import { sendResendMessage } from "./resend";

const codeLifetime = 15 * 60 * 1000;
const retryLifetime = 23 * 60 * 60 * 1000;

export function alertConfiguration() {
  const from = process.env.RESPONSE_ALERT_FROM?.trim() ?? "";
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  const address = from.match(/^Fold <([^<>\s]+@[^<>\s]+\.[^<>\s]+)>$/)?.[1];
  const configured = Boolean(address && !address.toLowerCase().endsWith("@resend.dev") && apiKey &&
    process.env.RESPONSE_ALERT_SENDER_VERIFIED === "true" && process.env.BETTER_AUTH_SECRET && resolveAuthBaseURL());
  return { configured, from, apiKey };
}

function verifyDigest(formId: string, address: string, code: string) {
  return createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(`${formId}/${address}/${code}`).digest("hex");
}

export function alertsEnabled(settings: AlertSettings, email: string) {
  return Boolean(settings.enabled && settings.address === email.toLowerCase());
}

export function alertRetryAllowed(createdAt: Date) {
  return Date.now() - createdAt.valueOf() < retryLifetime;
}

export async function sendResponseAlert(formId: string, responseId: string, email: string) {
  const { configured, from, apiKey } = alertConfiguration();
  if (!configured) return "The mail sender is unavailable. Restore its configuration before retrying.";
  const url = new URL(`/forms/${formId}/responses?response=${responseId}`, resolveAuthBaseURL());
  try {
    const response = await sendResendMessage(apiKey, `fold-response-alert-${responseId}`, {
      from, to: email,
      subject: "New Fold response",
      text: `A form has received a new response. Sign in to Fold to view it:\n\n${url.href}`,
    });
    return response.ok ? null : "The mail provider did not accept this alert. Check the sender configuration and retry.";
  } catch {
    return "The mail provider could not confirm this alert. Retry while the original send can still be deduplicated.";
  }
}

type AlertOwner = { id: string; email: string; emailVerified: boolean };
type AlertUpdate = { settings: AlertSettings; error?: HttpError };

export async function changeAlerts(db: FoldTransaction, form: { id: string; workspaceId: string },
  current: AlertSettings, owner: AlertOwner, action: string, value: unknown): Promise<AlertUpdate> {
  const address = owner.email.toLowerCase();
  const now = Date.now();
  if (action === "alert-disable") return { settings: { ...current, enabled: false, challenge: undefined } };
  const configuration = alertConfiguration();
  if (!configuration.configured) throw new HttpError(409, "Response alerts are not configured on this deployment.");
  if (action === "alert-start") {
    if (owner.emailVerified || current.address === address) {
      return { settings: { ...current, address, enabled: true, challenge: undefined } };
    }
    await db.execute(sql`select pg_advisory_xact_lock(hashtext(${"fold-alert:" + owner.id}))`);
    const [recent] = await db.select({ formId: responseSettings.formId }).from(responseSettings)
      .innerJoin(forms, eq(responseSettings.formId, forms.id))
      .where(and(eq(forms.workspaceId, form.workspaceId), sql`(${responseSettings.alert}->>'requestAt')::bigint > ${now - 60_000}`))
      .limit(1);
    if (recent) throw new HttpError(429, "Wait one minute before requesting another verification code.");
    const code = String(randomInt(10_000_000, 100_000_000));
    const settings: AlertSettings = { ...current, enabled: false, requestAt: now, challenge: {
      address, digest: verifyDigest(form.id, address, code), attempts: 0, expiresAt: now + codeLifetime,
    } };
    try {
      const response = await sendResendMessage(configuration.apiKey, `fold-alert-verify-${randomUUID()}`, {
        from: configuration.from, to: address, subject: "Verify your Fold alert address",
        text: `Enter this code in your Fold form’s alert settings: ${code}\n\nThe code expires in 15 minutes.`,
      });
      if (response.ok) return { settings };
    } catch { /* The request time must still limit immediate repeats. */ }
    return { settings: { ...settings, challenge: undefined },
      error: new HttpError(502, "Unable to send a verification code. Check the sender and try again in one minute.") };
  }
  if (action !== "alert-confirm" || typeof value !== "string" || !/^\d{8}$/.test(value)) {
    throw new HttpError(400, "Enter the eight-digit verification code.");
  }
  const challenge = current.challenge;
  if (!challenge || challenge.address !== address || now >= challenge.expiresAt) {
    return { settings: { ...current, challenge: undefined },
      error: new HttpError(409, "The code expired. Request a new code.") };
  }
  if (!timingSafeEqual(Buffer.from(challenge.digest), Buffer.from(verifyDigest(form.id, address, value)))) {
    const attempts = challenge.attempts + 1;
    return { settings: { ...current, challenge: attempts < 5 ? { ...challenge, attempts } : undefined },
      error: new HttpError(400, attempts < 5 ? "The verification code did not match." : "Too many attempts. Request a new code.") };
  }
  return { settings: { ...current, address, enabled: true, challenge: undefined } };
}
