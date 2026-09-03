# sap-conventions — Design

Date: 2026-09-03
Status: Approved (design); implementation plan pending

## 1. Purpose

A Claude Code plugin that makes file naming, folder layout and module
organization consistent across every UI5 / CAP project, and that can sweep an
existing project to report and repair drift.

It is deliberately **not** project-specific. The rules apply to any UI5 or
CAP/CDS codebase, not only the repositories that motivated it.

### Problem

Three sibling projects (`project-a`, `project-b`,
`project-c`) disagree with each other on nearly every structural choice:

| Concern             | project-a                     | project-b                        | project-c                    |
| ------------------- | ----------------------------- | -------------------------------- | ---------------------------- |
| CDS service file    | `srv/service.cds`             | `srv/change-notification-service.cds` | —                       |
| `srv/` TS naming    | camelCase (`readPipeline.ts`) | kebab-case (`cbo-odata.ts`)      | —                            |
| Types location      | `srv/pricing/simulationTypes.ts` | `srv/types/cbo.types.ts`      | —                            |
| UI5 util naming     | `util/I18n.ts`                | `util/userPreferences.ts`        | `util/I18n.ts`, `util/Formatter.ts` |
| Fragments folder    | `webapp/fragments/`           | —                                | `webapp/view/`               |
| External service    | `ZAPI_SALES_ORDER_SIMULATION_SRV` | `SalesCloudCBO`, `zchangenotifications` | —                 |

## 2. Non-goals

- **Restating SAP UI5 guidance.** The `ui5:*` plugin skills already cover UI5
  API-level rules (best practices, tables, MDC, accessibility, OPA5, QUnit).
  This plugin owns *structure* and delegates *API guidance* to those skills.
  Duplicated SAP rules would rot on the next UI5 release.
- **Code quality review.** Not a bug hunter. `/code-review` covers that.
- **Formatting.** Prettier/ESLint territory. No overlap.

## 3. Distribution

Own git repository, installed as a plugin via `/plugin`. Versioned and
shareable with the team; not a per-repo copy (three copies to sync is the drift
problem itself) and not a personal `~/.claude/skills/` folder (teammates get
nothing).

```
sap-conventions/
  .claude-plugin/
    plugin.json
    marketplace.json
  skills/
    ui5-conventions/SKILL.md        author-time; auto-loads on webapp/ work
    cap-conventions/SKILL.md        author-time; auto-loads on srv/ + db/ work
    conventions-audit/SKILL.md      /conventions-audit
  references/
    naming-ui5.md
    naming-cap.md
    typescript-layout.md            shared by both halves
    approuter.md
  scripts/
    audit.mjs                       deterministic checks -> JSON
```

The author-time skill is split in two so each half auto-loads only when
relevant: a standalone UI5 app has no `srv/`, a headless CAP service has no
`webapp/`. `typescript-layout.md` is shared — size, ordering and
`types.ts`/`constants.ts` placement are identical in both halves; only filename
casing differs by folder, and that is settled per half.

## 4. Naming — UI5 (`webapp/`)

All subfolders singular: `view/ controller/ fragment/ model/ util/ delegate/
service/ i18n/ css/ test/`. Every folder is flat except `test/`, whose internal
structure is fixed by §8.2.

| Artifact          | Rule                                        | Example                                        |
| ----------------- | ------------------------------------------- | ---------------------------------------------- |
| Component         | fixed                                       | `Component.ts`                                  |
| View / controller | PascalCase, basenames match 1:1             | `view/Main.view.xml` ↔ `controller/Main.controller.ts` |
| Fragment          | PascalCase, in `fragment/`                  | `fragment/PosDeterminationDialog.fragment.xml`  |
| Class-like module | PascalCase                                  | `delegate/ItemsTableDelegate.ts`, `service/UserPreferencesService.ts` |
| Plain module      | camelCase                                   | `model/formatter.ts`, `util/userPreferences.ts` |
| i18n / css        | fixed                                       | `i18n/i18n.properties`, `i18n/i18n_de.properties`, `css/style.css` |

**Pairing rule.** Every module in `controller/` pairs 1:1 with a same-basename
artifact — `X.controller.ts` ↔ `view/X.view.xml`, or `X.ts` ↔
`fragment/X.fragment.xml`. A module in `controller/` with no partner is
misplaced. The `.controller.ts` suffix stays meaningful as "extends
`sap/ui/core/mvc/Controller`"; a fragment controller is a plain class and does
not carry it.

