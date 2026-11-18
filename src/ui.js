import { makeEngine, emptyWeek, weekStart, dayDate, rangeLabel, mulberry32, formatQty, DAY_NAMES, DAY_SHORT } from './engine.js';

const DECK = JSON.parse(document.getElementById('deck-data').textContent);
const E = makeEngine(DECK);
const { G, R } = E;
const KEY = 'dinner-deck:v1';
const TAB = Math.random().toString(36).slice(2, 10);
const IRIS = 'iris';
const $ = (id) => document.getElementById(id);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isPhone = () => window.matchMedia('(max-width: 900px)').matches;

const PIPS = {
  sea: '<path d="M2 12c3-5 8-6 12-4l6-3.500v15L14 16c-4 2-9 1-12-4z"/><circle cx="7.500" cy="11" r="1.200" fill="var(--card)"/>',
  chicken: '<ellipse cx="14.500" cy="9" rx="6.200" ry="5" transform="rotate(-40 14.500 9)"/><path d="M10 13.500 5.500 18" stroke="currentColor" stroke-width="2.600" stroke-linecap="round" fill="none"/><circle cx="4.800" cy="18.700" r="2.300"/>',
  pork: '<path d="M4.500 4l5.500 3.500-5 3.500zM19.500 4 14 7.500l5 3.500z"/><circle cx="12" cy="13" r="7.500"/><ellipse cx="12" cy="14.800" rx="3.400" ry="2.400" fill="var(--card)"/><circle cx="10.800" cy="14.800" r=".75"/><circle cx="13.200" cy="14.800" r=".75"/>',
  lamb: '<circle cx="10" cy="9.500" r="3.800"/><circle cx="14.500" cy="8" r="4"/><circle cx="18.500" cy="11" r="3.600"/><circle cx="13.500" cy="13.500" r="4.300"/><circle cx="9" cy="13.500" r="3.400"/><ellipse cx="4.600" cy="10.500" rx="2.700" ry="3.300"/><path d="M2.200 8.600 4 9.600" stroke="currentColor" stroke-width="1.600" stroke-linecap="round"/><path d="M10 17v4M16 17v4" stroke="currentColor" stroke-width="2.200" stroke-linecap="round" fill="none"/>',
  veg: '<path d="M4 20C4 10 10 4 20 4c0 10-6 16-16 16z"/><path d="M5 19 14.500 9.500" stroke="var(--card)" stroke-width="1.500" fill="none"/>',
};
const PIP_NAMES = { sea: 'Fish and seafood', chicken: 'Chicken', pork: 'Pork', lamb: 'Lamb', veg: 'No meat' };
const LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const KIND_LABEL = { side: 'side', lunch: 'lunch', breakfast: 'breakfast', drink: 'drink' };

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'svg') el.innerHTML = v; // static markup defined in this file only
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const pip = (kind, cls = 'pip') => h('span', { class: `${cls} ${kind}`, role: 'img', 'aria-label': PIP_NAMES[kind], title: PIP_NAMES[kind], svg: `<svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">${PIPS[kind]}</svg>` });

// ---------------------------------------------------------------- state
const disk = {
  read() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } },
  write(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private window: carry on in memory */ } },
};
const saved = disk.read();
const S = {
  start: weekStart(new Date()), week: null, ticks: new Set(), rev: 0,
  style: saved.style || 'usual', view: 'week', filter: 'all', q: '', pickDay: null, why: '', open: new Set(), cloud: false,
};

function seedFor(start) { return Number(start.replace(/-/g, '')); }
function loadWeek(start) {
  S.start = start;
  const rec = (saved.weeks || {})[start];
  if (rec) {
    S.week = { ...emptyWeek(start), ...rec.week, start };
    S.ticks = new Set(rec.ticks || []); S.rev = rec.rev || 0; S.why = '';
  } else {
    const dealt = E.deal(emptyWeek(start), 'usual', mulberry32(seedFor(start)));
    S.week = dealt.week; S.ticks = new Set(); S.rev = 0;
    S.why = 'Dealt to get you started. ' + dealt.why;
  }
}
function persist() {
  saved.weeks = saved.weeks || {};
  saved.weeks[S.start] = { week: S.week, ticks: [...S.ticks], rev: S.rev };
  const keep = Object.keys(saved.weeks).sort().slice(-8);
  for (const k of Object.keys(saved.weeks)) if (!keep.includes(k)) delete saved.weeks[k];
  saved.style = S.style;
  disk.write(saved);
}
function commit(week, why) {
  S.week = week;
  if (why !== undefined) S.why = why;
  touched();
  renderAll();
}
function touched() { S.rev = Date.now(); persist(); pushCloud(); }

// ---------------------------------------------------------------- shared across devices (artifact database)
let db = null, unsub = null, writing = false, dirty = false, lastRev = 0, timer = 0;
async function initCloud() {
  if (!window.claude || typeof window.claude.use !== 'function') return;
  try { db = await window.claude.use('db'); } catch { db = null; }
  if (db) subscribe();
}
function subscribe() {
  if (unsub) unsub();
  if (!db) return;
  const start = S.start;
  try {
    unsub = db.doc('weeks/' + start).onSnapshot((snap) => {
      if (start !== S.start) return;
      S.cloud = true; renderFoot();
      if (!snap.exists || snap.metadata.hasPendingWrites) return;
      const d = snap.data();
      if ((d.tab === TAB && d.rev === lastRev) || (d.rev || 0) <= S.rev) return;
      S.week = { ...emptyWeek(start), days: d.days, extras: d.extras || [], adds: d.adds || [], everyWeek: d.everyWeek !== false, start };
      S.ticks = new Set(d.ticks || []); S.rev = d.rev; S.why = '';
      persist(); renderAll();
    }, () => { db = null; S.cloud = false; renderFoot(); });
  } catch { db = null; }
}
function pushCloud() {
  if (!db) return;
  dirty = true; clearTimeout(timer); timer = setTimeout(flush, 700);
}
async function flush() {
  if (writing || !dirty || !db) return;
  writing = true; dirty = false;
  const body = { days: S.week.days, extras: S.week.extras, adds: S.week.adds, everyWeek: S.week.everyWeek, ticks: [...S.ticks], rev: S.rev, tab: TAB };
  lastRev = body.rev;
  try { await db.doc('weeks/' + S.start).set(body); } catch (e) {
    if (e && e.code !== 'unavailable') { db = null; S.cloud = false; renderFoot(); } // a viewer who may not write keeps a private copy
  }
  writing = false;
  if (dirty) flush();
}

