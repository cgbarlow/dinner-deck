// Dinner Deck engine. Pure functions over the deck data; no DOM.
// A week is { start:'YYYY-MM-DD' (a Saturday), days:[7 x slot], extras:[recipeId], adds:[{g,q}], everyWeek:bool }
// A slot is { r: recipeId|null, d: diners|null, lock: bool, second: bool } (second = second night of a batch cook).

export const DAY_NAMES = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export const DAY_SHORT = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const COUNTABLE = new Set(['can', 'head', 'whole', 'punnet', 'bottle', 'loaf', 'packs']);
// Things bought whole: the list rounds these up, and says what is left over.
const WHOLE = new Set([...COUNTABLE, 'unit', 'cloves', 'piece', 'cube', 'bar', 'leaves', 'sticks']);
const buyQty = (q, unit) => (WHOLE.has(unit) ? Math.ceil(q - 1e-9) : q);
const PLURAL = { can: 'cans', head: 'heads', cup: 'cups', piece: 'pieces', punnet: 'punnets', bottle: 'bottles', loaf: 'loaves', bar: 'bars', slice: 'slices', cube: 'cubes', handful: 'handfuls', splash: 'splashes', sprinkle: 'sprinkles', pinch: 'pinches', pack: 'packs' };

export function emptyWeek(start) {
  return { start, days: Array.from({ length: 7 }, () => ({ r: null, d: null, lock: false, second: false })), extras: [], adds: [], everyWeek: true };
}

// The Saturday on or before `date`: the week being eaten now.
export function weekOf(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 1) % 7));
  return d.toISOString().slice(0, 10);
}

