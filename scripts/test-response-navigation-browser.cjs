const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const { build } = createRequire(require.resolve('drizzle-kit'))('esbuild');

const origin = process.env.BETTER_AUTH_URL;
const output = path.resolve('.cache/response-navigation');
const report = { status: 'running', checks: [], screenshots: [], errors: [], failures: [] };
const passed = (name) => { report.checks.push(name); console.log(`PASS ${name}`); };
const records = Array.from({ length: 20 }, (_, index) => ({
  id: `response-${index}`, formId: 'ui002', createdAt: '2026-11-19T00:00:00.000Z',
  schemaSnapshot: { title: `Synthetic response ${index}`, blocks: [{ id: 'answer', type: 'short_text', label: 'Your answer', required: true }] },
  answers: { answer: `Synthetic answer ${index}` },
}));

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const response = await fetch(origin);
  assert.ok(response.ok, 'The parent-owned preview must already be available.');
  const html = await response.text();
  const styles = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(([link]) => link).join('');
  assert.ok(styles, 'Use the running preview stylesheet, not a substitute layout.');
  const bundle = await build({
    stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import { Responses } from "./components/forms/responses"; createRoot(document.getElementById("root")).render(<Responses id="ui002" />);', resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env': '{}' },
  });
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  try {
    for (const scenario of [
      { name: 'phone', width: 390, height: 844, reducedMotion: 'no-preference' },
      { name: 'phone-reduced-motion', width: 390, height: 844, reducedMotion: 'reduce' },
      { name: 'desktop', width: 1440, height: 1000, reducedMotion: 'no-preference' },
    ]) {
      const mobile = scenario.width === 390;
      const context = await browser.newContext({ viewport: { width: scenario.width, height: scenario.height }, reducedMotion: scenario.reducedMotion, hasTouch: mobile });
      const page = await context.newPage();
      page.on('pageerror', (error) => report.errors.push(error.message));
      await page.addInitScript(() => {
        window.detailScrolls = [];
        const original = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function (options) {
          window.detailScrolls.push({ text: this.textContent, ...options });
          return original.call(this, options);
        };
      });
      await page.route('**/__ui002', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head>${styles}</head><body><div id="root"></div><script src="/__ui002.js"></script></body></html>` }));
      await page.route('**/__ui002.js', (route) => route.fulfill({ contentType: 'application/javascript', body: bundle.outputFiles[0].text }));
      let release;
      let requested;
      let fail = false;
      const pendingRequest = new Promise((resolve) => { requested = resolve; });
      const delayed = new Promise((resolve) => { release = resolve; });
      await page.route('**/api/forms/ui002/responses**', async (route) => {
        const url = new URL(route.request().url());
        const record = records.find((item) => url.pathname.endsWith(`/${item.id}`));
        if (record?.id === 'response-0') { requested(); await delayed; }
        await route.fulfill({ status: record && fail ? 500 : 200, json: record ? fail ? { error: 'Synthetic detail failure' } : record : { records, total: records.length, page: 1, pageSize: 20 } });
      });
      await page.goto(`${origin}/__ui002`);
      const list = page.getByRole('region', { name: 'Response list', exact: true });
      const buttons = list.getByRole('button').filter({ hasText: 'Synthetic answer' });
      await buttons.first().waitFor();
      assert.equal(await page.evaluate(() => scrollY), 0);
      assert.equal(await page.evaluate(() => window.detailScrolls.length), 0);
      assert.equal(await page.evaluate(() => document.activeElement === document.body), true);
      passed(`${scenario.name}: no initial scroll or focus transfer`);
      if (mobile) await buttons.first().tap(); else await buttons.first().click();
      await pendingRequest;
      assert.equal(await page.getByRole('region', { name: 'Response detail' }).getByRole('heading').count(), 0);
      assert.equal(await page.evaluate(() => window.detailScrolls.length), 0);
      const before = await page.evaluate(() => scrollY);
      passed(`${scenario.name}: waits for detail data before navigating`);
      release();
      const heading = page.getByRole('heading', { name: 'Synthetic response 0', exact: true });
      await heading.waitFor();
      if (mobile) {
        await page.waitForFunction(() => {
          const target = document.querySelector('[aria-label="Response detail"] h2');
          const rect = target?.getBoundingClientRect();
          const detail = document.querySelector('[aria-label="Response detail"]').getBoundingClientRect();
          return document.activeElement === target && rect.top >= document.querySelector('.fold-header').getBoundingClientRect().bottom && detail.bottom <= innerHeight;
        });
        const calls = await page.evaluate(() => window.detailScrolls);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].behavior, scenario.reducedMotion === 'reduce' ? 'instant' : 'smooth');
        assert.ok(await page.evaluate(() => scrollY) > before);
        passed(`${scenario.name}: loaded detail is focused and visible below sticky header, correct motion preference`);
      } else {
        assert.equal(await heading.evaluate((element) => element === document.activeElement), false);
        assert.equal(await page.evaluate(() => scrollY), before);
        assert.equal(await page.evaluate(() => window.detailScrolls.length), 0);
        passed('desktop: selection leaves scroll and focus unchanged');
      }
      const screenshot = path.join(output, `${scenario.name}.png`);
      await page.screenshot({ path: screenshot });
      report.screenshots.push(screenshot);
      const second = buttons.nth(1);
      await second.focus();
      await second.press('Enter');
      await page.getByRole('heading', { name: 'Synthetic response 1', exact: true }).waitFor();
      if (mobile) await page.waitForFunction(() => document.activeElement?.textContent === 'Synthetic response 1');
      else assert.equal(await second.evaluate((element) => element === document.activeElement), true);
      passed(`${scenario.name}: keyboard selection works`);
      let releaseOlder;
      let olderRequested;
      const olderPending = new Promise((resolve) => { olderRequested = resolve; });
      const olderDelay = new Promise((resolve) => { releaseOlder = resolve; });
      await page.route('**/api/forms/ui002/responses/response-3', async (route) => {
        olderRequested();
        await olderDelay;
        await route.fulfill({ json: records[3] });
      });
      await buttons.nth(3).click();
      await olderPending;
      await buttons.nth(4).click();
      await page.getByRole('heading', { name: 'Synthetic response 4', exact: true }).waitFor();
      if (mobile) await page.waitForFunction(() => document.activeElement?.textContent === 'Synthetic response 4');
      const callsBeforeOlder = await page.evaluate(() => window.detailScrolls.length);
      const olderResponse = page.waitForResponse((item) => item.url().endsWith('/responses/response-3'));
      releaseOlder();
      await (await olderResponse).finished();
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.getByRole('heading', { name: 'Synthetic response 4', exact: true }).count(), 1);
      assert.equal(await page.evaluate(() => window.detailScrolls.length), callsBeforeOlder);
      passed(`${scenario.name}: a slow earlier selection cannot replace or refocus the latest response`);
      fail = true;
      const callsBeforeFailure = await page.evaluate(() => window.detailScrolls.length);
      await buttons.nth(2).click();
      await page.getByText('Synthetic detail failure', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.detailScrolls.length), callsBeforeFailure);
      assert.equal(await page.getByRole('heading', { name: 'Synthetic response 4', exact: true }).count(), 1);
      passed(`${scenario.name}: failed selection does not focus or scroll stale details`);
      await context.close();
    }
    assert.deepEqual(report.errors, [], 'No uncaught browser errors');
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.failures.push(error.message);
    throw error;
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  }
  console.log(`${report.checks.length} checks passed. Evidence: ${output}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
