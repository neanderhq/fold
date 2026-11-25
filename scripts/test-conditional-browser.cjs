const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { Client } = require("pg");
const { chromium } = require("playwright");

const origin = process.env.BETTER_AUTH_URL;
const database = process.env.NEANDER_TEMPLATE_TEST_DATABASE_URL;
assert.equal(process.env.DATABASE_URL, database);
for (const value of [origin, database]) assert.ok(["127.0.0.1", "localhost"].includes(new URL(value).hostname));

async function json(response, status = 200) {
  assert.equal(response.status(), status, await response.text());
  return response.json();
}

async function capture(page, name) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  if (!process.env.FOLD_CAPTURE_DIRECTORY) return;
  const dir = join(process.env.FOLD_CAPTURE_DIRECTORY, "screenshots");
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `conditional-${name}.png`), fullPage: true, animations: "disabled" });
}

async function main() {
  const browser = await chromium.launch();
  const run = randomUUID(), emails = [];
  try {
    async function ownerContext(number) {
      const context = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 1000 },
        extraHTTPHeaders: { origin, "x-forwarded-for": `2001:db8:${run.slice(0, 4)}::${number}` } });
      const email = `conditional-${number}-${run}@example.invalid`;
      emails.push(email);
      await json(await context.request.post("/api/auth/sign-up/email", { data: { email, name: "Workshop owner", password: `Fold!${run}` } }));
      return context;
    }
    const owner = await ownerContext(1), other = await ownerContext(2);
    const reader = await browser.newContext({ baseURL: origin, viewport: { width: 375, height: 900 } });
    const { id } = await json(await owner.request.post("/api/forms", { data: {} }), 201);
    const path = `/api/forms/${id}`, publicPath = `/api/public/forms/${id}`;
    const controller = { id: randomUUID(), type: "single_choice", label: "Need dietary accommodations?", required: true, options: ["Yes", "No"] };
    const followUp = { id: randomUUID(), type: "long_text", label: "Dietary details", required: true };
    const schema = { title: "Workshop dietary needs", blocks: [controller, followUp] };
    await json(await owner.request.patch(path, { data: schema }));
    await json(await owner.request.post(`${path}/publish`, { data: {} }));
    await json(await reader.request.post(publicPath, { data: { answers: { [controller.id]: "No", [followUp.id]: "Earlier instructions" } } }), 201);
    const editor = await owner.newPage();
    editor.setDefaultTimeout(12000);
    await editor.goto(`/forms/${id}`);
    await editor.getByRole("button", { name: "Settings for block 2", exact: true }).click();
    await editor.locator(`[data-block-id="${followUp.id}"] summary`).press("Enter");
    const when = editor.getByLabel("Show this question when");
    await when.selectOption(controller.id);
    await editor.getByLabel("Answer is", { exact: true }).selectOption("Yes");
    await editor.getByRole("status", { name: "Draft save status", exact: true }).getByText("All changes saved", { exact: true }).waitFor();
    await capture(editor, "editor");
    await editor.reload();
    const preview = editor.getByRole("region", { name: "Draft preview" });
    await preview.getByRole("radio", { name: "Yes" }).press("Space");
    await preview.getByLabel("Dietary details").waitFor();
    assert.equal((await json(await owner.request.get(path))).draft.blocks[1].followUp.controllerId, controller.id);
    assert.equal((await json(await reader.request.get(publicPath))).blocks[1].followUp, undefined);
    await editor.getByRole("button", { name: "Republish" }).click();
    await editor.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
    const saved = (await json(await owner.request.get(path))).draft;
    assert.equal((await other.request.patch(path, { data: saved })).status(), 404);
    assert.equal((await other.request.post(`${path}/publish`, { data: {} })).status(), 404);
    for (const blocks of [[saved.blocks[1], saved.blocks[0]], [saved.blocks[1]], [{ ...controller, options: ["Maybe", "No"] }, saved.blocks[1]]]) {
      assert.equal((await owner.request.patch(path, { data: { ...saved, blocks } })).status(), 400);
    }
    const page = await reader.newPage();
    page.setDefaultTimeout(12000);
    await page.goto(`/f/${id}`);
    const yes = page.getByRole("radio", { name: "Yes" }), no = page.getByRole("radio", { name: "No" });
    const details = page.getByLabel("Dietary details");
    await yes.waitFor();
    assert.equal(await details.count(), 0);
    await yes.press("Space");
    await yes.press("Tab");
    assert.equal(await details.evaluate(input => input === document.activeElement), true);
    const submit = page.getByRole("button", { name: "Submit", exact: true });
    await submit.press("Enter");
    assert.equal(await details.getAttribute("aria-invalid"), "true");
    assert.equal(await details.evaluate(input => input === document.activeElement), true);
    await capture(page, "required-phone");
    await details.fill("Gluten free");
    await yes.press("ArrowDown");
    await details.waitFor({ state: "hidden" });
    await no.press("ArrowUp");
    await details.waitFor();
    assert.equal(await details.inputValue(), "");
    await details.fill("Gluten free");
    await submit.press("Enter");
    await page.getByRole("heading", { name: "Thank you!" }).waitFor();
    await page.reload();
    await no.press("Space");
    await submit.press("Enter");
    await page.getByRole("heading", { name: "Thank you!" }).waitFor();
    const before = await json(await owner.request.get(`${path}/responses`));
    assert.equal(before.length, 3);
    assert.deepEqual(before.find(row => row.answers[followUp.id] === "Gluten free").schemaSnapshot.blocks[1].followUp, saved.blocks[1].followUp);
    assert.ok(before.some(row => row.answers[controller.id] === "No" && !(followUp.id in row.answers)));
    assert.equal(before.find(row => row.answers[followUp.id] === "Earlier instructions").schemaSnapshot.blocks[1].followUp, undefined);
    assert.equal((await reader.request.post(publicPath, { data: { answers: { [controller.id]: "No", [followUp.id]: "Hidden" } } })).status(), 400);
    assert.equal((await json(await owner.request.get(`${path}/responses`))).length, 3);

    await editor.getByRole("button", { name: "Settings for block 2", exact: true }).click();
    await editor.getByRole("button", { name: "Move block 2 up", exact: true }).click();
    await editor.getByText("Choose an earlier unconditional choice on this page", { exact: false }).waitFor();
    assert.ok(await editor.getByRole("button", { name: "Republish" }).isDisabled());
    console.log("FOLD_CONDITIONAL_PASSED: draft/publish, roles, 375px keyboard branches, hidden values, validation, repair and preserved history");
  } finally {
    await browser.close();
    const db = new Client({ connectionString: database });
    await db.connect();
    try { await db.query('DELETE FROM "user" WHERE email = ANY($1)', [emails]); }
    finally { await db.end(); }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
