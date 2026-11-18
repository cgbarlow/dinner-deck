# Brief: Dinner Deck

## Where this came from

The original ask, 18 November 2026:

> review every collection in iris, come up with a set of criteria for an interesting, novel, surprising, delightful, engaging interactive, dynamic exploration based on the data sets. then rank each one in a scoring matrix across the criteria, and give me a visual mock up for the top 5

> obviously you'll need to come up with your best ideas for the individual collections for the mock ups

A Council of six advisors reviewed all 14 Iris collections and scored each on its single best concept. The "Day to day living" collection came second with this concept, one point behind the family tree, and was named the one to build first. Full report: `docs/council-report.md`.

## The seven criteria

Each scored 1 to 5. The build should keep earning these.

| Criterion | Test | Score |
|---|---|---|
| Interesting | Is the data deep enough to reward a second look? | 4 |
| Novel | Does it show something the Iris canvas does not? | 3 |
| Surprising | Can it reveal something its author did not know? | 3 |
| Delightful | Is there a personal or playful pull? | 5 |
| Engaging | Is there a story with stakes? | 5 |
| Interactive | Are there real things to do? | 5 |
| Dynamic | Does it move, change over time, or respond live? | 5 |

Novel and Surprising are the weak scores. Meal planners exist. What lifts this one is the overlap and leftover spotting, so those are not optional.

## The concept

Iris already holds the household's recipes, a grocery list sorted into aisles, weekly meal plans and shopping lists. Each recipe points at grocery items with a quantity. Iris can already add those up into a shopping list.

Dinner Deck puts a playable front on that. The recipes are a deck. The week is a board with seven slots. The shopping list is a live read-out of whatever is on the board.

## What the user can do

1. **Browse the deck.** All 43 recipes as cards. Search by name or ingredient.
2. **Drag a card onto a day.** Or drag between days to swap.
3. **Deal me a week.** One button fills all seven days. Deal again for a different week.
4. **Watch the shop.** The right-hand list regroups by aisle and re-adds quantities on every change.
5. **See what is shared.** An item two or more meals use gets a tag, for example "2 meals".
6. **See leftover chains.** When one recipe feeds another, the board says so.
7. **Tick items off.** Checkboxes on the list.
8. **Save as a shopping list in Iris.** Writes the week back as a meal plan and shopping list.

## Things already true in the data

- Recipes include "Slow cooked pork shoulder" and "Lasagne from leftover pork shoulder". That is a ready-made leftover chain.
- "Coleslaw" is its own recipe, and "Sausages with coleslaw and potatoes" exists. One recipe can sit inside another.
- "Lamb stew (x2 batches)" shows batch cooking is already a habit.
- The grocery list has a "Gluten-free" aisle and a "Household" and "Personal Care" aisle, so the shop is more than food.

## Ideas for the dealer

"Deal me a week" is where delight and surprise come from. Options, roughly easiest first.

- Random seven with no repeats.
- Prefer weeks where meals share ingredients, to cut the shop.
- Always place a leftover chain on consecutive days.
- One fish night, one slow-cook day.
- Learn from the two saved meal plans (2026-05-23 and 2026-06-06) what a normal week looks like.

## What is not yet known

These were not checked during the review. Check them first.

- How many of the 43 recipes have every ingredient linked with a quantity. Only 7 have a description. Two were read in full: Gołąbki has quantities on every line, Lamb stew has several lines with a name only.
- Whether the sausages recipe really references the Coleslaw recipe as a diagram, or just lists its ingredients.
- What the meal plan diagrams look like inside. The "Shopping list" aggregation expects a meal plan that references recipes, with an optional diner count per meal.
- Whether leftover chains are marked in the data or only in recipe names.
- Who else uses it and on what device. The mockup is a desktop layout. A phone in a supermarket is the more likely place for the list.

## The mockup

`mockup/index.html` is a static picture of one moment: a full week dealt, the leftover chain called out, the shop grouped into five aisles. The shopping list in the mockup is shortened and has no quantities. The item names were inferred from recipe titles and descriptions, not read from the grocery elements.

Colours, type and layout are a starting point, not a specification.

## A sensible first slice

Not a plan, just the smallest thing that would prove the idea.

1. Pull the 43 recipes and resolve their ingredient references to grocery names and aisles.
2. Show seven fixed recipes and compute the list in the browser, grouped by aisle.
3. Make the seven swappable.
4. Then the dealer, then save to Iris.