// The Saturday that starts the shopping week containing or following `date`.
export function weekStart(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

export function dayDate(start, i) {
  const d = new Date(start + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + i);
  return d;
}

export function rangeLabel(start) {
  const a = dayDate(start, 0), b = dayDate(start, 6);
  const sameMonth = a.getUTCMonth() === b.getUTCMonth();
  return `${a.getUTCDate()}${sameMonth ? '' : ' ' + MONTHS[a.getUTCMonth()]} to ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FRACTIONS = [[0.25, '¼'], [0.5, '½'], [0.75, '¾'], [1 / 3, '⅓'], [2 / 3, '⅔']];
export function formatNumber(q) {
  const whole = Math.floor(q + 1e-9), rest = q - whole;
  if (rest < 0.01) return String(whole);
  const f = FRACTIONS.find(([v]) => Math.abs(v - rest) < 0.02);
  if (f) return (whole ? whole : '') + f[1];
  return String(Math.round(q * 10) / 10);
}

export function formatQty(q, unit) {
  if (unit === 'g' && q >= 1000) return formatNumber(q / 1000) + ' kg';
  if (unit === 'ml' && q >= 1000) return formatNumber(q / 1000) + ' l';
  const n = formatNumber(q);
  if (!unit || unit === 'unit') return n;
  if (unit === 'g' || unit === 'ml' || unit === 'kg' || unit === 'tsp' || unit === 'tbsp') return `${n} ${unit}`;
  return `${n} ${q > 1 && PLURAL[unit] ? PLURAL[unit] : unit}`;
}

export function makeEngine(deck, learned = []) {
  const G = deck.groceries, R = deck.recipes;
  const recipeIds = Object.keys(R);
  const dinners = recipeIds.filter((id) => R[id].k === 'dinner');
  const unitOf = (ing) => ing.u || G[ing.g].u;
  // What a recipe needs from another night: groceries named "Leftover ..." whose source recipe is known.
  const needs = {};
  for (const id of recipeIds) {
    const from = R[id].i.map((ing) => G[ing.g].from).filter(Boolean);
    if (from.length) needs[id] = from[0];
  }
  const feeds = {};
  for (const [id, src] of Object.entries(needs)) feeds[src] = id;

  // ---- habits, from the saved plans -------------------------------------------------------
  const planned = {}, byDay = DAY_NAMES.map(() => ({}));
  const plans = [...deck.plans, ...learned];
  for (const p of plans) p.days.forEach((id, i) => {
    if (!id || !R[id]) return;
    planned[id] = (planned[id] || 0) + 1;
    byDay[i][id] = (byDay[i][id] || 0) + 1;
  });
  const habits = byDay.map((counts, day) => {
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return top && top[1] >= 2 ? { day, r: top[0], n: top[1], of: plans.length } : null;
  });

  // ---- the shop ---------------------------------------------------------------------------
  function sources(week) {
    const out = [];
    const onBoard = new Set(week.days.filter((s) => s.r && !s.second).map((s) => s.r));
    week.days.forEach((slot, day) => {
      if (!slot.r || slot.second || !R[slot.r]) return;
      const r = R[slot.r];
      out.push({ key: 'd' + day, day, r: slot.r, label: r.n, scale: (slot.d || r.sv) / r.sv });
    });
    week.extras.forEach((id, i) => R[id] && out.push({ key: 'x' + i, day: null, r: id, label: R[id].n, scale: 1 }));
    return { list: out, onBoard };
  }

  function shop(week) {
    const { list, onBoard } = sources(week);
    const lines = new Map();
    const line = (g) => {
      if (!lines.has(g)) lines.set(g, { g, name: G[g].n, aisle: G[g].a, product: G[g].p || '', parts: [], sums: {}, some: false, odd: [], days: [], notes: [] });
      return lines.get(g);
    };
    const fromFridge = [];
    for (const src of list) {
      for (const ing of R[src.r].i) {
        const g = G[ing.g];
        if (g.l) {
          const made = g.from && onBoard.has(g.from);
          fromFridge.push({ g: ing.g, name: g.n, day: src.day, r: src.r, made: !!made, from: g.from || null });
          continue;
        }
        const l = line(ing.g), unit = unitOf(ing);
        const part = { src: src.key, day: src.day, label: src.label, unit, opt: !!ing.o };
        if (ing.q != null && !ing.odd) {
          part.q = ing.q * src.scale;
          l.sums[unit] = (l.sums[unit] || 0) + part.q;
        } else {
          l.some = true;
          if (ing.odd) l.odd.push(`${src.label} says ${formatQty(ing.q, unit)}`);
        }
        if (ing.alt) l.notes.push('or ' + G[ing.alt].n.toLowerCase());
        l.parts.push(part);
        if (src.day != null && !l.days.includes(src.day)) l.days.push(src.day);
      }
    }
    for (const l of lines.values()) {
      l.tier = G[l.g].s ? 'cupboard' : 'meals';
      l.optional = l.parts.every((p) => p.opt);
    }
    if (week.everyWeek) for (const item of deck.everyWeek) {
      const existed = lines.has(item.g), l = line(item.g);
      if (!existed) l.tier = 'weekly';
      l.weekly = { q: item.q ?? null, unit: item.u || '', note: item.t || '' };
    }
    for (const add of week.adds) {
      if (!G[add.g]) continue;
      const existed = lines.has(add.g), l = line(add.g);
      if (!existed) l.tier = 'added';
      l.added = { q: add.q || 1 };
    }
    const all = [...lines.values()].sort((a, b) => a.aisle - b.aisle || a.name.localeCompare(b.name));
    for (const l of all) l.qty = qtyText(l);
    return { lines: all, fromFridge };
  }

  // What to show on the list. An every-week amount covers the same item for a meal rather than adding to it,
  // as the household's own combined lists do. Things bought whole are rounded up.
  function qtyText(l) {
    const sums = { ...l.sums };
    if (l.weekly && l.weekly.q != null) {
      const u = l.weekly.unit || (G[l.g].u === 'unit' ? 'unit' : '');
      sums[u] = u in sums ? Math.max(sums[u], l.weekly.q) : l.weekly.q;
    }
    if (l.added) { const u = G[l.g].u === 'unit' ? 'unit' : ''; sums[u] = (sums[u] || 0) + l.added.q; }
    const bits = Object.entries(sums).map(([u, q]) => (u === '' ? formatNumber(q) : formatQty(buyQty(q, u), u)));
    if (!bits.length) return '';
    return bits.join(' + ') + (l.some ? ' + some' : '');
  }

  // Part-used cans, heads and punnets: what is left over, and the ones two meals finish between them.
  function ends(mealLines) {
    const loose = [], closed = [];
    for (const l of mealLines) {
      if (l.some) continue;
      for (const [unit, q] of Object.entries(l.sums)) {
        if (!COUNTABLE.has(unit)) continue;
        const left = Math.ceil(q - 1e-9) - q;
        const parts = l.parts.filter((p) => p.unit === unit && p.q != null);
        if (left >= 0.2) loose.push({ g: l.g, name: l.name, left, unit });
        else if (parts.length >= 2 && parts.some((p) => p.q % 1 > 0.01)) closed.push({ g: l.g, name: l.name, q, unit, by: parts.map((p) => p.label) });
      }
    }
    return { loose, closed };
  }

  // ---- what the list alone hides ----------------------------------------------------------
  function insights(week, shopResult) {
    const s = shopResult || shop(week);
    const mealLines = s.lines.filter((l) => l.tier === 'meals' && l.parts.length);
    const shared = mealLines.filter((l) => l.days.length >= 2).sort((a, b) => b.days.length - a.days.length || a.name.localeCompare(b.name));
    const chains = [], warnings = [];
    week.days.forEach((slot, day) => {
      if (!slot.r || slot.second) return;
      const src = needs[slot.r];
      if (!src) return;
      const at = week.days.findIndex((x) => x.r === src && !x.second);
      if (at === -1) warnings.push({ day, r: slot.r, needs: src, why: 'missing' });
      else if (at > day) warnings.push({ day, r: slot.r, needs: src, why: 'order', at });
      else chains.push({ from: at, to: day, source: src, r: slot.r });
    });
    const batches = [];
    week.days.forEach((slot, day) => {
      if (slot.r && !slot.second && R[slot.r].b) {
        const second = week.days.findIndex((x, i) => i > day && x.second && x.r === slot.r);
        batches.push({ day, r: slot.r, second });
      }
    });
    const inside = [];
    week.days.forEach((slot, day) => {
      if (slot.r && !slot.second) for (const inner of R[slot.r].in || []) inside.push({ day, r: slot.r, inner });
    });
    const onBoard = new Set(week.days.map((x) => x.r).filter(Boolean));
    const { loose, closed } = ends(mealLines);
    for (const l of loose) l.uses = dinners.filter((id) => !onBoard.has(id) && !needs[id] && R[id].i.some((ing) => ing.g === l.g && !ing.o));
    const covered = mealLines.filter((l) => l.weekly);
    const habitNotes = [];
    week.days.forEach((slot, day) => {
      const h = habits[day];
      if (h && slot.r === h.r) habitNotes.push({ day, r: h.r, n: h.n, of: h.of, kept: true });
    });
    const flagged = s.lines.filter((l) => l.odd.length);
    return { shared, chains, warnings, batches, inside, loose, closed, covered, habitNotes, flagged, fromFridge: s.fromFridge };
  }

  function stats(week, shopResult) {
    const s = shopResult || shop(week);
    const buy = s.lines.filter((l) => l.tier !== 'cupboard');
    const meals = s.lines.filter((l) => l.tier === 'meals');
    // How many lines the meals would need if nothing were shared.
    const unshared = meals.reduce((n, l) => n + Math.max(1, new Set(l.parts.map((p) => p.src)).size), 0);
    return { items: buy.length, mealItems: meals.length, saved: unshared - meals.length, aisles: new Set(buy.map((l) => l.aisle)).size, cupboard: s.lines.length - buy.length };
  }

  // ---- the dealer -------------------------------------------------------------------------
  const STYLES = { usual: 'The usual', thrifty: 'Thrifty', wild: 'Wildcard' };

  // Every deal tries to tell one story: a leftover chain, a batch cook with its free second night, or neither.
  const STORY = { usual: [0.3, 0.2], thrifty: [0.45, 0.25], wild: [0.35, 0.25] };

  function deal(week, style = 'usual', rng = Math.random) {
    const keep = week.days.map((s) => !!(s.lock && s.r));
    week.days.forEach((s, i) => { // a kept second night keeps its cook night too
      if (!keep[i] || !s.second) return;
      const cook = week.days.findIndex((x) => x.r === s.r && !x.second);
      if (cook === -1) keep[i] = false; else keep[cook] = true;
    });
    const locked = week.days.map((s, i) => (keep[i] ? { ...s } : null));
    const taken = new Set(locked.filter(Boolean).map((s) => s.r));
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];
    const roll = rng(), odds = STORY[style] || STORY.usual;
    const story = roll < odds[0] ? 'chain' : roll < odds[0] + odds[1] ? 'batch' : 'none';
    let best = null;
    for (let t = 0; t < 120; t++) {
      const days = locked.map((s) => (s ? { ...s } : { r: null, d: null, lock: false, second: false }));
      const used = new Set(taken);
      const free = () => days.map((s, i) => (s.r ? -1 : i)).filter((i) => i >= 0);
      const weekendFirst = (spots) => { const w = spots.filter((i) => i <= 1); return w.length && rng() < 0.7 ? pick(w) : pick(spots); };
      if (story === 'chain') { // cook first, leftovers the next day
        const sources = Object.keys(feeds).filter((id) => !used.has(id) && !used.has(feeds[id]));
        const spots = free().filter((i) => i < 6 && !days[i + 1].r);
        if (sources.length && spots.length) {
          const src = pick(sources), i = weekendFirst(spots);
          days[i].r = src; days[i + 1].r = feeds[src]; used.add(src); used.add(feeds[src]);
        }
      } else if (story === 'batch') { // cook once, eat again two days on
        const batchers = dinners.filter((id) => R[id].b && !used.has(id));
        const spots = free().filter((i) => free().some((j) => j > i + 1));
        if (batchers.length && spots.length) {
          const id = pick(batchers), i = weekendFirst(spots), j = free().find((x) => x > i + 1);
          days[i].r = id; days[j] = { r: id, d: null, lock: false, second: true }; used.add(id);
        }
      }
      if (style === 'usual') for (const h of habits) {
        if (h && !days[h.day].r && !used.has(h.r) && R[h.r].k === 'dinner' && rng() < (h.n / h.of) * 0.8) { days[h.day].r = h.r; used.add(h.r); }
      }
      for (const i of free()) {
        if (days[i].r) continue;
        const count = {};
        for (const s of days) if (s.r && !s.second) count[R[s.r].pr] = (count[R[s.r].pr] || 0) + 1;
        const all = dinners.filter((id) => !used.has(id) && !needs[id]);
        const pool = all.filter((id) => (count[R[id].pr] || 0) < 2);
        const from = pool.length ? pool : all;
        if (!from.length) break;
        let id;
        if (style === 'usual') {
          const weights = from.map((p) => 1 + 2 * (planned[p] || 0) + 4 * (byDay[i][p] || 0));
          let x = rng() * weights.reduce((a, b) => a + b, 0);
          id = from.find((p, k) => (x -= weights[k]) < 0);
        } else if (style === 'wild') {
          const fresh = from.filter((p) => !planned[p]);
          id = pick(fresh.length && rng() < 0.85 ? fresh : from);
        } else id = pick(from);
        days[i].r = id || from[0]; used.add(days[i].r);
      }
      if (style === 'thrifty' && t % 20 === 0) improve(week, days);
      const candidate = { ...week, days };
      const score = scoreWeek(candidate, style) + rng() * (style === 'thrifty' ? 2.5 : 4);
      if (!best || score > best.score) best = { days, score };
    }
    const dealt = { ...week, days: best.days };
    return { week: dealt, why: explain(dealt, style) };
  }

  // Thrifty only: swap single dinners for ones that shorten the shop, until nothing helps.
  function improve(week, days) {
    const fixed = (s) => s.lock || s.second || needs[s.r] || feeds[s.r] || E_R(s.r).b;
    let now = scoreWeek({ ...week, days }, 'thrifty');
    for (let pass = 0; pass < 3; pass++) {
      let changed = false;
      for (let i = 0; i < 7; i++) {
        if (!days[i].r || fixed(days[i])) continue;
        const used = new Set(days.map((s) => s.r));
        for (const id of dinners) {
          if (used.has(id) || needs[id] || R[id].b) continue;
          const old = days[i].r;
          days[i].r = id;
          const next = scoreWeek({ ...week, days }, 'thrifty');
          if (next > now + 1e-9) { now = next; used.delete(old); used.add(id); changed = true; } else days[i].r = old;
        }
      }
      if (!changed) break;
    }
  }
  const E_R = (id) => R[id] || {};

  function scoreWeek(week, style) {
    let score = 0, slow = 0, prev = null;
    const proteins = {};
    week.days.forEach((s, i) => {
      if (!s.r || s.second) { prev = null; return; }
      const r = R[s.r];
      proteins[r.pr] = (proteins[r.pr] || 0) + 1;
      if (prev === r.pr) score -= 3; // the same thing two nights running
      prev = r.pr;
      if ((r.tg || []).includes('slow')) { slow++; if (i <= 1) score += 2; }
    });
    for (const n of Object.values(proteins)) if (n > 2) score -= 40 * (n - 2);
    if (proteins.sea) score += 3;
    if (slow > 2) score -= 6 * (slow - 2);
    const s = shop(week), st = stats(week, s);
    const e = ends(s.lines.filter((l) => l.tier === 'meals'));
    score += e.closed.length * 3 - e.loose.length * 1.5;
    if (style === 'thrifty') score += st.saved * 4 - st.mealItems;
    else score += st.saved * 0.8;
    if (style === 'wild') score += Object.keys(proteins).length * 2;
    return score;
  }

  function explain(week, style) {
    const st = stats(week), ins = insights(week);
    const bits = [];
    if (style === 'usual') {
      const kept = ins.habitNotes.map((h) => `${R[h.r].n.toLowerCase()} on ${DAY_NAMES[h.day]}`);
      bits.push(kept.length ? `A week like your saved ones: ${kept.slice(0, 2).join(', ')}.` : 'A week weighted toward what you have planned before.');
    } else if (style === 'thrifty') {
      bits.push(`Dealt for a short shop: the dinners need only ${st.mealItems} things.`);
    } else {
      const fresh = week.days.filter((s) => s.r && !planned[s.r]).length;
      bits.push(`${fresh} dinners that are in none of your saved weeks.`);
    }
    const batch = ins.batches.find((b) => b.second !== -1);
    if (ins.chains.length) bits.push(`${DAY_NAMES[ins.chains[0].from]}'s ${R[ins.chains[0].source].n.toLowerCase()} becomes ${DAY_NAMES[ins.chains[0].to]}'s ${R[ins.chains[0].r].n.split(' ')[0].toLowerCase()}.`);
    else if (batch) bits.push(`${R[batch.r].n.replace(/ \(.*\)$/, '')} is cooked once and feeds ${DAY_NAMES[batch.day]} and ${DAY_NAMES[batch.second]}.`);
    else if (ins.closed.length) { const c = ins.closed[0]; bits.push(`${c.by.join(' and ')} finish ${formatQty(c.q, c.unit)} of ${c.name.toLowerCase()} between them.`); }
    if (st.saved > 0) bits.push(`Sharing takes ${st.saved} ${st.saved === 1 ? 'line' : 'lines'} off the shop.`);
    return bits.join(' ');
  }

  // ---- placing cards ----------------------------------------------------------------------
  // Returns a new week. from: {deck:id} | {day:i}; to: {day:i} | {deck:true} | {extras:true}
  function move(week, from, to) {
    const w = { ...week, days: week.days.map((s) => ({ ...s })), extras: [...week.extras] };
    const blank = () => ({ r: null, d: null, lock: false, second: false });
    const clearSeconds = (id) => w.days.forEach((s, i) => { if (s.second && s.r === id) w.days[i] = blank(); });
    if (from.day != null && to.day != null) {
      if (from.day === to.day) return w;
      [w.days[from.day], w.days[to.day]] = [w.days[to.day], w.days[from.day]];
      // A second night that lands before its cook night swaps roles with it.
      w.days.forEach((s, i) => {
        if (!s.second) return;
        const cook = w.days.findIndex((x) => x.r === s.r && !x.second);
        if (cook > i) { w.days[cook].second = true; s.second = false; }
        if (cook === -1) s.second = false;
      });
    } else if (from.deck && to.day != null) {
      if (R[from.deck].k !== 'dinner' && R[from.deck].k !== 'side') { if (!w.extras.includes(from.deck)) w.extras.push(from.deck); return w; }
      const old = w.days[to.day];
      if (old.r && !old.second) clearSeconds(old.r);
      const dup = w.days.findIndex((s) => s.r === from.deck && !s.second);
      if (dup !== -1 && dup !== to.day) { clearSeconds(from.deck); w.days[dup] = blank(); }
      w.days[to.day] = { r: from.deck, d: null, lock: false, second: false };
    } else if (from.day != null && to.deck) {
      const old = w.days[from.day];
      if (old.r && !old.second) clearSeconds(old.r);
      w.days[from.day] = blank();
    } else if (from.deck && to.extras) {
      if (!w.extras.includes(from.deck)) w.extras.push(from.deck);
    }
    return w;
  }

  // In the shop and something is not there: the dinner for `day` is swapped for one that does not need
  // any of `avoid`, choosing the one that adds the fewest new things to the list.
  function swapOut(week, day, avoid, rng = Math.random) {
    const blank = { r: null, d: null, lock: false, second: false };
    const old = week.days[day].r;
    const days = week.days.map((s, i) => (i === day || (s.second && s.r === old) ? { ...blank } : { ...s }));
    const used = new Set(days.map((s) => s.r).filter(Boolean)); used.add(old);
    const have = new Set(shop({ ...week, days }).lines.map((l) => l.g));
    let best = null;
    for (const id of dinners) {
      if (used.has(id) || needs[id] || R[id].i.some((ing) => avoid.has(ing.g) && !ing.o)) continue;
      const extra = new Set(R[id].i.filter((ing) => !ing.o && !G[ing.g].s && !have.has(ing.g)).map((ing) => ing.g)).size;
      const score = extra + rng() * 0.9;
      if (!best || score < best.score) best = { id, extra, score };
    }
    if (!best) return null;
    days[day] = { ...blank, r: best.id };
    return { week: { ...week, days }, r: best.id, extra: best.extra };
  }

  function addSecondNight(week, day) {
    const w = { ...week, days: week.days.map((s) => ({ ...s })) };
    const id = w.days[day].r;
    let j = w.days.findIndex((s, i) => i > day + 1 && !s.r);
    if (j === -1) j = w.days.findIndex((s, i) => i > day && !s.r);
    if (j === -1) return null;
    w.days[j] = { r: id, d: null, lock: false, second: true };
    return w;
  }

  // ---- week code for the link -------------------------------------------------------------
  function encode(week) {
    return 'w-' + week.days.map((s) => (s.r ? recipeIds.indexOf(s.r).toString(36).padStart(2, '0') : 'zz')).join('') + week.days.map((s) => (s.second ? '1' : '0')).join('');
  }
  function decode(code, week) {
    const m = /^w-([0-9a-z]{14})([01]{7})?$/.exec(code || '');
    if (!m) return null;
    const days = [];
    for (let i = 0; i < 7; i++) {
      const pair = m[1].slice(i * 2, i * 2 + 2);
      const id = pair === 'zz' ? null : recipeIds[parseInt(pair, 36)];
      days.push({ r: id || null, d: null, lock: false, second: !!id && !!m[2] && m[2][i] === '1' });
    }
    return { ...week, days };
  }

  // ---- writing back to Iris ---------------------------------------------------------------
  function toIris(week, ticked = new Set()) {
    const a = dayDate(week.start, 0);
    const heading = (i) => { const d = dayDate(week.start, i); return `## ${DAY_NAMES[i]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`; };
    const dayLine = (s) => {
      if (!s.r) return '- _(nothing planned)_';
      if (s.second) return `- ${R[s.r].n} _(second night, already cooked)_`;
      // Iris scales a meal by its Diners value over the recipe's servings, and counts the meal once per token,
      // so a scaled meal carries exactly one token: the diner count. (Checked against Iris, 18 November 2026.)
      if (s.d && s.d !== R[s.r].sv) return `- ${R[s.r].n}, for {{diagram:${s.r}:attr:attributes/Diners/type=${s.d}}}`;
      return `- {{diagram:${s.r}:name}}`;
    };
    // Same shape as the saved plans: the weekend, then the working week.
    const plan = ['# Week 1:'];
    week.days.forEach((s, i) => {
      if (i === 2) plan.push('# Week 2:');
      plan.push(heading(i), dayLine(s), '');
    });
    if (week.extras.length) plan.push('# Extras', ...week.extras.map((id) => `- {{diagram:${id}:name}}`), '');
    const s = shop(week);
    const range = rangeLabel(week.start);
    const meals = week.days.map((x, i) => (x.r ? `${DAY_SHORT[i]} ${R[x.r].n.toLowerCase()}` : null)).filter(Boolean).join(', ');
    const list = [`Shopping list for ${range}, dealt in Dinner Deck. ${meals}.`, ''];
    const section = (title, lines) => {
      if (!lines.length) return;
      list.push(`## ${title}`, '');
      for (const l of lines) {
        const from = [...new Set(l.parts.map((p) => p.label.toLowerCase()))];
        if (l.weekly) from.push('every week');
        const why = from.length ? ` _(${from.join(', ')})_` : '';
        list.push(`- [${ticked.has(l.g) ? 'x' : ' '}] ${l.qty ? l.qty + ' ' : ''}{{element:${l.g}:name}}${why}`);
      }
      list.push('');
    };
    deck.aisles.forEach((name, i) => section(name, s.lines.filter((l) => l.aisle === i && l.tier !== 'cupboard')));
    section('Check the cupboard', s.lines.filter((l) => l.tier === 'cupboard'));
    return {
      packageName: a.toISOString().slice(0, 10),
      planName: `From ${range}`,
      planDescription: meals + '.',
      planMarkdown: plan.join('\n').trim(),
      listName: `Shopping list ${range}`,
      listDescription: `Shopping list for the ${range} meal plan, made in Dinner Deck. Grouped by aisle in store order.`,
      listMarkdown: list.join('\n').trim(),
    };
  }

  return { G, R, recipeIds, dinners, needs, feeds, planned, habits, plansCount: plans.length, shop, insights, stats, deal, move, swapOut, addSecondNight, encode, decode, toIris, STYLES, unitOf };
}
