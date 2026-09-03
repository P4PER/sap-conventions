---
name: ui5-conventions
description: Use when creating, renaming or moving any file under a UI5 webapp/ folder - views, fragments, controllers, formatters, delegates, utils, i18n or tests - so it lands with the right name, folder and structure the first time.
---

# UI5 file and folder conventions

Structure only. For UI5 **API** guidance — which control, table types, MDC
delegates, accessibility, how to write QUnit or OPA5 tests — load
`ui5:ui5-best-practices` and its siblings. Do not guess at API rules and do not
restate them here.

## Before creating a file

Read the rule that applies, then name the file:

- **Any file under `webapp/`** — `references/naming-ui5.md`
- **Any `.ts` file** — `references/typescript-layout.md` (size, ordering,
  `types.ts` / `constants.ts` placement)
- **Anything under `webapp/test/`** — `references/testing.md`

## The rules in one screen

```
webapp/
  Component.ts                          fixed
  view/PriceView.view.xml               PascalCase
  controller/PriceView.controller.ts    PascalCase, pairs 1:1 with the view
  controller/PosDialog.ts               fragment controller, pairs with the fragment
  fragment/PosDialog.fragment.xml       PascalCase
  delegate/ItemsTableDelegate.ts        default-exports a class -> PascalCase
  service/UserPreferencesService.ts     default-exports a class -> PascalCase
  model/formatter.ts                    plain module -> camelCase
  util/userPreferences.ts               plain module -> camelCase
  i18n/i18n.properties
  css/style.css
  test/                                 see references/testing.md
```

Folders are singular. `fragments/` and `utils/` are wrong.

**Everything in `controller/` pairs 1:1** with a same-basename artifact: a
`.controller.ts` with a view, a plain `.ts` with a fragment. A module in
`controller/` with neither partner is misplaced — it is either a controller
whose name should match its artifact, or a helper that belongs elsewhere.

**Class-like or plain** decides the casing: a default export that is a class
takes PascalCase, anything else camelCase.

## When editing an existing file

Do not rename files the user did not ask you to touch. If you notice drift, say
so and offer `/conventions-audit`, which fixes references in the same pass.
