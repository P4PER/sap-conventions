# Fixtures

Each fixture is a synthetic repository reproducing drift observed in a real
project, so the tests fail for the same reasons real code does.

| Fixture | Reproduces | Observed in |
| --- | --- | --- |
| `full-repo/` | The conforming baseline. Every check must report zero findings against it. Its `xs-app.json`, `mta.yaml` and `package.json` are real conforming configs, not placeholders — Tasks 7 and 8 read their contents. | — |
| `ui5-drift/` | `fragments/` instead of `fragment/`; `util/I18n.ts` mis-cased; a fragment controller whose basename does not match its fragment; a delegate exported by reference (`export default MyDelegate;`) that must still count as class-like; a `.d.ts` that is not a module to be cased; a nested module judged by its basename and renamed inside its own folder | project-a |
| `cap-drift/` | A bare `srv/service.cds`; camelCase modules under `srv/`; `srv/external/` correctly exempt from kebab-case; a `db/data/*.csv` and a `README.md` that the kebab rule must leave alone | project-a |
| `external-drift/` | The `CPI_Pricing` key against a `CpiPricing` file and service name; a SCREAMING_SNAKE service name; retained metadata as `.xml` | project-b, project-a |
| `ts-drift/` | A constant declared after an exported function; one interface declared in two files; files over 300 and over 500 lines; an oversized test file that must stay exempt; exported arrow functions that are API rather than constants; a statement whose trailing whitespace must not hide it | project-a, project-b |
| `deploy-drift/` | The catch-all route first instead of last; a route with no `authenticationType`; an MTA module name not derived from `ID`; an app folder disagreeing with the MTA ID; a `requires:` block whose names are references rather than declarations, with the module's own `path:` after it | project-b |
| `mta-only/` | An `mta.yaml` in a repo with no approuter, whose module names must still be checked | — |
| `router-broken/` | An `xs-app.json` whose `routes` is an object, which must be reported rather than thrown | — |
| `testing-drift/` | A `*.test.ts` beside its module under `srv/` and one under `db/`; a stray folder under `webapp/test/`; a unit module without `.qunit.ts`; a camelCase page object; a nested journey renamed inside its own folder; npm scripts with a hyphen | project-a, project-c |
| `test-collision/` | A `srv/` and a `db/` test that map onto one `test/` path, so the rename must be withheld | — |

`full-repo/node_modules/junk/ignored.ts` and `full-repo/gen/srv/ignored.ts`
exist to prove the walker's skip list works, so `.gitignore` is scoped to
`/node_modules/` at the repo root rather than matching at any depth.
