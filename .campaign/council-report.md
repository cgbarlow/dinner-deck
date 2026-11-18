---
created: 2026-11-18
council-type: standalone
---

# Council Report

Subject: the finished first build of Dinner Deck, reviewed with an independent hands-on test report (desktop, laptop, phone, keyboard, code read). The earlier review of the plan is summarised in `docs/plan.md`.

## Animal Perspectives

### Bear — Vision & Direction
- The concept landed: the list does shrink when meals share.
- The dealer hides the headline acts. A leftover chain appeared in 1% of usual deals. Every deal should tell one story: a chain, a batch night, or a loose end closed.

### Cat — Risk & Scope
- Switching weeks within 0.7 s dropped the edit and could overwrite a partner's week with an auto-deal.
- A week link re-applied on every reload and wiped ticks.
- Ticks survived a re-deal. No undo. Whole-document writes lost a second shopper's ticks.

### Owl — Process & Structure
- Every-week items and meals were added together, doubling nachos night. The household's own lists count them once.
- "No meat" was wrong on three dinners. Locks vanished on swap. A locked second night could be orphaned.
- Each fix needs a test.

### Puppy — Opportunities & Momentum
- Closing a loose end is the most delightful thing here; make the dealer do it on purpose and say so.
- Learn from weeks planned in the app, not only three saved plans.

### Rabbit — Resources & Stakeholders
- In the aisle, 290 of 780 px were chrome. Countables showed as "2½ cans". Unitless amounts became invented "packs".
- Keyboard users lost focus on every tick.

### Wolf — Cohesion & Balance
- Shared-ingredient tags were hidden below 1180 px and on the phone, so the main novelty was desktop-only.
- Other weeks showed invented deals as if planned.

## Consensus

Sound in its sums and its look, unsafe in its sync. Fix loss of work first, then truthfulness of the list, then make the dealer show the best tricks, then phone and keyboard.

## Recommended Next Steps

1. Data-loss fixes: writes bound to the week they belong to, link applied once with consent, per-item tick sync, undo.
2. Truth fixes: every-week overlap counted once, whole-unit rounding, no invented units, curation, locks.
3. Story dealer: guarantee a chain, a batch night or a closed loose end, and say which.
4. Phone and keyboard: tags at every width, list gets the screen, focus kept.
5. The polish list from the test report.
