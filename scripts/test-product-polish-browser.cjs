// Exercise the real app, PostgreSQL aggregates and public forms with fictional data.
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
const marker = randomUUID(), email = `polish-${marker}@example.invalid`, otherEmail = `polish-other-${marker}@example.invalid`;
const output = `.cache/product-polish/${marker}`;
fs.mkdirSync(output, { recursive: true });
const checks = [], errors = [];
const passed = name => { checks.push(name); console.log(`PASS ${name}`); };
async function json(response, status = 200) { assert.equal(response.status(), status, await response.text()); return response.json(); }
async function saved(page) { await page.getByRole('status', { name: 'Draft save status', exact: true }).getByText('All changes saved', { exact: true }).waitFor(); }
async function capture(page, name) {
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: 'disabled' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: no horizontal overflow`);
}
let browser;
(async () => {
  try {
    browser = await chromium.launch();
    const owner = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { origin, 'x-forwarded-for': `2001:db8:${marker.slice(0, 4)}::1` } });
    const stranger = await browser.newContext({ baseURL: origin, extraHTTPHeaders: { origin, 'x-forwarded-for': `2001:db8:${marker.slice(0, 4)}::2` } });
    const anonymous = await browser.newContext({ baseURL: origin, viewport: { width: 375, height: 900 } });
    for (const [context, address] of [[owner, email], [stranger, otherEmail]]) await json(await context.request.post('/api/auth/sign-up/email', { data: { name: 'Fictional reviewer', email: address, password: `Polish!${marker}` } }));
    const page = await owner.newPage(), publicPage = await anonymous.newPage();
    for (const tab of [page, publicPage]) { tab.setDefaultTimeout(15000); tab.on('pageerror', error => errors.push(error.message)); }
    const starters = [];
    for (const title of ['Customer feedback', 'Workshop registration', 'Project enquiry']) {
      await page.goto('/'); await page.getByRole('button', { name: 'New form', exact: true }).click();
      await capture(page, `starter-picker-${starters.length}`);
      await page.getByRole('dialog', { name: 'Start your next form', exact: true }).getByRole('button', { name: new RegExp(`^${title}`) }).click();
      await page.getByLabel('Form title', { exact: true }).waitFor();
      const id = new URL(page.url()).pathname.split('/')[2], form = await json(await owner.request.get(`/api/forms/${id}`));
      assert.equal(form.draft.title, title); assert.equal(form.isPublished, false); assert.equal(form.published, null);
      assert.equal((await json(await owner.request.get(`/api/forms/${id}/responses?page=1`))).total, 0);
      assert.equal((await anonymous.request.get(`/api/public/forms/${id}`)).status(), 404);
      starters.push(form);
    }
    assert.equal(new Set(starters.flatMap(form => form.draft.blocks.map(block => block.id))).size, 11);
    assert.equal((await owner.request.post('/api/forms', { data: { starter: 'missing' } })).status(), 400);
    assert.equal((await owner.request.post('/api/forms', { data: { starter: 'feedback', ownerId: 'someone-else' } })).status(), 400);
    passed('All three starters create private, empty drafts with unique question IDs; invalid selections are rejected');

    const id = starters[0].id, path = `/api/forms/${id}`, publicPath = `/api/public/forms/${id}`;
    await page.goto(`/forms/${id}`); await page.getByLabel('Form title', { exact: true }).waitFor();
    await page.locator('.fold-question').first().getByLabel('Question', { exact: true }).fill('Your name');
    for (const index of [2, 3]) {
      await page.getByRole('button', { name: `Settings for block ${index + 1}`, exact: true }).click();
      await page.locator('.fold-question.is-selected').getByRole('switch', { name: 'Required question', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Settings for block 3', exact: true }).click();
    const choices = page.locator('.fold-question.is-selected');
    await choices.getByLabel('Option 1', { exact: true }).fill('Clarity');
    await choices.getByLabel('Option 2', { exact: true }).fill('Speed');
    await choices.getByLabel('Option 3', { exact: true }).fill('Support');
    await choices.getByRole('button', { name: 'Add option', exact: true }).click();
    await choices.getByLabel('Option 4', { exact: true }).fill('Flexibility');
    await choices.getByRole('button', { name: 'Remove option 4', exact: true }).click();
    await page.getByRole('button', { name: 'Add block', exact: true }).click();
    await page.getByRole('dialog', { name: 'Add a block', exact: true }).getByRole('button', { name: 'Email', exact: true }).click();
    await page.locator('.fold-question.is-selected').getByLabel('Question', { exact: true }).fill('Email address');
    await saved(page); await page.reload(); await page.getByRole('tab', { name: 'Questions 5', exact: true }).waitFor();
    let form = await json(await owner.request.get(path));
    assert.deepEqual(form.draft.blocks.slice(0, 4).map(block => block.id), starters[0].draft.blocks.map(block => block.id));
    assert.deepEqual(form.draft.blocks[2].options, ['Clarity', 'Speed', 'Support']);
    await capture(page, 'inline-editor');
    passed('Direct question labels, individual choices and add/remove choices autosave and retain their IDs');

    await page.getByRole('tab', { name: 'Settings', exact: true }).click();
    for (const [preset, name] of [['paper', 'Paper'], ['classic', 'Classic'], ['meadow', 'Meadow']]) {
      const previous = form.published?.appearance;
      await page.getByRole('button', { name, exact: true }).click(); await saved(page);
      form = await json(await owner.request.get(path)); assert.equal(form.draft.appearance, preset);
      if (previous) assert.equal((await json(await anonymous.request.get(publicPath))).appearance, previous);
      else assert.equal((await anonymous.request.get(publicPath)).status(), 404);
      await capture(page, `appearance-${preset}`);
      await page.getByRole('button', { name: /^(Publish|Republish)$/ }).click();
      await page.getByRole('dialog', { name: 'Share your form', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      form = await json(await owner.request.get(path));
      assert.equal((await json(await anonymous.request.get(publicPath))).appearance, preset);
      await publicPage.goto(`/f/${id}`); await publicPage.getByRole('button', { name: 'Submit', exact: true }).waitFor();
      assert.equal(await publicPage.locator('.fold-public').getAttribute('data-form-appearance'), preset);
      await capture(publicPage, `public-${preset}-mobile`);
    }
    passed('All three appearances preview, persist and reach the public form only after explicit publication');

    const [nameBlock, rating, multi, detail, emailBlock] = form.published.blocks;
    await publicPage.getByRole('button', { name: 'Submit', exact: true }).click();
    await publicPage.getByRole('alert').getByText('5 questions need your attention.', { exact: true }).waitFor();
    assert.equal(await publicPage.locator('.fold-field-error').count(), 5);
    assert.equal(await publicPage.locator(`[id="${nameBlock.id}"]`).evaluate(element => element === document.activeElement), true);
    for (const block of form.published.blocks) {
      assert.ok(await publicPage.locator(`[data-field-id="${block.id}"] [aria-invalid="true"]`).count());
      assert.ok(await publicPage.locator(`[id="${block.id}-error"]`).isVisible());
    }
    await capture(publicPage, 'inline-validation-mobile');
    await publicPage.getByLabel('Your name', { exact: false }).fill('Alex Morgan');
    await publicPage.getByRole('radio', { name: '1', exact: true }).focus();
    assert.equal(await publicPage.getByRole('radio', { checked: true }).count(), 0, 'Focusing an unanswered rating must not invent an answer');
    for (let step = 0; step < 3; step++) {
      await publicPage.getByRole('radio', { name: String(step + 1), exact: true }).press('ArrowRight');
      await publicPage.getByRole('radio', { name: String(step + 2), exact: true, checked: true }).waitFor();
      assert.equal(await publicPage.getByRole('radio', { name: String(step + 2), exact: true }).evaluate(element => element === document.activeElement), true);
    }
    assert.equal(await publicPage.getByRole('radio', { name: '4', exact: true }).getAttribute('aria-checked'), 'true');
    for (const [from, key, to] of [['4', 'Home', '1'], ['1', 'End', '5'], ['5', 'ArrowDown', '1'], ['1', 'ArrowUp', '5'], ['5', 'ArrowLeft', '4']]) {
      await publicPage.getByRole('radio', { name: from, exact: true }).press(key);
      await publicPage.getByRole('radio', { name: to, exact: true, checked: true }).waitFor();
    }
    await publicPage.locator(`[id="${multi.id}-0"]`).check(); await publicPage.locator(`[id="${multi.id}-2"]`).check();
    await publicPage.getByLabel(detail.label, { exact: false }).fill('The questions were easy to answer.');
    await publicPage.getByLabel('Email address', { exact: false }).fill('alex@');
    await publicPage.getByRole('button', { name: 'Submit', exact: true }).click();
    await publicPage.getByRole('alert').getByText('1 question needs your attention.', { exact: true }).waitFor();
    assert.equal(await publicPage.locator('.fold-field-error').count(), 1);
    assert.equal((await json(await owner.request.get(`${path}/responses?page=1`))).total, 0);
    await publicPage.getByLabel('Email address', { exact: false }).fill('alex@example.invalid');
    await publicPage.getByRole('button', { name: 'Submit', exact: true }).click();
    await publicPage.getByRole('heading', { name: 'Thank you!', exact: true }).waitFor();
    await capture(publicPage, 'confirmation-mobile');
    passed('Mobile forms report every error, focus the first answer, support keyboard stars and store only valid submissions');

    for (let index = 0; index < 24; index++) await json(await anonymous.request.post(publicPath, { data: { answers: { [nameBlock.id]: `Fictional sample ${index}`, [rating.id]: index % 5 + 1, [multi.id]: [index % 2 ? 'Support' : 'Clarity'], [detail.id]: 'Fictional feedback', [emailBlock.id]: `sample${index}@example.invalid` } } }), 201);
    const firstPage = await json(await owner.request.get(`${path}/responses?page=1`));
    assert.equal(firstPage.records.length, 20); assert.equal(firstPage.total, 25);
    let summary = await json(await owner.request.get(`${path}/summary`));
    const ratingSummary = summary.find(item => item.type === 'rating'), choiceSummary = summary.find(item => item.type === 'multi_choice');
    assert.equal(ratingSummary.responses, 25); assert.equal(ratingSummary.answered, 25); assert.ok(Math.abs(ratingSummary.average - 74 / 25) < 1e-10);
    assert.deepEqual(choiceSummary.options.map(option => option.count), [13, 0, 13]);
    assert.equal((await stranger.request.get(`${path}/summary`)).status(), 404);
    assert.equal((await anonymous.request.get(`${path}/summary`)).status(), 401);
    assert.equal((await owner.request.get(`${path}/summary?q=${'x'.repeat(201)}`)).status(), 400);
    assert.equal((await owner.request.get(`${path}/summary?from=2026-02-30`)).status(), 400);
    assert.deepEqual(await json(await owner.request.get(`${path}/summary?from=2099-01-01`)), []);
    const selectedSummary = await json(await owner.request.get(`${path}/summary?q=Alex%20Morgan`));
    assert.equal(selectedSummary.find(item => item.type === 'rating').average, 4);
    assert.equal(selectedSummary.find(item => item.type === 'rating').answered, 1);
    passed('PostgreSQL summaries cover all 25 responses, correct multi-choice denominators and shared search/date/ownership rules');

    await page.goto(`/forms/${id}/responses`); await page.getByText('25 responses', { exact: true }).waitFor();
    await page.getByLabel('Search responses', { exact: true }).fill('Alex Morgan'); await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
    await page.getByText('1 response of 25 total', { exact: true }).waitFor();
    await page.getByRole('button').filter({ hasText: 'Alex Morgan' }).click();
    await page.getByRole('heading', { name: 'Your name', exact: true }).waitFor(); await capture(page, 'response-review');
    await page.getByRole('tab', { name: 'Summary', exact: true }).click();
    await page.getByRole('region', { name: 'Answer summaries', exact: true }).getByText('4.0', { exact: true }).waitFor();
    await capture(page, 'filtered-summary');
    await page.getByLabel('Search responses', { exact: true }).fill(''); await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
    await page.getByRole('region', { name: 'Answer summaries', exact: true }).getByText('3.0', { exact: true }).waitFor();
    await capture(page, 'all-response-summary');
    passed('Scannable response rows and summary tab follow the applied filters');

    const original = firstPage.records[0];
    const renamed = { ...form.draft, blocks: form.draft.blocks.map(block => block.id === rating.id ? { ...block, label: 'Updated experience', max: 10 } : block) };
    await json(await owner.request.patch(path, { data: renamed })); await json(await owner.request.post(`${path}/publish`, { data: {} }));
    await json(await anonymous.request.post(publicPath, { data: { answers: { [nameBlock.id]: 'New version', [rating.id]: 10, [multi.id]: ['Speed'], [detail.id]: 'Fictional versioned feedback', [emailBlock.id]: 'new-version@example.invalid' } } }), 201);
    summary = await json(await owner.request.get(`${path}/summary`));
    const ratingVersions = summary.filter(item => item.type === 'rating');
    assert.equal(ratingVersions.length, 2);
    assert.equal(ratingVersions.find(item => item.label === 'Updated experience').average, 10);
    assert.equal(ratingVersions.find(item => item.label === rating.label).answered, 25);
    assert.deepEqual(await json(await owner.request.get(`${path}/responses/${original.id}`)), original);
    passed('Renaming and changing a rating scale preserves old answer snapshots and separate summaries');

    await page.setViewportSize({ width: 375, height: 900 }); await page.goto('/'); await page.getByRole('button', { name: 'New form', exact: true }).click(); await capture(page, 'starter-picker-mobile');
    await page.getByRole('button', { name: 'Close', exact: true }).click(); await page.goto(`/forms/${id}`); await page.getByLabel('Form title', { exact: true }).waitFor(); await capture(page, 'editor-mobile');
    await page.getByRole('tab', { name: 'Settings', exact: true }).click(); await capture(page, 'settings-mobile');
    assert.deepEqual(errors, []);
    passed('Starter picker, editor, presets and public form fit a 375px phone without overflow');
    fs.writeFileSync(`${output}/report.json`, JSON.stringify({ status: 'passed', checks }, null, 2));
    console.log(`PRODUCT_POLISH_BROWSER_PASSED ${checks.length} checks; report=${output}/report.json`);
    await owner.close(); await stranger.close(); await anonymous.close();
  } finally {
    await browser?.close(); const db = new Client({ connectionString: database }); await db.connect();
    try { await db.query('DELETE FROM "user" WHERE email=ANY($1)', [[email, otherEmail]]); } finally { await db.end(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
