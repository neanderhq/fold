const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const { Client } = require('pg');

const origin = process.env.BETTER_AUTH_URL;
const database = new URL(process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(database.hostname) && process.env.DATABASE_URL === process.env.NEANDER_TEMPLATE_TEST_DATABASE_URL, 'Fixture cleanup is local-only.');
const marker = randomUUID();
const owners = ['a', 'b'].map(label => ({ label, email: `builder-browser-${label}-${marker}@example.invalid`, password: `Browser-${marker}` }));
const output = path.resolve('.cache/browser-gate', `builder-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
const report = { marker, checks: [], timings: [], screenshots: [], errors: [], frameworkErrors: [], failedRequests: [], failures: [] };
const expectedNotFoundUrls = new Set();
let browser;
let activePage;
const passed = (name) => { report.checks.push(name); console.log(`PASS ${name}`); };
async function shot(page, name) {
  activePage = page;
  const filename = path.join(output, `${name}.png`);
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  await page.screenshot({ path: filename, fullPage: true });
  const png = fs.readFileSync(filename);
  assert.equal(png.readUInt32BE(16), page.viewportSize().width);
  const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(size.scroll <= size.width, `${name}: overflow ${JSON.stringify(size)}`);
  report.screenshots.push({ filename, viewport: page.viewportSize(), width: png.readUInt32BE(16), height: png.readUInt32BE(20) });
  passed(`${name}: correct screenshot width, no horizontal overflow`);
}
async function api(page, pathname, method = 'GET', body) {
  activePage = page;
  return page.evaluate(async ({ pathname, method, body }) => {
    const response = await fetch(pathname, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  }, { pathname, method, body });
}
async function authenticate(page, owner, signup) {
  activePage = page;
  await page.goto(origin);
  await page.getByRole('heading', { name: 'Log in to Fold' }).waitFor();
  if (signup) {
    await page.getByRole('button', { name: 'New to Fold? Create an account.', exact: true }).click();
    await page.getByLabel('Your name', { exact: true }).fill(`Synthetic owner ${owner.label}`);
  }
  await page.getByLabel('Email', { exact: true }).fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill(owner.password);
  const start = performance.now();
  await page.getByRole('button', { name: signup ? 'Create your workspace' : 'Log in', exact: true }).click();
  await page.getByRole('heading', { name: 'My forms', exact: true }).waitFor();
  report.timings.push({ operation: signup ? 'signup' : 'login', owner: owner.label, ms: Math.round(performance.now() - start) });
  passed(`${owner.label}: ${signup ? 'signup' : 'login'}`);
}
async function create(page, title) {
  activePage = page;
  const start = performance.now();
  await page.getByRole('button', { name: 'New form', exact: true }).click();
  await page.getByRole('button', { name: /^Blank form/ }).click();
  await page.getByLabel('Form title', { exact: true }).waitFor();
  report.timings.push({ operation: 'New form', ms: Math.round(performance.now() - start) });
  const id = new URL(page.url()).pathname.split('/')[2];
  await page.getByLabel('Form title', { exact: true }).fill(title);
  await page.locator('#question').fill('Your name');
  return id;
}
async function choose(page, label, option) {
  if (typeof page.goto === 'function') activePage = page;
  if (label.startsWith('Type of block ')) {
    const settings = page.locator('.fold-question').nth(Number(label.split(' ').at(-1)) - 1).locator('details');
    if (await settings.getAttribute('open') === null) await settings.locator('summary').click();
  }
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
async function builderView(page, view) {
  activePage = page;
  if (await page.getByRole('group', { name: 'Builder view', exact: true }).isVisible()) {
    await page.getByRole('button', { name: view, exact: true }).click();
  }
}
async function save(page) {
  activePage = page;
  await page.getByRole('status', { name: 'Draft save status', exact: true }).getByText('All changes saved', { exact: true }).waitFor();
}
async function publish(page) {
  activePage = page;
  await save(page);
  await page.getByRole('button', { name: /^(Publish|Republish)$/ }).click();
  await page.getByText('Published. Your link is ready to share.', { exact: true }).waitFor();
}
async function answerFields(page, schema, prefix = '') {
  const blocks = schema.blocks || [schema.question];
  for (const block of blocks) {
    const selector = `[id="${prefix}${block.id}"]`;
    if (block.type === 'short_text') await page.locator(selector).fill('=Synthetic, "customer"');
    if (block.type === 'long_text') await page.locator(selector).fill('Fictional detailed feedback\nSecond line.');
    if (block.type === 'email') await page.locator(selector).fill('fictional@example.invalid');
    if (block.type === 'number') await page.locator(selector).fill('2.5');
    if (block.type === 'date') await page.locator(selector).fill('2026-11-12');
    if (block.type === 'single_choice' || block.type === 'rating') await page.locator(`[id="${prefix}${block.id}-0"]`).click();
    if (block.type === 'multi_choice') { await page.locator(`[id="${prefix}${block.id}-0"]`).click(); await page.locator(`[id="${prefix}${block.id}-1"]`).click(); }
    if (block.type === 'dropdown') await choose(page, block.label, block.options[0]);
    if (block.type === 'consent') await page.locator(selector).click();
  }
}
(async () => {
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
    for (const size of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
      const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1, extraHTTPHeaders: { 'x-forwarded-for': `2001:db8:${randomUUID().slice(0,4)}::1` } })));
      for (const context of contexts) await context.route('https://fold-assets.example.invalid/logo.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" rx="5" fill="#182225"/><text x="12" y="26" font-size="18" fill="white">Synthetic</text></svg>' }));
      const pages = await Promise.all(contexts.map(context => context.newPage()));
      for (const page of pages) {
        page.setDefaultTimeout(15000);
        page.on('pageerror', error => {
          const record = { url: page.url(), message: error.message, stack: error.stack };
          if (expectedNotFoundUrls.has(page.url()) && error.message.includes("cannot have a negative time stamp") && error.stack?.includes('flushComponentPerformance')) report.frameworkErrors.push(record);
          else report.errors.push(record);
        });
        page.on('requestfailed', request => { if (request.failure()?.errorText !== 'net::ERR_ABORTED') report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }); });
      }
      const [owner, other, anonymous] = pages;
      const previewPosts = [];
      owner.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/api/public/forms/')) previewPosts.push(request.url()); });
      await authenticate(owner, owners[0], size.name === 'desktop');
      await authenticate(other, owners[1], size.name === 'desktop');
      const formId = await create(owner, `Synthetic all-fields ${size.name}`);
      const initialDraft = (await api(owner, `/api/forms/${formId}`)).data.draft;
      const originalQuestionId = (initialDraft.blocks || [initialDraft.question])[0].id;
      await choose(owner, 'Type of block 1', 'Long text');
      await choose(owner, 'Type of block 1', 'Short text');
      await owner.getByRole('switch', { name: 'Required question', exact: true }).click();
      assert.equal(await owner.getByRole('switch').getAttribute('aria-checked'), 'false');
      await owner.getByRole('switch', { name: 'Required question', exact: true }).click();
      await owner.getByLabel('Form title', { exact: true }).focus();
      await owner.keyboard.press('Tab');
      assert.equal(await owner.evaluate(() => document.activeElement.id), 'form-description');
      passed(`${size.name}: field type editing, required toggle, keyboard focus`);
      const secondId = await create(other, `Synthetic second owner ${size.name}`);
      await save(other); await publish(other);
      const secondForm = (await api(other, `/api/forms/${secondId}`)).data;
      activePage = anonymous;
      await anonymous.goto(`${origin}/f/${secondId}`);
      await anonymous.getByRole('button', { name: 'Submit', exact: true }).waitFor();
      await answerFields(anonymous, secondForm.draft);
      await anonymous.getByRole('button', { name: 'Submit', exact: true }).click();
      await anonymous.getByRole('heading', { name: 'Thank you!', exact: true }).waitFor();
      activePage = other;
      await other.goto(`${origin}/forms/${secondId}/responses`);
      await other.getByText('1 response', { exact: true }).waitFor();
      await other.getByRole('button').filter({ hasText: '=Synthetic' }).click();
      await other.getByRole('heading', { name: 'Your name', exact: true }).waitFor();
      passed(`${size.name}: second owner's one-question form collects and displays its own anonymous response`);
      const secondQuestionId = (secondForm.draft.blocks || [secondForm.draft.question])[0].id;
      for (let index = 0; index < 20; index++) assert.equal((await api(anonymous, `/api/public/forms/${secondId}`, 'POST', { answers: { [secondQuestionId]: `Synthetic pagination ${index}` } })).status, 201);
      activePage = other;
      await other.reload();
      await other.getByText('21 responses', { exact: true }).waitFor();
      await other.getByRole('button', { name: 'Next', exact: true }).click();
      await other.getByText('Page 2', { exact: true }).waitFor();
      await other.getByRole('button').filter({ hasText: '=Synthetic' }).click();
      await other.getByRole('heading', { name: 'Your name', exact: true }).waitFor();
      await other.getByRole('button', { name: 'Previous', exact: true }).click();
      await other.getByText('Page 1', { exact: true }).waitFor();
      passed(`${size.name}: actual Next/Previous pagination across 21 persisted responses`);
      activePage = owner;
      const types = ['Long text', 'Email', 'Number', 'Date', 'Single choice', 'Multiple choice', 'Dropdown', 'Rating', 'Consent', 'Heading', 'Description'];
      for (const type of types) {
        await owner.getByRole('button', { name: 'Add block', exact: true }).click();
        await owner.getByRole('dialog', { name: 'Add a block', exact: true }).getByRole('button', { name: type, exact: true }).click();
        const card = owner.locator('.fold-question.is-selected');
        await card.getByLabel(type === 'Heading' || type === 'Description' ? 'Content' : 'Question', { exact: true }).fill(`${type} question`);
        if (['Single choice', 'Multiple choice', 'Dropdown'].includes(type)) { await card.getByLabel('Option 1', { exact: true }).fill(`${type} first`); await card.getByLabel('Option 2', { exact: true }).fill(`${type} second`); }
      }
      await owner.getByLabel('Form description', { exact: true }).fill('Synthetic customer feedback. No real customer data.');
      await owner.getByRole('tab', { name: 'Settings', exact: true }).click();
      await owner.getByLabel('Confirmation message', { exact: true }).fill('Thanks, synthetic customer!');
      await owner.getByLabel('Logo URL (HTTPS)', { exact: true }).fill('https://fold-assets.example.invalid/logo.svg');
      await save(owner);
      await owner.getByRole('tab', { name: /^Questions/ }).click();
      let form = (await api(owner, `/api/forms/${formId}`)).data;
      assert.equal(form.draft.blocks.length, 12);
      assert.equal(form.draft.blocks[0].id, originalQuestionId);
      passed(`${size.name}: all 12 types added and saved through UI`);
      await shot(owner, `${size.name}-editor`);
      await owner.goto(`${origin}/forms/${formId}/responses`);
      await owner.getByRole('heading', { name: 'No responses yet', exact: true }).waitFor();
      assert.equal(await owner.getByRole('button', { name: 'Clear filters', exact: true }).count(), 0);
      passed(`${size.name}: genuinely never-submitted form shows No responses yet`);
      await shot(owner, `${size.name}-never-submitted`);
      await owner.goto(`${origin}/forms/${formId}`);
      await owner.getByLabel('Form title', { exact: true }).waitFor();
      await owner.locator('.fold-question-row').nth(5).click();
      const choiceCard = owner.locator('.fold-question-settings');
      await choiceCard.getByLabel('Option 1', { exact: true }).fill('Only option');
      await choiceCard.getByLabel('Option 2', { exact: true }).fill('');
      await builderView(owner, 'Preview');
      await owner.getByRole('button', { name: 'Desktop', exact: true }).click();
      await owner.getByRole('region', { name: 'Draft preview', exact: true }).getByText('Option is required (maximum 200 characters).', { exact: true }).waitFor();
      await builderView(owner, 'Edit');
      await owner.getByRole('button', { name: 'Save draft', exact: true }).click();
      await owner.getByText('Option is required (maximum 200 characters).', { exact: true }).first().waitFor();
      owner.once('dialog', dialog => dialog.accept());
      await owner.reload(); await owner.getByLabel('Form title', { exact: true }).waitFor();
      passed(`${size.name}: invalid choice draft shows preview/save validation without rendering crash`);
      for (const mode of ['Desktop', 'Mobile']) {
        activePage = owner;
        await owner.getByLabel('Form title', { exact: true }).fill(`Draft preview ${size.name} ${mode}`);
        await builderView(owner, 'Preview');
        await owner.getByRole('button', { name: mode, exact: true }).click();
        const previewRegion = owner.getByRole('region', { name: 'Draft preview', exact: true });
        await previewRegion.getByRole('heading', { name: `Draft preview ${size.name} ${mode}`, exact: true }).waitFor();
        for (const device of ['Desktop', 'Mobile']) assert.equal(await previewRegion.getByRole('button', { name: device, exact: true }).isVisible(), true);
        await answerFields(owner, form.draft, 'preview-');
        for (const name of ['Save draft', 'Publish', 'Desktop', 'Mobile']) {
          const bounds = await owner.getByRole('button', { name, exact: true }).boundingBox();
          assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= size.width && bounds.y + bounds.height <= size.height, `${size.name}: ${name} remains in the scrolled viewport`);
        }
        await builderView(owner, 'Edit');
        assert.equal(await owner.getByLabel('Form title', { exact: true }).inputValue(), `Draft preview ${size.name} ${mode}`);
        await save(owner);
        assert.equal((await api(owner, `/api/public/forms/${formId}`)).status, 404, 'Autosaving preview edits must not publish a form');
        await builderView(owner, 'Preview');
        assert.equal(await owner.locator(`[id="preview-${originalQuestionId}"]`).inputValue(), '=Synthetic, "customer"');
        await owner.getByRole('button', { name: 'Test submission', exact: true }).click();
        await previewRegion.getByRole('status').getByText('Preview only — no response was stored.', { exact: true }).waitFor();
        await previewRegion.getByRole('status').getByText('Thanks, synthetic customer!', { exact: true }).waitFor();
        assert.deepEqual(previewPosts, []);
        assert.equal((await api(owner, `/api/forms/${formId}/responses?page=1`)).data.total, 0);
        assert.deepEqual((await api(owner, `/api/forms/${formId}`)).data.draft, { ...form.draft, title: `Draft preview ${size.name} ${mode}` });
        passed(`${size.name}: ${mode} autosaved preview preserves draft/answers, validates with zero public POSTs and unchanged response count`);
        await shot(owner, `${size.name}-preview-${mode.toLowerCase()}`);
        await builderView(owner, 'Edit');
        await owner.getByLabel('Form title', { exact: true }).fill(form.draft.title);
        await save(owner);
        await owner.reload(); await owner.getByLabel('Form title', { exact: true }).waitFor();
      }
      await publish(owner);
      assert.ok((await owner.getByLabel('Iframe embed', { exact: true }).inputValue()).includes(`/f/${formId}`));
      passed(`${size.name}: published link and embed code`);
      activePage = anonymous;
      await anonymous.goto(`${origin}/f/${formId}`);
      await anonymous.getByRole('button', { name: 'Submit', exact: true }).waitFor();
      await anonymous.getByRole('img', { name: 'Form logo', exact: true }).waitFor();
      await anonymous.getByRole('button', { name: 'Submit', exact: true }).click();
      assert.equal(await anonymous.locator(`[id="${originalQuestionId}"]`).evaluate(element => element.validity.valueMissing), true);
      await answerFields(anonymous, form.draft);
      await shot(anonymous, `${size.name}-public-filled`);
      await anonymous.getByRole('button', { name: 'Submit', exact: true }).click();
      await anonymous.getByText('Thanks, synthetic customer!', { exact: true }).waitFor();
      passed(`${size.name}: anonymous submission for every field, customized confirmation`);
      await shot(anonymous, `${size.name}-public-confirmation`);
      activePage = owner;
      await owner.goto(`${origin}/forms/${formId}/responses`);
      await owner.getByText('1 response', { exact: true }).waitFor();
      await owner.getByRole('button').filter({ hasText: '=Synthetic' }).click();
      await owner.getByRole('heading', { name: 'Your name', exact: true }).waitFor();
      await shot(owner, `${size.name}-response-detail`);
      const original = (await api(owner, `/api/forms/${formId}/responses?page=1`)).data.records[0];
      await owner.getByLabel('Search responses', { exact: true }).fill('Fictional detailed');
      await owner.getByRole('button', { name: 'Apply filters', exact: true }).click();
      await owner.getByText('1 response', { exact: true }).waitFor();
      await owner.getByLabel('From (UTC)', { exact: true }).fill('2099-01-01');
      await owner.getByRole('button', { name: 'Apply filters', exact: true }).click();
      await owner.getByRole('heading', { name: 'No matching responses', exact: true }).waitFor();
      await owner.getByRole('button', { name: 'Clear filters', exact: true }).waitFor();
      await shot(owner, `${size.name}-filtered-empty`);
      await owner.getByRole('button', { name: 'Clear filters', exact: true }).click();
      assert.equal(await owner.getByLabel('Search responses', { exact: true }).inputValue(), '');
      assert.equal(await owner.getByLabel('From (UTC)', { exact: true }).inputValue(), '');
      await owner.getByText('1 response', { exact: true }).waitFor();
      const downloadPromise = owner.waitForEvent('download');
      await owner.getByRole('button', { name: 'Export CSV', exact: true }).click();
      const download = await downloadPromise;
      const csvPath = path.join(output, `${size.name}-responses.csv`);
      await download.saveAs(csvPath);
      assert.ok(fs.readFileSync(csvPath, 'utf8').includes("'=Synthetic"));
      passed(`${size.name}: search, date filters and spreadsheet-safe CSV download`);
      for (const [page, foreignId] of [[owner, secondId], [other, formId]]) {
        activePage = page;
        assert.equal((await api(page, `/api/forms/${foreignId}`)).status, 404);
        assert.equal((await api(page, `/api/forms/${foreignId}/export`)).status, 404);
        expectedNotFoundUrls.add(`${origin}/forms/${foreignId}`);
        await page.goto(`${origin}/forms/${foreignId}`);
        await page.getByRole('heading', { name: '404', exact: true }).waitFor();
      }
      passed(`${size.name}: bidirectional owner page/API isolation`);
      activePage = owner;
      await owner.goto(`${origin}/forms/${formId}`); await owner.getByLabel('Form title', { exact: true }).waitFor();
      await owner.locator('#question').fill('Changed name label');
      await owner.getByRole('button', { name: 'Move block 1 down', exact: true }).click();
      await owner.getByRole('button', { name: 'Delete block 2', exact: true }).click();
      await save(owner);
      assert.equal((await api(anonymous, `/api/public/forms/${formId}`)).data.blocks[0].label, 'Your name');
      await publish(owner);
      assert.equal((await api(anonymous, `/api/public/forms/${formId}`)).data.blocks[0].type, 'long_text');
      assert.deepEqual((await api(owner, `/api/forms/${formId}/responses/${original.id}`)).data, original);
      passed(`${size.name}: reorder/delete/republish preserves original labels and answers`);
      await owner.goto(origin); await owner.getByRole('heading', { name: 'My forms', exact: true }).waitFor();
      let card = owner.locator('[data-slot="card"]').filter({ has: owner.getByRole('heading', { name: `Synthetic all-fields ${size.name}`, exact: true }) });
      await card.getByRole('link', { name: '1 response', exact: true }).waitFor();
      await card.getByRole('button', { name: 'Rename', exact: true }).click();
      await owner.getByLabel('Form name', { exact: true }).fill(`Renamed synthetic ${size.name}`);
      await owner.getByRole('button', { name: 'Save name', exact: true }).click();
      await owner.getByRole('heading', { name: `Renamed synthetic ${size.name}`, exact: true }).waitFor();
      card = owner.locator('[data-slot="card"]').filter({ has: owner.getByRole('heading', { name: `Renamed synthetic ${size.name}`, exact: true }) });
      await card.getByRole('button', { name: 'Duplicate', exact: true }).click();
      await owner.getByRole('heading', { name: `Renamed synthetic ${size.name} (copy)`, exact: true }).waitFor();
      const forms = (await api(owner, '/api/forms')).data;
      const copy = forms.find(item => item.draft.title === `Renamed synthetic ${size.name} (copy)`);
      assert.equal(copy.responseCount, 0); assert.equal(copy.isPublished, false);
      passed(`${size.name}: dashboard rename, duplicate and real response counts`);
      await shot(owner, `${size.name}-dashboard`);
      await card.getByRole('button', { name: 'Archive', exact: true }).click();
      await owner.getByRole('heading', { name: `Renamed synthetic ${size.name}`, exact: true }).waitFor({ state: 'hidden' });
      assert.equal((await api(anonymous, `/api/public/forms/${formId}`, 'POST', { answers: {} })).status, 404);
      activePage = owner;
      await owner.getByRole('button', { name: 'Archived forms', exact: true }).click();
      await owner.getByRole('heading', { name: `Renamed synthetic ${size.name}`, exact: true }).waitFor();
      await shot(owner, `${size.name}-archived`);
      await owner.getByRole('button', { name: 'Restore', exact: true }).click();
      await owner.getByRole('button', { name: 'Active forms', exact: true }).click();
      await owner.getByRole('heading', { name: `Renamed synthetic ${size.name}`, exact: true }).waitFor();
      assert.equal((await api(anonymous, `/api/public/forms/${formId}`)).status, 404);
      assert.deepEqual((await api(owner, `/api/forms/${formId}/responses/${original.id}`)).data, original);
      passed(`${size.name}: archive blocks direct submissions, restore keeps history and stays private`);
      await owner.goto(`${origin}/forms/${formId}`); await owner.getByLabel('Form title', { exact: true }).waitFor(); await publish(owner);
      const embed = await contexts[2].newPage();
      activePage = embed;
      await contexts[2].grantPermissions(['local-network-access'], { origin: 'http://127.0.0.1:3999' });
      await embed.route('http://127.0.0.1:3999/**', route => route.fulfill({ contentType: 'text/html', body: `<html><body style="margin:0"><iframe title="Embedded Fold" src="${origin}/f/${formId}" style="border:0;width:100%;height:900px"></iframe></body></html>` }));
      await embed.goto('http://127.0.0.1:3999/');
      await embed.frameLocator('iframe').getByRole('button', { name: 'Submit', exact: true }).waitFor();
      const latest = (await api(owner, `/api/forms/${formId}`)).data.draft;
      await answerFields(embed.frameLocator('iframe'), latest);
      await shot(embed, `${size.name}-iframe`);
      await embed.frameLocator('iframe').getByRole('button', { name: 'Submit', exact: true }).click();
      await embed.frameLocator('iframe').getByText('Thanks, synthetic customer!', { exact: true }).waitFor();
      assert.equal((await api(owner, `/api/forms/${formId}/responses?page=1`)).data.total, 2);
      await embed.close();
      activePage = owner;
      passed(`${size.name}: real cross-origin iframe renders and stores anonymous submission`);
      await owner.getByRole('button', { name: 'Unpublish form', exact: true }).click();
      await owner.getByText('Unpublished. New responses are now blocked.', { exact: true }).waitFor();
      assert.equal((await api(anonymous, `/api/public/forms/${formId}`, 'POST', { answers: {} })).status, 404);
      passed(`${size.name}: unpublish rejects direct anonymous submissions`);
      for (const page of [owner, other]) {
        activePage = page;
        await page.goto(origin);
        await page.getByRole('heading', { name: 'My forms', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Log out', exact: true }).click();
        await page.getByRole('heading', { name: 'Log in to Fold', exact: true }).waitFor();
      }
      for (const context of contexts) await context.close();
    }
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.failedRequests, []);
    report.status = report.frameworkErrors.length ? 'passed_with_caveats' : 'passed';
  } catch (error) {
    report.status = 'failed'; report.failures.push({ message: error.message, stack: error.stack, url: activePage?.url() });
    console.error(error.stack); if (activePage && !activePage.isClosed()) await shot(activePage, 'failure').catch(() => {});
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    try { const deleted = await db.query('DELETE FROM "user" WHERE email=ANY($1::text[]) RETURNING id', [owners.map(owner => owner.email)]); report.cleanup = { fixtureOwners: deleted.rowCount }; }
    finally { await db.end(); }
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`BUILDER_BROWSER_${report.status?.toUpperCase()} ${report.checks.length} checks; report=${path.join(output, 'report.json')}`);
  }
})();
