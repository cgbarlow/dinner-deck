# Data sources: Dinner Deck

All data lives in Iris (`https://iris-uat.chrisbarlow.nz`), reached through the Iris MCP server. Read tools need no sign-in. Write tools do.

## Where

| Thing | Name | Id | Holds |
|---|---|---|---|
| Collection | Day to day living | `705058c2-42bd-4f69-bb13-64323a335922` | 4 sets, 52 diagrams, 216 elements |
| Set | Groceries | `12866e48-fd87-44ce-a228-446643b9f06d` | 216 elements in 13 packages. No diagrams |
| Set | Recipes | `ef57c7e7-666f-4d78-b156-c9892d533fad` | 43 smart-markdown diagrams. No elements |
| Set | Weekly meal plans | `f2e064ad-9e08-4420-9c1f-3c3747b1c728` | Packages `2026-05-23` and `2026-06-06` |
| Set | Shopping lists | `9ed26bcc-6077-41f0-b173-a72bee1a54f1` | 6 diagrams in 4 packages |

## Groceries

One element per item. The package is the aisle. The 13 aisles:

Bakery, Beverages, Canned Goods, Cereals & Breakfast, Chilled, Deli, Frozen, Gluten-free, Household, Meat & Poultry, Pantry, Personal Care, Produce.

A grocery element, read from Iris on 18 November 2026:

```json
{
  "id": "fb82994f-94b5-453a-bfde-697dbf07517e",
  "name": "Garlic",
  "element_type": "class",
  "notation": "simple",
  "package_name": "Produce",
  "diagram_usage_count": 10,
  "data": {
    "attributes": [
      { "name": "Unit", "type": "cloves" },
      { "name": "Quantity", "type": "" }
    ]
  }
}
```

The attribute's `type` field holds the value. `Unit` has a default on the element. `Quantity` is blank on the element and set per use in each recipe. `diagram_usage_count` says how many recipes use the item, which is a free popularity measure.

## Recipes

Each recipe is a diagram of type `smart_markdown`. The body is in `data.markdown_source`. Servings, where set, are in `data.servings`.

Ingredients are tokens that point at grocery elements:

```
- {{element:<id>:attr:attributes/Quantity/type=2}} {{element:<id>:attr:attributes/Unit/type=cloves}} {{element:<id>:name}}
```

- `{{element:<id>:name}}` renders the grocery name.
- `{{element:<id>:attr:attributes/Quantity/type=2}}` reads the Quantity attribute, with `=2` as the value for this use.
- `{{element:<id>:attr:attributes/Unit/type}}` with no `=` falls back to the unit on the element. With `=tbsp` it overrides it.
- Some lines have a name token only, with no quantity.

So a recipe can be parsed with one regular expression over `markdown_source`, giving a list of (grocery id, quantity, unit).

### The 43 recipes

Baked salmon · BBQ 1 · Burgers · Chicken and mushroom skewers · Chicken rice · Chilli con carne · Coleslaw · Creamy garlic mussels with broccoli and crusty bread · Crock pot Mediterranean chicken with olives · Dad's potato bake · Dumplings and brocolli · Dumplings with chicken pieces and broccoli · Easy nachos · Egg Pie · Fish pie a la Tata · Fish with frozen chips and carrot-apple surówka · Gołąbki · Ham and cheese sandwiches · Lamb stew (x2 batches) · Lasagne from leftover pork shoulder · Lebneh · Meatballs with rich tomato sauce · Mild chicken, kumara and coconut curry · Mr Bakeman spiced lemonade · One-pot mild Shin noodles with chicken · Pikelets · Pizza · Pork loin with buckwheat and mushroom sauce · Porridge · Prawn curry rice · Prawn fettuccini · Roast chicken · Salmon pasta · Saucy chicken thighs on rice · Sausages with coleslaw and potatoes · Sausies and veg · Shepherds pie · Simple Crudités · Slow cooked pork shoulder · Spaghetti · Tacos · Tomato pasta · Veg stew

Not all are dinners. Porridge, Pikelets, Lebneh, Simple Crudités, the lemonade and the sandwiches need a meal type before the dealer puts them on a Tuesday night. No such field was seen.

## The adding-up already exists

Iris has a global aggregation profile called "Shopping list".

| | |
|---|---|
| Profile id | `f0f2f8e8-345c-590b-a4f3-7ed320a9c8da` |
| Walks | A meal-plan diagram, then the recipe diagrams it references |
| Sums | `attributes/Quantity/type`, bucketed by `attributes/Unit/type` |
| Scales by | Diners per meal (`attributes/Diners/type`) divided by the recipe's `data.servings`. Default 1.0 |
| Groups by | `element.package_name`, which is the aisle |
| Output | Markdown, one line per item, with a per-recipe breakdown |

Call it with `aggregate(source_diagram_id=<meal plan diagram>, profile_id=<above>)`. It also accepts an inline `profile_data` for one-off runs.

Two ways to build on this:

1. **Server side.** Write the week as a meal-plan diagram, call `aggregate`, show the markdown. Least code, but a round trip on every drag.
2. **Client side.** Load recipes and groceries once, parse the tokens, add up in the browser. Instant, and needed anyway for the "2 meals" tags and the dealer. Use `aggregate` as the check that the numbers agree.

## Useful MCP calls

- `package_hierarchy(set_id=<Groceries>)` for the aisles.
- `list_elements(set_id=<Groceries>)` or per `package_id` for the items.
- `list_diagrams(set_id=<Recipes>, page_size=50)` for all 43 recipes with bodies. About 90,000 characters, so save it to a file.
- `list_aggregation_profiles`, `get_aggregation_profile`, `aggregate`.
- `create_diagram` to save a new meal plan or shopping list. Needs sign-in.

The chrisbarlow.nz collection is described as being pulled at build time through an anonymous JSON export. Whether that export is open for this collection was not checked.
