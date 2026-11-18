---
created: 2026-11-18
council-type: standalone
---

# Council Report

Subject: the build plan in `docs/plan.md`, reviewed before any code.

## Animal Perspectives

### Bear — Vision & Direction
- Purpose is clear: deck, week, live shop. The plan has drifted toward "six insights".
- The household's real workflow is a combined list: standing items + meal plan + handwritten extras. The plan covers two of three. Add free add-ins from the 216 groceries.
- Saturday-to-Friday week and store-walk order are the right fidelity.
- One headline novelty: the shop that shrinks when meals share.

### Cat — Risk & Scope
- Three untestable integrations in one page. Cut live Refresh; bake and date the snapshot.
- "Leftover tomato sauce" has no proven source. Chain only what the data names.
- Loose ends must not guess pack sizes: explicit fractions of countable units only.
- Three saved weeks is thin: "3 of 3 saved weeks", never "always".
- Strip personal annotations from committed data. Escape all Iris text.

### Owl — Process & Structure
- Order: data → engine + tests → board → shop → insights → dealer → phone → save → sync.
- Use the saved Iris aggregation (18-24 May) as the engine's fixture.
- Every curated value is derivable-with-override or shown as a household choice.
- Check brief items 1 to 8 in the browser at the end.

### Puppy — Opportunities & Momentum
- The deal is the moment: cards fly, the shop counter ticks down.
- Protein pips on card corners.
- A week code in the link to text the week to someone.
- Draw the pork-to-lasagne join on the board.

### Rabbit — Resources & Stakeholders
- The user is someone with a phone in the supermarket. Show preferred products.
- Save needs the viewer's Iris connector; copy-as-markdown is the floor.
- Match the existing write shape: dated package, existing naming, checklist metadata.
- Seasonings collapsed by default, as the household's lists exclude them.

### Wolf — Cohesion & Balance
- Phone shop mode is under-specified relative to its use.
- One deal button; style is a small switch.
- Keyboard path missing.
- Defaults must need zero configuration.

## Consensus

Fidelity to how the household already shops beats cleverness. Say only what the data supports. The phone is the main stage. Motion is spent on the deal and the shrinking shop; everything else stays still. The plan is one feature short (free add-ins) and one long (live refresh).

## Recommended Next Steps

1. Add "add anything" from the grocery catalogue.
2. Cut live Refresh from the page.
3. Make phone shop mode first-class.
4. Honesty rules for habits, loose ends, chains, curation.
5. Test the engine against Iris's saved aggregation first.
6. Strip personal annotations; escape Iris text.
7. Add a week code and a keyboard path.
