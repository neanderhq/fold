const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { Client } = require('pg');
const { chromium } = require('playwright');

const origin = process.env.BETTER_AUTH_URL;
const database = process.env.NEANDER_TEMPLATE_TEST_DATABASE_URL;
assert.equal(process.env.DATABASE_URL, database);
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(database).hostname));
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
const run = randomUUID();
const email = `workshop-${run}@example.invalid`;
const password = `Workshop!${run}`;

async function json(response, status = 200) {
  assert.equal(response.status(), status, await response.text());
  return response.json();
}

async function publish(page, label) {
  await page.getByRole('button', { name: label, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Share your form', exact: true });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
}

async function capture(page, name) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const directory = process.env.FOLD_CAPTURE_DIRECTORY;
  if (!directory) return;
  const path = join(directory, 'screenshots');
  mkdirSync(path, { recursive: true });
  await page.screenshot({ path: join(path, `workshop-${name}.png`), animations: 'disabled', fullPage: true });
}

async function main() {
  const browser = await chromium.launch();
  try {
    const owner = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 1000 },
      extraHTTPHeaders: { origin, 'x-forwarded-for': `2001:db8:${run.slice(0, 4)}::1` } });
    const visitor = await browser.newContext({ baseURL: origin, viewport: { width: 375, height: 900 } });
    await json(await owner.request.post('/api/auth/sign-up/email', { data: { name: 'Workshop reviewer', email, password } }));
    const editor = await owner.newPage();
    editor.setDefaultTimeout(12000);
    await editor.goto('/');
    await editor.getByRole('button', { name: 'New form', exact: true }).click();
    await editor.getByRole('button', { name: /^Workshop registration/ }).click();
    await editor.getByLabel('Form title', { exact: true }).waitFor();
    const id = new URL(editor.url()).pathname.split('/')[2];
    const formPath = `/api/forms/${id}`;
    const publicPath = `/api/public/forms/${id}`;
    const [nameBlock, emailBlock, workshopBlock, consentBlock] = (await json(await owner.request.get(formPath))).draft.blocks;

    await publish(editor, 'Publish');
    await editor.getByRole('button', { name: 'Settings for block 3', exact: true }).click();
    const boundary = editor.getByRole('switch', { name: 'Start a new page here', exact: true });
    await boundary.click();
    await editor.getByRole('status', { name: 'Draft save status', exact: true }).getByText('All changes saved', { exact: true }).waitFor();
    await editor.reload();
    await editor.getByRole('button', { name: 'Settings for block 3', exact: true }).click();
    assert.equal(await boundary.getAttribute('data-state'), 'checked');
    assert.equal((await json(await owner.request.get(formPath))).draft.blocks[2].startsPage, true);
    assert.equal((await json(await visitor.request.get(publicPath))).blocks[2].startsPage, undefined);

    const preview = editor.getByRole('region', { name: 'Draft preview', exact: true });
    await preview.getByLabel('Your name').fill('Jamie West');
    await preview.getByLabel('Email address').fill('jamie@example.invalid');
    await preview.getByRole('button', { name: 'Next', exact: true }).click();
    await preview.getByRole('heading', { name: 'Page 2 of 2', exact: true }).waitFor();
    await preview.getByRole('combobox', { name: 'Workshop', exact: true }).click();
    await editor.getByRole('option', { name: 'Design basics', exact: true }).click();
    await preview.getByRole('checkbox', { name: /I agree/ }).check();
    await preview.getByRole('button', { name: 'Test submission', exact: true }).click();
    await preview.getByText('Preview only — no response was stored.', { exact: true }).waitFor();
    assert.equal((await json(await owner.request.get(`${formPath}/responses?page=1`))).total, 0);
    await preview.getByRole('button', { name: 'Back to form', exact: true }).click();
    await capture(editor, 'editor');
    await publish(editor, 'Republish');

    const page = await visitor.newPage();
    page.setDefaultTimeout(12000);
    let writes = 0;
    page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === publicPath) writes++; });
    await page.goto(`/f/${id}`);
    const next = page.getByRole('button', { name: 'Next', exact: true });
    await next.press('Enter');
    assert.equal(await page.getByLabel('Your name').evaluate(element => element === document.activeElement), true);
    assert.equal(await page.locator('.fold-field-error').count(), 2);
    assert.equal(await page.getByRole('combobox', { name: 'Workshop', exact: true }).count(), 0);
    await capture(page, 'required-errors-phone');
    await page.getByLabel('Your name').fill('Jamie West');
    await page.getByLabel('Email address').fill('jamie@example.invalid');
    await page.getByLabel('Email address').press('Enter');
    const progress = page.getByRole('heading', { name: 'Page 2 of 2', exact: true });
    await progress.waitFor();
    assert.equal(await progress.evaluate(element => element === document.activeElement), true);
    await page.getByRole('combobox', { name: 'Workshop', exact: true }).click();
    await page.getByRole('option', { name: 'Design basics', exact: true }).click();
    await page.getByRole('checkbox', { name: /I agree/ }).check();
    await capture(page, 'last-page-phone');
    await page.getByRole('button', { name: 'Back', exact: true }).press('Enter');
    assert.equal(await page.getByLabel('Your name').inputValue(), 'Jamie West');
    assert.equal(await page.getByLabel('Email address').inputValue(), 'jamie@example.invalid');
    await next.press('Enter');
    assert.equal(await page.getByRole('checkbox', { name: /I agree/ }).isChecked(), true);
    assert.equal(await page.getByRole('combobox', { name: 'Workshop', exact: true }).textContent(), 'Design basics');
    assert.equal(writes, 0);
    assert.equal((await json(await owner.request.get(`${formPath}/responses?page=1`))).total, 0);

    await page.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    await page.getByRole('heading', { name: 'Thank you!', exact: true }).waitFor();
    assert.equal(writes, 1);
    await capture(page, 'confirmation-phone');
    const responses = await json(await owner.request.get(`${formPath}/responses?page=1`));
    assert.equal(responses.total, 1);
    assert.equal(responses.records[0].schemaSnapshot.blocks[2].startsPage, true);
    assert.deepEqual(responses.records[0].answers, {
      [nameBlock.id]: 'Jamie West', [emailBlock.id]: 'jamie@example.invalid',
      [workshopBlock.id]: 'Design basics', [consentBlock.id]: true,
    });
    assert.equal((await visitor.request.post(publicPath, { data: { answers: { [nameBlock.id]: 'Incomplete' } } })).status(), 400);
    assert.equal((await json(await owner.request.get(`${formPath}/responses?page=1`))).total, 1);
    assert.equal((await visitor.request.get(`${formPath}/responses?page=1`)).status(), 401);
    console.log('MULTI_PAGE_BROWSER_PASSED: private drafts, preview, phone and keyboard navigation, validation, one stored response and owner isolation');
  } finally {
    await browser.close();
    const db = new Client({ connectionString: database });
    await db.connect();
    try { await db.query('DELETE FROM "user" WHERE email=$1', [email]); }
    finally { await db.end(); }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
