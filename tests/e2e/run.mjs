// Drives the built page in Chromium: node tests/e2e/run.mjs
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = pathToFileURL(new URL('../../dist/index.html', import.meta.url).pathname).href;
const browser = await chromium.launch();
let passed = 0;
const failures = [];

async function open(opts = {}, init) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const page = await ctx.newPage();
  page.setDefaultTimeout(5000);
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && page.errors.push(m.text()));
  if (init) await page.addInitScript(init);
  await page.goto(url + (opts.hash || ''));
  await page.waitForSelector('#days .day');
  return page;
}
async function check(name, fn) {
  try { await fn(); passed++; console.log('ok   ' + name); } catch (e) { failures.push(name); console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').slice(0, 4).join('\n     ')); }
}
const names = (page) => page.$$eval('#days .day', (els) => els.map((li) => li.querySelector('.dcard .nm')?.textContent || null));
const count = async (page) => { await page.waitForTimeout(450); return Number(await page.textContent('#n-items')); };
async function dragTo(page, from, to) {
  await (await page.$(from)).scrollIntoViewIfNeeded();
  const a = await (await page.$(from)).boundingBox(), b = await (await page.$(to)).boundingBox();
  await page.mouse.move(a.x + 40, a.y + a.height / 2); await page.mouse.down();
  await page.mouse.move(a.x + 60, a.y + a.height / 2 + 10, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}
const card = (name) => `#cards .pcard:has(.nm:text-is("${name}"))`;

// ---------- desktop
{
  const page = await open();
  await check('opens on a full dealt week with a list', async () => {
    assert.equal((await names(page)).filter(Boolean).length, 7);
    assert.ok(await count(page) > 20);
    assert.equal(await page.$$eval('#cards .pcard', (c) => c.length), 43);
  });
  await page.click('#clear');
  await check('clearing the table empties the week; every-week items stay', async () => {
    assert.deepEqual(await names(page), Array(7).fill(null));
    assert.equal(await count(page), 33);
  });
  await page.uncheck('#every-week');
  await check('every-week switch empties the list', async () => assert.equal(await count(page), 0));

  await dragTo(page, card('Slow cooked pork shoulder'), '.day[data-i="0"] .slot');
  await check('drag a card from the deck onto Saturday', async () => {
    assert.equal((await names(page))[0], 'Slow cooked pork shoulder');
    assert.ok(await count(page) > 3);
  });
  await dragTo(page, card('Lasagne from leftover pork shoulder'), '.day[data-i="2"] .slot');
  await check('leftover chain is found and the leftover pork is not on the list', async () => {
    assert.match(await page.textContent('#notes'), /Leftover chain\. Saturday's slow cooked pork shoulder becomes Monday's lasagne/);
    assert.equal(await page.$('.item:has(.nm:text-is("Leftover pork"))'), null);
    assert.ok(await page.$('.item:has(.nm:text-is("Lasagne sheets"))'));
  });
  await dragTo(page, '.day[data-i="2"] .dcard', '.day[data-i="1"] .slot');
  await check('drag between days moves the card, and the link badge appears on consecutive days', async () => {
    const n = await names(page);
    assert.equal(n[1], 'Lasagne from leftover pork shoulder'); assert.equal(n[2], null);
    assert.ok(await page.$('.day[data-i="0"] .link'));
  });
  await dragTo(page, '.day[data-i="1"] .dcard', '.day[data-i="0"] .slot');
  await check('swapping so the lasagne comes first raises a warning', async () => {
    assert.equal((await names(page))[0], 'Lasagne from leftover pork shoulder');
    assert.match(await page.textContent('#notes'), /has nothing to be made from/);
  });
  await dragTo(page, '.day[data-i="0"] .dcard', '.deck .scroll');
  await check('drag a card back to the deck removes it', async () => assert.equal((await names(page))[0], null));

  await page.click('#clear');
  await dragTo(page, card('Spaghetti'), '.day[data-i="0"] .slot');
  await dragTo(page, card('Tacos'), '.day[data-i="1"] .slot');
  await check('shared ingredient: mince summed across two meals and tagged', async () => {
    const row = '.item:has(.nm:text-is("Pork mince"))';
    assert.equal((await page.textContent(`${row} .qty`)).trim(), '1 kg');
    assert.equal(await page.textContent(`${row} .badge.share`), '2 meals');
    assert.match(await page.textContent('#notes'), /double duty/);
    assert.match(await page.textContent('#n-saved'), /sharing saves [1-9]/);
  });
  await check('expanding a line shows where it comes from and the preferred product', async () => {
    await page.click('.item:has(.nm:text-is("Pork mince")) .more');
    assert.match(await page.textContent('.item:has(.nm:text-is("Pork mince")) .detail'), /Spaghetti 500 g · Tacos 500 g/);
  });
  await check('recipe sheet: put on a day by keyboard-reachable buttons, change diners', async () => {
    await page.click(card('Chicken rice'));
    await page.click('#sheet .puton button:text-is("Wed")');
    assert.equal((await names(page))[4], 'Chicken rice');
    await page.click('.day[data-i="4"] .dcard .body');
    assert.match(await page.textContent('#sheet'), /Ingredients/);
    await page.click('#sheet .stepper button[aria-label="One more"]'); await page.click('#sheet .stepper button[aria-label="One more"]');
    await page.click('#sheet .close');
    assert.equal((await page.textContent('.item:has(.nm:text-is("Rice")) .qty')).trim(), '2¼ cups');
    assert.match(await page.textContent('.day[data-i="4"] .meta'), /for 6/);
  });
  await check('loose ends name what is left and who could use it', async () => {
    assert.match(await page.textContent('#notes'), /Loose end\. You will have [¼½] can of (black beans|chickpeas) left over/);
  });
  await check('batch cook offers a free second night', async () => {
    await dragTo(page, card('Lamb stew (x2 batches)'), '.day[data-i="2"] .slot');
    const before = await count(page);
    await page.click('#notes button:text-is("Add the second night")');
    const n = await names(page);
    assert.equal(n.filter((x) => x === 'Lamb stew (x2 batches)').length, 2);
    assert.equal(await count(page), before);
    assert.match(await page.textContent('#days'), /Second night\. Already cooked/);
  });
  await check('a non-dinner goes to extras and still feeds the shop', async () => {
    await page.click(card('Porridge'));
    await page.click('#sheet .puton button');
    assert.match(await page.textContent('#extras'), /Porridge/);
    assert.ok(await page.$('.item:has(.nm:text-is("Rolled oats"))'));
  });
  await check('search by ingredient and filter by suit', async () => {
    await page.fill('#search', 'cabbage');
    const found = await page.$$eval('#cards .pcard .nm', (e) => e.map((x) => x.textContent));
    assert.ok(found.includes('Gołąbki') && found.includes('Coleslaw') && !found.includes('Tacos'));
    await page.fill('#search', '');
    await page.click('#filters [data-f="sea"]');
    assert.equal(await page.$$eval('#cards .pcard', (c) => c.length), 7);
    await page.click('#filters [data-f="all"]');
  });
  await check('add anything from the catalogue, then remove it', async () => {
    await page.fill('#add', 'toil'); await page.keyboard.press('Enter');
    assert.ok(await page.$('.aisle:has(h3:text-is("Household")) .item:has(.nm:text-is("Toilet paper"))'));
    await page.click('.item:has(.nm:text-is("Toilet paper")) .x');
    assert.equal(await page.$('.item:has(.nm:text-is("Toilet paper"))'), null);
  });
  await check('tick an item: progress moves, item sinks, survives reload', async () => {
    await page.check('.item:has(.nm:text-is("Pork mince")) input');
    assert.match(await page.textContent('#n-got'), /1 of \d+ in the trolley/);
    await page.reload(); await page.waitForSelector('#days .day');
    assert.ok(await page.isChecked('.item:has(.nm:text-is("Pork mince")) input'));
    assert.equal((await names(page))[0], 'Spaghetti');
  });
  await check('lock a day, deal: the lock holds, the week fills, the deal explains itself', async () => {
    await page.click('.day[data-i="0"] .tool[aria-pressed]');
    for (const style of ['thrifty', 'wild', 'usual']) {
      await page.click(`#styles [data-s="${style}"]`); await page.click('#deal'); await page.waitForTimeout(80);
      const n = await names(page);
      assert.equal(n[0], 'Spaghetti'); assert.equal(n.filter(Boolean).length, 7);
      assert.ok((await page.textContent('#why')).length > 20);
    }
  });
  await check('undo brings back a week that Deal replaced, and Deal clears the trolley', async () => {
    const before = await names(page);
    await page.check(`.item[data-g="${await page.getAttribute('.item:not(.done)', 'data-g')}"] input`);
    await page.click('#deal'); await page.waitForTimeout(80);
    assert.match(await page.textContent('#n-got'), /walk the store/);
    await page.click('#toast button');
    assert.deepEqual(await names(page), before);
    assert.match(await page.textContent('#n-got'), /in the trolley/);
    await page.keyboard.press('Control+z');
    await page.click('#untick');
  });
  await check('keyboard: focus stays put after ticking and after locking', async () => {
    await page.focus('.item:not(.done) input'); const g = await page.evaluate(() => document.activeElement.dataset.fk);
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.fk), g);
    await page.keyboard.press('Space');
    await page.focus('.day[data-i="2"] [data-fk="lock:2"]'); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.fk), 'lock:2');
    await page.keyboard.press('Enter');
  });
  await check('nachos night does not double the every-week nachos', async () => {
    await page.check('#every-week');
    await page.click(card('Easy nachos')); await page.click('#sheet .puton button:text-is("Fri")');
    assert.equal((await page.textContent('.item:has(.nm:text-is("Chilli beans")) .qty')).trim(), '2 cans');
    assert.match(await page.textContent('#notes'), /Already on your every-week list/);
  });
  await check('not in the shop: mark it, get offered a swap, take it, undo it', async () => {
    await page.click('#clear');
    await page.click(card('Egg Pie')); await page.click('#sheet .puton button:text-is("Mon")');
    const row = '.item:has(.nm:text-is("Cauliflower"))';
    await page.click(`${row} .more`); await page.click(`${row} .acts button:text-is("Not in the shop today")`);
    assert.match(await page.textContent('#notes'), /No cauliflower in the shop\. Monday's egg pie needs it/);
    await page.click('#notes button:text-is("Swap Monday\'s dinner")');
    const now = (await names(page))[2];
    assert.ok(now && now !== 'Egg Pie');
    assert.match(await page.textContent('#why'), /egg pie swapped for/);
    assert.equal(await page.$(row), null);
    await page.click('#toast button');
    assert.equal((await names(page))[2], 'Egg Pie');
  });
  await check('aisles appear in store-walk order', async () => {
    await page.check('#every-week');
    const order = await page.$$eval('.aisle-h h3', (e) => e.map((x) => x.textContent));
    const walk = ['Produce', 'Deli', 'Gluten-free', 'Pantry', 'Canned Goods', 'Cereals & Breakfast', 'Beverages', 'Meat & Poultry', 'Bakery', 'Household', 'Personal Care', 'Chilled', 'Frozen'];
    assert.deepEqual(order, walk.filter((a) => order.includes(a)));
  });
  await check('week link round-trips into a fresh browser', async () => {
    await page.click('#share');
    const hash = await page.evaluate(() => location.hash);
    assert.match(hash, /^#w-[0-9a-z]{21}$/);
    await page.waitForTimeout(300);
    if (await page.$('#sheet[open]')) await page.click('#sheet .close'); // headless Chromium refuses the clipboard, so the link is shown instead
    const other = await open({ hash });
    assert.notDeepEqual(await names(other), await names(page), 'a linked week is offered, not applied');
    await other.click('#offer-yes');
    assert.deepEqual(await names(other), await names(page));
    const g = await other.getAttribute('.item', 'data-g');
    await other.check(`.item[data-g="${g}"] input`);
    await other.reload(); await other.waitForSelector('#days .day');
    assert.equal(await other.evaluate(() => location.hash), '', 'the link is cleared once read');
    assert.ok(await other.isChecked(`.item[data-g="${g}"] input`), 'a reload keeps the trolley');
    await other.context().close();
  });
  await check('save dialog without Claude offers the markdown instead', async () => {
    await page.click('#save');
    assert.match(await page.textContent('#sheet'), /From \d+ .*to \d+ \w+ 2026/);
    assert.ok(await page.isDisabled('#sheet .go'));
    assert.match(await page.textContent('#sheet'), /copy the markdown/i);
    await page.click('#sheet .close');
  });
  await check('next week is a separate table; coming back restores this one', async () => {
    const mine = await names(page);
    await page.click('#next'); assert.notDeepEqual(await names(page), mine);
    await page.click('#prev'); assert.deepEqual(await names(page), mine);
  });
  await check('no page errors (desktop)', async () => assert.deepEqual(page.errors, []));
  await page.context().close();
}

// ---------- phone
{
  const page = await open({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  await check('phone: no sideways scroll in any view', async () => {
    for (const v of ['week', 'deck', 'shop']) {
      await page.tap(`.tabs [data-v="${v}"]`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), v);
    }
  });
  await check('phone: tap an empty day, pick a card, land back on the week', async () => {
    await page.tap('.tabs [data-v="week"]');
    await page.tap('.day[data-i="3"] .tool[aria-label^="Take"]');
    await page.tap('.day[data-i="3"] .open');
    assert.equal(await page.getAttribute('#app', 'data-view'), 'deck');
    assert.match(await page.textContent('#pick-text'), /Tuesday/);
    await page.tap(card('Pizza'));
    assert.equal(await page.getAttribute('#app', 'data-view'), 'week');
    assert.equal((await names(page))[3], 'Pizza');
  });
  await check('phone: shop view ticks with a thumb and shows the product to look for', async () => {
    await page.tap('.tabs [data-v="shop"]');
    const box = await (await page.$('.item input[type="checkbox"]')).boundingBox();
    assert.ok(box.width >= 24 && box.height >= 24);
    await page.tap('.item input[type="checkbox"]');
    assert.match(await page.textContent('#tab-shop-n'), /\d+ to get/);
    assert.ok(await page.$$eval('.detail .product', (els) => els.some((e) => e.offsetParent !== null)));
  });
  await check('no page errors (phone)', async () => assert.deepEqual(page.errors, []));
  await page.context().close();
}

// ---------- inside Claude: a fake runtime stands in for the shared database and the Iris connector
{
  const page = await open({}, () => {
    const calls = [], docs = {}, subs = {}, writes = [];
    window.__writes = writes;
    const merge = (a, b) => { const out = { ...a }; for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) && a && typeof a[k] === 'object' && !Array.isArray(a[k]) ? merge(a[k], v) : v; return out; };
    const emit = (path) => (subs[path] || []).forEach((fn) => fn({ exists: true, data: () => docs[path], metadata: { hasPendingWrites: false } }));
    window.__calls = calls; window.__docs = docs;
    const db = { doc: (path) => ({
      set: async (body) => { writes.push({ op: 'set', path, body }); docs[path] = body; emit(path); },
      update: async (body) => { writes.push({ op: 'update', path, body }); if (!docs[path]) throw { code: 'invalid_argument' }; docs[path] = merge(docs[path], body); emit(path); },
      onSnapshot: (next) => { (subs[path] = subs[path] || []).push(next); setTimeout(() => next({ exists: !!docs[path], data: () => docs[path], metadata: { hasPendingWrites: false } }), 10); return () => {}; },
    }) };
    window.__remote = (path, body) => { docs[path] = body; emit(path); };
    const mcp = { callTool: async (server, tool, input) => {
      calls.push({ server, tool, input });
      if (window.__fail) throw window.__fail;
      if (tool === 'list_diagrams') return { payload: window.__existing ? [{ name: window.__existing }] : [] };
      if (tool === 'package_hierarchy') return { payload: input.set_id.startsWith('f2e0') ? [{ id: 'pkg-existing', name: window.__pkg || 'none' }] : [] };
      if (tool === 'create_package') return { payload: { id: 'pkg-new', name: input.name } };
      return { payload: { id: 'dia-' + calls.length, web_url: 'https://iris-uat.chrisbarlow.nz/views/dia-' + calls.length } };
    } };
    window.claude = { use: async (name) => (name === 'db' ? db : name === 'mcp' ? mcp : null) };
  });
  await check('in Claude: the week is written to the shared database after a change', async () => {
    await page.waitForFunction(() => /shared with everyone/.test(document.getElementById('sync').textContent));
    await page.click('#deal'); await page.waitForTimeout(1000);
    const keys = await page.evaluate(() => Object.keys(window.__docs));
    assert.equal(keys.length, 1); assert.match(keys[0], /^weeks\/\d{4}-\d\d-\d\d$/);
    const doc = await page.evaluate(() => Object.values(window.__docs)[0]);
    assert.equal(doc.days.length, 7); assert.deepEqual(doc.ticks, {});
  });
  await check('in Claude: a change made on another device arrives', async () => {
    await page.evaluate(() => { const [path, body] = Object.entries(window.__docs)[0]; const first = body.days.find((d) => d.r).r; window.__remote(path, { ...body, days: body.days.map((d, i) => (i === 0 ? { ...d, r: first } : { ...d, r: null })), ticks: {}, rev: Date.now() + 5000, tab: 'other' }); });
    await page.waitForTimeout(100);
    assert.equal((await names(page)).filter(Boolean).length, 1);
  });
  await check('in Claude: Save writes a plan and a list to the right sets, reusing a dated package', async () => {
    await page.click('#deal'); await page.waitForTimeout(60);
    const pkg = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7)); const p = (n) => String(n).padStart(2, '0'); return (window.__pkg = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`); });
    await page.click('#save'); await page.click('#sheet .go');
    await page.waitForFunction(() => /Saved\./.test(document.getElementById('save-status')?.textContent || ''));
    const calls = await page.evaluate(() => window.__calls);
    assert.deepEqual(calls.map((c) => c.tool), ['package_hierarchy', 'list_diagrams', 'package_hierarchy', 'create_diagram', 'create_package', 'create_diagram']);
    assert.ok(calls.every((c) => c.server === 'iris'));
    const [plan, list] = calls.filter((c) => c.tool === 'create_diagram').map((c) => c.input);
    assert.equal(plan.set_id, 'f2e064ad-9e08-4420-9c1f-3c3747b1c728'); assert.equal(plan.parent_package_id, 'pkg-existing');
    assert.equal(list.set_id, '9ed26bcc-6077-41f0-b173-a72bee1a54f1'); assert.equal(list.parent_package_id, 'pkg-new');
    assert.equal(plan.diagram_type, 'smart_markdown'); assert.equal(plan.notation, 'markdown');
    assert.match(plan.data.markdown_source, /^# Week 1:\n## Saturday \d+\/\d+\n- \{\{diagram:[0-9a-f-]{36}:name\}\}/);
    assert.match(list.data.markdown_source, /## Produce\n\n- \[ \] .*\{\{element:[0-9a-f-]{36}:name\}\}/);
    assert.equal(calls.find((c) => c.tool === 'create_package').input.name, pkg);
    assert.equal(await page.$$eval('#save-status a', (a) => a.length), 2);
    await page.click('#sheet .close');
  });
  await check('in Claude: saving a week that is already in Iris stops and asks first', async () => {
    const before = (await page.evaluate(() => window.__calls)).length;
    await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7)); const e = new Date(d); e.setDate(d.getDate() + 6); const M = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']; window.__existing = `From ${d.getDate()}${d.getMonth() === e.getMonth() ? '' : ' ' + M[d.getMonth()]} to ${e.getDate()} ${M[e.getMonth()]} ${e.getFullYear()}`; });
    await page.click('#save'); await page.click('#sheet .go');
    await page.waitForFunction(() => /already in Iris/.test(document.getElementById('save-status')?.textContent || ''));
    const calls = (await page.evaluate(() => window.__calls)).slice(before);
    assert.ok(!calls.some((c) => c.tool.startsWith('create_')), 'nothing written yet');
    assert.equal((await page.textContent('#sheet .go')).trim(), 'Write new copies anyway');
    await page.click('#sheet .close');
  });
  await check('in Claude: each tick is merged on its own, so two shoppers do not undo each other', async () => {
    await page.waitForTimeout(700);
    await page.evaluate(() => { window.__writes.length = 0; });
    const g = await page.getAttribute('.item', 'data-g');
    await page.check(`.item[data-g="${g}"] input`); await page.waitForTimeout(100);
    const w = await page.evaluate(() => window.__writes);
    assert.equal(w.length, 1); assert.equal(w[0].op, 'update'); assert.deepEqual(Object.keys(w[0].body.ticks), [g]);
    // a partner ticks something else: both ticks stand
    const other = await page.getAttribute('.item:not(.done)', 'data-g');
    await page.evaluate(([o]) => { const [path, body] = Object.entries(window.__docs)[0]; const qty = document.querySelector(`.item[data-g="${o}"] .qty`).textContent; window.__remote(path, { ...body, ticks: { ...body.ticks, [o]: qty }, tab: 'partner' }); }, [other]);
    await page.waitForTimeout(100);
    assert.ok(await page.isChecked(`.item[data-g="${g}"] input`)); assert.ok(await page.isChecked(`.item[data-g="${other}"] input`));
  });
  await check('in Claude: changing week straight after an edit still saves the edit to its own week, and an untouched week is never pushed', async () => {
    const start = await page.evaluate(() => Object.keys(window.__docs)[0]);
    await page.click('.day[data-i="6"] .tool[aria-label^="Take"]');
    await page.click('#next'); await page.waitForTimeout(900);
    const docs = await page.evaluate(() => window.__docs);
    assert.deepEqual(Object.keys(docs), [start], 'the empty next week was not written');
    assert.equal(docs[start].days[6].r, null, 'the edit reached the week it was made in');
    await page.click('#prev');
  });
  await check('in Claude: a failed save says what to do about it', async () => {
    await page.evaluate(() => { window.__fail = { code: 'server_not_connected', message: 'x' }; });
    await page.click('#save'); await page.click('#sheet .go');
    await page.waitForFunction(() => /Settings, Connectors/.test(document.getElementById('save-status')?.textContent || ''));
    assert.ok(!(await page.isDisabled('#sheet .go')));
  });
  await check('no page errors (in Claude)', async () => assert.deepEqual(page.errors, []));
  await page.context().close();
}

await browser.close();
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
