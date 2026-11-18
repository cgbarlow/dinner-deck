#!/usr/bin/env python3
"""Turn raw Iris pulls into data/deck.json, the one file the app reads.

Inputs (see docs/data-sources.md for how to pull them through the Iris connector):
  data/raw/recipes.json            list_diagrams(set_id=<Recipes>, page_size=50)
  data/raw/groceries-export.json   export_set(set_id=<Groceries>, format="json")
  data/raw/aisles.json             {aisle name: [element id]} from list_package_elements per aisle
  data/source/meal-plans.json      the saved meal plans (committed)
  data/source/every-week.json      the Repeating weekly shopping list (committed)
  data/curation.json               the few judgements the data does not hold (committed)

data/raw/ is not committed. data/deck.json is.
"""
import json
import re
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"

# The order the household's own combined lists walk the store in:
# Fruit and vege, Deli and health foods, General, Meats, Bakery, Cleaning & Pharmacy, Chilled, Frozen.
WALK = ["Produce", "Deli", "Gluten-free", "Pantry", "Canned Goods", "Cereals & Breakfast", "Beverages",
        "Meat & Poultry", "Bakery", "Household", "Personal Care", "Chilled", "Frozen"]

TOKEN = re.compile(r"\{\{element:([0-9a-f-]{36}):([^}]*)\}\}")
NOTE = re.compile(r"_\((.*?)\)_")
FRACTION = re.compile(r"^\s*-\s*(\d+(?:/\d+)?(?:\.\d+)?)\s")

PROTEIN_WORDS = [
    ("sea", ["fish", "salmon", "prawn", "mussel", "tuna"]),
    ("chicken", ["chicken"]),
    ("lamb", ["lamb"]),
    ("pork", ["pork", "sausage", "bacon", "ham", "chorizo", "burger patties"]),
]


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def attrs(element):
    return {a["name"]: (a.get("type") or "").strip() for a in (element.get("data") or {}).get("attributes", [])}


def num(text):
    try:
        return float(Fraction(text))
    except (ValueError, ZeroDivisionError):
        return None


def build_groceries():
    export = load(RAW / "groceries-export.json")
    aisle_of = {eid: aisle for aisle, ids in load(RAW / "aisles.json").items() for eid in ids}
    out = {}
    for e in export["elements"]:
        if e["id"] not in aisle_of:
            continue  # template stub and one unfiled item
        a = attrs(e)
        g = {"n": e["name"].strip(), "a": WALK.index(aisle_of[e["id"]]), "u": a.get("Unit", "") or "unit"}
        product = a.get("Preferred product") or a.get("Products") or a.get("Favourite product")
        if product:
            g["p"] = product
        if a.get("Seasoning") == "true":
            g["s"] = 1
        if g["n"].lower().startswith("leftover"):
            g["l"] = 1
        out[e["id"]] = g
    return out


def parse_recipe(diagram, groceries):
    src = diagram["data"].get("markdown_source", "")
    head, _, method = src.partition("# Method")
    ings, section, loose = [], "", []
    for line in head.split("\n"):
        stripped = line.strip()
        if stripped.startswith("#"):
            title = stripped.lstrip("#").strip()
            section = "" if title.lower() == "ingredients" else title
            continue
        tokens = TOKEN.findall(line)
        if not tokens:
            if stripped.startswith("-"):
                loose.append(stripped.lstrip("- ").strip())
            continue
        gid = tokens[0][0]
        if gid not in groceries:
            continue
        qty = unit = None
        alt = None
        for tid, form in tokens:
            if tid != gid:
                alt = tid if tid in groceries else alt
                continue
            if form.startswith("attr:attributes/Quantity/type="):
                qty = num(form.split("=", 1)[1])
            elif form.startswith("attr:attributes/Unit/type="):
                unit = form.split("=", 1)[1].strip() or None
        if qty is None:
            m = FRACTION.match(line)  # "- 1/2 {{unit}} {{name}}" written as text
            if m:
                qty = num(m.group(1))
        note_match = NOTE.search(line)
        note = note_match.group(1) if note_match else ""
        note = re.sub(r"\{\{element:([0-9a-f-]{36}):name\}\}", lambda m: groceries.get(m.group(1), {}).get("n", ""), note)
        ing = {"g": gid}
        if qty is not None:
            ing["q"] = round(qty, 4)
        if unit and unit != groceries[gid]["u"]:
            ing["u"] = unit
        if note.lower().startswith("optional"):
            ing["o"] = 1
            note = note.split(":", 1)[1].strip() if ":" in note else ""
            if note.lower() == "yes":
                note = ""
        if note:
            ing["t"] = note
        if section:
            ing["h"] = section
        if alt:
            ing["alt"] = alt
        ings.append(ing)
    method_text = method.strip()
    return ings, loose, method_text


