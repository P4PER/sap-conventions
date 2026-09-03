# Testing

These rules govern **where tests live and what they are called** — never whether
they exist. A rule requiring a test per module would fire dozens of times on
first run and teach you to ignore the report. Coverage is a policy decision,
kept separate from structure.

How to *write* the tests is out of scope too: load
`ui5:ui5-best-practices-qunit` and `ui5:ui5-best-practices-opa5` for that.

## CAP and Node: a `test/` tree mirroring `srv/`   `test-location`

```
srv/pos/pos-determination.ts        ->  test/pos/pos-determination.test.ts
srv/pricing/response-mapper.ts      ->  test/pricing/response-mapper.test.ts
srv/price-view-service.ts           ->  test/price-view-service.test.ts
```

- The path under `test/` mirrors the path under `srv/`, with the leading `srv/`
  or `db/` segment dropped.
- Filenames are the module's kebab-case basename plus `.test.ts`.
- No `*.test.ts` anywhere under `srv/` or `db/`.

```json
"scripts": { "test": "tsx --test \"test/**/*.test.ts\"" }
```

Rationale: keeps `srv/` listings free of test files, and lets a build exclude
the whole suite by path rather than by glob.

## UI5: the SAP standard `webapp/test/` tree   `ui5-test-tree`

Co-locating is not an option — `webapp/` is served to the browser.

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

- `webapp/test/` holds exactly two subfolders: `unit/` and `integration/`.
- `testsuite.qunit.ts` is the only module directly inside `webapp/test/`.

### Unit modules end in `.qunit.ts`   `ui5-test-suffix`

Mirroring the path of the module under test, relative to `webapp/`.

### Page objects and journeys are PascalCase   `ui5-test-case`

Applies to `integration/pages/` and `integration/journey/`.

## npm scripts are `<area>:<action>`   `npm-script-name`

Lowercase segments separated by colons:

```
ts:typecheck          not  ts-typecheck
generate:entrypoint   not  generate:entry-point
```

Single-word lifecycle scripts (`test`, `build`, `start`, `clean`) are fine as
they are. Reported as a warning rather than a violation: an npm script rename is
safe locally but touches CI.