**Class-like vs plain, decided mechanically.** A module is class-like if its
default export is a class (`export default class ...`); otherwise it is plain.
The audit reads the export, so check 1 needs no judgement.

Rationale for camelCase on plain modules: the stock UI5 template ships
`model/formatter.ts` and `model/models.ts`. The folder tells you which rule
applies, so there is never ambiguity at the point of naming a file.

## 5. Naming — CAP (`srv/`, `db/`)

Kebab-case filenames; PascalCase identifiers inside CDS.

| Artifact         | Rule                                    | Example                                    |
| ---------------- | --------------------------------------- | ------------------------------------------ |
| Service def      | `<domain>-service.cds`                  | `srv/price-view-service.cds`               |
| Service handler  | same basename as its `.cds`             | `srv/price-view-service.ts`                |
| Domain module    | kebab-case                              | `srv/pos/pos-determination.ts`             |
| Test             | beside its module                       | `srv/pos/pos-determination.test.ts`        |
| Model            | kebab-case                              | `db/schema.cds`, `db/pos-tickets.cds`      |
| CDS identifiers  | service `XyzService`; entity PascalCase plural; element camelCase | `service PriceViewService { entity QuoteItems { itemNumber } }` |

Rationale: CAP capire ships kebab-case (`cat-service.js`, `admin-service.js`)
and pairs the handler to its `.cds` by basename.

## 6. External services (`srv/external/`)

### 6.1 Three-way identity (mandatory, mechanical)

```
cds.requires key  ==  srv/external/<basename>  ==  service <Name> { } in the file
```

This holds in 10 of the 11 external services across the two CAP repos today and
is already broken once:

```
CPI_Pricing   rest   srv/external/CpiPricing   ->   service CpiPricing {
^^^ key                          ^^^ file and service name disagree
```

The filename is **not** wire contract. Binding to the backend is done by
`credentials.destination` + `credentials.path`. The name is free; the identity
across the three places is not.

### 6.2 Style: PascalCase logical alias

One rule for OData and REST alike. The backend service ID stays recoverable
from `credentials.path` in `package.json`, and is repeated in a header comment
in the `.cds` file.

```
srv/external/
  C4C.cds                      service C4C
  C4cPartyDetermination.cds    service C4cPartyDetermination
  C4cEmployee.cds              service C4cEmployee
  SalesOrderSimulation.cds     service SalesOrderSimulation
  ChangeNotifications.cds      service ChangeNotifications
  CpiPricing.cds               service CpiPricing
```

Rejected: mirroring the SAP service ID verbatim. It costs no rename work after
`cds import`, but hand-written REST services have no SAP ID, so the folder stays
permanently mixed-case — which is the state both repos are in now.

Cost accepted: each `cds import` needs a rename pass (file, `service` name,
`cds.requires` key, `model:` path).

### 6.3 Retained metadata

The downloaded metadata kept alongside the model uses `.edmx`, not `.xml`.
Cosmetic, but currently inconsistent (`ZAPI_SALES_ORDER_SIMULATION_SRV.xml` in
pricing vs `zchangenotifications.edmx` in change_notification).

## 7. TypeScript layout (both halves)

### 7.1 Size

Warn at **300** lines, violation at **500**. Test files exempt.

Calibrated against the 61 source files in the three repos: 53 pass, and the 8
that fail are exactly the ones a reviewer would point at.

```
754  srv/service.ts                             violation
636  srv/change-notification-service.ts         violation
609  srv/determination-service.ts               violation
370  srv/dev-seed-data.ts                       warn
353  webapp/controller/PriceView.controller.ts  warn
352  srv/readPipeline.ts                        warn
347  webapp/controller/PosDetermination.ts      warn
319  webapp/controller/Main.controller.ts       warn
```

All three violations are CAP service handlers. The rule that fixes them also
keeps them fixed: a handler file registers events and delegates; the logic lives
in the domain modules beside it.

### 7.2 Placement — nearest-common-folder rule

- A type used by **one** module stays in that module.
- Used by **two or more** → `types.ts` in their nearest shared folder.
- Same rule for literals → `constants.ts`.
- No `types/` folder, no `.types.ts` suffix.

So `srv/types/cbo.types.ts` → `srv/types.ts` if genuinely srv-wide, otherwise
down into the folder that uses it; `srv/pricing/simulationTypes.ts` →
`srv/pricing/types.ts`.

### 7.3 Intra-file order

One fixed sequence, so any file reads the same way:

