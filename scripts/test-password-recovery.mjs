import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { registerHooks } from "node:module";
import { Client } from "pg";

const databaseUrl = new URL(process.env.DATABASE_URL);
assert.ok(["127.0.0.1", "localhost"].includes(databaseUrl.hostname), "Recovery tests only use local PostgreSQL.");
const root = new URL("../", import.meta.url).href;
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, root).href, context);
  if (specifier.startsWith(".") && context.parentURL?.startsWith(root) && !context.parentURL.includes("/node_modules/") && !/\.[a-z]+$/i.test(specifier)) return nextResolve(new URL(`${specifier}.ts`, context.parentURL).href, context);
  return nextResolve(specifier, context);
} });

const schema = `recovery_${randomUUID().replaceAll("-", "")}`;
const database = new Client({ connectionString: databaseUrl.href, connectionTimeoutMillis: 3000 });
await database.connect();
let getDb;
try {
  await database.query(`CREATE SCHEMA "${schema}"`);
  await database.query(`SET search_path TO "${schema}"`);
  await database.query("SET TIME ZONE 'Asia/Dubai'");
  for (const file of readdirSync(new URL("../drizzle/", import.meta.url)).filter((name) => name.endsWith(".sql")).sort()) {
    const migration = readFileSync(new URL(`../drizzle/${file}`, import.meta.url), "utf8").replaceAll('"public".', `"${schema}".`);
    await database.query(migration);
  }
  databaseUrl.searchParams.set("options", `-csearch_path=${schema} -cTimeZone=Asia/Dubai`);
  process.env.DATABASE_URL = databaseUrl.href;
  process.env.NODE_ENV = "test";
  process.env.BETTER_AUTH_URL = "http://127.0.0.1:3000";
  process.env.BETTER_AUTH_SECRET = "synthetic-isolated-recovery-test-secret-only";
  Object.assign(process.env, {
    PASSWORD_RESET_ENABLED: "true", PASSWORD_RESET_DELIVERY_MODE: "preview",
    PASSWORD_RESET_FROM: "Fold <onboarding@resend.dev>", PASSWORD_RESET_PREVIEW_RECIPIENT: "owner@example.invalid",
    RESEND_API_KEY: "synthetic-integration-key-never-sent",
  });
  ({ getDb } = await import("../server/db.ts"));
  const { createAuth } = await import("../server/auth.ts");
  const { RESET_CONFIRMATION } = await import("../server/password-recovery.ts");
  const { recoveryRateStorage } = await import("../server/recovery-rate-limit.ts");
  const messages = [];
  const pending = [];
  let failDelivery = false;
  let deliveryBarrier;
  const auth = createAuth(async (message) => {
    if (deliveryBarrier) await deliveryBarrier;
    if (failDelivery) throw new Error("Synthetic provider failure with private details");
    messages.push(message);
  }, (task) => { pending.push(task); });
  const origin = process.env.BETTER_AUTH_URL;
  const oldPassword = "synthetic-original-password";
  const newPassword = "synthetic-replacement-password";
  let address = 1;
  async function request(path, body, { cookie, ip = `192.0.2.${address++}`, requestOrigin = origin } = {}) {
    const headers = { origin: requestOrigin, "content-type": "application/json", "x-forwarded-for": ip };
    if (cookie) headers.cookie = cookie;
    const response = await auth.handler(new Request(`${origin}/api/auth${path}`, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) }));
    const data = response.status === 302 ? null : await response.json();
    return { response, data };
  }
  function cookieFor(result) {
    const cookie = result.response.headers.getSetCookie().find((value) => value.startsWith("better-auth.session_token="));
    assert.ok(cookie, "Sign in returns a session cookie");
    return cookie.split(";")[0];
  }
  async function signup(label) {
    const email = `${label}@recovery.example`;
    const result = await request("/sign-up/email", { name: "Synthetic recovery owner", email, password: oldPassword });
    assert.equal(result.response.status, 200);
    return { email, id: result.data.user.id, cookie: cookieFor(result) };
  }
  async function requestLink(email, options) {
    const result = await request("/request-password-reset", { email, redirectTo: `${origin}/reset-password` }, options);
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.data, { status: true, message: RESET_CONFIRMATION });
    await Promise.all(pending.splice(0));
    return result;
  }
  async function reset(token, password = newPassword) {
    return request("/reset-password", { token, newPassword: password });
  }
  const owner = await signup("success");
  const secondSession = cookieFor(await request("/sign-in/email", { email: owner.email, password: oldPassword }));
  const known = await requestLink(owner.email);
  const sent = messages.at(-1);
  assert.equal(sent.email, owner.email);
  const link = new URL(sent.url);
  assert.equal(link.origin, origin);
  assert.equal(link.pathname, "/reset-password");
  assert.equal(link.search, "", "Tokens must not appear in server request URLs");
  assert.ok(new URLSearchParams(link.hash.slice(1)).get("token") === sent.token);
  const lifetime = await database.query('SELECT EXTRACT(EPOCH FROM expires_at - created_at)::integer AS lifetime FROM verification WHERE identifier=$1', [`reset-password:${sent.token}`]);
  assert.ok(lifetime.rows[0].lifetime >= 1795 && lifetime.rows[0].lifetime <= 1805);
  const redirect = await request(`/reset-password/${sent.token}?callbackURL=${encodeURIComponent(`${origin}/reset-password`)}`);
  assert.equal(redirect.response.status, 302);
  assert.equal(new URL(redirect.response.headers.get("location")).pathname, "/reset-password");
  const unknown = await requestLink("unknown@recovery.example");
  assert.equal(known.response.status, unknown.response.status);
  assert.deepEqual(known.data, unknown.data);
  assert.equal(messages.length, 1, "Unknown address sends no email");
  assert.equal((await reset(sent.token, "short")).response.status, 400);
  assert.equal((await reset(sent.token, "x".repeat(129))).response.status, 400);
  assert.equal((await reset(sent.token)).response.status, 200);
  assert.equal((await reset(sent.token)).response.status, 400);
  const reusedRedirect = await request(`/reset-password/${sent.token}?callbackURL=${encodeURIComponent(`${origin}/reset-password`)}`);
  assert.equal(new URL(reusedRedirect.response.headers.get("location")).searchParams.get("error"), "INVALID_TOKEN");
  for (const cookie of [owner.cookie, secondSession]) assert.equal((await request("/get-session", undefined, { cookie })).data, null);
  assert.equal((await database.query('SELECT count(*)::integer AS count FROM session WHERE user_id=$1', [owner.id])).rows[0].count, 0);
  assert.equal((await request("/sign-in/email", { email: owner.email, password: oldPassword })).response.status, 401);
  assert.equal((await request("/sign-in/email", { email: owner.email, password: newPassword })).response.status, 200);
  console.log("PASS reset success, new login, old password rejected, length bounds, single use, two sessions revoked");

  const expiredOwner = await signup("expired");
  await requestLink(expiredOwner.email);
  const expired = messages.at(-1);
  await database.query("UPDATE verification SET expires_at=timezone('UTC', NOW())-INTERVAL '1 second' WHERE identifier=$1", [`reset-password:${expired.token}`]);
  const expiredRedirect = await request(`/reset-password/${expired.token}?callbackURL=${encodeURIComponent(`${origin}/reset-password`)}`);
  assert.equal(new URL(expiredRedirect.response.headers.get("location")).searchParams.get("error"), "INVALID_TOKEN");
  assert.equal((await reset(expired.token)).response.status, 400);
  assert.equal((await request("/sign-in/email", { email: expiredOwner.email, password: oldPassword })).response.status, 200);
  console.log("PASS expired callback and reset rejected; password unchanged");

  const concurrentOwner = await signup("concurrent");
  await requestLink(concurrentOwner.email);
  const concurrent = messages.at(-1);
  const competing = await Promise.all([reset(concurrent.token, "concurrent-winning-password-one"), reset(concurrent.token, "concurrent-winning-password-two")]);
  assert.deepEqual(competing.map((result) => result.response.status).sort(), [200, 400]);
  const winningPassword = competing[0].response.status === 200 ? "concurrent-winning-password-one" : "concurrent-winning-password-two";
  assert.equal((await request("/sign-in/email", { email: concurrentOwner.email, password: winningPassword })).response.status, 200);
  console.log("PASS concurrent reuse: exactly one winner, winning password signs in");

  const failedOwner = await signup("provider-failure");
  failDelivery = true;
  const providerFailure = await requestLink(failedOwner.email);
  const unknownFailure = await requestLink("unknown-failure@recovery.example");
  assert.deepEqual(providerFailure.data, known.data);
  assert.deepEqual(unknownFailure.data, known.data);
  assert.equal(providerFailure.response.status, unknownFailure.response.status);
  assert.equal((await database.query("SELECT count(*)::integer AS count FROM verification WHERE value=$1 AND identifier LIKE 'reset-password:%'", [failedOwner.id])).rows[0].count, 0);
  failDelivery = false;
  console.log("PASS generic known/unknown/provider-failure confirmation; undelivered token removed");

  const slowOwner = await signup("slow-provider");
  let releaseDelivery;
  deliveryBarrier = new Promise((resolve) => { releaseDelivery = resolve; });
  try {
    const controller = AbortSignal.timeout(2000);
    const completed = await Promise.race([
      request("/request-password-reset", { email: slowOwner.email }),
      new Promise((_, reject) => controller.addEventListener("abort", () => reject(new Error("Provider latency blocked confirmation")), { once: true })),
    ]);
    assert.equal(completed.response.status, 200);
    assert.deepEqual(completed.data, known.data);
  } finally {
    releaseDelivery(); deliveryBarrier = undefined;
    await Promise.all(pending.splice(0));
  }
  console.log("PASS provider latency does not delay the generic confirmation");

  for (let index = 0; index < 3; index++) await requestLink(`ip-limit-${index}@recovery.example`, { ip: "198.51.100.1" });
  const ipLimit = await request("/request-password-reset", { email: owner.email }, { ip: "198.51.100.1" });
  assert.equal(ipLimit.response.status, 429);
  assert.ok(Number(ipLimit.response.headers.get("x-retry-after")) > 0);
  assert.equal((await request("/request-password-reset", { email: "limited-unknown@recovery.example" }, { ip: "198.51.100.1" })).response.status, 429);
  for (let index = 0; index < 3; index++) await requestLink("address-limit@recovery.example");
  assert.equal((await request("/request-password-reset", { email: "ADDRESS-LIMIT@recovery.example" })).response.status, 429);
  const atomicRate = await Promise.all(Array.from({ length: 8 }, () => recoveryRateStorage.consume("concurrent-rate-fixture", { window: 60, max: 3 })));
  assert.equal(atomicRate.filter((result) => result.allowed).length, 3);
  assert.equal((await recoveryRateStorage.consume("expiry-rate-fixture", { window: 60, max: 1 })).allowed, true);
  assert.equal((await recoveryRateStorage.consume("expiry-rate-fixture", { window: 60, max: 1 })).allowed, false);
  await database.query("UPDATE verification SET expires_at=timezone('UTC', NOW())-INTERVAL '1 second' WHERE id=$1", [`fold-rate:${createHash("sha256").update("expiry-rate-fixture").digest("hex")}`]);
  assert.equal((await recoveryRateStorage.consume("expiry-rate-fixture", { window: 60, max: 1 })).allowed, true);
  const freshAuth = createAuth(async () => {}, (task) => pending.push(task));
  const persistedLimit = await freshAuth.handler(new Request(`${origin}/api/auth/request-password-reset`, { method: "POST", headers: { origin, "content-type": "application/json", "x-forwarded-for": "198.51.100.1" }, body: JSON.stringify({ email: "other@recovery.example" }) }));
  assert.equal(persistedLimit.status, 429);
  for (let index = 0; index < 10; index++) assert.equal((await request("/reset-password", { token: "invalid-fixture", newPassword }, { ip: "198.51.100.2" })).response.status, 400);
  assert.equal((await request("/reset-password", { token: "invalid-fixture", newPassword }, { ip: "198.51.100.2" })).response.status, 429);
  console.log("PASS IP/address/reset limits, atomic concurrency, window expiry in non-UTC PostgreSQL, persisted counters");

  assert.equal((await request("/request-password-reset", { email: owner.email }, { requestOrigin: "https://attacker.invalid" })).response.status, 403);
  assert.equal((await request("/reset-password", { token: "origin-fixture", newPassword }, { requestOrigin: "https://attacker.invalid" })).response.status, 403);
  assert.equal((await request("/request-password-reset", { email: owner.email }, { requestOrigin: "" })).response.status, 403);
  const gatedToken = messages.at(-1).token;
  process.env.PASSWORD_RESET_ENABLED = "false";
  for (const email of [owner.email, "disabled-unknown@recovery.example"]) assert.equal((await request("/request-password-reset", { email })).response.status, 503);
  assert.equal((await reset(gatedToken)).response.status, 503);
  assert.equal((await request("/reset-password/disabled-token?callbackURL=" + encodeURIComponent(`${origin}/reset-password`))).response.status, 503);
  process.env.PASSWORD_RESET_ENABLED = "true";
  process.env.RESEND_API_KEY = "";
  assert.equal((await request("/request-password-reset", { email: owner.email })).response.status, 503);
  assert.equal((await request("/request-password-reset", { email: "missing-configuration-unknown@recovery.example" })).response.status, 503);
  assert.equal((await reset(gatedToken)).response.status, 503);
  process.env.RESEND_API_KEY = "synthetic-integration-key-never-sent";
  assert.equal((await reset(gatedToken)).response.status, 200, "Closed gates must not consume a valid token");
  await Promise.all(pending.splice(0));
  console.log("PASS untrusted origins denied; disabled gate rejects requests, callbacks and resets");
  console.log("recovery-security: PASS (real isolated PostgreSQL schema + Better Auth; delivery mocked only in test)");
} finally {
  if (getDb) await getDb().$client.end();
  await database.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await database.end();
}
