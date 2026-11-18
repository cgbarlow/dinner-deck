import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEngine, emptyWeek, weekStart, weekOf as currentWeek, rangeLabel, formatQty, mulberry32 } from '../src/engine.js';

const deck = JSON.parse(readFileSync(new URL('../data/deck.json', import.meta.url)));
const E = makeEngine(deck);
const id = (name) => { const hit = E.recipeIds.find((r) => E.R[r].n === name); assert.ok(hit, name); return hit; };
const gid = (name) => { const hit = Object.keys(E.G).find((g) => E.G[g].n === name); assert.ok(hit, name); return hit; };
const weekOf = (names, start = '2026-11-21') => { const w = emptyWeek(start); names.forEach((n, i) => { if (n) w.days[i].r = id(n); }); w.everyWeek = false; return w; };
const lineFor = (shop, name) => shop.lines.find((l) => l.name === name);

// What Iris's own "Shopping list" aggregation returned for the saved plan of 6 to 12 June 2026,
// called on 18 November 2026: aggregate(source_diagram_id=5cd03d1d…, profile_id=f0f2f8e8…).
const IRIS_6_JUNE = [
  ['Chilli beans', 2, 'can'], ['Cheese', 200, 'g'], ['Fresh fish', 700, 'g'], ['Frozen chips', 1000, 'g'],
  ['Frozen dumplings', 24, 'unit'], ['Chicken pieces', 400, 'g'], ['Cooked chicken meat', 2, 'cup'],
  ['Pork mince', 500, 'g'], ['Sausages', 6, 'unit'], ['Mayonnaise', 3, 'tbsp'], ['Nachos', 500, 'g'],
  ['Olive oil', 1, 'splash'], ['Rice', 1.5, 'cup'], ['Sugar', 1, 'tsp'], ['Sundried tomatoes', 50, 'g'],
  ['Broccoli', 1, 'head'], ['Cabbage', 3, 'cup'], ['Carrots', 150, 'g'], ['Onion', 1, 'unit'], ['Potatoes', 800, 'g'],
];

test('agrees with Iris on every line Iris adds up', () => {
  const w = emptyWeek('2026-06-06'); w.everyWeek = false;
  deck.plans[2].days.forEach((r, i) => { w.days[i].r = r; });
  const shop = E.shop(w);
  for (const [name, qty, unit] of IRIS_6_JUNE) {
    const l = lineFor(shop, name);
    assert.ok(l, `${name} is on the list`);
    assert.equal(l.sums[unit], qty, `${name}: ${unit}`);
  }
});

test('lists what Iris leaves off: text fractions and lines with no quantity', () => {
  const w = emptyWeek('2026-06-06'); w.everyWeek = false;
  deck.plans[2].days.forEach((r, i) => { w.days[i].r = r; });
  const shop = E.shop(w);
  assert.equal(lineFor(shop, 'Black beans').sums.can, 0.5);
  assert.ok(lineFor(shop, 'Whole chicken').some);
  assert.ok(shop.lines.length > IRIS_6_JUNE.length);
});

test('sums across meals and counts the days that share', () => {
  const shop = E.shop(weekOf(['Spaghetti', 'Tacos', 'Burgers']));
  const mince = lineFor(shop, 'Pork mince');
  assert.equal(mince.sums.g, 1500);
  assert.deepEqual(mince.days, [0, 1, 2]);
  assert.equal(mince.qty, '1½ kg');
});

test('diners scale the quantities', () => {
  const w = weekOf(['Spaghetti']); w.days[0].d = 8;
  assert.equal(lineFor(E.shop(w), 'Pork mince').sums.g, 1000);
});

test('leftover chain: lasagne after pork shoulder buys no pork', () => {
  const w = weekOf(['Slow cooked pork shoulder', 'Lasagne from leftover pork shoulder']);
  const shop = E.shop(w), ins = E.insights(w, shop);
  assert.equal(lineFor(shop, 'Leftover pork'), undefined);
  assert.deepEqual(ins.chains.map((c) => [c.from, c.to]), [[0, 1]]);
  assert.equal(ins.warnings.length, 0);
});

test('lasagne alone, or before the pork, is called out', () => {
  assert.equal(E.insights(weekOf(['Lasagne from leftover pork shoulder'])).warnings[0].why, 'missing');
  assert.equal(E.insights(weekOf(['Lasagne from leftover pork shoulder', null, 'Slow cooked pork shoulder'])).warnings[0].why, 'order');
});

test('coleslaw is found inside the sausages recipe', () => {
  const ins = E.insights(weekOf(['Sausages with coleslaw and potatoes']));
  assert.equal(E.R[ins.inside[0].inner].n, 'Coleslaw');
});

test('loose ends: half a can left, and who could use it', () => {
  const ins = E.insights(weekOf(['Chicken rice']));
  const chick = ins.loose.find((l) => l.name === 'Chickpeas');
  assert.equal(chick.left, 0.5);
  assert.ok(chick.uses.map((r) => E.R[r].n).includes('Veg stew'));
});