```ts
// 1. imports          external, then internal, blank line between
// 2. types            local to this module
// 3. constants        module-level literals
// 4. exported API     the functions this module exists to provide
// 5. local helpers    not exported
```

### 7.4 One concern per file

Reported, never auto-fixed — splitting is a judgement call. Worked example:
`webapp/controller/PosDetermination.ts` is the controller for
`PosDeterminationDialog.fragment.xml` (plain class, `open()`/`destroy()`
lifecycle, handlers the fragment binds via `.onX`). The pairing rule makes its
rename mechanical:

```
controller/PosDetermination.ts                 -> controller/PosDeterminationDialog.ts
fragments/PosDeterminationDialog.fragment.xml  -> fragment/PosDeterminationDialog.fragment.xml
```

At 347 lines it still trips the warn afterwards. The natural seam is the
ticket-creation block (`_createTickets` / `_markCreated` / `_resolveQuoteId`,
~110 lines) — backend orchestration rather than dialog presentation, so
`service/PosTicketService.ts`. That is a reported follow-up, not part of the
rename.

## 8. Testing

These rules govern **where tests live and what they are called** — not whether
they exist. Requiring a test per module would emit dozens of findings on day one
and train the reader to ignore the report. Coverage is a policy decision, kept
separate from structure.

### 8.1 CAP / Node — a `test/` tree mirroring `srv/`

```
srv/pos/pos-determination.ts        ->  test/pos/pos-determination.test.ts
srv/pricing/response-mapper.ts      ->  test/pricing/response-mapper.test.ts
srv/price-view-service.ts           ->  test/price-view-service.test.ts
```

- Test filenames are the module's kebab-case basename plus `.test.ts`.
- The path under `test/` mirrors the path under `srv/`, with the `srv/` segment
  dropped.
- No `*.test.ts` file anywhere under `srv/` or `db/`.
- `package.json` runs them as `"test": "tsx --test \"test/**/*.test.ts\""`.

This relocates the 19 co-located test files in `project-a`; they are the
only CAP tests that exist across the three repos today.

Rationale: keeps `srv/` listings free of test files, and lets the whole suite be
excluded from a build by path rather than by glob.

### 8.2 UI5 — the SAP standard `webapp/test/` tree

Co-locating is not an option: `webapp/` is served to the browser.

```
webapp/test/
  testsuite.qunit.html
  testsuite.qunit.ts
  unit/
    unitTests.qunit.ts
    controller/PriceView.controller.qunit.ts
    model/formatter.qunit.ts
  integration/
    opaTests.qunit.ts
    AllJourneys.ts
    pages/PriceView.ts
    journey/PosDeterminationJourney.ts
```

- `test/` is an allowed `webapp/` folder, and the only one with subfolders
  beyond one level.
- Unit test modules are `<Subject>.qunit.ts`, mirroring the path of the module
  under test relative to `webapp/`.
- Integration tests live in `integration/`, with page objects in
  `integration/pages/` and journeys in `integration/journey/`, both PascalCase.
- No rules here about how to *write* the tests — `ui5:ui5-best-practices-qunit`
  and `ui5:ui5-best-practices-opa5` own that, and this plugin delegates to them.

No UI5 tests exist in any of the three repos today, so this section is
prescriptive rather than descriptive.

### 8.3 npm script naming

Scripts are colon-namespaced, lowercase, `<area>:<action>`:

```
ts:typecheck      not  ts-typecheck
generate:entrypoint    consistently, not generate:entry-point
```

Current drift: `ts:typecheck` in pricing and change_notification vs
`ts-typecheck` in print; `generate:entry-point` vs `generate:entrypoint`.
Reported as a warning — an npm script rename is safe but touches CI.

## 9. Approuter and MTA

Already the most consistent area across the three repos; the rules codify what
is there.

**`app/router/xs-app.json`**

- `authenticationMethod: "route"`.
- Routes ordered specific → catch-all; the `^(.*)$` html5-apps-repo-rt route is
  always last and carries `cacheControl: "no-cache, must-revalidate"`.
- Every route sets `authenticationType: "xsuaa"`.
- `csrfProtection: true` on any route to a destination that accepts writes.
- `welcomeFile` is `/<app-id>/index.html`.
- A `cors` block is present only when the app is embedded in C4C (pricing and
  print have one; change_notification does not, correctly).

**`mta.yaml`** — every module and resource derives from the MTA `ID`:

