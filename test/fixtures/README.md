# Fixtures

Each fixture is a synthetic repository reproducing drift observed in a real
project, so the tests fail for the same reasons real code does.

| Fixture | Reproduces | Observed in |
| --- | --- | --- |
| `full-repo/` | The conforming baseline. Every check must report zero findings against it. Its `xs-app.json`, `mta.yaml` and `package.json` are real conforming configs, not placeholders — Tasks 7 and 8 read their contents. | — |
| `ui5-drift/` | `fragments/` instead of `fragment/`; `util/I18n.ts` mis-cased; a fragment controller whose basename does not match its fragment; a delegate exported by reference (`export default MyDelegate;`) that must still count as class-like | project-a |
| `cap-drift/` | A bare `srv/service.cds`; camelCase modules under `srv/`; `srv/external/` correctly exempt from kebab-case | project-a |
| `external-drift/` | The `CPI_Pricing` key against a `CpiPricing` file and service name; a SCREAMING_SNAKE service name; retained metadata as `.xml` | project-b, project-a |
| `ts-drift/` | A constant declared after an exported function; one interface declared in two files; files over 300 and over 500 lines; an oversized test file that must stay exempt | project-a, project-b |
| `deploy-drift/` | The catch-all route first instead of last; a route with no `authenticationType`; an MTA module name not derived from `ID`; an app folder disagreeing with the MTA ID | project-b |
| `testing-drift/` | A `*.test.ts` beside its module under `srv/`; a stray folder under `webapp/test/`; a unit module without `.qunit.ts`; a camelCase page object; npm scripts with a hyphen | project-a, project-c |

`full-repo/node_modules/junk/ignored.ts` and `full-repo/gen/srv/ignored.ts`
exist to prove the walker's skip list works, so `.gitignore` is scoped to
`/node_modules/` at the repo root rather than matching at any depth.
