# sap-conventions

A Claude Code plugin for consistent file naming, folder layout and module
organization across UI5 and CAP/CDS projects.

Structure is this plugin's concern. UI5 API-level guidance is delegated to the
`ui5:*` skills rather than restated here.

## Install

```
/plugin marketplace add P4PER/sap-conventions
/plugin install sap-conventions
```

To work on the plugin locally instead, point the marketplace at your clone:

```
/plugin marketplace add ./sap-conventions
```

## Skills

| Skill | Loads when |
| --- | --- |
| `ui5-conventions` | creating, renaming or moving files under a `webapp/` folder |
| `cap-conventions` | working in `srv/` or `db/`, running `cds import`, editing `xs-app.json` or `mta.yaml` |
| `conventions-audit` | asked to audit or clean up a project's structure |

## The audit

```
/conventions-audit <path>
```

Reports drift grouped by severity, then repairs it on approval — renames go
through `git mv` with every import, `manifest.json` entry, `Fragment.load` name,
`cds.requires.model` path and `using ... from` updated in the same commit.

The checker underneath is standalone and dependency-free:

```bash
node scripts/audit.mjs <path-to-repo>   # prints JSON, never writes
```

## The rules

Single source of truth, read by all three skills:

- [`references/naming-ui5.md`](references/naming-ui5.md)
- [`references/naming-cap.md`](references/naming-cap.md)
- [`references/typescript-layout.md`](references/typescript-layout.md)
- [`references/duplication.md`](references/duplication.md)
- [`references/testing.md`](references/testing.md)
- [`references/approuter.md`](references/approuter.md)

Design and plan: [`docs/`](docs/)

## The skill reminder

The plugin ships a `UserPromptSubmit` hook (`hooks/hooks.json`). On every
message, in a UI5 or CAP project only, it injects a short reminder naming the
three skills and what each one covers.

It exists because a skill is only used if the model remembers to look for one,
and the instruction to look arrives once per session — at `SessionStart` — then
competes with everything after it. `UserPromptSubmit` fires every turn instead.

A `webapp/` tree makes it a UI5 project, the same test the audit uses. The CAP
half is deliberately stricter than the audit's: a `srv/` or `db/` directory
*and* a `.cds` file inside one of them, or `@sap/cds` in `package.json`. The
audit only ever runs on a repo you point it at, but this fires on every prompt,
and a top-level `db/` is common well outside SAP. Everywhere else the hook
prints nothing, so it costs nothing.

To see it, disable it, or check that it ran, use `/hooks`.

## Development

```bash
npm test
```

Zero dependencies. Node's built-in test runner, fixtures under `test/fixtures/`.
