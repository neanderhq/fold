import assert from "node:assert/strict";
import test from "node:test";
import { createResetSender, recoveryConfiguration, RESET_LIFETIME_SECONDS } from "../server/password-recovery.ts";

const preview = {
  PASSWORD_RESET_ENABLED: "true",
  PASSWORD_RESET_DELIVERY_MODE: "preview",
  PASSWORD_RESET_FROM: "Fold <onboarding@resend.dev>",
  PASSWORD_RESET_PREVIEW_RECIPIENT: "owner@example.invalid",
  RESEND_API_KEY: "synthetic-unit-test-key",
};
const message = { email: preview.PASSWORD_RESET_PREVIEW_RECIPIENT, url: "https://fold.example/reset-password/synthetic?test=1&next=2", token: "synthetic-test-only" };

test("gate fails closed for disabled, missing, malformed and unverified configuration", () => {
  assert.equal(recoveryConfiguration({}).enabled, false);
  for (const name of Object.keys(preview)) assert.equal(recoveryConfiguration({ ...preview, [name]: "" }).enabled, false, name);
  assert.equal(recoveryConfiguration({ ...preview, PASSWORD_RESET_ENABLED: "TRUE" }).enabled, false);
  assert.equal(recoveryConfiguration({ ...preview, PASSWORD_RESET_FROM: "Fold <sender@example.com>\r\nBcc: victim@example.com" }).enabled, false);
  assert.equal(recoveryConfiguration({ ...preview, PASSWORD_RESET_PREVIEW_RECIPIENT: "invalid" }).enabled, false);
  assert.equal(recoveryConfiguration(preview).enabled, true);
  const production = { ...preview, PASSWORD_RESET_DELIVERY_MODE: "production", PASSWORD_RESET_FROM: "Fold <hello@example.com>" };
  assert.equal(recoveryConfiguration(production).enabled, false);
  assert.equal(recoveryConfiguration({ ...production, PASSWORD_RESET_SENDER_VERIFIED: "true" }).enabled, true);
  assert.equal(recoveryConfiguration({ ...preview, PASSWORD_RESET_DELIVERY_MODE: "production", PASSWORD_RESET_SENDER_VERIFIED: "true" }).enabled, false);
});

test("Resend HTTP request uses exact preview sender/recipient, expiring-link copy and idempotency", async () => {
  let calls = 0;
  await createResetSender(preview, async (url, options) => {
    calls++;
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.authorization, "Bearer synthetic-unit-test-key");
    assert.equal(options.headers["idempotency-key"], "fold-password-reset-synthetic-test-only");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    const body = JSON.parse(options.body);
    assert.equal(body.from, "Fold <onboarding@resend.dev>");
    assert.deepEqual(body.to, ["owner@example.invalid"]);
    assert.ok(body.text.includes(message.url));
    assert.match(body.text, /30 minutes/);
    assert.match(body.text, /works once/);
    assert.match(body.html, />Fold<\/td>/);
    assert.ok(body.html.includes(`href="${message.url.replace("&", "&amp;")}"`));
    assert.match(body.html, />Reset password<\/a>/);
    assert.match(body.html, />If the button doesn’t work, open the reset page\.<\/a>/);
    assert.match(body.html, /expires in 30 minutes and works once/);
    return new Response("{}", { status: 200 });
  })(message);
  assert.equal(calls, 1);
});

async function renderedEmail(url, environment = preview) {
  let payload;
  await createResetSender(environment, async (_url, options) => {
    payload = JSON.parse(options.body);
    return new Response("{}", { status: 200 });
  })({ ...message, url });
  return payload;
}

