# Dinner Deck

A weekly meal planner over the recipes and groceries held in Iris. The recipes are a deck of cards, the week is a table with seven places, and the shopping list rewrites itself, in the order you walk the store, every time a card moves.

Built from `BRIEF.md`. The plan, with the changes each Council review led to, is in `docs/plan.md`. The latest Council report is `.campaign/council-report.md`.

## Use it

- **In Claude:** the published artifact (private to its owner until shared). There it can save to Iris through your Iris connector and keep the week in step between devices.
- **Anywhere else:** open `dist/index.html` in a browser. Everything works except writing to Iris and cross-device sync; the week is kept in that browser, and Save gives you the markdown to paste.

## What you can do

| | |
|---|---|
| Browse and search | 43 recipe cards. Search by name or ingredient, filter by fish, chicken, pork, lamb, no meat. |
| Place cards | Drag onto a day, drag between days to swap, drag back to the deck. Or open a card and press a day (works by keyboard and touch). |
| Deal me a week | Three deals: **The usual** leans on your saved plans, **Thrifty** deals the shortest shop, **Wildcard** deals dinners you have never planned. Lock a day to keep it. |
| Watch the shop | Quantities add up across meals, per unit, grouped by aisle in your own store order. Tick things off. |
| Finish the list | Every-week items from your Repeating weekly shopping list are merged in, and cover the same item for a meal rather than doubling it. Add anything else from your groceries. Seasonings wait under "Check the cupboard". |
| Change your mind | Every change can be undone (the Undo button, the toast, or Ctrl+Z). Dealing again or clearing the table empties the trolley; undo brings it back. |
| When the shop is out of something | Mark it "Not in the shop today" and the dinners that needed it offer a swap: the replacement that adds the fewest new things to the list. |
| Mark what you cooked | A tick on past days. What you actually cook is what The usual learns from. |
| Shop from a phone | The list fills the screen, ticks are thumb-sized, the preferred product shows under each item, and things bought whole are rounded up (1 can, not ¾). |
| Send a week | "Put this week in the link" gives a link that offers the week to whoever opens it. It is never applied without a yes. |
| Save | Writes a meal plan and a checklist shopping list to Iris, in the same shape as your existing ones. |

## What it spots that a list does not

- **Shared ingredients.** "Onion, 6 meals", with matching coloured tags on the days that share it, and how many lines sharing took off the shop.
- **Leftover chains.** Iris has a grocery called "Leftover pork". Put the lasagne after the slow cooked pork shoulder and the pork is not bought twice. Put it before, or alone, and the table says there is nothing to make it from.
- **Batch cooking.** Lamb stew (x2 batches) offers a second night that adds nothing to the shop.
- **Recipes inside recipes.** Sausages with coleslaw and potatoes contains every line of Coleslaw.
- **Loose ends.** Half a can of chickpeas left over, and which card would use it up.
- **Nothing wasted.** When two meals finish a can between them, it says so. Every deal tries to tell one such story: a leftover chain, a batch night, or a can used up.
- **House habits.** Nachos has been Wednesday in 3 of 3 saved weeks. Weeks you plan here are added to that count, so The usual gets more like your household over time.
- **Data to tidy.** 19 quantities in Iris cannot be right for their unit (250 cups of cauliflower), and a few groceries exist under two names (Onion and Onions). They are kept out of the totals and listed under "What the deck knows".

## How it is put together

```
data/source/        saved meal plans and the every-week list, as read from Iris
data/curation.json  the few judgements Iris does not hold (which recipes are not dinners, which recipe yields which leftover)
data/deck.json      built: everything the page needs
scripts/build_data.py   raw Iris pulls -> data/deck.json
scripts/build.py        src/ + data/deck.json -> dist/
src/engine.js       shop totals, sharing, chains, loose ends, the dealer, Iris markdown. No DOM.
src/ui.js           the page
tests/engine.test.js    32 tests, including a round trip through the real Iris
tests/e2e/run.mjs       41 checks in a real browser: drag, deal, undo, tick, swap, keyboard, phone, save, sync
```

```bash
npm test
```

```bash
npm run build
```

```bash
npm run e2e
```

No dependencies to install. Tests use Node's built-in runner; the browser run needs Playwright available.

## Refreshing from Iris

The page carries a snapshot, dated in its footer. To refresh it, pull through the Iris connector (see `docs/data-sources.md`) into `data/raw/`, which is not committed:

- `recipes.json`: `list_diagrams(set_id=<Recipes>, page_size=50)`
- `groceries-export.json`: `export_set(set_id=<Groceries>, format="json")`
- `aisles.json`: `{aisle: [element ids]}` from `list_package_elements` per aisle (the export does not carry the aisle)

Then run the data build and the page build. Update `data/source/` if the saved plans or the every-week list changed.

## Things to know

- **Agreement with Iris.** On every line Iris's "Shopping list" aggregation adds up, this page gets the same number (tested on the 6 to 12 June plan). It also keeps what Iris drops: lines with no quantity, and amounts typed as text such as `1/2`.
- **Sharing between devices.** In Claude, the week lives in the artifact's database, one document per week. The plan is written whole; each tick is merged on its own so two people shopping do not undo each other. Whoever you share the artifact with as a contributor can change the week.
- **Save, checked against the real Iris (18 November 2026).** The same calls the Save button makes were run through the Iris connector into the Sandbox collection (set "ArchiMate Test", package "Dinner Deck test"): a package, a meal plan and a shopping list. Iris accepted all three, and its own "Shopping list" aggregation then added up the plan this app wrote and agreed with the engine on all 24 lines they share (`tests/fixtures-iris-roundtrip.json`). Those test diagrams are still there; the connector cannot delete them. If a plan of the same name is already in the week's package, Save stops and asks before writing a second copy.
- **Sync, checked against the real database.** A week in the page's own document shape was written to the published artifact's database, two ticks were merged in separately by two "shoppers" and both stood, a contributor could write and a viewer could only read. The test document was then removed.
- **Proven end to end on the live page (18 November 2026).** The published page, opened in Claude, wrote the week of 21 November to the artifact's database, and its Save button created package `2026-11-21` in both Weekly meal plans and Shopping lists with "From 21 to 27 November 2026" and "Shopping list 21 to 27 November 2026". The saved plan matches the synced week day for day, and Iris's aggregation walks all seven of its recipes.
- **Where this page and Iris's aggregation differ, on purpose.** Iris ignores a per-line unit override when it adds up (Gołąbki's "1 whole" cabbage becomes 1 cup, "1 tbsp" butter becomes 1 g); this page keeps the unit the recipe wrote. Iris adds impossible quantities in (pork mince 501 g); this page flags them and leaves them out. Iris lists Pasatta and Passata separately; this page folds them.
- **Diner counts reach Iris.** A meal for 8 is written as one token carrying the diner count, which is the form Iris's aggregation scales by. Checked against Iris: spaghetti for 8 and tacos for 2 came back as 1,000 g and 250 g of mince. (A name token plus a diner token on the same line makes Iris count the meal twice.)
- **Duplicate groceries.** Onion and Onions, Apple and Apples, Pasatta and Passata are held twice in Iris. They are one line here (`data/curation.json`, `sameAs`). Merge them in Iris and remove the entry.
- **Committed data.** `data/deck.json` holds recipe text, grocery names and preferred products. Personal notes on the every-week list were removed. Check you are happy with that before making the repository public.
