// Takes screenshots of the built page for a visual check: node tests/e2e/shots.mjs <outdir>
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { pathToFileURL } from 'node:url';
const out = process.argv[2] || 'test-results';
const url = pathToFileURL(new URL('../../dist/index.html', import.meta.url).pathname).href;
const browser = await chromium.launch();
for (const [name, opts] of [['desktop-light', { viewport: { width: 1440, height: 900 }, colorScheme: 'light' }], ['desktop-dark', { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' }], ['phone', { viewport: { width: 400, height: 800 }, colorScheme: 'light', hasTouch: true }]]) {
  const page = await (await browser.newContext({ ...opts, deviceScaleFactor: 1 })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url); await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${name}.png` });
  if (name === 'phone') { await page.click('.tabs [data-v="shop"]'); await page.waitForTimeout(200); await page.screenshot({ path: `${out}/phone-shop.png` }); await page.click('.tabs [data-v="deck"]'); await page.screenshot({ path: `${out}/phone-deck.png` }); }
  if (name === 'desktop-light') { await page.click('#cards .pcard >> nth=7'); await page.waitForTimeout(200); await page.screenshot({ path: `${out}/sheet.png` }); }
  console.log(name, errors.length ? errors : 'no errors');
}
await browser.close();
