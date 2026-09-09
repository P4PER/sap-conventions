---
name: conventions-audit
description: Use when asked to audit, check, review or clean up a UI5 or CAP project's structure - file naming, folder layout, module organization, external service naming, test placement or approuter and MTA wiring. Reports drift, then repairs it on approval.
---

# Conventions audit

Report first. Fix only what the user approves. Never fix and report in one
breath.

## 1. Run the checker

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/audit.mjs" <path-to-repo>
```

It prints JSON and always exits 0. It never writes to the repo.

```json
{
  "root": "...",
  "halves": { "ui5": ["app/priceview/webapp"], "cap": true, "router": true },
  "summary": { "violation": 3, "warning": 8, "question": 2, "total": 13 },
  "findings": [
    { "check": 1, "id": "ui5-module-case", "severity": "violation",
      "file": "app/priceview/webapp/util/I18n.ts", "line": null,
      "message": "plain module must be camelCase; \"I18n\" is not",
      "fix": { "kind": "rename", "to": "app/priceview/webapp/util/i18n.ts" } }
  ]
}
```

## 2. Render the report

Group by severity, then by file. For each finding show the file, the message,
and the rename target when `fix` is present. Findings sharing an `id` are one
group — a reader wants "9 files are mis-cased", not nine paragraphs.

Report **questions separately and last**. These need human judgement and are
never auto-fixed: a module in `controller/` with no partner, an app folder that
disagrees with the MTA ID, an oversized file whose seams are a design call, two
functions with the same shape but different constants
(`ts-parameterizable-function`).

Cite the rule by its check id. `references/` documents every id, and the
matching section explains why the rule exists.

## 3. Stop

Do not fix anything yet. Ask which groups to fix.

## 4. Fix, one group at a time

Before touching anything, confirm the working tree is clean:

```bash
git status --porcelain
```

If it is not empty, **refuse and say why** — the point is a diff the user can
review in isolation.

Then, per group:

1. `git mv <old> <new>` for each file in the group.
2. Update every reference in the same commit:
   - TypeScript and JavaScript imports
   - `manifest.json` entries
   - `Fragment.load({ name: "..." })` and any other UI5 module path string
   - `cds.requires.<key>.model` in `package.json`
   - `using ... from` in `.cds` files
   - `path:` in `mta.yaml`, `welcomeFile` in `xs-app.json`
3. Search the repo for the old basename and confirm nothing still points at it.
4. Run the project's own tests if it has any.
5. Commit, naming the check id in the message.

## Findings with no rename

`ts-duplicate-function` and `ts-parameterizable-function` arrive without a
`fix`. There is nothing to `git mv` — the repair is to write a shared function
and change the call sites, which is a code change the user has to want.

Bodies count from two lines up, so these are not all equally actionable. A
short helper carried from one app into the next is worth extracting; two
handlers that happen to share two lines inside one controller usually are not,
and a shared import can cost more than the copy. Say which is which rather
than handing over every finding as a repair waiting to happen.

Report them, name the sites and the folder the shared version belongs in, and
stop there. If the user asks for the extraction, do it as its own commit,
separate from any rename group: move the body into the named folder, replace
each site with a call, run the project's tests, and confirm nothing else still
holds a copy.

## Renames that need more than a rename

- **External services** — the `cds.requires` key, the file basename and the
  `service <Name>` inside the file must all change together, or the identity
  check simply moves rather than resolves.
- **App folder** (`mta-app-id`) — renaming `app/<app-id>/` moves the UI5
  namespace with it, so `Component.ts`, `manifest.json` and every module path
  string change too. Confirm with the user before starting.
- **Test relocation** (`test-location`) — moving `srv/**/*.test.ts` into `test/`
  breaks every relative import in those files. Fix the import depths in the same
  commit and run the suite before committing.
