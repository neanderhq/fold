// Verify the real built image with disposable PostgreSQL and fictional accounts.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import pg from 'pg';

const exec = promisify(execFile);
const FORM = 'f01d0000-0000-4000-8000-000000000001';
async function main() {
  const image = process.env.NEANDER_TEMPLATE_IMAGE, databaseUrl = process.env.NEANDER_TEMPLATE_TEST_DATABASE_URL;
  const password = process.env.DEMO_PASSWORD;
  assert.ok(image && databaseUrl && password && process.env.BETTER_AUTH_SECRET, 'Use a built image, disposable database and test secrets');
  assert.equal(process.env.DATABASE_URL, databaseUrl);
  const origin = new URL(process.env.BETTER_AUTH_URL);
  assert.ok(origin.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(origin.hostname));
  const name = `fold-check-${randomUUID().slice(0, 12)}`, directory = await mkdtemp(join(tmpdir(), 'fold-check-'));
  const bundle = join(directory, 'neander_environment'), runtimeDatabase = new URL(databaseUrl);
  if (process.platform === 'darwin' && ['127.0.0.1', 'localhost'].includes(runtimeDatabase.hostname)) runtimeDatabase.hostname = 'host.docker.internal';
  const environment = { DATABASE_URL: runtimeDatabase.href, BETTER_AUTH_URL: origin.origin, BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET, PASSWORD_RESET_ENABLED: 'false' };
  await writeFile(bundle, Object.entries(environment).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o644 });
  const db = new pg.Client({ connectionString: databaseUrl });
  let browser, connected = false;
  async function ready() {
    for (let attempt = 0; attempt < 120; attempt++) {
      try { if ((await fetch(`${origin.origin}/api/health`)).ok) return; } catch {}
      await delay(500);
    }
    throw new Error('Fold production image did not become ready');
  }
  async function run(command, args, options = {}) {
    try { const result = await exec(command, args, { timeout: 240000, maxBuffer: 16 * 1024 * 1024, ...options }); process.stdout.write(result.stdout); process.stderr.write(result.stderr); }
    catch (error) { process.stdout.write(error.stdout || ''); process.stderr.write(error.stderr || ''); throw error; }
  }
  async function json(response, status = 200) { assert.equal(response.status(), status, await response.text()); return response.json(); }
  try {
    const networking = process.platform === 'linux' ? ['--network', 'host', '--env', `PORT=${origin.port || 80}`] : ['--publish', `127.0.0.1:${origin.port || 80}:8080`];
    await exec('docker', ['run', '--detach', '--name', name, '--mount', `type=bind,src=${bundle},dst=/run/secrets/neander_environment,readonly`, ...networking, image], { timeout: 60000 });
    await ready(); await db.connect(); connected = true;
    const before = (await db.query('SELECT id,draft,published FROM forms ORDER BY id')).rows;
    assert.equal(before.length, 3);
    const hash = (await db.query('SELECT password FROM account WHERE user_id=$1', ['fold-template-owner'])).rows[0].password;
    await run('pnpm', ['db:seed']);
    assert.deepEqual((await db.query('SELECT id,draft,published FROM forms ORDER BY id')).rows, before);
    assert.equal((await db.query('SELECT password FROM account WHERE user_id=$1', ['fold-template-owner'])).rows[0].password, hash);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM responses')).rows[0].n, 5);
    await run('pnpm', ['exec', 'playwright', 'install', ...(process.platform === 'linux' ? ['--with-deps'] : []), 'chromium']);
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } }), page = await context.newPage();
    page.setDefaultTimeout(20000);
    await page.goto(origin.origin); assert.match(await page.title(), /Fold/);
    await page.getByLabel('Email', { exact: true }).fill('owner@fold.test');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.getByRole('heading', { name: 'My forms', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Customer feedback', exact: true }).waitFor();
    const forms = await json(await context.request.get(`${origin.origin}/api/forms`));
    assert.equal(forms.length, 3); assert.equal(forms.find(f => f.id === FORM).responseCount, 3);
    const capture = process.env.FOLD_CAPTURE_DIRECTORY;
    if (capture) { await mkdir(join(capture, 'screenshots'), { recursive: true }); await page.screenshot({ path: join(capture, 'thumbnail.png') }); }
    await page.goto(`${origin.origin}/forms/${FORM}`);
    await page.getByLabel('Form title', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Form title', { exact: true }).inputValue(), 'Customer feedback');
    if (capture) {
      await page.screenshot({ path: join(capture, 'screenshots/editor.png'), animations: 'disabled' });
      await page.getByRole('button', { name: 'Add block', exact: true }).click();
      await page.getByRole('dialog', { name: 'Add a block', exact: true }).waitFor();
      await page.screenshot({ path: join(capture, 'screenshots/add-block.png'), animations: 'disabled' });
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await page.getByRole('button', { name: 'Share', exact: true }).click();
      await page.getByRole('dialog', { name: 'Share your form', exact: true }).waitFor();
      await page.screenshot({ path: join(capture, 'screenshots/share.png'), animations: 'disabled' });
      await page.getByRole('button', { name: 'Close', exact: true }).click();
    }
    await page.goto(`${origin.origin}/forms/${FORM}/responses`);
    await page.getByRole('heading', { name: 'Responses', exact: true }).waitFor();
    await page.getByRole('region', { name: 'Response list', exact: true }).getByRole('button').first().waitFor();
    if (capture) await page.screenshot({ path: join(capture, 'screenshots/responses.png') });
    const anonymous = await browser.newContext(), publicPage = await anonymous.newPage();
    await publicPage.goto(`${origin.origin}/f/${FORM}`);
    await publicPage.getByRole('heading', { name: 'Customer feedback', exact: true }).waitFor();
    assert.equal((await anonymous.request.get(`${origin.origin}/api/forms`)).status(), 401);
    if (capture) await publicPage.screenshot({ path: join(capture, 'screenshots/public-form.png') });
    const draft = forms.find(f => f.id === FORM).draft;
    const edited = { ...draft, title: `Template edit ${randomUUID().slice(0, 8)}` };
    await json(await context.request.patch(`${origin.origin}/api/forms/${FORM}`, { headers: { origin: origin.origin }, data: edited }));
    await run('pnpm', ['db:seed']); await exec('docker', ['restart', name], { timeout: 60000 }); await ready();
    assert.equal((await json(await context.request.get(`${origin.origin}/api/forms/${FORM}`))).draft.title, edited.title);
    assert.equal((await json(await anonymous.request.get(`${origin.origin}/api/public/forms/${FORM}`))).title, draft.title);
    await context.close(); await anonymous.close(); await browser.close(); browser = undefined;
    // Existing delivery tests now run against the isolated production image.
    await run(process.execPath, ['scripts/test-foundation.mjs', '--in-process']);
    await run(process.execPath, ['scripts/test-foundation.mjs', `--origin=${origin.origin}`]);
    await run(process.execPath, ['scripts/test-builder.mjs', `--origin=${origin.origin}`]);
    await run(process.execPath, ['scripts/test-password-recovery.mjs']);
    const browserEnvironment = { ...process.env, PLAYWRIGHT_MODULE: 'playwright' };
    await run(process.execPath, ['scripts/test-builder-browser.cjs'], { env: browserEnvironment });
    await run(process.execPath, ['scripts/test-response-navigation-browser.cjs'], { env: browserEnvironment });
    await run(process.execPath, ['scripts/test-editor-browser.cjs'], { env: browserEnvironment });
    console.log('PASS: built Fold image, fictional seeded owner/forms/responses, repeat seed preservation, persistent edit after restart, live API and desktop/mobile browser suites');
  } finally {
    await browser?.close(); if (connected) await db.end();
    try { await exec('docker', ['rm', '--force', name], { timeout: 30000 }); } finally { await rm(directory, { recursive: true, force: true }); }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