```
ID: <mta-id>
  <mta-id>-srv              nodejs,  path gen/srv
  <mta-id>                  approuter.nodejs, path app/router
  <mta-id>-ui-deployer      com.sap.application.content
  <mta-id>-ui               html5,   path app/<app-id>
  <mta-id>-auth | -destination | -connectivity | -html5-host | -html5-runtime
```

**App id alignment.** `app/<app-id>/` must match the UI5 namespace, the
`welcomeFile` path segment and the `<mta-id>-ui` module. `<app-id>` is lowercase
with no separators, since it becomes a UI5 namespace segment. Currently
`change_notification` has MTA `ID: change-notification` against
`app/changenotifications` — reported as a finding for the user to resolve, since
either side can move.

## 10. The audit

`/conventions-audit [path]` detects which halves the repo has (`webapp/`,
`srv/`, `db/`, `app/router/`) and checks only those. It runs `scripts/audit.mjs`,
which emits JSON; the skill renders a grouped report by severity and stops.

### 10.1 Script decides (deterministic)

| #  | Check                                                                     |
| -- | ------------------------------------------------------------------------- |
| 1  | Filename casing per folder role — kebab in `srv/`/`db/`, camel/Pascal in `webapp/` |
| 2  | `controller/` pairing — every module has a `view/` or `fragment/` partner, and vice versa |
| 3  | `.cds` ↔ handler basename pairing in `srv/`                              |
| 4  | External three-way identity (§6.1)                                        |
| 5  | Folder names — expected set, singular                                     |
| 6  | File length — warn 300, violation 500, tests exempt                       |
| 7  | Intra-file order — imports → types → constants → exports → helpers        |
| 8  | Identical type/const name declared in 2+ modules → belongs in `types.ts`/`constants.ts` |
| 9  | Retained metadata is `.edmx`                                              |
| 10 | `xs-app.json` route ordering and required flags (§9)                      |
| 11 | `mta.yaml` module/resource names derive from `ID` (§9)                    |
| 12 | No `*.test.ts` under `srv/` or `db/`; mirrored path under `test/` (§8.1)  |
| 13 | `webapp/test/` tree shape and `.qunit.ts` naming (§8.2)                   |
| 14 | npm scripts are `<area>:<action>` (§8.3)                                  |

### 10.2 Model judges (reported as questions, never auto-fixed)

Whether an oversized file's seams are in the right place; whether a name is
meaningful; whether a misplaced module should move or the folder should change.

### 10.3 Fix pass

On approval, one group at a time. Renames use `git mv`, with every referencing
import, `manifest.json` entry, `Fragment.load` name string,
`cds.requires.model` path and `using ... from` updated in the same commit.

Requires a clean working tree — refuses otherwise, so the diff is always
reviewable in isolation.

## 11. Decisions log

| Decision                                   | Chosen                                             | Rejected                                        |
| ------------------------------------------ | -------------------------------------------------- | ----------------------------------------------- |
| Shape                                      | Author-time guide + audit command                   | Doc only; audit only                            |
| Distribution                               | Own git repo as a plugin                            | `~/.claude/skills/`; per-repo `.claude/skills/` |
| Relation to `ui5:*` skills                 | Delegate, don't restate                             | Self-contained copy of SAP guidance             |
| Plugin name                                | `sap-conventions`                                   | `ui5-cap-conventions` (couples the two stacks)  |
| Naming rule                                | Role-based per SAP defaults                         | Kebab everywhere; camel everywhere              |
| Plain modules                              | kebab in `srv/`, camel in `webapp/`                 | Kebab everywhere; camel everywhere              |
| External service style                     | PascalCase logical alias                            | SAP service ID verbatim; verbatim-for-OData     |
| Fragment controllers                       | `controller/`, paired by basename                   | `dialog/` folder; beside fragment               |
| Audit teeth                                | Report, then fix on approval                        | Report only; auto-fix all; two commands         |
| CAP test location                          | Separate `test/` tree mirroring `srv/`              | Co-located `*.test.ts` beside the module        |
| UI5 test location                          | SAP standard `webapp/test/{unit,integration}`       | Deferred; flat `webapp/test/`                   |
| Test-existence rules                       | Out of scope — structure only                       | Requiring a test per module                     |

## 12. Open items for implementation

- `references/approuter.md` is the thinnest section; §9 is derived from three
  repos only. Expect to revise once the plugin meets a fourth project.
- Whether `audit.mjs` check 7 (intra-file order) can be done reliably with
  regex or needs a TS AST parse. Prefer regex first; escalate only if noisy.
