// Browser smoke test for the live GrowthX UI (TasteWorkspace at "/" and "/demo").
//
// Run against a local server with a disposable workspace database and no provider
// credentials, for example:
//   EVENT_GTM_WORKSPACE_PATH=$(mktemp -d)/workspace.sqlite EVENT_GTM_DEMO_ENABLED=true pnpm start
//   pnpm test:browser
// It calls no paid providers, never modifies the research catalog, and does not
// exercise live LLM agents: without credentials the team reports that it is not configured.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin = process.env.EVENT_GTM_BASE_URL || 'http://localhost:3010';
// Expected failures when no provider credentials are configured.
const EXPECTED_FAILURES = [/^502 POST \/api\/brand$/];

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
const unexpectedResponses = [];
context.on('page', watch);

function watch(page) {
  page.on('pageerror', error => pageErrors.push(`${page.url()}: ${error.message}`));
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin !== origin || response.status() < 400) return;
    const entry = `${response.status()} ${response.request().method()} ${url.pathname}`;
    if (!EXPECTED_FAILURES.some(pattern => pattern.test(entry))) unexpectedResponses.push(entry);
  });
}

try {
  const page = await context.newPage();

  // 1. Welcome screen.
  await page.goto(origin);
  await page.getByRole('heading', { name: /Make your next/ }).waitFor();
  await page.screenshot({ path: 'test-results/welcome-desktop.png' });

  // 2. Website step -> brief step. Brand extraction fails without TASTE_API_KEY and is surfaced, not thrown.
  await page.getByLabel('Your company website').fill('tastelabs.com');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'Make it yours.' }).waitFor();
  await page.getByRole('alert').filter({ hasText: /Taste is not configured/ }).waitFor();

  // 3. Brief submission persists server-side and opens the plan. Without model
  //    credentials the team reports that it is not configured instead of running.
  await page.getByLabel('Who’s in the room?').fill('Design engineers building AI apps');
  await page.getByRole('button', { name: 'Partnerships' }).click();
  await page.getByRole('button', { name: 'Create my event plan' }).click();
  await page.getByRole('heading', { name: 'Your event plan.' }).waitFor();
  await page.getByText(/not configured/i).first().waitFor();
  await page.screenshot({ path: 'test-results/plan-unconfigured.png' });

  // 4. Reload: the saved brief is restored from the server snapshot and the plan reopens.
  await page.reload();
  await page.getByRole('heading', { name: 'Your event plan.' }).waitFor();
  const workspace = await page.evaluate(async () => (await fetch('/api/workspace', { cache: 'no-store' })).json());
  assert.equal(workspace.briefVersion, 1, 'the brief was saved once on the server');
  assert.equal(workspace.latestBrief.objective, 'partnerships', 'the selected goal reached the server');
  assert.equal(workspace.runs.length, 0, 'no agent run starts without model credentials');

  // 5. Prepared demo: seeded plan, event details and team activity dialogs.
  await page.goto(`${origin}/demo`);
  await page.getByRole('heading', { name: 'Your event plan.' }).waitFor();
  const cards = page.locator('.tg-event-card');
  await cards.first().waitFor();
  assert.ok(await cards.count() >= 3, 'the prepared demo shows its seeded event plan');
  await cards.first().click();
  const details = page.locator('dialog[open]');
  await details.waitFor();
  await page.screenshot({ path: 'test-results/demo-event-details.png' });
  await page.keyboard.press('Escape');
  await details.waitFor({ state: 'detached' });
  await page.locator('.tg-crew-button').click();
  await page.getByRole('heading', { name: 'Behind your next event.' }).waitFor();
  await page.keyboard.press('Escape');

  // 6. Mobile layout renders without horizontal overflow.
  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(`${origin}/demo`);
  await mobile.getByRole('heading', { name: 'Your event plan.' }).waitFor();
  await mobile.screenshot({ path: 'test-results/demo-mobile.png' });
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'mobile layout overflows horizontally');

  assert.deepEqual(pageErrors, [], 'no uncaught page errors');
  assert.deepEqual(unexpectedResponses, [], 'no unexpected failed same-origin responses');
  console.log('Browser smoke passed: welcome, brief, plan restore, demo plan, dialogs and mobile layout.');
} catch (error) {
  for (const [index, open] of context.pages().entries()) await open.screenshot({ path: `test-results/failure-${index}.png` }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