test('quantities that cannot be right are flagged, not added', () => {
  const shop = E.shop(weekOf(["Egg Pie"]));
  const cauli = lineFor(shop, 'Cauliflower');
  assert.equal(cauli.sums.cup, undefined);
  assert.match(cauli.odd[0], /250 cups/);
});

test('seasonings go to the cupboard tier; every-week items merge in', () => {
  const w = weekOf(['Easy nachos']); w.everyWeek = true;
  const shop = E.shop(w);
  assert.equal(lineFor(E.shop(weekOf(['Coleslaw'])), 'Salt')?.tier ?? 'cupboard', 'cupboard');
  const cheese = lineFor(shop, 'Cheese');
  assert.equal(cheese.tier, 'meals');
  assert.ok(cheese.weekly);
  assert.equal(lineFor(shop, 'Bananas').tier, 'weekly');
});

test('habits are counted from the saved plans', () => {
  const wed = E.habits[4];
  assert.equal(E.R[wed.r].n, 'Easy nachos');
  assert.equal(wed.n, 3); assert.equal(wed.of, 3);
});

for (const style of ['usual', 'thrifty', 'wild']) {
  test(`deal (${style}): seven dinners, no repeats, chains in order, locks kept`, () => {
    for (let seed = 1; seed <= 40; seed++) {
      const w = emptyWeek('2026-11-21');
      w.days[3] = { r: id('Tacos'), d: null, lock: true, second: false };
      const { week, why } = E.deal(w, style, mulberry32(seed));
      assert.equal(week.days[3].r, id('Tacos'));
      assert.ok(week.days.every((s) => s.r), 'every day filled');
      const cooked = week.days.filter((s) => !s.second).map((s) => s.r);
      assert.equal(new Set(cooked).size, cooked.length, 'no repeats');
      assert.ok(cooked.every((r) => E.R[r].k === 'dinner'));
      assert.equal(E.insights(week).warnings.length, 0, 'no broken chains');
      for (const s of week.days.filter((x) => x.second)) assert.ok(E.R[s.r].b);
      assert.ok(why.length > 10);
    }
  });
}

test('thrifty deals a shorter shop than wildcard on average', () => {
  const avg = (style) => { let n = 0; for (let s = 1; s <= 25; s++) n += E.stats(E.deal(emptyWeek('2026-11-21'), style, mulberry32(s)).week).mealItems; return n / 25; };
  assert.ok(avg('thrifty') < avg('wild') - 3, `${avg('thrifty')} vs ${avg('wild')}`);
});

test('moving cards: place, swap, return, and a non-dinner goes to extras', () => {
  let w = emptyWeek('2026-11-21');
  w = E.move(w, { deck: id('Tacos') }, { day: 0 });
  w = E.move(w, { deck: id('Pizza') }, { day: 1 });
  w = E.move(w, { day: 0 }, { day: 1 });
  assert.deepEqual(w.days.slice(0, 2).map((s) => E.R[s.r].n), ['Pizza', 'Tacos']);
  w = E.move(w, { deck: id('Tacos') }, { day: 4 });
  assert.equal(w.days[1].r, null, 'a card is only in one place');
  w = E.move(w, { deck: id('Porridge') }, { day: 2 });
  assert.deepEqual(w.extras, [id('Porridge')]);
  w = E.move(w, { day: 4 }, { deck: true });
  assert.equal(w.days[4].r, null);
});

test('batch cook: second night is free and leaves with its cook night', () => {
  let w = weekOf(['Lamb stew (x2 batches)']);
  const one = E.shop(w).lines.length;
  w = E.addSecondNight(w, 0);
  assert.equal(w.days[2].second, true);
  assert.equal(E.shop(w).lines.length, one);
  w = E.move(w, { day: 0 }, { deck: true });
  assert.ok(w.days.every((s) => !s.r));
});

test('week code round-trips', () => {
  const { week } = E.deal(emptyWeek('2026-11-21'), 'usual', mulberry32(7));
  const back = E.decode(E.encode(week), emptyWeek('2026-11-21'));
  assert.deepEqual(back.days.map((s) => [s.r, s.second]), week.days.map((s) => [s.r, s.second]));
  assert.match(E.encode(week), /^[a-z0-9-]+$/);
  assert.equal(E.decode('nonsense', week), null);
});

test('dates: weeks start on Saturday and are named like the saved plans', () => {
  assert.equal(weekStart(new Date(2026, 10, 18)), '2026-11-21');
  assert.equal(weekStart(new Date(2026, 10, 21)), '2026-11-21');
  assert.equal(rangeLabel('2026-06-06'), '6 to 12 June 2026');
  assert.equal(rangeLabel('2026-05-30'), '30 May to 5 June 2026');
});

