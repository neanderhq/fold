import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const origin = process.argv.find((argument) => argument.startsWith("--origin="))?.slice(9);
assert.ok(origin && ["127.0.0.1", "localhost"].includes(new URL(origin).hostname), "Use the existing local managed preview.");
const databaseUrl = new URL(process.env.DATABASE_URL);
assert.ok(["127.0.0.1", "localhost"].includes(databaseUrl.hostname) && process.env.DATABASE_URL === process.env.NEANDER_TEMPLATE_TEST_DATABASE_URL, "Cleanup requires the explicitly selected disposable loopback database.");
const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const marker = randomUUID();
const emails = ["a", "b"].map((owner) => `builder-${owner}-${marker}@example.invalid`);
let checks = 0;
// Independent synthetic clients keep input/ownership cases separate from abuse tests.
const testAddressPrefix = randomUUID().slice(0, 4);
let requestSequence = 0;
async function request(path, { method = "GET", body, cookie, expected = 200, requestOrigin = origin } = {}) {
  const response = await fetch(`${origin}${path}`, { method, headers: { "x-forwarded-for": `2001:db8:${testAddressPrefix}:${(++requestSequence).toString(16)}::1`, "Content-Type": "application/json", ...(requestOrigin ? { Origin: requestOrigin } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  const data = response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.text();
  assert.ok((Array.isArray(expected) ? expected : [expected]).includes(response.status), `${method} ${path}: expected ${expected}, got ${response.status}: ${JSON.stringify(data)}`); checks++;
  return { data, response };
}
async function signup(email) {
  const result = await request("/api/auth/sign-up/email", { method: "POST", body: { name: "Synthetic builder tester", email, password: `Builder-${marker}` } });
  return result.response.headers.getSetCookie().map((item) => item.split(";")[0]).join("; ");
}
try {
  const first = await signup(emails[0]);
  const second = await signup(emails[1]);
  const form = (await request("/api/forms", { method: "POST", cookie: first, body: {}, expected: 201 })).data;
  const secondForm = (await request("/api/forms", { method: "POST", cookie: second, body: {}, expected: 201 })).data;
  const path = `/api/forms/${form.id}`;
  const publicPath = `/api/public/forms/${form.id}`;
  const types = ["short_text", "long_text", "email", "number", "date", "single_choice", "multi_choice", "dropdown", "rating", "consent", "heading", "description"];
  const blocks = types.map((type) => ({ id: randomUUID(), type, label: `Original ${type}`, description: "Help text", required: !["heading", "description"].includes(type), ...(["single_choice", "multi_choice", "dropdown"].includes(type) ? { options: ["One", "Two"] } : {}), ...(type === "rating" || type === "number" ? { min: 1, max: 5 } : {}) }));
  const draft = { title: "All-fields synthetic feedback", description: "Synthetic demonstration", confirmation: "Thanks for the feedback!", logoUrl: "https://example.invalid/logo.png", blocks };
  const validAnswers = Object.fromEntries(blocks.slice(0, 10).map((block) => [block.id, ({ short_text: '=SUM(1,2)\n"Quoted", text', long_text: "Long fictional answer", email: "synthetic@example.invalid", number: 2.5, date: "2024-02-29", single_choice: "One", multi_choice: ["One", "Two"], dropdown: "Two", rating: 5, consent: true })[block.type]]));
  await request(path, { method: "PATCH", cookie: first, body: draft });
  await request(`${path}/publish`, { method: "POST", cookie: first, body: {} });
  assert.deepEqual((await request(publicPath)).data, draft); checks++;
  for (const [type, value] of [["short_text", 2], ["long_text", "x".repeat(10001)], ["email", "not-email"], ["number", "NaN"], ["date", "2026-02-29"], ["single_choice", "Unknown"], ["multi_choice", ["One", "One"]], ["dropdown", "Unknown"], ["rating", 2.5], ["consent", false]]) {
    const block = blocks.find((item) => item.type === type);
    await request(publicPath, { method: "POST", body: { answers: { ...validAnswers, [block.id]: value } }, expected: 400 });
    const missing = { ...validAnswers }; delete missing[block.id];
    await request(publicPath, { method: "POST", body: { answers: missing }, expected: 400 });
  }
  for (const invalid of [{ ...draft, blocks: [] }, { ...draft, blocks: [blocks[0], blocks[0]] }, { ...draft, logoUrl: "javascript:alert(1)" }, { ...draft, blocks: [{ ...blocks[5], options: ["Duplicate", "Duplicate"] }] }, { ...draft, blocks: [{ ...blocks[3], min: 5, max: 1 }] }]) await request(path, { method: "PATCH", body: invalid, cookie: first, expected: 400 });
  for (const block of blocks.slice(0, 10)) await request(publicPath, { method: "POST", body: { answers: { ...validAnswers, [block.id]: null } }, expected: 400 });
  await request(publicPath, { method: "POST", body: { answers: { ...validAnswers, [blocks[10].id]: "Injected content answer" } }, expected: 400 });
  await request(publicPath, { method: "POST", body: { answers: validAnswers, schemaSnapshot: draft }, expected: 400 });
  await request(publicPath, { method: "POST", body: { answers: validAnswers }, expected: 201 });
  const initial = (await request(`${path}/responses?page=1`, { cookie: first })).data;
  const original = initial.records[0];
  assert.equal(initial.total, 1); assert.deepEqual(original.schemaSnapshot, draft); assert.deepEqual(original.answers, validAnswers); checks += 3;
  for (const action of ["duplicate", "archive", "restore", "rename", "publish", "unpublish"]) {
    await request(`${path}/${action}`, { method: "POST", cookie: second, body: action === "rename" ? { title: "Stolen" } : {}, expected: 404 });
    await request(`${path}/${action}`, { method: "POST", body: {}, expected: 401 });
    await request(`${path}/${action}`, { method: "POST", cookie: first, body: {}, requestOrigin: "https://attacker.invalid", expected: 403 });
  }
  for (const suffix of ["", "/responses?page=1", "/responses?q=fictional", `/responses/${original.id}`, "/export"]) {
    await request(`${path}${suffix}`, { cookie: second, expected: 404 });
    await request(`${path}${suffix}`, { expected: 401 });
  }
  await request(`/api/forms/${secondForm.id}/responses/${original.id}`, { cookie: second, expected: 404 });
  const updated = { ...draft, title: "New title", blocks: [{ ...blocks[9], label: "Updated consent" }, ...blocks.slice(2, 9).reverse().map((block) => ({ ...block, label: `Updated ${block.type}` })), { id: randomUUID(), type: "short_text", label: "New optional question", required: false }] };
  await request(path, { method: "PATCH", cookie: first, body: updated });
  assert.deepEqual((await request(publicPath)).data, draft); checks++;
  await request(`${path}/publish`, { method: "POST", cookie: first, body: {} });
  const currentAnswers = { ...validAnswers }; delete currentAnswers[blocks[0].id]; delete currentAnswers[blocks[1].id];
  await request(publicPath, { method: "POST", body: { answers: validAnswers }, expected: 400 });
  for (let index = 0; index < 23; index++) await request(publicPath, { method: "POST", body: { answers: currentAnswers }, expected: 201 });
  const pageOne = (await request(`${path}/responses?page=1`, { cookie: first })).data;
  const pageTwo = (await request(`${path}/responses?page=2`, { cookie: first })).data;
  assert.equal(pageOne.total, 24); assert.equal(pageOne.records.length, 20); assert.equal(pageTwo.records.length, 4); assert.equal(new Set([...pageOne.records, ...pageTwo.records].map((record) => record.id)).size, 24); checks += 4;
  assert.deepEqual((await request(`${path}/responses/${original.id}`, { cookie: first })).data, original); checks++;
  const search = (await request(`${path}/responses?page=1&q=Long%20fictional`, { cookie: first })).data;
  assert.equal(search.total, 1); checks++;
  assert.equal((await request(`${path}/responses?page=1&q=Updated%20consent`, { cookie: first })).data.total, 23); checks++;
  assert.equal((await request(`${path}/responses?page=1&q=%25`, { cookie: first })).data.total, 0); checks++;
  const today = new Date().toISOString().slice(0, 10);
  assert.equal((await request(`${path}/responses?page=1&from=${today}&to=${today}`, { cookie: first })).data.total, 24); checks++;
  assert.equal((await request(`${path}/responses?page=1&from=2099-01-01`, { cookie: first })).data.total, 0); checks++;
  for (const query of ["page=-1", "page=1.2", "page=1&from=2026-02-29", "page=1&from=2026-11-13&to=2026-11-12"]) await request(`${path}/responses?${query}`, { cookie: first, expected: 400 });
  const csv = await request(`${path}/export`, { cookie: first });
  assert.ok(csv.data.includes("Original short_text")); assert.ok(csv.data.includes("Updated consent")); assert.ok(csv.data.includes("'=SUM(1,2)")); assert.ok(csv.data.includes('""Quoted""')); checks += 4;
  const filteredCsv = (await request(`${path}/export?q=Long%20fictional`, { cookie: first })).data;
  assert.ok(!filteredCsv.includes("Updated consent")); checks++;
  const copy = (await request(`${path}/duplicate`, { method: "POST", cookie: first, body: {}, expected: 201 })).data;
  assert.notEqual(copy.id, form.id); assert.equal(copy.isPublished, false); assert.equal((await request(`/api/forms/${copy.id}/responses?page=1`, { cookie: first })).data.total, 0); checks += 3;
  const bulkSchema = { title: "Synthetic export-limit fixture", question: { id: randomUUID(), type: "short_text", label: "Fictional", required: false } };
  await db.query("INSERT INTO responses (form_id, schema_snapshot, answers) SELECT $1, $2::jsonb, '{}'::jsonb FROM generate_series(1,10001)", [copy.id, JSON.stringify(bulkSchema)]);
  await request(`/api/forms/${copy.id}/export`, { cookie: first, expected: 400 });
  assert.equal((await request(`/api/forms/${copy.id}/responses?page=1`, { cookie: first })).data.total, 10001); checks++;
  assert.equal((await request(`/api/forms/${copy.id}/responses?page=501`, { cookie: first })).data.records.length, 1); checks++;
  await request(`${path}/rename`, { method: "POST", cookie: first, body: { title: "Renamed draft only" } });
  assert.equal((await request(publicPath)).data.title, updated.title); checks++;
  await request(`${path}/archive`, { method: "POST", cookie: first, body: {} });
  await request(publicPath, { expected: 404 }); await request(publicPath, { method: "POST", body: { answers: currentAnswers }, expected: 404 });
  await request(`${path}/publish`, { method: "POST", cookie: first, body: {}, expected: 409 });
  await request(`${path}/restore`, { method: "POST", cookie: first, body: {} });
  await request(publicPath, { expected: 404 });
  assert.deepEqual((await request(`${path}/responses/${original.id}`, { cookie: first })).data, original); checks++;
  await request(`${path}/publish`, { method: "POST", cookie: first, body: {} });
  const race = await Promise.all([request(publicPath, { method: "POST", body: { answers: currentAnswers }, expected: [201, 404] }), request(`${path}/archive`, { method: "POST", cookie: first, body: {} })]);
  const expectedTotal = 24 + (race[0].response.status === 201 ? 1 : 0);
  assert.equal(race.length, 2); checks++;
  for (let index = 0; index < 3; index++) await request(publicPath, { method: "POST", body: { answers: currentAnswers }, expected: 404 });
  assert.equal((await request(`${path}/responses?page=1`, { cookie: first })).data.total, expectedTotal); checks++;
  await request(`${path}/restore`, { method: "POST", cookie: first, body: {} });
  await db.query("UPDATE forms SET draft=$1::jsonb WHERE id=$2", [JSON.stringify({ title: "Corrupted fixture", blocks: [{ ...blocks[5], options: [] }] }), form.id]);
  await request(`${path}/publish`, { method: "POST", cookie: first, body: {}, expected: 400 });
  await request(path, { method: "PATCH", cookie: first, body: updated });
  await request(`${path}/publish`, { method: "POST", cookie: first, body: {} });
  const unpublishRace = await Promise.all([request(publicPath, { method: "POST", body: { answers: currentAnswers }, expected: [201, 404] }), request(`${path}/unpublish`, { method: "POST", cookie: first, body: {} })]);
  const finalTotal = expectedTotal + (unpublishRace[0].response.status === 201 ? 1 : 0);
  await request(publicPath, { method: "POST", body: { answers: currentAnswers }, expected: 404 });
  const listed = (await request("/api/forms", { cookie: first })).data;
  assert.equal(listed.find((item) => item.id === form.id).responseCount, finalTotal); checks++;
  const publicHeaders = (await request(`/f/${form.id}`)).response.headers;
  assert.ok(publicHeaders.get("content-security-policy")?.includes("frame-ancestors *")); assert.equal(publicHeaders.get("x-frame-options"), null); checks += 2;
  const privateHeaders = (await request("/api/health")).response.headers;
  assert.equal(privateHeaders.get("x-frame-options"), "DENY"); assert.ok(privateHeaders.get("content-security-policy")?.includes("frame-ancestors 'none'")); checks += 2;
  console.log(`BUILDER_PASSED ${checks} checks: all fields, validation, ownership, historical snapshots, lifecycle, filters, pagination, CSV and embedding headers.`);
} finally {
  await db.query('DELETE FROM "user" WHERE email=ANY($1::text[])', [emails]);
  await db.end();
}
