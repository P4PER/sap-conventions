# Naming — UI5 (`webapp/`)

Rules for file and folder names inside a UI5 application. For UI5 *API*
guidance — which control to use, table types, MDC delegates, accessibility,
QUnit, OPA5 — load `ui5:ui5-best-practices` and its siblings instead. This
document owns structure only.

## Folders are singular   `ui5-folder-name`

The allowed set:

```
view/ controller/ fragment/ model/ util/ delegate/ service/ i18n/ css/ test/
```

Every folder is flat except `test/`, whose internal shape is defined in
[testing.md](testing.md). A plural folder (`fragments/`, `utils/`) is a
violation with a rename fix. An unrecognised folder is a violation without one —
decide where its contents belong.

## Views and fragments are PascalCase   `ui5-artifact-case`

```
view/PriceView.view.xml
fragment/PosDeterminationDialog.fragment.xml
```

## Class-like modules are PascalCase, plain modules camelCase   `ui5-module-case`

A module is **class-like** if either:

- its basename ends in the **role suffix** of its folder — `Delegate` in
  `delegate/`, `Service` in `service/`; or
- it default-exports a class (`export default class` at the start of a line).

Everything else is **plain**.

The role suffix is what carries the signal in `delegate/` and `service/`: UI5
loads a delegate or a service by module path, and they are routinely exported by
reference (`export default PriceViewTableDelegate;`) rather than as a class.
Meanwhile the supporting-data modules that live beside them are plain.

Export shape alone is no signal — `model/formatter.ts` has a default export and
is correctly camelCase, while `service/UserPreferencesService.ts` has none and is
correctly PascalCase.

```
delegate/ItemsTableDelegate.ts        role suffix -> PascalCase
service/UserPreferencesService.ts     role suffix -> PascalCase
delegate/columnTypes.ts               supporting data, no suffix -> camelCase
delegate/itemsTableProperties.ts      supporting data, no suffix -> camelCase
model/formatter.ts                    plain       -> camelCase
util/userPreferences.ts               plain       -> camelCase
util/i18n.ts                          plain       -> camelCase
```

Rationale: the stock UI5 template ships `model/formatter.ts` and
`model/models.ts`. The folder plus the export tells you which rule applies, so
there is never ambiguity at the point of naming a file.

Applies in `model/ util/ delegate/ service/`. `Component.ts` is fixed.

## i18n files have fixed names   `ui5-i18n-name`

```
i18n/i18n.properties
i18n/i18n_de.properties
i18n/i18n_en_GB.properties
```

## Everything in `controller/` pairs 1:1   `ui5-controller-pairing`

```
controller/Main.controller.ts        <->  view/Main.view.xml
controller/PosDeterminationDialog.ts <->  fragment/PosDeterminationDialog.fragment.xml
```

The `.controller.ts` suffix means "extends `sap/ui/core/mvc/Controller`". A
fragment controller is a plain class that owns a fragment — it takes the
fragment's basename and no suffix.

A `*.controller.ts` with no matching view is a violation. A module in
`controller/` with neither partner is reported as a **question**, not a
violation: it is either a controller that should be renamed to match its
artifact, or a helper that belongs outside `controller/`. That call is yours.