test('Iris markdown has the saved plans\' shape and tokens Iris can aggregate', () => {
  const w = emptyWeek('2026-06-06'); w.everyWeek = false;
  deck.plans[2].days.forEach((r, i) => { w.days[i].r = r; });
  const out = E.toIris(w, new Set([gid('Sausages')]));
  assert.equal(out.planName, 'From 6 to 12 June 2026');
  assert.equal(out.packageName, '2026-06-06');
  assert.ok(out.planMarkdown.startsWith(`# Week 1:\n## Saturday 6/6\n- {{diagram:${deck.plans[2].days[0]}:name}}`));
  assert.ok(out.planMarkdown.includes('# Week 2:\n## Monday 8/6'));
  assert.match(out.listMarkdown, /- \[x\] 6 \{\{element:[0-9a-f-]{36}:name\}\} _\(sausages with coleslaw and potatoes\)_/);
  assert.ok(out.listMarkdown.indexOf('## Produce') < out.listMarkdown.indexOf('## Frozen'));
});

test('formatting', () => {
  assert.equal(formatQty(0.5, 'can'), '½ can');
  assert.equal(formatQty(2, 'can'), '2 cans');
  assert.equal(formatQty(1500, 'g'), '1½ kg');
  assert.equal(formatQty(6, 'unit'), '6');
});

// ---- after the second Council review

test('an every-week item covers the same item for a meal instead of doubling it', () => {
  const w = weekOf(['Easy nachos']); w.everyWeek = true;
  const shop = E.shop(w), ins = E.insights(w, shop);
  assert.equal(lineFor(shop, 'Chilli beans').qty, '2 cans');
  assert.equal(lineFor(shop, 'Nachos').qty, '500 g');
  assert.deepEqual(ins.covered.map((l) => l.name).sort(), ['Cheese', 'Chilli beans', 'Nachos']);
});

test('things bought whole are rounded up on the list; the sums stay exact', () => {
  const w = weekOf(['Chicken rice']); w.days[0].d = 6;
  const beans = lineFor(E.shop(w), 'Black beans');
  assert.equal(beans.sums.can, 0.75);
  assert.equal(beans.qty, '1 can');
  assert.doesNotMatch(E.shop(w).lines.map((l) => l.qty).join('|'), /packs?\b(?! of)/);
});

test('swapping two days keeps their locks', () => {
  let w = weekOf(['Tacos', 'Pizza']); w.days[0].lock = true;
  w = E.move(w, { day: 0 }, { day: 1 });
  assert.equal(w.days[1].lock, true); assert.equal(E.R[w.days[1].r].n, 'Tacos');
});

test('a non-dinner dropped on a batch-cook day leaves the second night alone', () => {
  let w = E.addSecondNight(weekOf(['Lamb stew (x2 batches)']), 0);
  w = E.move(w, { deck: id('Porridge') }, { day: 0 });
  assert.equal(w.days.filter((s) => s.r === id('Lamb stew (x2 batches)')).length, 2);
});

test('dealing with only a second night locked keeps its cook night', () => {
  let w = E.addSecondNight(weekOf(['Lamb stew (x2 batches)']), 0);
  w.days[2].lock = true;
  for (let seed = 1; seed <= 15; seed++) {
    const { week } = E.deal(w, 'usual', mulberry32(seed));
    assert.equal(week.days[0].r, id('Lamb stew (x2 batches)')); assert.equal(week.days[2].second, true);
  }
});

test('deals: never three of one protein, and the stories show up', () => {
  for (const style of ['usual', 'thrifty', 'wild']) {
    let chains = 0, seconds = 0, sig = new Set();
    for (let seed = 1; seed <= 60; seed++) {
      const { week } = E.deal(emptyWeek('2026-11-21'), style, mulberry32(seed));
      const n = {};
      for (const s of week.days) if (!s.second) n[E.R[s.r].pr] = (n[E.R[s.r].pr] || 0) + 1;
      assert.ok(Math.max(...Object.values(n)) <= 2, `${style} seed ${seed}: ${JSON.stringify(n)}`);
      const ins = E.insights(week);
      if (ins.chains.length) chains++;
      if (week.days.some((s) => s.second)) seconds++;
      sig.add(week.days.map((s) => s.r).join());
    }
    assert.ok(chains >= 9, `${style}: chain in ${chains} of 60`);
    assert.ok(seconds >= 5, `${style}: second night in ${seconds} of 60`);
    assert.ok(sig.size >= 50, `${style}: ${sig.size} different weeks in 60`);
  }
});

test('weeks planned in the app count toward habits', () => {
  const tacos = id('Tacos');
  const E2 = makeEngine(deck, [{ days: [null, null, null, null, null, null, tacos] }, { days: [null, null, null, null, null, null, tacos] }]);
  assert.equal(E2.habits[6].r, tacos); assert.equal(E2.habits[6].of, 5);
});