// ---------------------------------------------------------------- derived
let SHOP, INS, STATS, COLOR;
function derive() {
  SHOP = E.shop(S.week); INS = E.insights(S.week, SHOP); STATS = E.stats(S.week, SHOP);
  COLOR = new Map(INS.shared.map((l, i) => [l.g, `var(--t${Math.min(i, 7)})`]));
}
const toBuy = () => SHOP.lines.filter((l) => l.tier !== 'cupboard');
const dayOf = (id) => S.week.days.findIndex((s) => s.r === id && !s.second);

// ---------------------------------------------------------------- deck
function matches(id) {
  const r = R[id];
  if (S.filter === 'extras' ? r.k === 'dinner' : S.filter !== 'all' && (r.k !== 'dinner' || r.pr !== S.filter)) return false;
  if (!S.q) return true;
  const q = S.q.toLowerCase();
  return r.n.toLowerCase().includes(q) || (r.tg || []).some((t) => t.includes(q)) || r.i.some((ing) => G[ing.g].n.toLowerCase().includes(q));
}
function renderDeck() {
  const list = $('cards');
  const ids = E.recipeIds.filter(matches);
  $('pick-banner').hidden = S.pickDay == null;
  if (S.pickDay != null) $('pick-text').textContent = `Choosing ${DAY_NAMES[S.pickDay]}'s dinner. Pick a card.`;
  list.replaceChildren(...ids.map((id) => {
    const r = R[id], at = dayOf(id), extra = S.week.extras.includes(id);
    const tags = [];
    if (at !== -1) tags.push(h('span', { class: 'tag on', text: DAY_SHORT[at] }));
    else if (extra) tags.push(h('span', { class: 'tag on', text: 'extra' }));
    if (r.k !== 'dinner') tags.push(h('span', { class: 'tag', text: KIND_LABEL[r.k] }));
    if (E.needs[id]) tags.push(h('span', { class: 'tag', text: 'leftovers' }));
    if (r.b) tags.push(h('span', { class: 'tag', text: `×${r.b}` }));
    return h('li', null, h('button', {
      class: 'pcard' + (at !== -1 || extra ? ' used' : ''), type: 'button', 'data-drag': 'deck', 'data-id': id,
      onclick: () => (S.pickDay != null ? place(id, S.pickDay) : openRecipe(id)),
    }, pip(r.pr), h('span', { class: 'nm', text: r.n }), h('span', { class: 'tags' }, tags)));
  }));
  if (!ids.length) list.append(h('li', { class: 'empty', text: `Nothing in the deck matches "${S.q}".` }));
  for (const b of document.querySelectorAll('#filters .chip')) b.setAttribute('aria-pressed', String(b.dataset.f === S.filter));
}
function place(id, day) {
  const kind = R[id].k;
  S.pickDay = null;
  commit(E.move(S.week, { deck: id }, { day }), '');
  if (kind !== 'dinner' && kind !== 'side') toast(`${R[id].n} is not a dinner, so it went to this week's extras.`);
  if (isPhone()) setView('week');
}