def looks_off(ing, groceries):
    """A quantity that cannot be right for its unit, e.g. 250 cup cauliflower or 4 g carrots.
    Usually a count or a kilo typed against the grocery's default unit. Flagged, never corrected."""
    g = groceries[ing["g"]]
    q, unit = ing.get("q"), ing.get("u") or g["u"]
    if q is None or g.get("s"):
        return False
    return (unit == "g" and q < 20) or (unit == "cup" and q > 8) or (unit == "ml" and q < 10)


def protein_of(ings, groceries):
    names = " ".join(groceries[i["g"]]["n"].lower() for i in ings if not i.get("o") and not groceries[i["g"]].get("s"))
    for key, words in PROTEIN_WORDS:
        if any(w in names for w in words):
            return key
    return "veg"


def main():
    groceries = build_groceries()
    curation = load(ROOT / "data" / "curation.json")
    by_name = curation["recipes"]
    recipes = {}
    for d in sorted(load(RAW / "recipes.json"), key=lambda d: d["name"].lower()):
        ings, loose, method = parse_recipe(d, groceries)
        for ing in ings:
            if looks_off(ing, groceries):
                ing["odd"] = 1
        cur = by_name.get(d["name"], {})
        name = d["name"].strip()
        r = {
            "n": name,
            "sv": d["data"].get("servings") or 4,
            "k": cur.get("kind", "dinner"),
            "pr": cur.get("protein") or protein_of(ings, groceries),
            "i": ings,
        }
        if d.get("description"):
            r["d"] = d["description"].strip()
        if loose:
            r["x"] = loose
        if method:
            r["m"] = method
        batches = re.search(r"\(x(\d)\s*batches\)", name)
        if batches:
            r["b"] = int(batches.group(1))
        tags = list(cur.get("tags", []))
        low = name.lower()
        if any(w in low for w in ("slow cooked", "crock pot", "stew")) and "slow" not in tags:
            tags.append("slow")
        if "one-pot" in low or "one-pot" in (r.get("d") or "").lower():
            tags.append("one-pot")
        if tags:
            r["tg"] = tags
        recipes[d["id"]] = r

    # Leftover chains: only where a grocery is named "Leftover ..." and curation names its source recipe.
    name_to_id = {r["n"]: rid for rid, r in recipes.items()}
    gname_to_id = {}
    for gid, g in groceries.items():
        gname_to_id.setdefault(g["n"], gid)
    for leftover_name, source_name in curation["leftovers"].items():
        groceries[gname_to_id[leftover_name]]["from"] = name_to_id[source_name]

    # Recipes inside recipes: B sits inside A when every ingredient of B is an ingredient of A.
    sets = {rid: {i["g"] for i in r["i"]} for rid, r in recipes.items()}
    for a, ra in recipes.items():
        inside = [b for b in recipes if b != a and len(sets[b]) >= 3 and sets[b] < sets[a]]
        if inside:
            ra["in"] = inside

    plans = load(ROOT / "data" / "source" / "meal-plans.json")["plans"]
    for p in plans:
        for rid in p["days"]:
            assert rid in recipes, rid
    every_week = []
    for gid, qty, unit, note in load(ROOT / "data" / "source" / "every-week.json")["items"]:
        assert gid in groceries, gid
        item = {"g": gid}
        if qty:
            item["q"] = float(qty)
        if unit:
            item["u"] = unit
        if note:
            item["t"] = note
        every_week.append(item)

    deck = {
        "read": curation["read"],
        "aisles": WALK,
        "groceries": groceries,
        "recipes": recipes,
        "plans": [{"start": p["start"], "days": p["days"]} for p in plans],
        "everyWeek": every_week,
        "iris": curation["iris"],
    }
    out = ROOT / "data" / "deck.json"
    out.write_text(json.dumps(deck, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    lines = sum(len(r["i"]) for r in recipes.values())
    with_qty = sum(1 for r in recipes.values() for i in r["i"] if "q" in i)
    kinds = {}
    for r in recipes.values():
        kinds[r["k"]] = kinds.get(r["k"], 0) + 1
    print(f"{len(recipes)} recipes, {len(groceries)} groceries, {lines} ingredient lines, {with_qty} with a quantity")
    print("kinds:", kinds)
    print("quantities that look off:", [f"{r['n']}: {i['q']:g} {i.get('u') or groceries[i['g']]['u']} {groceries[i['g']]['n']}" for r in recipes.values() for i in r["i"] if i.get("odd")])
    print("inside:", {recipes[a]["n"]: [recipes[b]["n"] for b in r["in"]] for a, r in recipes.items() if "in" in r})
    print(f"wrote {out.relative_to(ROOT)} ({out.stat().st_size:,} bytes)")


if __name__ == "__main__":
    sys.exit(main())
