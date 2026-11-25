const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { mkdirSync, readFileSync, renameSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { Client } = require("pg");
const { chromium } = require("playwright");

const origin = process.env.BETTER_AUTH_URL;
const database = process.env.NEANDER_TEMPLATE_TEST_DATABASE_URL;
const fixture = process.env.FOLD_PROVIDER_FIXTURE_DIR;
assert.equal(process.env.DATABASE_URL, database);
for (const value of [origin, database]) assert.ok(["127.0.0.1", "localhost"].includes(new URL(value).hostname));
assert.ok(fixture);

const control = { mail: "ok", sheets: "ok", proofs: {} };
function saveControls() {
  const path = join(fixture, "controls.json");
  writeFileSync(path + ".next", JSON.stringify(control), { mode: 0o644 });
  renameSync(path + ".next", path);
}
const events = () => readFileSync(join(fixture, "events.ndjson"), "utf8").split("\n").filter(Boolean).map(JSON.parse);

async function json(response, status = 200) {
  assert.equal(response.status(), status, await response.text());
  return response.json();
}

async function waitFor(check) {
  for (let i = 0; i < 60; i += 1) {
    const result = await check();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.fail("Timed out waiting for delivery state");
}

async function capture(page, name) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  if (!process.env.FOLD_CAPTURE_DIRECTORY) return;
  const dir = join(process.env.FOLD_CAPTURE_DIRECTORY, "screenshots");
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `delivery-${name}.png`), fullPage: true, animations: "disabled" });
}