// ---------------------------------------------------------------- week
function metaFor(slot, day) {
  const r = R[slot.r], bits = [];
  if (slot.second) return [h('span', { text: 'Second night. Already cooked, nothing to buy.' })];
  const warn = INS.warnings.find((w) => w.day === day);
  if (warn) bits.push(h('span', { class: 'warn', text: warn.why === 'missing' ? `Needs leftovers from ${R[warn.needs].n.toLowerCase()}, which is not on the board.` : `Needs leftovers from ${DAY_NAMES[warn.at]}. Move it later in the week.` }));
  const chainTo = INS.chains.find((c) => c.from === day), chainFrom = INS.chains.find((c) => c.to === day);
  if (chainTo) bits.push(h('span', { text: `Cook once. Leftovers become ${DAY_NAMES[chainTo.to]}'s dinner.` }));
  if (chainFrom) bits.push(h('span', { text: `Made from ${DAY_NAMES[chainFrom.from]}'s leftovers.` }));
  if (!bits.length) {
    const n = SHOP.lines.filter((l) => l.tier === 'meals' && l.parts.some((p) => p.day === day)).length;
    const parts = [`${n} to buy`];
    if (slot.d && slot.d !== r.sv) parts.push(`for ${slot.d}`);
    const habit = INS.habitNotes.find((x) => x.day === day);
    if (habit) parts.push(`${DAY_NAMES[day]} in ${habit.n} of ${habit.of} saved weeks`);
    for (const x of INS.inside.filter((x) => x.day === day)) parts.push(`${R[x.inner].n} is inside this one`);
    bits.push(h('span', { text: parts.join(' · ') }));
  }
  return bits;
}
function renderWeek() {
  $('range').textContent = rangeLabel(S.start).replace(/ \d{4}$/, '');
  $('why').textContent = S.why;
  for (const b of document.querySelectorAll('#styles button')) b.setAttribute('aria-pressed', String(b.dataset.s === S.style));
  $('days').replaceChildren(...S.week.days.map((slot, i) => {
    const date = dayDate(S.start, i).getUTCDate();
    const label = h('div', { class: 'd' }, h('b', { text: DAY_SHORT[i] }), h('span', { text: String(date) }));
    let inner;
    if (!slot.r || !R[slot.r]) {
      inner = h('div', { class: 'slot', 'data-drop-day': i }, h('button', { class: 'open', type: 'button', text: S.pickDay === i ? 'Pick a card from the deck…' : 'Drop a card here, or choose one', onclick: () => startPick(i) }));
    } else {
      const r = R[slot.r];
      const threads = slot.second ? [] : INS.shared.filter((l) => l.days.includes(i)).slice(0, 3).map((l) => h('button', {
        class: 'thread', type: 'button', style: `--tc:${COLOR.get(l.g)}`, 'data-g': l.g, text: l.name, title: `${l.name}: ${l.days.map((d) => DAY_NAMES[d]).join(', ')}`,
        onmouseenter: () => highlight(l.g, true), onmouseleave: () => highlight(l.g, false), onfocus: () => highlight(l.g, true), onblur: () => highlight(l.g, false),
        onclick: () => revealInShop(l.g),
      }));
      const tools = [];
      if (r.b && !slot.second && !INS.batches.find((b) => b.day === i && b.second !== -1)) tools.push(h('button', { class: 'tool', type: 'button', title: 'Add its second night', 'aria-label': `Add a second night of ${r.n}`, text: '×2', style: 'font-weight:700;font-size:13px', onclick: () => { const w = E.addSecondNight(S.week, i); w ? commit(w, 'One cook, two dinners. The second night adds nothing to the shop.') : toast('No free day left for a second night.'); } }));
      tools.push(h('button', { class: 'tool', type: 'button', svg: LOCK, 'aria-pressed': String(!!slot.lock), title: slot.lock ? 'Kept when you deal again' : 'Keep this when dealing again', 'aria-label': `Keep ${r.n} on ${DAY_NAMES[i]} when dealing again`, onclick: () => { const w = { ...S.week, days: S.week.days.map((s, k) => (k === i ? { ...s, lock: !s.lock } : s)) }; commit(w); } }));
      tools.push(h('button', { class: 'tool', type: 'button', text: '×', style: 'font-size:20px', title: 'Back to the deck', 'aria-label': `Take ${r.n} off ${DAY_NAMES[i]}`, onclick: () => commit(E.move(S.week, { day: i }, { deck: true }), '') }));
      inner = h('div', { class: 'slot', 'data-drop-day': i }, h('div', { class: 'dcard' + (slot.second ? ' second' : ''), 'data-drag': 'day', 'data-day': i, 'data-id': slot.r },
        pip(r.pr),
        h('button', { class: 'body', type: 'button', 'aria-label': `${DAY_NAMES[i]}: ${r.n}. Open recipe.`, onclick: () => openRecipe(slot.r, i) }, h('span', { class: 'nm', text: r.n }), h('span', { class: 'meta' }, metaFor(slot, i))),
        h('div', { class: 'threads' }, threads),
        h('div', { class: 'tools' }, tools)));
    }
    const chain = INS.chains.find((c) => c.from === i && c.to === i + 1);
    return h('li', { class: 'day', 'data-i': i }, label, inner, chain && h('div', { class: 'link', 'aria-hidden': 'true' }, h('span', { text: 'leftovers ↓' })));
  }));
  const x = $('extras');
  x.replaceChildren(h('span', { text: S.week.extras.length ? 'Also this week:' : 'Breakfasts, sides and drinks can ride along as extras.' }),
    ...S.week.extras.map((id) => h('span', { class: 'xchip' }, h('span', { text: R[id].n }), h('button', { type: 'button', text: '×', 'aria-label': `Remove ${R[id].n} from extras`, onclick: () => commit({ ...S.week, extras: S.week.extras.filter((e) => e !== id) }) }))));
  renderNotes();
}
function renderNotes() {
  const out = [];
  const b = (t) => h('b', { text: t });
  for (const c of INS.chains) out.push(h('li', { class: 'note chain' }, b('Leftover chain. '), `${DAY_NAMES[c.from]}'s ${R[c.source].n.toLowerCase()} becomes ${DAY_NAMES[c.to]}'s lasagne. One cook, two dinners, and the pork for the lasagne is not on the list.`));
  for (const w of INS.warnings) out.push(h('li', { class: 'note chain' }, b(`${R[w.r].n} has nothing to be made from. `), w.why === 'missing' ? 'Put ' : 'Move it after ', h('button', { type: 'button', text: R[w.needs].n, onclick: () => openRecipe(w.needs) }), w.why === 'missing' ? ' on an earlier day.' : '.'));
  if (INS.shared.length) {
    const top = INS.shared.slice(0, 5).map((l) => `${l.name.toLowerCase()} (${l.days.length} meals)`).join(', ');
    out.push(h('li', { class: 'note' }, b(`${INS.shared.length} ${INS.shared.length === 1 ? 'thing does' : 'things do'} double duty. `), `${top}${INS.shared.length > 5 ? ' and more' : ''}. Bought once, the shop is ${STATS.saved} ${STATS.saved === 1 ? 'line' : 'lines'} shorter.`));
  }
  for (const l of INS.loose.slice(0, 3)) {
    const left = `${formatQty(l.left, l.unit)} of ${l.name.toLowerCase()}`;
    const uses = l.uses.slice(0, 2);
    out.push(h('li', { class: 'note' }, b('Loose end. '), `You will have ${left} left over.`, uses.length ? [' ', ...uses.flatMap((id, k) => [k ? ' or ' : '', h('button', { type: 'button', text: R[id].n, onclick: () => openRecipe(id) })]), ' would use it up.'] : ' Nothing else in the deck uses it.'));
  }
  for (const bt of INS.batches.filter((x) => x.second === -1)) out.push(h('li', { class: 'note' }, b('Batch cook. '), `${R[bt.r].n} makes two nights. `, h('button', { type: 'button', text: 'Add the second night', onclick: () => { const w = E.addSecondNight(S.week, bt.day); w ? commit(w, 'One cook, two dinners.') : toast('No free day left for a second night.'); } }), '. It costs nothing at the shop.'));
  for (const x of INS.inside) out.push(h('li', { class: 'note' }, b('A recipe inside a recipe. '), `${R[x.r].n} contains all of `, h('button', { type: 'button', text: R[x.inner].n, onclick: () => openRecipe(x.inner) }), '.'));
  if (INS.flagged.length) out.push(h('li', { class: 'note' }, b(`${INS.flagged.length} ${INS.flagged.length === 1 ? 'quantity' : 'quantities'} in Iris look wrong. `), INS.flagged.slice(0, 2).map((l) => `${l.odd[0]} of ${l.name.toLowerCase()}`).join('; ') + '. They are left out of the totals and marked on the list.'));
  const empties = S.week.days.filter((s) => !s.r).length;
  if (empties === 7) out.push(h('li', { class: 'note' }, 'An empty table. Drag cards over from the deck, or press Deal me a week.'));
  $('notes').replaceChildren(out.length ? h('h3', { text: 'What this week knows' }) : '', ...out);
}
function startPick(i) {
  S.pickDay = S.pickDay === i ? null : i;
  renderDeck(); renderWeek();
  if (S.pickDay != null) { if (isPhone()) setView('deck'); else $('search').focus(); }
}
function highlight(g, on) {
  for (const el of document.querySelectorAll(`[data-g="${g}"]`)) (el.closest('.dcard') || el.closest('.item') || el).classList.toggle('hl', on);
}
function revealInShop(g) {
  if (isPhone()) setView('shop');
  S.open.add(g); renderShop();
  const el = document.querySelector(`.item[data-g="${g}"]`);
  if (el) { el.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' }); el.classList.add('hl'); setTimeout(() => el.classList.remove('hl'), 1600); }
}

// ---------------------------------------------------------------- shop
let shownCount = null;
function tween(el, to) {
  const from = shownCount == null ? to : shownCount; shownCount = to;
  if (from === to || reduceMotion) { el.textContent = String(to); return; }
  const t0 = performance.now();
  const step = (t) => { const p = Math.min(1, (t - t0) / 380); el.textContent = String(Math.round(from + (to - from) * p)); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function itemRow(l) {
  const done = S.ticks.has(l.g), open = S.open.has(l.g), id = 'tick-' + l.g;
  const badges = [];
  if (l.days.length >= 2) badges.push(h('span', { class: 'badge share', style: `--tc:${COLOR.get(l.g) || 'var(--rust)'}`, text: `${l.days.length} meals` }));
  if (l.weekly) badges.push(h('span', { class: 'badge weekly', text: 'every week' }));
  if (l.optional) badges.push(h('span', { class: 'badge weekly', text: 'optional' }));
  if (l.odd.length) badges.push(h('span', { class: 'badge odd', text: 'check amount', title: l.odd.join('; ') }));
  const from = [];
  for (const p of l.parts) from.push(`${p.label}${p.q != null ? ' ' + formatQty(p.q, p.unit) : ''}${p.opt ? ' (optional)' : ''}`);
  if (l.weekly) from.push('every week' + (l.weekly.q != null ? ' ' + formatQty(l.weekly.q, l.weekly.unit) : '') + (l.weekly.note ? `, ${l.weekly.note}` : ''));
  if (l.added) from.push(`added by hand ×${l.added.q}`);
  const detail = h('div', { class: 'detail', hidden: !open },
    l.product && h('span', { class: 'product', text: l.product }),
    h('span', { class: 'from', text: [...from, ...l.notes, ...l.odd.map((o) => `Iris: ${o}, which looks wrong`)].join(' · ') }));
  return h('li', { class: 'item' + (done ? ' done' : '') + (open ? ' open' : ''), 'data-g': l.g },
    h('div', { class: 'main' },
      h('input', { type: 'checkbox', id, checked: done, 'aria-label': `${l.name}${l.qty ? ', ' + l.qty : ''}`, onchange: (e) => { e.target.checked ? S.ticks.add(l.g) : S.ticks.delete(l.g); touched(); renderShop(); renderTabs(); } }),
      h('button', { class: 'more', type: 'button', 'aria-expanded': String(open), onclick: () => { open ? S.open.delete(l.g) : S.open.add(l.g); renderShop(); } }, h('span', { class: 'nm', text: l.name }), badges),
      h('span', { class: 'qty', text: l.qty }),
      l.added && h('button', { class: 'x', type: 'button', text: '×', 'aria-label': `Remove ${l.name} that you added`, onclick: () => commit({ ...S.week, adds: S.week.adds.filter((a) => a.g !== l.g) }) })),
    detail);
}
function renderShop() {
  const buy = toBuy(), got = buy.filter((l) => S.ticks.has(l.g)).length;
  tween($('n-items'), buy.length);
  $('n-aisles').textContent = String(STATS.aisles);
  $('n-saved').hidden = STATS.saved < 1;
  $('n-saved').textContent = ` · sharing saves ${STATS.saved}`;
  $('progress').style.width = buy.length ? `${(got / buy.length) * 100}%` : '0';
  $('n-got').textContent = got ? `${got} of ${buy.length} in the trolley` : 'in the order you walk the store';
  $('every-week').checked = S.week.everyWeek;
  const sections = [];
  DECK.aisles.forEach((name, a) => {
    const lines = buy.filter((l) => l.aisle === a);
    if (!lines.length) return;
    lines.sort((x, y) => S.ticks.has(x.g) - S.ticks.has(y.g) || x.name.localeCompare(y.name));
    const left = lines.filter((l) => !S.ticks.has(l.g)).length;
    sections.push(h('section', { class: 'aisle' }, h('div', { class: 'aisle-h' }, h('h3', { style: 'font:inherit', text: name }), h('span', { text: left ? `${left} to get` : 'done' })), h('ul', { class: 'items' }, lines.map(itemRow))));
  });
  if (!buy.length) sections.push(h('p', { class: 'empty', text: 'Nothing to buy yet. Put a dinner on the table and the list writes itself.' }));
  const cup = SHOP.lines.filter((l) => l.tier === 'cupboard');
  if (cup.length) sections.push(h('details', { class: 'cupboard', open: saved.cupOpen || null, ontoggle: (e) => { saved.cupOpen = e.target.open; disk.write(saved); } }, h('summary', { text: `Check the cupboard (${cup.length}): ${cup.slice(0, 4).map((l) => l.name.toLowerCase()).join(', ')}${cup.length > 4 ? '…' : ''}` }), h('ul', { class: 'items' }, cup.map(itemRow))));
  for (const f of SHOP.fromFridge.filter((x) => !x.made && !x.from)) sections.push(h('p', { class: 'fine', style: 'margin:12px 0 0', text: `${R[f.r].n} also wants ${f.name.toLowerCase()}. Iris does not say which recipe makes it, so it is not on the list.` }));
  $('list').replaceChildren(...sections);
}
function renderFoot() {
  $('sync').textContent = `${S.cloud ? 'This week is shared with everyone who can open this page.' : 'This week is saved on this device.'} Recipes read from Iris on ${readDate()}.`;
}
function renderTabs() {
  const buy = toBuy(), left = buy.filter((l) => !S.ticks.has(l.g)).length;
  $('tab-week-n').textContent = `${S.week.days.filter((s) => s.r).length} of 7`;
  $('tab-deck-n').textContent = `${E.recipeIds.length} cards`;
  $('tab-shop-n').textContent = `${left} to get`;
  for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-current', String(b.dataset.v === S.view));
}
let wake = null;
function setView(v) {
  S.view = v; $('app').dataset.view = v; renderTabs();
  if (v === 'shop' && isPhone() && navigator.wakeLock) navigator.wakeLock.request('screen').then((w) => { wake = w; }).catch(() => {});
  else if (wake) { wake.release().catch(() => {}); wake = null; }
}
function renderAll() { derive(); renderDeck(); renderWeek(); renderShop(); renderFoot(); renderTabs(); }

// add anything from the grocery catalogue
const catalogue = Object.keys(G).filter((g) => !G[g].l).sort((a, b) => G[a].n.localeCompare(G[b].n));
let sugCur = 0, sugIds = [];
function renderSuggest() {
  const q = $('add').value.trim().toLowerCase(), box = $('suggest');
  sugIds = q ? catalogue.filter((g) => G[g].n.toLowerCase().includes(q)).sort((a, b) => G[a].n.toLowerCase().indexOf(q) - G[b].n.toLowerCase().indexOf(q)).slice(0, 8) : [];
  sugCur = Math.min(sugCur, Math.max(0, sugIds.length - 1));
  box.hidden = !q;
  box.replaceChildren(...sugIds.map((g, i) => h('li', null, h('button', { type: 'button', class: i === sugCur ? 'cur' : '', onclick: () => addItem(g) }, h('span', { text: G[g].n }), h('small', { text: DECK.aisles[G[g].a] })))));
  if (q && !sugIds.length) box.append(h('li', { class: 'empty', style: 'padding:10px', text: `"${$('add').value.trim()}" is not one of the ${catalogue.length} groceries in Iris.` }));
}
function addItem(g) {
  const adds = S.week.adds.map((a) => ({ ...a }));
  const hit = adds.find((a) => a.g === g);
  hit ? hit.q++ : adds.push({ g, q: 1 });
  $('add').value = ''; sugCur = 0; renderSuggest();
  commit({ ...S.week, adds });
  toast(`${G[g].n} added under ${DECK.aisles[G[g].a]}.`);
}

// ---------------------------------------------------------------- recipe sheet
const sheet = $('sheet');
function openSheet(nodes) { $('sheet-inner').replaceChildren(...nodes); if (!sheet.open) (sheet.showModal ? sheet.showModal() : sheet.setAttribute('open', '')); }
function closeSheet() { sheet.open && sheet.close ? sheet.close() : sheet.removeAttribute('open'); }
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((part) => (part.startsWith('**') ? h('strong', { text: part.slice(2, -2) }) : part));
}
function openRecipe(id, dayHint) {
  const r = R[id];
  const at = dayHint != null ? dayHint : dayOf(id);
  const slot = at !== -1 ? S.week.days[at] : null;
  const rows = [];
  let sec = null;
  for (const ing of r.i) {
    if ((ing.h || '') !== (sec || '')) { sec = ing.h || ''; if (sec) rows.push(h('li', { class: 'sec', text: sec })); }
    const g = G[ing.g], unit = E.unitOf(ing);
    const extra = [ing.t, ing.o && 'optional', ing.alt && `or ${G[ing.alt].n.toLowerCase()}`, ing.odd && 'this amount looks wrong in Iris'].filter(Boolean).join(', ');
    rows.push(h('li', { class: 'q', text: ing.q != null ? formatQty(ing.q, unit) : '' }), h('li', { class: 'n' }, g.n, extra && h('small', { text: ` (${extra})` })));
  }
  for (const x of r.x || []) rows.push(h('li', { class: 'q' }), h('li', { class: 'n', text: x }));
  const steps = [], paras = [], after = [];
  for (const line of (r.m || '').split('\n').map((s) => s.trim()).filter(Boolean)) {
    const m = /^\d+\.\s+(.*)$/.exec(line);
    if (m) steps.push(h('li', null, inline(m[1])));
    else if (line.startsWith('#')) after.push(h('h3', { text: line.replace(/^#+\s*/, '') }));
    else if (line.startsWith('- ')) after.push(h('p', null, '• ', inline(line.slice(2))));
    else (steps.length ? after : paras).push(h('p', null, inline(line)));
  }
  const facts = [`Serves ${r.sv}`, PIP_NAMES[r.pr].toLowerCase(), ...(r.tg || []), r.k !== 'dinner' && KIND_LABEL[r.k], E.planned[id] && `in ${E.planned[id]} of ${DECK.plans.length} saved weeks`].filter(Boolean).join(' · ');
  const isDinner = r.k === 'dinner' || r.k === 'side';
  const puton = isDinner ? h('div', { class: 'puton', role: 'group', 'aria-label': 'Put on a day' }, DAY_SHORT.map((d, i) => h('button', {
    type: 'button', class: i === at ? 'here' : '', text: d, 'aria-label': `Put on ${DAY_NAMES[i]}`, 'aria-pressed': String(i === at),
    onclick: () => { const w = at !== -1 ? E.move(S.week, { day: at }, { day: i }) : E.move(S.week, { deck: id }, { day: i }); S.pickDay = null; closeSheet(); commit(w, ''); toast(`${r.n} is on ${DAY_NAMES[i]}.`); },
  }))) : h('div', { class: 'puton' }, h('button', { type: 'button', text: S.week.extras.includes(id) ? 'In this week’s extras' : 'Add to this week’s extras', onclick: () => { closeSheet(); commit(E.move(S.week, { deck: id }, { extras: true })); toast(`${r.n} added to extras.`); } }));
  const body = [
    r.d && h('p', { text: r.d }),
    h('p', { class: 'fine', text: facts }),
    h('div', null, h('h3', { text: isDinner ? 'Put it on' : 'This week' }), h('div', { style: 'margin-top:6px' }, puton)),
    slot && !slot.second && h('div', null, h('h3', { text: 'Eating' }), h('div', { class: 'stepper', style: 'margin-top:6px' },
      h('button', { type: 'button', text: '−', 'aria-label': 'One fewer', onclick: () => setDiners(at, -1, id) }),
      h('output', { id: 'diners', text: String(slot.d || r.sv) }),
      h('button', { type: 'button', text: '+', 'aria-label': 'One more', onclick: () => setDiners(at, 1, id) }),
      h('span', { class: 'fine', text: `The recipe serves ${r.sv}. The shop scales to match.` }))),
    h('div', null, h('h3', { text: 'Ingredients' }), h('ul', { class: 'ing' }, rows)),
    (steps.length || paras.length) ? [h('div', null, h('h3', { text: 'Method' }), paras, steps.length ? h('ol', { class: 'method' }, steps) : null), after.length ? h('div', { class: 'after' }, after) : null] : h('p', { class: 'fine', text: 'No method is written down in Iris for this one.' }),
  ];
  openSheet([
    h('div', { class: 'sheet-head' }, pip(r.pr), h('h2', { text: r.n, id: 'sheet-title' }), h('button', { class: 'close', type: 'button', text: '×', 'aria-label': 'Close', onclick: closeSheet })),
    h('div', { class: 'sheet-body' }, body),
    h('div', { class: 'sheet-foot' },
      h('a', { href: `${DECK.iris.base}/views/${id}`, target: '_blank', rel: 'noopener', text: 'Open in Iris' }),
      slot && h('button', { class: 'ghost', type: 'button', style: 'margin-left:auto', text: 'Take off the table', onclick: () => { closeSheet(); commit(E.move(S.week, { day: at }, { deck: true }), ''); } })),
  ]);
}
function setDiners(day, delta, id) {
  const slot = S.week.days[day], r = R[id];
  const d = Math.max(1, Math.min(16, (slot.d || r.sv) + delta));
  S.week = { ...S.week, days: S.week.days.map((s, k) => (k === day ? { ...s, d: d === r.sv ? null : d } : s)) };
  touched(); renderAll();
  const out = $('diners'); if (out) out.textContent = String(d);
}

// ---------------------------------------------------------------- what the deck knows
function openFacts() {
  const uses = {};
  for (const id of E.recipeIds) for (const g of new Set(R[id].i.map((i) => i.g))) if (!G[g].s) uses[g] = (uses[g] || 0) + 1;
  const top = Object.entries(uses).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const never = E.dinners.filter((id) => !E.planned[id]);
  const odd = E.recipeIds.flatMap((id) => R[id].i.filter((i) => i.odd).map((i) => ({ id, text: `${formatQty(i.q, E.unitOf(i))} of ${G[i.g].n.toLowerCase()}` })));
  const bare = E.recipeIds.filter((id) => R[id].i.every((i) => i.q == null));
  const noMethod = E.recipeIds.filter((id) => !R[id].m).length;
  const link = (id, text) => h('button', { type: 'button', class: 'linkish', text: text || R[id].n, onclick: () => openRecipe(id) });
  const list = (ids) => ids.flatMap((id, k) => [k ? ', ' : '', link(id)]);
  openSheet([
    h('div', { class: 'sheet-head' }, h('h2', { text: 'What the deck knows', id: 'sheet-title' }), h('button', { class: 'close', type: 'button', text: '×', 'aria-label': 'Close', onclick: closeSheet })),
    h('div', { class: 'sheet-body' },
      h('p', { text: `Read from Iris on ${readDate()}: ${E.recipeIds.length} recipes, ${E.dinners.length} of them dinners, drawing on ${Object.keys(uses).length} of your ${Object.keys(G).length} groceries.` }),
      h('div', null, h('h3', { text: 'What your cooking runs on' }), h('ol', { class: 'rank' }, top.map(([g, n]) => h('li', null, h('span', { text: G[g].n }), h('span', { class: 'fine', text: `${n} recipes` })))),
        h('p', { class: 'fine', text: 'Seasonings left out. A week built around the top of this list is a short shop, which is what Thrifty deals.' })),
      h('div', null, h('h3', { text: 'Habits in your saved weeks' }), h('p', null, E.habits.filter(Boolean).length ? E.habits.filter(Boolean).flatMap((x, k) => [k ? '; ' : '', link(x.r), ` on ${DAY_NAMES[x.day]} in ${x.n} of ${x.of}`]) : 'No repeats yet.', '. Three saved weeks is a small sample. The usual deal leans on it anyway.')),
      h('div', null, h('h3', { text: `Never on a saved plan (${never.length} of ${E.dinners.length} dinners)` }), h('p', null, list(never), '. Wildcard deals from these.')),
      h('div', null, h('h3', { text: 'Worth tidying in Iris' }),
        h('p', null, `${odd.length} quantities cannot be right for their unit, usually a count typed against grams. They are left out of shop totals: `, odd.flatMap((o, k) => [k ? '; ' : '', link(o.id), ` (${o.text})`]), '.'),
        h('p', null, `${bare.length} recipes list ingredients with no amounts at all: `, list(bare), '. The shop shows those lines without a quantity.'),
        h('p', { class: 'fine', text: `${noMethod} recipes have no method written down. Iris's own shopping-list aggregation skips lines without a quantity and amounts typed as text like 1/2; this page keeps them.` }))),
  ]);
}
const readDate = () => new Date(DECK.read + 'T00:00:00Z').toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// ---------------------------------------------------------------- copy, share, save to Iris
async function copy(text, okMessage) {
  try { await navigator.clipboard.writeText(text); toast(okMessage); return true; } catch { return false; }
}
function copyList() {
  const lines = [`Shopping, ${rangeLabel(S.start)}`];
  DECK.aisles.forEach((name, a) => {
    const ls = toBuy().filter((l) => l.aisle === a && !S.ticks.has(l.g));
    if (ls.length) lines.push('', name.toUpperCase(), ...ls.map((l) => `- ${l.name}${l.qty ? ' ' + l.qty : ''}`));
  });
  const text = lines.join('\n');
  copy(text, 'List copied.').then((ok) => { if (!ok) showText('Copy the list', text); });
}
function showText(title, text, note) {
  const ta = h('textarea', { class: 'copy', readonly: true, id: 'copy-text', 'aria-label': title });
  ta.value = text;
  openSheet([
    h('div', { class: 'sheet-head' }, h('h2', { text: title }), h('button', { class: 'close', type: 'button', text: '×', 'aria-label': 'Close', onclick: closeSheet })),
    h('div', { class: 'sheet-body' }, note && h('p', { text: note }), ta),
  ]);
  ta.focus(); ta.select();
}
function shareWeek() {
  const code = E.encode(S.week);
  try { history.replaceState(null, '', '#' + code); } catch { location.hash = code; }
  if (window.claude) toast('This week is now in the page link. Use Share, then Copy link.');
  else copy(location.href, 'Link to this week copied.').then((ok) => { if (!ok) showText('Link to this week', location.href); });
}

const FIX = {
  server_not_connected: 'Iris is not connected for you. Add it in claude.ai under Settings, Connectors, then try again.',
  needs_reauth: 'Your Iris sign-in has lapsed. Reconnect Iris in claude.ai under Settings, Connectors, then try again.',
  selection_required: 'You have more than one Iris connector. Choose one in claude.ai when asked, then try again.',
  not_in_manifest: 'Iris is switched off for this page. Allow it in this page’s Permissions menu, then try again.',
  consent_required: 'Iris has not been allowed for this page. Press the button again and choose Allow.',
  approval_required: 'Writing to Iris needs your approval. Press the button again and choose Allow.',
  blocked_by_policy: 'Your organisation does not allow this page to write to Iris.',
  not_granted: 'This view cannot reach Iris.', capability_disabled: 'This view cannot reach Iris.',
};
function irisError(e, wrote) {
  const code = e && e.code;
  if (code === 'tool_error' && /auth|sign.?in|401|unauthor/i.test(e.message || '')) return 'Iris wants you signed in before it will save. In claude.ai go to Settings, Connectors, Iris and press Connect, then try again.';
  if (code === 'tool_error') return `Iris refused: ${String(e.message || '').slice(0, 200)}`;
  if (FIX[code]) return FIX[code];
  return wrote || code === 'server_unavailable' || code === 'upstream_error'
    ? 'Iris did not answer in time. Something may have been written. Check Iris before trying again.'
    : 'Could not reach Iris just now. Nothing was written.';
}
async function openSave() {
  const out = E.toIris(S.week, S.ticks);
  const empty = S.week.days.every((s) => !s.r);
  let mcp = null;
  try { mcp = window.claude && window.claude.use ? await Promise.race([window.claude.use('mcp'), new Promise((r) => setTimeout(() => r(null), 4000))]) : null; } catch { mcp = null; }
  const status = h('div', { id: 'save-status', role: 'status', hidden: true });
  const goBtn = h('button', { class: 'go', type: 'button', style: 'flex:0 1 auto;padding:0 18px', text: 'Write both to Iris', disabled: empty || !mcp || null });
  const say = (text, ok) => { status.hidden = false; status.className = 'status' + (ok ? ' ok' : ''); status.replaceChildren(...(Array.isArray(text) ? text : [text])); };
  goBtn.addEventListener('click', async () => {
    goBtn.disabled = true; say('Writing to Iris…', true);
    let wrote = false;
    try {
      const made = [];
      for (const job of [
        { set: DECK.iris.mealPlansSet, name: out.planName, description: out.planDescription, md: out.planMarkdown },
        { set: DECK.iris.shoppingListsSet, name: out.listName, description: out.listDescription, md: out.listMarkdown },
      ]) {
        const tree = (await mcp.callTool(IRIS, 'package_hierarchy', { set_id: job.set }, { cache: false })).payload;
        const nodes = Array.isArray(tree) ? tree : (tree && (tree.result || tree.packages)) || [];
        let pkg = nodes.find((n) => n && n.name === out.packageName);
        if (!pkg) { pkg = (await mcp.callTool(IRIS, 'create_package', { name: out.packageName, set_id: job.set })).payload; wrote = true; }
        const res = (await mcp.callTool(IRIS, 'create_diagram', { set_id: job.set, name: job.name, description: job.description, diagram_type: 'smart_markdown', notation: 'markdown', parent_package_id: pkg && pkg.id, data: { markdown_source: job.md } })).payload;
        wrote = true;
        if (res && res.error) throw { code: 'tool_error', message: String(res.message || res.error) };
        made.push({ name: job.name, url: res && res.web_url });
      }
      say(['Saved. ', ...made.flatMap((m, i) => [i ? ' and ' : '', m.url ? h('a', { href: m.url, target: '_blank', rel: 'noopener', text: m.name }) : m.name]), ' are in Iris.'], true);
      toast('Saved to Iris.');
    } catch (e) { say(irisError(e, wrote), false); goBtn.disabled = false; }
  });
  openSheet([
    h('div', { class: 'sheet-head' }, h('h2', { text: 'Save this week to Iris' }), h('button', { class: 'close', type: 'button', text: '×', 'aria-label': 'Close', onclick: closeSheet })),
    h('div', { class: 'sheet-body' },
      h('p', { text: empty ? 'There is nothing on the table to save yet.' : 'Two new things will be written. Nothing existing is changed.' }),
      h('ul', { class: 'dest' },
        h('li', null, h('b', { text: out.planName }), h('small', { text: `A meal plan in Weekly meal plans, package ${out.packageName}. Same shape as your saved plans, so Iris can still add it up.` })),
        h('li', null, h('b', { text: out.listName }), h('small', { text: `A checklist in Shopping lists, package ${out.packageName}. ${toBuy().length} items in store order, ticks included.` }))),
      !mcp && h('p', { class: 'status', text: window.claude ? 'This view cannot reach your Iris connector. Copy the markdown instead and paste it into a new Iris document.' : 'Saving straight to Iris works when this page is opened in Claude, where it can use your Iris connector. Here you can copy the markdown and paste it into Iris.' }),
      status),
    h('div', { class: 'sheet-foot' }, goBtn,
      h('button', { class: 'ghost', type: 'button', text: 'Copy the plan', onclick: () => copy(out.planMarkdown, 'Meal plan markdown copied.').then((ok) => { if (!ok) showText(out.planName, out.planMarkdown); }) }),
      h('button', { class: 'ghost', type: 'button', text: 'Copy the list', onclick: () => copy(out.listMarkdown, 'Shopping list markdown copied.').then((ok) => { if (!ok) showText(out.listName, out.listMarkdown); }) })),
  ]);
}

// ---------------------------------------------------------------- dealing
function dealNow() {
  const before = S.week.days.map((s) => s.r + (s.second ? '2' : ''));
  const { week, why } = E.deal(S.week, S.style);
  S.pickDay = null;
  commit(week, why);
  if (reduceMotion) return;
  const from = $('deal').getBoundingClientRect();
  document.querySelectorAll('#days .day').forEach((li, i) => {
    const card = li.querySelector('.dcard');
    if (!card || before[i] === week.days[i].r + (week.days[i].second ? '2' : '')) return;
    const to = card.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2), dy = from.top + from.height / 2 - (to.top + to.height / 2);
    card.animate([
      { transform: `translate(${dx}px, ${dy}px) rotate(${i % 2 ? 9 : -9}deg) scale(.35)`, opacity: 0 },
      { opacity: 1, offset: 0.25 },
      { transform: 'none', opacity: 1 },
    ], { duration: 460, delay: i * 75, easing: 'cubic-bezier(.2,.9,.25,1.05)', fill: 'backwards' });
  });
}

// ---------------------------------------------------------------- drag (mouse and pen; touch uses taps)
let drag = null, swallowClick = false;
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' || e.button !== 0) return;
  const src = e.target.closest('[data-drag]');
  if (!src || e.target.closest('.tools, .threads')) return;
  drag = { src, x: e.clientX, y: e.clientY, ghost: null, over: null };
});
document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.ghost) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    const rect = drag.src.getBoundingClientRect();
    const g = drag.src.cloneNode(true);
    g.classList.add('ghostcard'); g.style.width = Math.min(rect.width, 340) + 'px';
    drag.dx = Math.min(e.clientX - rect.left, 300); drag.dy = e.clientY - rect.top;
    document.body.append(g); document.body.classList.add('dragging');
    drag.ghost = g; drag.src.style.opacity = '.35';
  }
  drag.ghost.style.left = e.clientX - drag.dx + 'px'; drag.ghost.style.top = e.clientY - drag.dy + 'px';
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const target = el && (el.closest('[data-drop-day]') || el.closest('#extras') || (drag.src.dataset.drag === 'day' && el.closest('.deck')));
  if (target !== drag.over) { drag.over && drag.over.classList.remove('over'); target && target.classList.add('over'); drag.over = target || null; }
});
function endDrag(cancel) {
  if (!drag) return;
  const d = drag; drag = null;
  if (!d.ghost) return;
  d.ghost.remove(); d.src.style.opacity = ''; document.body.classList.remove('dragging');
  d.over && d.over.classList.remove('over');
  swallowClick = true; setTimeout(() => { swallowClick = false; }, 0);
  if (cancel || !d.over) return;
  const id = d.src.dataset.id, fromDay = d.src.dataset.drag === 'day' ? Number(d.src.dataset.day) : null;
  if (d.over.dataset.dropDay != null) {
    const to = Number(d.over.dataset.dropDay);
    if (fromDay != null) commit(E.move(S.week, { day: fromDay }, { day: to }), '');
    else place(id, to);
  } else if (d.over.id === 'extras' && fromDay == null) commit(E.move(S.week, { deck: id }, { extras: true }));
  else if (fromDay != null) commit(E.move(S.week, { day: fromDay }, { deck: true }), '');
}
document.addEventListener('pointerup', () => endDrag(false));
document.addEventListener('pointercancel', () => endDrag(true));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { endDrag(true); if (S.pickDay != null) { S.pickDay = null; renderDeck(); renderWeek(); } } });
document.addEventListener('click', (e) => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); } }, true);

