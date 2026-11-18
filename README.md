# Dinner Deck

A weekly meal planner over the recipes and groceries held in Iris. The recipes are a deck of cards, the week is a table with seven places, and the shopping list rewrites itself, in the order you walk the store, every time a card moves.

Built from `BRIEF.md`. The plan and the two Council reviews are in `docs/plan.md` and `.campaign/`.

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
| Finish the list | Every-week items from your Repeating weekly shopping list are merged in. Add anything else from the 214 groceries. Seasonings wait under "Check the cupboard". |
| Save | Writes a meal plan and a checklist shopping list to Iris, in the same shape as your existing ones. |

## What it spots that a list does not

- **Shared ingredients.** "Onion, 6 meals", with matching coloured tags on the days that share it, and how many lines sharing took off the shop.
- **Leftover chains.** Iris has a grocery called "Leftover pork". Put the lasagne after the slow cooked pork shoulder and the pork is not bought twice. Put it before, or alone, and the table says there is nothing to make it from.
- **Batch cooking.** Lamb stew (x2 batches) offers a second night that adds nothing to the shop.
- **Recipes inside recipes.** Sausages with coleslaw and potatoes contains every line of Coleslaw.
- **Loose ends.** Half a can of chickpeas left over, and which card would use it up.
- **House habits.** Nachos has been Wednesday in 3 of 3 saved weeks.
- **Data to tidy.** 18 quantities in Iris cannot be right for their unit (250 cups of cauliflower). They are kept out of the totals and listed under "What the deck knows".

## How it is put together

```
data/source/        saved meal plans and the every-week list, as read from Iris
data/curation.json  the few judgements Iris does not hold (which recipes are not dinners, which recipe yields which leftover)
data/deck.json      built: everything the page needs
scripts/build_data.py   raw Iris pulls -> data/deck.json
scripts/build.py        src/ + data/deck.json -> dist/
src/engine.js       shop totals, sharing, chains, loose ends, the dealer, Iris markdown. No DOM.
src/ui.js           the page
tests/engine.test.js    21 tests, including agreement with Iris's own aggregation
tests/e2e/run.mjs       32 checks in a real browser: drag, deal, tick, phone, save, sync
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
- **Save has not been run against the real Iris.** Iris diagrams cannot be deleted through the connector, so the first real write is yours to make. The write is tested against a stand-in, and its shape is copied from your existing diagrams.
- **Diner counts** scale the shop here, but are written to Iris only as a note; the token form Iris wants for a per-meal diner count was not confirmed.
- **Committed data.** `data/deck.json` holds recipe text, grocery names and preferred products. Personal notes on the every-week list were removed. Check you are happy with that before making the repository public.
