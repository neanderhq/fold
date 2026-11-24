// Editor regressions against the real app and a disposable PostgreSQL workspace.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const { Client } = require('pg');
const { chromium } = require('playwright');
const origin = process.env.BETTER_AUTH_URL;
const database = process.env.NEANDER_TEMPLATE_TEST_DATABASE_URL;
assert.equal(process.env.DATABASE_URL, database);
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(database).hostname));
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
const marker = randomUUID(), email = `editor-${marker}@example.invalid`, password = `Editor!${marker}`;
const output = `.cache/editor-gate/${marker}`; fs.mkdirSync(output, { recursive: true });
const checks = [];
const passed = name => { checks.push(name); console.log(`PASS ${name}`); };
async function saved(page) { await page.getByRole('status', { name: 'Draft save status', exact: true }).getByText('All changes saved', { exact: true }).waitFor(); }
async function json(response, status = 200) { assert.equal(response.status(), status, await response.text()); return response.json(); }
let browser;
(async () => {
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const ip = `2001:db8:${marker.slice(0, 4)}:${marker.slice(4, 8)}::1`;
    await json(await context.request.post('/api/auth/sign-up/email', { headers: { origin, 'x-forwarded-for': ip }, data: { name: 'Fictional editor owner', email, password } }));
    await page.goto('/'); await page.getByRole('heading', { name: 'My forms', exact: true }).waitFor();
    await page.getByRole('button', { name: 'New form', exact: true }).click();
    await page.getByRole('button', { name: /^Blank form/ }).click();
    await page.getByLabel('Form title', { exact: true }).waitFor();
    const id = new URL(page.url()).pathname.split('/')[2], path = `/api/forms/${id}`;
    const read = async () => json(await context.request.get(path));
    await page.getByLabel('Form title', { exact: true }).fill('A draft saved automatically');
    await saved(page); assert.equal((await read()).draft.title, 'A draft saved automatically');
    await page.reload(); assert.equal(await page.getByLabel('Form title', { exact: true }).inputValue(), 'A draft saved automatically');
    passed('Draft autosaves and survives a reload without pressing Save');

    await page.getByLabel('Form title', { exact: true }).fill('Keep my space ');
    await saved(page); assert.equal(await page.getByLabel('Form title', { exact: true }).inputValue(), 'Keep my space ');
    await page.getByLabel('Form title', { exact: true }).press('End');
    await page.getByLabel('Form title', { exact: true }).pressSequentially('while typing');
    await saved(page); assert.equal((await read()).draft.title, 'Keep my space while typing');
    passed('Saving canonical text preserves the space before the next word');

    // Hold one successful API receipt at a deterministic UI boundary, without
    // simulating a transport fault, to exercise typing during a pending save.
    let release, received;
    const receipt = new Promise(resolve => { received = resolve; });
    const barrier = new Promise(resolve => { release = resolve; });
    await page.route(`**${path}`, async route => {
      if (route.request().method() !== 'PATCH') return route.continue();
      const response = await route.fetch(); received(); await barrier; await route.fulfill({ response });
    }, { times: 1 });
    await page.getByLabel('Form title', { exact: true }).fill('First pending save');
    await receipt;
    await page.getByLabel('Form title', { exact: true }).fill('Latest typing wins');
    assert.equal(await page.getByRole('button', { name: 'Publish', exact: true }).isDisabled(), true);
    release(); await saved(page);
    assert.equal(await page.getByLabel('Form title', { exact: true }).inputValue(), 'Latest typing wins');
    assert.equal((await read()).draft.title, 'Latest typing wins');
    passed('Typing during a save is retained and saved next; publishing waits');

    // HTTP application-status fixture; no network outage or fake transport fault.
    await page.route(`**${path}`, route => route.fulfill({ status: 503, json: { error: 'Fixture save unavailable' } }), { times: 1 });
    await page.getByLabel('Form title', { exact: true }).fill('Retained after save error');
    await page.getByText('Save failed', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Form title', { exact: true }).inputValue(), 'Retained after save error');
    assert.equal(await page.getByRole('button', { name: 'Publish', exact: true }).isDisabled(), true);
    let leavePrompt = false;
    page.once('dialog', async dialog => { leavePrompt = true; await dialog.dismiss(); });
    await page.getByRole('link', { name: 'Responses', exact: true }).click();
    assert.equal(leavePrompt, true); assert.equal(new URL(page.url()).pathname, `/forms/${id}`);
    await page.getByRole('button', { name: 'Retry save', exact: true }).click();
    await saved(page); assert.equal((await read()).draft.title, 'Retained after save error');
    passed('Failed save stays visible, retains edits, warns before leaving and retries explicitly');

    const original = (await read()).draft.question.id;
    await page.getByRole('button', { name: 'Add block', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Add a block', exact: true });
    await picker.getByRole('button', { name: 'Email', exact: true }).click();
    await page.locator('.fold-question.is-selected').getByLabel('Question', { exact: true }).fill('Contact email');
    await page.getByRole('button', { name: 'Duplicate block 2', exact: true }).click();
    await saved(page);
    let form = await read();
    assert.equal(form.draft.blocks.length, 3); assert.equal(form.draft.blocks[0].id, original);
    const duplicate = form.draft.blocks[2]; assert.notEqual(duplicate.id, form.draft.blocks[1].id);
    assert.deepEqual({ ...duplicate, id: form.draft.blocks[1].id }, form.draft.blocks[1]);
    await page.getByRole('button', { name: 'Move block 3 up', exact: true }).click(); await saved(page);
    assert.equal((await read()).draft.blocks[1].id, duplicate.id);
    await page.getByRole('button', { name: 'Drag block 2 to reorder', exact: true }).dragTo(page.locator('.fold-question').first());
    await saved(page); assert.equal((await read()).draft.blocks[0].id, duplicate.id);
    passed('Picker, question duplication, keyboard-accessible move controls and real dragging preserve IDs');

    await page.getByRole('tab', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Confirmation message', { exact: true }).fill('Thanks for your fictional response!');
    await saved(page);
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const sharing = page.getByRole('dialog', { name: 'Share your form', exact: true }); await sharing.waitFor();
    assert.ok((await sharing.getByLabel('Public link', { exact: true }).inputValue()).endsWith(`/f/${id}`));
    await sharing.getByRole('button', { name: 'Close', exact: true }).click();
    const published = await json(await context.request.get(`/api/public/forms/${id}`));
    await page.getByLabel('Form title', { exact: true }).fill('Draft changes stay private'); await saved(page);
    assert.deepEqual(await json(await context.request.get(`/api/public/forms/${id}`)), published);
    await page.getByRole('button', { name: 'Republish', exact: true }).click();
    await sharing.waitFor(); assert.equal((await json(await context.request.get(`/api/public/forms/${id}`))).title, 'Draft changes stay private');
    await sharing.getByRole('button', { name: 'Close', exact: true }).click();
    passed('Publishing opens sharing; autosaved edits stay private until explicit republication');

    await page.getByRole('tab', { name: /^Questions/ }).click();
    for (const width of [1440, 900, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({ path: `${output}/editor-${width}.png`, fullPage: true, animations: 'disabled' });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      for (const name of ['Share', 'Republish', 'Save draft']) assert.ok(await page.getByRole('button', { name, exact: true }).isVisible());
      await page.getByRole('button', { name: 'Share', exact: true }).click();
      await sharing.waitFor(); await page.screenshot({ path: `${output}/share-${width}.png`, animations: 'disabled' });
      await sharing.getByRole('button', { name: 'Close', exact: true }).click();
    }
    passed('Desktop, tablet and mobile editor/share layouts have no horizontal overflow');
    assert.deepEqual(errors, []); await context.close();
    fs.writeFileSync(`${output}/report.json`, JSON.stringify({ status: 'passed', checks }, null, 2));
    console.log(`EDITOR_BROWSER_PASSED ${checks.length} checks; report=${output}/report.json`);
  } finally {
    await browser?.close(); const db = new Client({ connectionString: database }); await db.connect();
    try { await db.query('DELETE FROM "user" WHERE email=$1', [email]); } finally { await db.end(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