// ---------------------------------------------------------------- toast
let toastTimer = 0;
function toast(text) {
  const t = $('toast'); t.textContent = text; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------------------------------------------------------------- wiring
$('search').addEventListener('input', (e) => { S.q = e.target.value.trim(); renderDeck(); });
$('filters').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) { S.filter = b.dataset.f; renderDeck(); } });
$('pick-cancel').addEventListener('click', () => { S.pickDay = null; renderDeck(); renderWeek(); if (isPhone()) setView('week'); });
$('styles').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { S.style = b.dataset.s; persist(); renderWeek(); } });
$('deal').addEventListener('click', dealNow);
$('facts').addEventListener('click', openFacts);
$('clear').addEventListener('click', () => commit({ ...emptyWeek(S.start), adds: S.week.adds, everyWeek: S.week.everyWeek }, 'Table cleared.'));
function shiftWeek(by) { const d = dayDate(S.start, by * 7); loadWeek(d.toISOString().slice(0, 10)); shownCount = null; subscribe(); renderAll(); }
$('prev').addEventListener('click', () => shiftWeek(-1));
$('next').addEventListener('click', () => shiftWeek(1));
$('every-week').addEventListener('change', (e) => commit({ ...S.week, everyWeek: e.target.checked }));
$('add').addEventListener('input', () => { sugCur = 0; renderSuggest(); });
$('add').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { sugCur = Math.min(sugCur + 1, sugIds.length - 1); renderSuggest(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { sugCur = Math.max(sugCur - 1, 0); renderSuggest(); e.preventDefault(); }
  else if (e.key === 'Enter' && sugIds[sugCur]) { addItem(sugIds[sugCur]); e.preventDefault(); }
  else if (e.key === 'Escape') { e.target.value = ''; renderSuggest(); }
});
$('add').addEventListener('blur', () => setTimeout(() => { if (document.activeElement && document.activeElement.closest('#suggest')) return; $('suggest').hidden = true; }, 150));
$('add').addEventListener('focus', renderSuggest);
$('save').addEventListener('click', openSave);
$('copy').addEventListener('click', copyList);
$('share').addEventListener('click', shareWeek);
$('untick').addEventListener('click', () => { S.ticks.clear(); touched(); renderShop(); renderTabs(); });
for (const b of document.querySelectorAll('.tabs button')) b.addEventListener('click', () => setView(b.dataset.v));
sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });

loadWeek(S.start);
const fromLink = E.decode(location.hash.slice(1), S.week);
if (fromLink) { S.week = fromLink; S.why = 'This week came from the link.'; S.ticks = new Set(); S.rev = Date.now(); persist(); }
$('deck-sub').textContent = `${E.recipeIds.length} recipes · ${Object.keys(G).length} groceries · ${DECK.aisles.length} aisles`;
renderAll();
initCloud();
