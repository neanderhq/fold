import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const inProcess = process.argv.includes("--in-process");
const suppliedOrigin = process.argv.find((argument) => argument.startsWith("--origin="))?.slice(9);
assert.ok(inProcess || suppliedOrigin, "Pass --in-process or --origin=http://127.0.0.1:3000");
const origin = suppliedOrigin || process.env.BETTER_AUTH_URL;
assert.ok(origin && process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET, "Load the development environment first.");
const databaseUrl = new URL(process.env.DATABASE_URL);
assert.ok(["127.0.0.1", "localhost"].includes(databaseUrl.hostname) && process.env.DATABASE_URL === process.env.NEANDER_TEMPLATE_TEST_DATABASE_URL, "Fixture cleanup requires the explicitly selected disposable loopback database.");
assert.ok(["127.0.0.1", "localhost"].includes(new URL(origin).hostname), "Use a local preview origin, never production.");

let dispatch;
let appDb;
if (inProcess) {
  const root = new URL("../", import.meta.url).href;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, root).href, context);
      if (specifier.startsWith(".") && context.parentURL?.startsWith(root) && !context.parentURL.includes("/node_modules/") && !/\.[a-z]+$/i.test(specifier)) {
        return nextResolve(new URL(`${specifier}.ts`, context.parentURL).href, context);
      }
      return nextResolve(specifier, context);
    },
  });
  const [authRoute, formsRoute, publicRoute, meRoute, workspaceRoute, dbModule] = await Promise.all([
    import("../app/api/auth/[...all]/route.ts"),
    import("../app/api/forms/[[...path]]/route.ts"),
    import("../app/api/public/forms/[id]/route.ts"),
    import("../app/api/me/route.ts"),
    import("../app/api/workspace/route.ts"),
    import("../server/db.ts"),
  ]);
  appDb = dbModule.getDb;
  dispatch = async (request) => {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/auth/")) return authRoute[request.method](request);
    if (path === "/api/me") return meRoute.GET(request);
    if (path === "/api/workspace") return workspaceRoute.GET(request);
    if (path.startsWith("/api/public/forms/")) return publicRoute[request.method](request, { params: Promise.resolve({ id: path.split("/")[4] }) });
    if (path === "/api/forms" || path.startsWith("/api/forms/")) return formsRoute[request.method](request, { params: Promise.resolve({ path: path.split("/").slice(3) }) });
    throw new Error(`Unexpected test route: ${path}`);
  };
} else {
  dispatch = (request) => fetch(request, { redirect: "manual" });
}