async function main() {
  const run = randomUUID(), emails = [];
  const browser = await chromium.launch();
  const db = new Client({ connectionString: database });
  await db.connect();
  try {
    async function user(number) {
      const context = await browser.newContext({ baseURL: origin, viewport: { width: 375, height: 900 },
        extraHTTPHeaders: { origin, "x-forwarded-for": `2001:db8:${run.slice(0, 4)}::${number}` } });
      const email = `delivery-${number}-${run.slice(0, 8)}@example.invalid`;
      emails.push(email);
      await json(await context.request.post("/api/auth/sign-up/email", { data: { email, name: "Workshop organizer", password: `Fold!${run}` } }));
      return context;
    }
    const owner = await user(1), other = await user(2);
    const publicContext = await browser.newContext({ baseURL: origin });
    const { id } = await json(await owner.request.post("/api/forms", { data: {} }), 201);
    const path = `/api/forms/${id}`, publicPath = `/api/public/forms/${id}`, settingsPath = `${path}/integrations`;
    const route = `/forms/${id}/integrations`;
    const post = async (action, extra = {}, status = 200) => json(await owner.request.post(settingsPath, { data: { action, ...extra } }), status);
    const current = async () => json(await owner.request.get(settingsPath));
    const byStatus = async (responseId, kind, status) => waitFor(async () =>
      (await current()).recent.find(row => row.responseId === responseId && row.kind === kind && row.status === status));
    const lookup = async (id, text) => (await json(await owner.request.get(`${path}/responses`))).find(row => row.answers[id] === text);
    const first = { id: randomUUID(), type: "short_text", label: "Workshop name", required: true };
    const privateField = { id: randomUUID(), type: "long_text", label: "Notes for the organizer", required: false };
    const schema = { title: "Workshop intake", blocks: [first, privateField] };
    async function publish(blocks = schema.blocks) {
      await json(await owner.request.patch(path, { data: { ...schema, blocks } }));
      await json(await owner.request.post(`${path}/publish`, { data: {} }));
    }
    async function submit(name, value = "Private fictional note") {
      const answers = { [first.id]: name, [privateField.id]: value };
      await json(await publicContext.request.post(publicPath, { data: { answers } }), 201);
      const row = await lookup(first.id, name);
      assert.ok(row, "Response commits before provider delivery");
      return row.id;
    }
    await publish();
    await submit("Historical response");
    const page = await owner.newPage();
    page.setDefaultTimeout(12000);
    await page.goto(route);
    await page.getByRole("status", { name: "Alert status" }).getByText("Alerts off").waitFor();
    assert.equal((await publicContext.request.get(settingsPath)).status(), 401);
    assert.equal((await other.request.get(settingsPath)).status(), 404);
    assert.equal((await other.request.post(settingsPath, { data: { action: "alert-start" } })).status(), 404);
    assert.equal((await other.request.post(settingsPath, { data: { action: "sheets-start" } })).status(), 404);
    assert.equal((await owner.request.post(settingsPath, { headers: { origin: "https://untrusted.example.invalid" }, data: { action: "alert-start" } })).status(), 403);

    await page.getByRole("button", { name: "Send verification code" }).press("Enter");
    await page.getByRole("status", { name: "Alert status" }).getByText("Verification required").waitFor();
    const codeEvent = events().find(event => event.type === "mail-accepted" && event.key.startsWith("fold-alert-verify-"));
    assert.deepEqual(codeEvent.message.to, [emails[0]]);
    const code = /\b\d{8}\b/.exec(codeEvent.message.text)[0];
    await post("alert-start", {}, 429);
    await post("alert-confirm", { code: code === "11111111" ? "22222222" : "11111111" }, 400);
    await db.query("UPDATE response_settings SET alert=jsonb_set(alert, '{challenge,expiresAt}', '0') WHERE form_id=$1", [id]);
    await post("alert-confirm", { code }, 409);
    await db.query("UPDATE response_settings SET alert=jsonb_set(alert, '{requestAt}', '0') WHERE form_id=$1", [id]);
    await post("alert-start");
    await page.reload();
    const verificationMessages = events().filter(event => event.type === "mail-accepted" && event.key.startsWith("fold-alert-verify-"));
    const nextCode = /\b\d{8}\b/.exec(verificationMessages.at(-1).message.text)[0];
    const codeBox = page.getByLabel("Verification code");
    await codeBox.fill(nextCode);
    await page.getByRole("button", { name: "Verify and enable alerts" }).press("Enter");
    await page.getByRole("status", { name: "Alert status" }).getByText("Alerts on").waitFor();
    await page.reload();
    await page.getByRole("status", { name: "Alert status" }).getByText("Alerts on").waitFor();

    const file = "fixture_sheet_owner_file_01";
    await page.getByRole("button", { name: "Start Google Sheets setup" }).press("Enter");
    const proofBox = page.getByLabel("Sheet verification code");
    await proofBox.waitFor();
    const proof = await proofBox.inputValue();
    assert.ok(proof.startsWith("fold-"));
    await page.getByLabel("Spreadsheet link or ID").fill(`https://docs.google.com/spreadsheets/d/${file}/edit`);
    await page.getByRole("checkbox", { name: first.label }).press("Space");
    await capture(page, "setup-phone");
    await page.getByRole("button", { name: "Verify and connect" }).press("Enter");
    await page.getByText("Share this spreadsheet with the service account as Editor and paste your code", { exact: false }).waitFor();
    assert.equal(events().filter(event => event.type === "sheet-created").length, 0);
    control.proofs[file] = proof;
    saveControls();
    await page.getByRole("button", { name: "Verify and connect" }).press("Enter");
    await page.getByRole("status", { name: "Sheets status" }).getByText("Connected", { exact: true }).waitFor();
    const copy = await json(await other.request.post("/api/forms", { data: {} }), 201);
    const copyPath = `/api/forms/${copy.id}`;
    await json(await other.request.patch(copyPath, { data: schema }));
    await json(await other.request.post(`${copyPath}/publish`, { data: {} }));
    await json(await other.request.post(`${copyPath}/integrations`, { data: { action: "sheets-start" } }));
    await json(await other.request.post(`${copyPath}/integrations`, {
      data: { action: "sheets-connect", spreadsheet: file, fieldIds: [first.id] },
    }), 422);
    const connection = (await current()).sheets.connection;
    assert.deepEqual(connection.fields.map(field => field.id), [first.id]);
    assert.equal(connection.spreadsheetId, file);
    assert.equal(events().filter(event => event.type === "sheet-written").length, 0);

    await page.reload();
    await page.getByRole("status", { name: "Sheets status" }).getByText("Connected", { exact: true }).waitFor();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await capture(page, "settings-desktop");
    await page.setViewportSize({ width: 375, height: 900 });
    const editor = await owner.newPage();
    await editor.setViewportSize({ width: 1440, height: 1000 });
    await editor.goto(`/forms/${id}`);
    const preview = editor.getByRole("region", { name: "Draft preview" });
    await preview.getByLabel(first.label).fill("Preview only");
    await preview.getByRole("button", { name: "Test submission" }).click();
    await preview.getByText("Preview only", { exact: false }).first().waitFor();
    assert.equal((await publicContext.request.post(publicPath, { data: { answers: {} } })).status(), 400);
    assert.equal(events().filter(event => ["sheet-written"].includes(event.type) || event.key?.startsWith("fold-response-alert-")).length, 0);

    const formula = "=1+2", responseId = await submit(formula);
    await byStatus(responseId, "alert", "delivered");
    await byStatus(responseId, "sheets", "delivered");
    const message = events().find(event => event.type === "mail-accepted" && event.key.endsWith(responseId)).message;
    assert.deepEqual(message.to, [emails[0]]);
    assert.doesNotMatch(message.text, /Private fictional note|Workshop intake|=1\+2/);
    const responseLink = message.text.match(/https?:[^\s]+/)[0];
    assert.equal(new URL(responseLink).searchParams.get("response"), responseId);
    await page.goto(responseLink);
    await page.getByRole("region", { name: "Response detail" }).getByText("Private fictional note").waitFor();
    assert.equal((await other.request.get(responseLink)).status(), 404);
    const row = events().find(event => event.type === "sheet-written" && event.row[0] === responseId).row;
    assert.deepEqual(row, [responseId, (await lookup(first.id, formula)).createdAt, formula]);

    control.mail = "lost";
    control.sheets = "lost";
    saveControls();
    const uncertain = await submit("Uncertain acknowledgment");
    await byStatus(uncertain, "alert", "failed");
    await byStatus(uncertain, "sheets", "failed");
    await page.goto(route);
    await page.getByText("Delivery failed", { exact: true }).first().waitFor();
    await capture(page, "failed-phone");
    control.mail = "ok";
    control.sheets = "ok";
    saveControls();
    const retryAlerts = page.getByRole("button", { name: "Retry delivery" }).first();
    await retryAlerts.press("Enter");
    await waitFor(async () => (await current()).recent.find(row => row.responseId === uncertain && row.status === "delivered"));
    await Promise.all([post("retry", { responseId: uncertain, kind: "alert" }), post("retry", { responseId: uncertain, kind: "alert" }),
      post("retry", { responseId: uncertain, kind: "sheets" }), post("retry", { responseId: uncertain, kind: "sheets" })]);
    await byStatus(uncertain, "alert", "delivered");
    await byStatus(uncertain, "sheets", "delivered");
    assert.equal(events().filter(event => event.type === "mail-accepted" && event.key.endsWith(uncertain)).length, 1);
    assert.equal(events().filter(event => event.type === "sheet-written" && event.row[0] === uncertain).length, 1);

    control.mail = "fail";
    control.sheets = "forbidden";
    saveControls();
    const forbidden = await submit("Provider unavailable");
    await byStatus(forbidden, "sheets", "failed");
    await byStatus(forbidden, "alert", "failed");
    control.sheets = "ok";
    saveControls();
    await post("retry", { responseId: forbidden, kind: "sheets" });
    await byStatus(forbidden, "sheets", "delivered");
    await db.query("UPDATE responses SET created_at = now() - interval '24 hours' WHERE id=$1", [forbidden]);
    const attempts = events().filter(event => event.type === "mail-attempt").length;
    await post("retry", { responseId: forbidden, kind: "alert" });
    assert.equal(events().filter(event => event.type === "mail-attempt").length, attempts);
    assert.match((await byStatus(forbidden, "alert", "failed")).detail, /retry window closed/);

    await publish([{ ...first, label: "Workshop display name" }, privateField]);
    const afterRename = await submit("Renamed field");
    await byStatus(afterRename, "sheets", "delivered");
    assert.deepEqual((await current()).sheets.connection.fields.map(field => field.label), [first.label]);
    await publish([privateField]);
    assert.match((await current()).sheets.mappingIssue, /removed or changed type/);
    await json(await publicContext.request.post(publicPath, { data: { answers: { [privateField.id]: "Unmapped snapshot" } } }), 201);
    const removed = await lookup(privateField.id, "Unmapped snapshot");
    await byStatus(removed.id, "sheets", "failed");
    await page.reload();
    await page.getByRole("status", { name: "Sheets status" }).getByText("Mapping needs attention").waitFor();
    await page.getByRole("button", { name: "Disconnect Google Sheets" }).press("Enter");
    await page.getByRole("status", { name: "Sheets status" }).getByText("Disconnected", { exact: true }).waitFor();
    await byStatus(removed.id, "sheets", "cancelled");
    await page.getByRole("button", { name: "Disable alerts" }).press("Enter");
    await page.getByRole("status", { name: "Alert status" }).getByText("Alerts off").waitFor();
    await byStatus(forbidden, "alert", "cancelled");
    const sentBefore = events().length;
    await publish();
    const disconnected = await submit("After disconnect");
    assert.ok(!(await current()).recent.some(item => item.responseId === disconnected));
    assert.equal(events().length, sentBefore);
    assert.ok((await json(await owner.request.get(`${path}/responses`))).some(item => item.id === responseId));

    console.log("FOLD_DELIVERY_PASSED: controlled Resend and Sheets, verification, exact selected data, phone keyboard setup/recovery, auth, history and idempotency");
  } finally {
    await browser.close();
    try { await db.query('DELETE FROM "user" WHERE email = ANY($1)', [emails]); }
    finally { await db.end(); }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