for (const url of [
  "https://fold.example/reset-password#token=synthetic-test-only",
  message.url,
  "https://fold.example/reset-password?one=1&two=2&three=3#token=synthetic%2B%2F%3D",
  'https://fold.example/reset-password#token=synthetic&value="quoted"&tag=<test>&single=\'test\'&literal=&amp;',
]) {
  test(`HTML button, backup and plaintext preserve one logical URL: fixture ${url === message.url ? "query" : url.includes("quoted") ? "escaping" : url.includes("one=") ? "encoded" : "fragment"}`, async () => {
    const { html, text } = await renderedEmail(url);
    const escaped = url.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("'", "&#39;");
    const links = [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>/g)].map((match) => match[1]);
    assert.deepEqual(links, [escaped, escaped]);
    const entities = { "&amp;": "&", "&quot;": '"', "&lt;": "<", "&gt;": ">", "&#39;": "'" };
    for (const link of links) assert.equal(link.replace(/&(?:amp|quot|lt|gt|#39);/g, (entity) => entities[entity]), url);
    assert.deepEqual(text.split("\n").filter((line) => line.startsWith("https://")), [url]);
    assert.equal(text.split(url).length - 1, 1);
  });
}

test("Option 3 email uses inline presentation tables, Fold branding and no tracking assets", async () => {
  const { html, text, subject } = await renderedEmail(message.url);
  assert.equal(subject, "Reset your Fold password");
  assert.match(html, /<html lang="en">/);
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1"/);
  assert.match(html, /<body[^>]*background:#ffffff/);
  for (const table of html.matchAll(/<table\b[^>]*>/g)) assert.match(table[0], /role="presentation"/);
  assert.match(html, /aria-hidden="true"[\s\S]*border:3px solid #192b40/);
  assert.match(html, /border-bottom:1px solid #d5e0ed/);
  assert.match(html, /<h1[^>]*>Reset your password<\/h1>/);
  const panel = html.match(/<tr><td bgcolor="#eaf3ff"[^>]*>([\s\S]*?)<\/td><\/tr>\s*<tr><td style="padding:28px/);
  assert.ok(panel, "Pale blue panel must end before the backup link");
  assert.match(panel[1], /bgcolor="#192b40"/);
  assert.match(panel[1], />Reset password<\/a>/);
  assert.match(panel[1], /expires in 30 minutes and works once/);
  assert.doesNotMatch(panel[1], /open the reset page/);
  assert.match(html, /color:#2563eb;text-decoration:underline/);
  assert.doesNotMatch(html, /<(?:img|svg|script|link|style)\b|\bsrc\s*=|url\(|@import/i);
  assert.equal(RESET_LIFETIME_SECONDS, 1800);
  assert.match(text, /^Reset your Fold password\n\nOpen this link to choose a new password:\n/);
  assert.match(text, /This link expires in 30 minutes and works once\./);
  assert.ok(text.endsWith("If you didn’t request this, you can ignore this email. Your password hasn’t changed."));
});

test("production payload preserves the configured Fold sender", async () => {
  const environment = { ...preview, PASSWORD_RESET_DELIVERY_MODE: "production", PASSWORD_RESET_SENDER_VERIFIED: "true", PASSWORD_RESET_FROM: "Fold <no-reply@apps.neander.ai>" };
  const payload = await renderedEmail(message.url, environment);
  assert.equal(payload.from, "Fold <no-reply@apps.neander.ai>");
});

test("no network call when gated or outside preview recipient allowlist", async () => {
  const forbidden = async () => { assert.fail("Network must not be called"); };
  await assert.rejects(createResetSender({}, forbidden)(message), /delivery unavailable/);
  await assert.rejects(createResetSender(preview, forbidden)({ ...message, email: "someone-else@example.com" }), /delivery unavailable/);
});

test("provider HTTP, network and timeout failures never expose provider response content", async () => {
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(createResetSender(preview, async () => new Response("private-provider-response", { status }))(message), { message: "Password recovery delivery unavailable" });
  }
  for (const error of [new Error("network unavailable"), new DOMException("timeout", "TimeoutError")]) {
    await assert.rejects(createResetSender(preview, async () => { throw error; })(message));
  }
});