if (process.argv.includes("--session-only")) {
  const { cookie, ownerId } = JSON.parse(readFileSync(0, "utf8"));
  const response = await dispatch(new Request(`${origin}/api/me`, { headers: { cookie } }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.id, ownerId);
  await appDb().$client.end();
  console.log("Persisted session accepted in a fresh process.");
  process.exit(0);
}

const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const marker = randomUUID();
const emails = [`foundation-a-${marker}@example.invalid`, `foundation-b-${marker}@example.invalid`];
const password = `test-password-${randomUUID()}`;
let assertions = 0;
// Independent synthetic clients keep input/ownership cases separate from abuse tests.
const testAddressPrefix = randomUUID().slice(0, 4);
let requestSequence = 0;

async function request(path, { method = "GET", cookie, body, expected = 200, requestOrigin = origin, rawBody } = {}) {
  const headers = new Headers({ "x-forwarded-for": `2001:db8:${testAddressPrefix}:${(++requestSequence).toString(16)}::1` });
  if (cookie) headers.set("cookie", cookie);
  if (method !== "GET" && requestOrigin !== null) headers.set("origin", requestOrigin);
  if (body !== undefined || rawBody !== undefined) headers.set("content-type", "application/json");
  const response = await dispatch(new Request(`${origin}${path}`, {
    method, headers, body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
  }));
  const text = await response.text();
  assert.equal(response.status, expected, `${method} ${path}: ${text}`);
  assertions++;
  return { response, data: text ? JSON.parse(text) : null };
}

function sessionCookie(response) {
  const values = response.headers.getSetCookie();
  const session = values.find((value) => value.startsWith("better-auth.session_token="));
  assert.ok(session, "Real authentication must issue a session cookie.");
  assert.match(session, /httponly/i);
  assert.match(session, /(?:max-age|expires)=/i, "Session cookie must survive closing the browser.");
  return session.split(";")[0];
}

try {
  for (const path of ["/api/me", "/api/workspace", "/api/forms"]) await request(path, { expected: 401 });
  await request("/api/auth/sign-up/email", { method: "POST", body: { name: "Owner", email: emails[0], password }, requestOrigin: "https://attacker.invalid", expected: 403 });
  for (const invalid of [
    { name: "Owner", email: "not-an-email", password },
    { name: "Owner", email: emails[0], password: "short" },
    { name: "   ", email: emails[0], password },
  ]) await request("/api/auth/sign-up/email", { method: "POST", body: invalid, expected: 400 });

  const owners = [];
  for (const [index, email] of emails.entries()) {
    const registered = await request("/api/auth/sign-up/email", { method: "POST", body: { name: `Owner ${index + 1}`, email, password } });
    const cookie = sessionCookie(registered.response);
    const me = (await request("/api/me", { cookie })).data;
    const provisioned = await db.query("SELECT count(*) FROM workspaces WHERE owner_id=$1", [me.user.id]);
    assert.equal(Number(provisioned.rows[0].count), 1, "Registration must provision one workspace before any workspace API call.");
    const workspace = (await request("/api/workspace", { cookie })).data;
    assert.equal(workspace.ownerId, me.user.id);
    assert.deepEqual((await request("/api/workspace", { cookie })).data, workspace);
    assert.deepEqual((await request("/api/forms", { cookie })).data, []);
    const persisted = await db.query('SELECT count(*) FROM "session" WHERE user_id=$1 AND expires_at > NOW()', [me.user.id]);
    assert.equal(Number(persisted.rows[0].count), 1);
    const credential = await db.query('SELECT password FROM "account" WHERE user_id=$1 AND provider_id=$2', [me.user.id, "credential"]);
    assert.ok(credential.rows[0].password && credential.rows[0].password !== password, "Password must be hashed.");
    await assert.rejects(db.query("INSERT INTO workspaces (owner_id) VALUES ($1)", [me.user.id]), { code: "23505" });
    await request("/api/forms", { method: "POST", cookie, body: { ownerId: me.user.id }, expected: 400 });
    const form = (await request("/api/forms", { method: "POST", cookie, body: {}, expected: 201 })).data;
    assert.equal(form.workspaceId, workspace.id);
    assert.equal(form.isPublished, false);
    assert.equal(form.published, null);
    owners.push({ cookie, id: me.user.id, form, workspace });
  }
  const [first, second] = owners;
  assert.notEqual(first.workspace.id, second.workspace.id);
  if (inProcess) {
    const freshProcess = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--in-process", "--session-only"], {
      input: JSON.stringify({ cookie: first.cookie, ownerId: first.id }), encoding: "utf8", env: process.env, timeout: 30000,
    });
    assert.equal(freshProcess.status, 0, freshProcess.stderr);
    assert.match(freshProcess.stdout, /Persisted session accepted/);
    console.log("Persisted session accepted in a fresh process using the same database and secret.");
  }
  const formPath = `/api/forms/${first.form.id}`;
  const publicPath = `/api/public/forms/${first.form.id}`;
  const questionId = first.form.draft.question.id;
  const schema = { title: "Customer feedback", question: { id: questionId, type: "short_text", label: "What could we improve?", required: true } };

  await request(publicPath, { expected: 404 });
  await request(publicPath, { method: "POST", body: { answers: { [questionId]: "Not yet" } }, expected: 404 });
  for (const invalid of [null, {}, { ...schema, title: " " }, { ...schema, title: "x".repeat(201) },
    { ...schema, question: { ...schema.question, id: randomUUID() } },
    { ...schema, question: { ...schema.question, label: " " } },
    { ...schema, question: { ...schema.question, type: "unsupported" } },
    { ...schema, question: { ...schema.question, required: "yes" } },
    { ...schema, ownerId: second.id }]) {
    await request(formPath, { method: "PATCH", cookie: first.cookie, body: invalid, expected: 400 });
  }
  await request(formPath, { method: "PATCH", cookie: first.cookie, rawBody: "{broken", expected: 400 });
  await request(formPath, { method: "PATCH", cookie: first.cookie, rawBody: "x".repeat(262145), expected: 413 });
  await request(formPath, { method: "PATCH", cookie: first.cookie, body: schema });
  assert.deepEqual((await request(formPath, { cookie: first.cookie })).data.draft, schema);
  await request(`${formPath}/publish`, { method: "POST", cookie: first.cookie, body: { published: schema }, expected: 400 });
  await db.query("UPDATE forms SET draft=$1::jsonb WHERE id=$2", [JSON.stringify({ ...schema, title: " " }), first.form.id]);
  await request(`${formPath}/publish`, { method: "POST", cookie: first.cookie, body: {}, expected: 400 });
  await request(publicPath, { expected: 404 });
  await request(formPath, { method: "PATCH", cookie: first.cookie, body: schema });
  await request(`${formPath}/publish`, { method: "POST", cookie: first.cookie, body: {} });
  assert.deepEqual((await request(publicPath)).data, schema);
  for (const answers of [null, [], {}, { [questionId]: " " }, { [questionId]: 3 }, { [questionId]: null }, { [questionId]: "x".repeat(2001) }, { [randomUUID()]: "unknown" }, { [questionId]: "fine", extra: "unknown" }]) {
    await request(publicPath, { method: "POST", body: { answers }, expected: 400 });
  }
  await request(publicPath, { method: "POST", body: { answers: { [questionId]: "Fine" }, schemaSnapshot: schema }, expected: 400 });
  await request(publicPath, { method: "POST", body: { answers: { [questionId]: "  Keep it simple.  " } }, expected: 201 });
  const initialList = (await request(`${formPath}/responses`, { cookie: first.cookie })).data;
  assert.equal(initialList.length, 1);
  const responseId = initialList[0].id;
  const detailPath = `${formPath}/responses/${responseId}`;
  const originalResponse = (await request(detailPath, { cookie: first.cookie })).data;
  assert.deepEqual(originalResponse.schemaSnapshot, schema);
  assert.equal(originalResponse.answers[questionId], "Keep it simple.");
  const stored = await db.query("SELECT schema_snapshot, answers FROM responses WHERE id=$1", [responseId]);
  assert.deepEqual(stored.rows[0].schema_snapshot, schema);
  assert.deepEqual(stored.rows[0].answers, originalResponse.answers);
  await request(`/api/forms/${second.form.id}/publish`, { method: "POST", cookie: second.cookie, body: {} });
  await request(`/api/public/forms/${second.form.id}`, { method: "POST", body: { answers: { [second.form.draft.question.id]: "Second owner's answer" } }, expected: 201 });
  const secondResponses = (await request(`/api/forms/${second.form.id}/responses`, { cookie: second.cookie })).data;
  assert.equal(secondResponses.length, 1);
  first.responseId = responseId;
  second.responseId = secondResponses[0].id;
  await request(`/api/forms/${second.form.id}/responses/${second.responseId}`, { cookie: second.cookie });

  for (const [owner, other] of [[first, second], [second, first]]) {
    const otherPath = `/api/forms/${other.form.id}`;
    for (const [method, suffix, body] of [["GET", ""], ["PATCH", "", owner.form.draft], ["POST", "/publish", {}], ["POST", "/unpublish", {}], ["GET", "/responses"], ["GET", `/responses/${other.responseId}`]]) {
      await request(`${otherPath}${suffix}`, { method, cookie: owner.cookie, body, expected: 404 });
    }
    const list = (await request("/api/forms", { cookie: owner.cookie })).data;
    assert.deepEqual(list.map((form) => form.id), [owner.form.id]);
  }
  for (const path of ["/api/me", "/api/workspace", "/api/forms"]) await request(path, { cookie: `${first.cookie}tampered`, expected: 401 });
  await request(`/api/forms/${second.form.id}/responses/${responseId}`, { cookie: second.cookie, expected: 404 });
  await request(`${formPath}/responses/${randomUUID()}`, { cookie: first.cookie, expected: 404 });
  await request(`/api/forms/${randomUUID()}`, { cookie: first.cookie, expected: 404 });
  await request("/api/forms/not-a-uuid", { cookie: first.cookie, expected: 404 });
  await request("/api/forms", { method: "POST", body: {}, expected: 401 });
  for (const [method, suffix, body] of [["GET", ""], ["PATCH", "", schema], ["POST", "/publish", {}], ["POST", "/unpublish", {}], ["GET", "/responses"], ["GET", `/responses/${responseId}`]]) {
    await request(`${formPath}${suffix}`, { method, body, expected: 401 });
    await request(`${formPath}${suffix}`, { method, body, cookie: `${first.cookie}tampered`, expected: 401 });
  }
  for (const requestOrigin of ["https://attacker.invalid", null]) {
    for (const [path, method, body] of [["/api/forms", "POST", {}], [formPath, "PATCH", schema], [`${formPath}/publish`, "POST", {}], [`${formPath}/unpublish`, "POST", {}]]) {
      await request(path, { method, body, cookie: first.cookie, requestOrigin, expected: 403 });
    }
  }

  const edited = { title: "Updated feedback", question: { ...schema.question, label: "Anything else?", required: false } };
  await request(formPath, { method: "PATCH", cookie: first.cookie, body: edited });
  assert.deepEqual((await request(publicPath)).data, schema, "Saving a draft must not change the live schema.");
  await request(publicPath, { method: "POST", body: { answers: {} }, expected: 400 });
  await request(`${formPath}/publish`, { method: "POST", cookie: first.cookie, body: {} });
  assert.deepEqual((await request(publicPath)).data, edited);
  await request(publicPath, { method: "POST", body: { answers: {} }, expected: 201 });
  await request(publicPath, { method: "POST", body: { answers: { [questionId]: "x".repeat(2000) } }, expected: 201 });
  assert.deepEqual((await request(detailPath, { cookie: first.cookie })).data, originalResponse, "Republishing must preserve response snapshots.");
  assert.equal((await request(`${formPath}/responses`, { cookie: first.cookie })).data.length, 3);
  await request(`${formPath}/unpublish`, { method: "POST", cookie: first.cookie, body: {} });
  await request(publicPath, { expected: 404 });
  await request(publicPath, { method: "POST", body: { answers: { [questionId]: "Too late" } }, expected: 404 });
  await request(publicPath, { method: "POST", cookie: first.cookie, body: { answers: {} }, expected: 404 });
  assert.deepEqual((await request(detailPath, { cookie: first.cookie })).data, originalResponse);

  await request("/api/auth/sign-in/email", { method: "POST", body: { email: emails[0], password: "wrong-password" }, expected: 401 });
  await request("/api/auth/sign-in/email", { method: "POST", body: { email: emails[0], password }, requestOrigin: "https://attacker.invalid", expected: 403 });
  await request("/api/auth/sign-out", { method: "POST", cookie: first.cookie, body: {}, requestOrigin: "https://attacker.invalid", expected: 403 });
  await request("/api/me", { cookie: first.cookie });
  await request("/api/auth/sign-out", { method: "POST", cookie: first.cookie, body: {} });
  await request(formPath, { cookie: first.cookie, expected: 401 });
  const login = await request("/api/auth/sign-in/email", { method: "POST", body: { email: emails[0], password } });
  const newCookie = sessionCookie(login.response);
  assert.deepEqual((await request(formPath, { cookie: newCookie })).data.draft, edited, "Forms must survive logout and login.");
  assert.deepEqual((await request(detailPath, { cookie: newCookie })).data, originalResponse, "Responses must survive logout and login.");
  await db.query('UPDATE "session" SET expires_at=NOW()-INTERVAL \'1 minute\' WHERE user_id=$1', [second.id]);
  await request("/api/me", { cookie: second.cookie, expected: 401 });
  console.log(`Foundation: ${assertions} request assertions passed (${inProcess ? "in-process Request/Response handlers + real PostgreSQL; no listening server" : "live HTTP + real PostgreSQL"}).`);
} finally {
  await db.query('DELETE FROM "user" WHERE email = ANY($1::text[])', [emails]);
  await db.end();
  if (appDb) await appDb().$client.end();
}
