# Build plan: Dinner Deck

Written 18 November 2026, before any code, for Council review.

## What discovery found (the brief's open questions)

| Question | Answer from the data |
|---|---|
| How many recipes have every ingredient quantified? | 20 of 43 fully, 17 partly, 6 not at all (Baked salmon, Pizza, Prawn curry rice, Prawn fettuccini, Roast chicken, the lemonade). 199 of 296 ingredient lines carry a quantity. Ten more lines carry a literal `1/2` or `1/4` in text instead of a token. |
| Does Sausages reference the Coleslaw recipe? | No. No recipe references another diagram. Sausages repeats Coleslaw's five lines exactly, so containment can be computed. |
| What do meal plans look like? | Three exist, not two. Markdown with `## Saturday 6/6` headings and one `{{diagram:<id>:name}}` per day. The week runs Saturday to Friday. No diner counts are set. |
| Are leftover chains in the data? | Yes. Groceries include "Leftover pork" and "Leftover tomato sauce", and the lasagne uses both. Batch cooking is only in a recipe name. |
| Meal type field? | None. 42 of 43 recipes say servings 4. |
| Other finds | 37 groceries are flagged `Seasoning` (the household's own lists exclude them). 119 carry a preferred supermarket product. A "Repeating weekly shopping" list holds 26 standing items. The household's own lists walk the store in a fixed section order. Nachos has been Wednesday in 3 of 3 saved weeks. |
| Reach | This container cannot reach Iris over HTTP. Data arrives through the Iris connector only. |

## What gets built

One self-contained page, published as a Claude artifact (so it runs on a phone and can call the Iris connector as the viewer) and kept in this repo with its build and tests.

**Board.** Deck of recipe cards, a Saturday-to-Friday week of seven slots, and the shop. Drag by pointer (mouse and touch), or tap a card then tap a day. Drag between days to swap. Lock a day. Per-meal diner stepper scales quantities. An extras tray holds non-dinners (porridge, pikelets, lemonade) that still feed the shop. Tap a card to flip it and read ingredients and method.

**The shop.** Recomputed in the browser on every change. Quantities summed per unit, grouped by aisle in the household's own store-walk order. Three tiers: this week's meals, "every week" staples from the Repeating list (toggle), and "check the cupboard" for seasonings. Each line shows which meals want it, the preferred product, and a tick box. Unquantified lines are listed honestly as "some", never guessed.

**Things the list alone hides** (the Novel and Surprising scores):
1. Shared-ingredient tags ("3 meals") and coloured threads on the board linking the days that share.
2. Leftover chains from the data: lasagne after pork shoulder removes the leftover lines from the shop and says so. Lasagne without it warns that there is nothing to make it from.
3. Batch cooking: Lamb stew (x2) offers its second night as a free card.
4. Recipes inside recipes: Sausages contains Coleslaw, computed by containment.
5. Loose ends: half a can of chickpeas, a quarter cabbage. The board names what is left over and which card in the deck would use it up.
6. House habits learned from the saved plans, shown as facts ("Nachos, every Wednesday on record").

**The dealer.** Three deals: The usual (weighted by saved plans, habit days honoured), Thrifty (maximise shared ingredients, shortest shop), Wildcard (favours recipes never planned). All deals: dinners only, no repeats, at most two of a protein, leftover chains on consecutive days, locked days kept. Cards fly from deck to slot. Each deal explains itself in one line.

**Iris, both ways.** A snapshot is baked in so first paint is instant and the page works anywhere. With the Iris connector allowed: Refresh pulls recipes and groceries live; Save writes a meal plan (same markdown shape as the existing three, with `{{diagram:…}}` tokens so Iris's own aggregation still works on it) and a shopping list (checklist markdown with element tokens) into dated packages. Save shows the destination and asks before writing. Without the connector: Copy as Iris markdown.

**Shared state.** The week and ticks sync between household devices through the artifact's database, so the plan made on a laptop is the list on the phone in the aisle. Falls back to local storage.

**Shop mode on a phone.** One column, large tick targets, aisle progress, done items sink.

## How

- `data/raw/` Iris pulls as received. `scripts/build_data.py` parses tokens into `data/deck.json` (recipes, groceries, aisles, habits, staples). `data/curation.json` holds the few human judgements the data lacks (meal type, protein, which recipe yields which leftover), each one overridable.
- `src/` plain ES modules, no framework: `engine.js` (aggregate, overlaps, chains, loose ends, dealer; pure, unit-tested in Node), `ui.js`, `iris.js`, `styles.css`. `scripts/build.py` inlines everything into `dist/dinner-deck.html`.
- Tests: Node unit tests for the engine, including agreement with Iris's own "Shopping list" aggregation on the 18 to 24 May plan. Playwright run for drag, deal, tick, phone width, both themes.
- Design: the mockup's palette and type as the starting point, pushed toward a card table. Light and dark.

## Risks I already see

- Save cannot be test-run without writing into the real Iris, and diagrams cannot be deleted through the connector. The write shape is copied from existing diagrams; the first real save is the user's click.
- Curation is a judgement. Kept in one small file and shown in the UI.
- Quantities are patchy. The UI must say so rather than look more precise than the data.
- One page doing a lot. The board must stay calm: insights collapse to one strip.

## Changes after Council review (18 November 2026)

Report: `.campaign/council-report.md`.

1. **Added:** add any of the 216 groceries to the week's list by search, so the household's combined list (meals + every-week + extras) is finished in one place.
2. **Cut:** live Refresh from the page. The snapshot is baked, dated in the UI, and rebuilt with `scripts/build_data.py`.
3. **Promoted:** phone shop mode is a first-class surface: thumb-sized ticks, aisle progress, preferred product under each item, screen kept awake.
4. **Honesty rules:** habits are stated as counts ("3 of 3 saved weeks"). Loose ends only for explicit fractions of countable units. Leftover chains only where the data names the leftover (pork). Curated values are visible.
5. **Order:** engine first, tested against Iris's own saved aggregation for 18 to 24 May, before any UI.
6. **Data hygiene:** personal annotations stripped from committed data; all Iris text escaped.
7. **Added:** a week code in the link, a keyboard path for placing cards, one deal button with a small style switch.

## Changes after the second Council review (18 November 2026)

The finished build was tested hands-on by an independent reviewer, then put to the Council. What changed:

1. **No lost work.** Writes to the shared copy are bound to the week they were made in. A week nobody touched is never pushed. A week link is offered, not applied, and is cleared once read. Each tick syncs on its own. Everything can be undone.
2. **A truthful list.** Every-week items cover the same item for a meal instead of doubling it. Things bought whole are rounded up. No invented units. A tick lapses if the line it was for grows. "No meat" no longer covers the pizza with salami.
3. **A dealer that shows its best tricks.** Each deal picks a story (leftover chain, batch night, or neither) and builds the week around it. Never three of one protein. Less of the same week twice.
4. **Phone and keyboard.** Shared-ingredient tags show at every width. The list gets the whole phone screen. Focus stays where it was after a tick or a lock.
5. **It learns.** Past weeks planned in the app count toward habits.
6. **Save checks first.** If the week is already in Iris, it says so before writing a second copy.

7. **In the shop.** "Not in the shop today" on any item offers to swap the dinners that needed it for the one that adds least to the list.
8. **Cooked.** Past days can be marked cooked; the usual deal learns from what was cooked.
9. **Verified for real.** Save was run through the Iris connector into the Sandbox, and Iris's aggregation agreed with the engine on the plan the app wrote. Sync was run against the artifact's live database.

Not done, and why: merging near-duplicate groceries (a change to make in Iris, listed under "What the deck knows").
