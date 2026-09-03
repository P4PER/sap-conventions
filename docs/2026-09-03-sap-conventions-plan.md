# sap-conventions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `sap-conventions` Claude Code plugin — three skills backed by four reference documents and a zero-dependency Node checker that reports UI5/CAP structural drift and repairs it on approval.

**Architecture:** A plugin repo holding (a) `references/*.md` as the single source of truth for the rules, (b) three `SKILL.md` files that consume those references — two author-time, one command-driven, and (c) `scripts/audit.mjs`, an orchestrator over five focused check modules that emits JSON findings. The skill renders the JSON and drives the fix pass; the script never edits files.

**Tech Stack:** Node 25 ESM (`.mjs`), `node --test` + `node:assert/strict` (zero dependencies), Markdown.

**Spec:** `docs/2026-09-03-sap-conventions-design.md`

## Global Constraints

- **Zero runtime dependencies.** Node 25 resolves `node --test <dir>` as a module path, so the suite runs via the explicit glob `node --test "test/**/*.test.mjs"` — `.mjs`-only, so the `.test.ts` files inside `test/fixtures/` are never executed. No npm packages in `dependencies` or `devDependencies`. Tests use the built-in `node --test` runner and `node:assert/strict`. YAML and JSON5 are parsed with targeted regex, never a library.
- **The script never writes.** `audit.mjs` is read-only and always exits 0 unless it crashes. All mutation happens in the fix pass, driven by the skill.
- **The plugin obeys its own rules.** Its own `.mjs` modules are kebab-case, ordered imports → types → constants → exports → helpers, and kept under 300 lines.
- **Skill files delegate, never restate.** Any UI5 API-level guidance points at `ui5:ui5-best-practices` and its siblings. No SAP API rules are copied into this repo.
- **Directories always skipped when walking:** `node_modules`, `.git`, `dist`, `gen`, `@cds-models`, `_out`, `mta_archives`, `resources`, `coverage`.
- **Casing regexes, used verbatim everywhere:**
  - PascalCase `/^[A-Z][A-Za-z0-9]*$/`
  - camelCase `/^[a-z][A-Za-z0-9]*$/`
  - kebab-case `/^[a-z0-9]+(-[a-z0-9]+)*$/`
- **Severities:** `violation` (breaks a mandatory rule), `warning` (soft threshold), `question` (needs human judgement, never auto-fixed).

---

## File Structure

```
sap-conventions/
  .claude-plugin/
    plugin.json                        plugin manifest
    marketplace.json                   single-plugin marketplace, source "./"
  package.json                         name, type:module, test script
  README.md                            exists — updated in Task 10
  docs/
    2026-09-03-sap-conventions-design.md   exists (spec)
    2026-09-03-sap-conventions-plan.md     exists (this file)
  references/
    naming-ui5.md                      spec §4
    naming-cap.md                      spec §5 + §6
    typescript-layout.md               spec §7
    testing.md                         spec §8
    approuter.md                       spec §9
  skills/
    ui5-conventions/SKILL.md
    cap-conventions/SKILL.md
    conventions-audit/SKILL.md
  scripts/
    audit.mjs                          CLI + orchestrator
    lib/
      finding.mjs                      Finding shape, severities, casing regexes
      walk.mjs                         file discovery + half detection
      checks/
        ui5-naming.mjs                 checks 1, 2, 5 (webapp half)
        cap-naming.mjs                 checks 1, 3, 5 (srv/db half)
        external-services.mjs          checks 4, 9
        ts-layout.mjs                  checks 6, 7, 8
        deployment.mjs                 checks 10, 11
        testing.mjs                    checks 12, 13, 14
  test/                                mirrors scripts/, per spec 8.1
    fixtures/                          synthetic repos, one dir per scenario
    manifest.test.mjs                  repo-level, no scripts/ counterpart
    references.test.mjs                repo-level
    skills.test.mjs                    repo-level
    audit.test.mjs
    lib/
      walk.test.mjs
      checks/
        ui5-naming.test.mjs
        cap-naming.test.mjs
        external-services.test.mjs
        ts-layout.test.mjs
        deployment.test.mjs
        testing.test.mjs
```

One check module per spec section keeps each file well under the 300-line
threshold the plugin itself enforces, and lets a reviewer reject one check
without touching its neighbours.

`test/` mirrors `scripts/` rather than sitting flat, because spec §8.1 is the
rule this plugin enforces on everyone else. The three repo-level test files have
no `scripts/` counterpart and stay at the root of `test/`.

---

### Task 1: Repo scaffolding and plugin manifests

**Files:**
- Create: `package.json`
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`
- Test: `test/manifest.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm test` runs `node --test test/`. The repo is installable via `/plugin marketplace add <path>`.

- [ ] **Step 1: Write the failing test**

`test/manifest.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => JSON.parse(readFileSync(root + p, "utf8"));

test("plugin.json declares the plugin identity", () => {
    const m = read(".claude-plugin/plugin.json");
    assert.equal(m.name, "sap-conventions");
    assert.match(m.version, /^\d+\.\d+\.\d+$/);
    assert.ok(m.description.length > 20);
});

test("marketplace.json lists this plugin at the repo root", () => {
    const m = read(".claude-plugin/marketplace.json");
    assert.equal(m.name, "sap-conventions");
    assert.equal(m.plugins.length, 1);
    assert.equal(m.plugins[0].name, "sap-conventions");
    assert.equal(m.plugins[0].source, "./");
});

test("package.json has no dependencies", () => {
    const p = read("package.json");
    assert.equal(p.type, "module");
    assert.deepEqual(p.dependencies ?? {}, {});
    assert.deepEqual(p.devDependencies ?? {}, {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `ENOENT` on `package.json` / `.claude-plugin/plugin.json`.

- [ ] **Step 3: Write minimal implementation**

`package.json`:

```json
{
  "name": "sap-conventions",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Structural conventions checker for UI5 and CAP projects",
  "scripts": {
    "test": "node --test \"test/**/*.test.mjs\""
  }
}
```

`.claude-plugin/plugin.json`:

```json
{
  "name": "sap-conventions",
  "version": "0.1.0",
  "description": "Consistent file naming, folder layout and module organization for UI5 and CAP/CDS projects, with an audit command that reports and repairs drift.",
  "author": {
    "name": "Timon Wegener"
  },
  "keywords": ["ui5", "sapui5", "cap", "cds", "sap", "conventions", "naming", "approuter"]
}
```

`.claude-plugin/marketplace.json`:

```json
{
  "name": "sap-conventions",
  "owner": {
    "name": "Timon Wegener"
  },
  "metadata": {
    "description": "Structural conventions for UI5 and CAP/CDS projects.",
    "version": "0.1.0"
  },
  "plugins": [
    {
      "name": "sap-conventions",
      "description": "Consistent file naming, folder layout and module organization for UI5 and CAP/CDS projects.",
      "source": "./",
      "category": "development"
    }
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add package.json .claude-plugin test/manifest.test.mjs
git commit -m "feat: scaffold plugin manifests and test runner"
```

---

### Task 2: Finding shape and repository walker

**Files:**
- Create: `scripts/lib/finding.mjs`
- Create: `scripts/lib/walk.mjs`
- Create: `test/fixtures/full-repo/` (see Step 1)
- Test: `test/lib/walk.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `finding({check, id, severity, file, message, line?, fix?}) -> Finding`
  - `PASCAL`, `CAMEL`, `KEBAB` — the three regexes from Global Constraints
  - `detectHalves(root) -> {ui5: string[], cap: boolean, router: boolean}` where `ui5` is a list of repo-relative webapp directories
  - `listFiles(root, subdir) -> string[]` — repo-relative paths, sorted, skip-list applied
  - `SKIP_DIRS` — the skip set

- [ ] **Step 1: Build the shared fixture**

```bash
mkdir -p test/fixtures/full-repo/app/priceview/webapp/{view,controller,fragment,model,util,i18n,css}
mkdir -p test/fixtures/full-repo/app/router
mkdir -p test/fixtures/full-repo/srv/external test/fixtures/full-repo/db
mkdir -p test/fixtures/full-repo/node_modules/junk test/fixtures/full-repo/gen/srv

: > test/fixtures/full-repo/app/priceview/webapp/Component.ts
: > test/fixtures/full-repo/app/priceview/webapp/view/Main.view.xml
: > test/fixtures/full-repo/app/priceview/webapp/controller/Main.controller.ts
: > test/fixtures/full-repo/app/priceview/webapp/fragment/ItemsTable.fragment.xml
: > test/fixtures/full-repo/app/priceview/webapp/model/formatter.ts
: > test/fixtures/full-repo/app/priceview/webapp/i18n/i18n.properties
: > test/fixtures/full-repo/app/priceview/webapp/css/style.css
: > test/fixtures/full-repo/srv/price-view-service.cds
: > test/fixtures/full-repo/srv/price-view-service.ts
: > test/fixtures/full-repo/db/schema.cds
: > test/fixtures/full-repo/node_modules/junk/ignored.ts
: > test/fixtures/full-repo/gen/srv/ignored.ts
echo '{}' > test/fixtures/full-repo/app/router/xs-app.json
echo '{}' > test/fixtures/full-repo/package.json
```

- [ ] **Step 2: Write the failing test**

`test/lib/walk.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { detectHalves, listFiles } from "../../scripts/lib/walk.mjs";
import { PASCAL, CAMEL, KEBAB } from "../../scripts/lib/finding.mjs";

const fixture = fileURLToPath(new URL("../fixtures/full-repo", import.meta.url));

test("detectHalves finds every half of a full repo", () => {
    const halves = detectHalves(fixture);
    assert.deepEqual(halves.ui5, ["app/priceview/webapp"]);
    assert.equal(halves.cap, true);
    assert.equal(halves.router, true);
});

test("listFiles returns sorted repo-relative paths", () => {
    const files = listFiles(fixture, "srv");
    assert.deepEqual(files, [
        "srv/price-view-service.cds",
        "srv/price-view-service.ts",
    ]);
});

test("listFiles skips node_modules and generated output", () => {
    const files = listFiles(fixture, ".");
    assert.ok(!files.some((f) => f.includes("node_modules")));
    assert.ok(!files.some((f) => f.startsWith("gen/")));
});

test("casing regexes accept and reject the right names", () => {
    assert.ok(PASCAL.test("PosDeterminationDialog"));
    assert.ok(!PASCAL.test("posDetermination"));
    assert.ok(CAMEL.test("userPreferences"));
    assert.ok(!CAMEL.test("UserPreferences"));
    assert.ok(KEBAB.test("pos-determination"));
    assert.ok(!KEBAB.test("posDetermination"));
    assert.ok(!KEBAB.test("cbo_odata"));
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/lib/walk.test.mjs`
Expected: FAIL — `Cannot find module '../../scripts/lib/walk.mjs'`.

- [ ] **Step 4: Implement `scripts/lib/finding.mjs`**

```js
// Shared vocabulary for every check module.

export const PASCAL = /^[A-Z][A-Za-z0-9]*$/;
export const CAMEL = /^[a-z][A-Za-z0-9]*$/;
export const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const VIOLATION = "violation";
export const WARNING = "warning";
export const QUESTION = "question";

export function finding({ check, id, severity, file, message, line = null, fix = null }) {
    return { check, id, severity, file, line, message, fix };
}

export function rename(to) {
    return { kind: "rename", to };
}
```

- [ ] **Step 5: Implement `scripts/lib/walk.mjs`**

```js
import { readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const SKIP_DIRS = new Set([
    "node_modules", ".git", "dist", "gen", "@cds-models",
    "_out", "mta_archives", "resources", "coverage",
]);

export function listFiles(root, subdir = ".") {
    const start = join(root, subdir);
    if (!existsSync(start)) return [];
    const out = [];
    walk(start);
    return out.sort();

    function walk(dir) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                if (SKIP_DIRS.has(entry.name)) continue;
                walk(join(dir, entry.name));
            } else if (entry.isFile()) {
                out.push(relative(root, join(dir, entry.name)).split(sep).join("/"));
            }
        }
    }
}

export function detectHalves(root) {
    return {
        ui5: findWebapps(root),
        cap: existsSync(join(root, "srv")) || existsSync(join(root, "db")),
        router: existsSync(join(root, "app", "router", "xs-app.json")),
    };
}

function findWebapps(root) {
    const found = [];
    if (existsSync(join(root, "webapp"))) found.push("webapp");
    const appDir = join(root, "app");
    if (existsSync(appDir) && statSync(appDir).isDirectory()) {
        for (const entry of readdirSync(appDir, { withFileTypes: true })) {
            if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
            if (existsSync(join(appDir, entry.name, "webapp"))) {
                found.push(`app/${entry.name}/webapp`);
            }
        }
    }
    return found.sort();
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test test/lib/walk.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/finding.mjs scripts/lib/walk.mjs test/lib/walk.test.mjs test/fixtures/full-repo
git commit -m "feat: add finding vocabulary and repository walker"
```

---

### Task 3: UI5 naming checks (spec §4, checks 1, 2, 5)

**Files:**
- Create: `scripts/lib/checks/ui5-naming.mjs`
- Create: `test/fixtures/ui5-drift/`
- Test: `test/lib/checks/ui5-naming.test.mjs`

**Interfaces:**
- Consumes: `finding`, `rename`, `PASCAL`, `CAMEL`, `VIOLATION`, `QUESTION` from `finding.mjs`; `listFiles` from `walk.mjs`.
- Produces: `checkUi5Naming(root, webappDir) -> Finding[]`

**Rules implemented:**

1. Folder names are the singular allowed set: `view controller fragment model util delegate service i18n css test`. A plural or unknown folder is a `violation` with a rename fix when the singular form is known. `test/` is allowed here but its internal shape is Task 8's concern, not this module's.
2. `controller/X.controller.ts` requires `view/X.view.xml`; `controller/X.ts` requires `fragment/X.fragment.xml`; a `controller/` module with neither partner is a `question`.
3. `view/*.view.xml` and `fragment/*.fragment.xml` basenames are PascalCase.
4. In `model util delegate service`, a `.ts` whose source matches `/^export default class\s/m` must be PascalCase; otherwise camelCase.
5. `i18n/` holds only `i18n.properties` and `i18n_<locale>.properties`.

- [ ] **Step 1: Build the drift fixture**

```bash
mkdir -p test/fixtures/ui5-drift/webapp/{view,controller,fragments,util,i18n}
: > test/fixtures/ui5-drift/webapp/Component.ts
: > test/fixtures/ui5-drift/webapp/view/PriceView.view.xml
: > test/fixtures/ui5-drift/webapp/controller/PriceView.controller.ts
: > test/fixtures/ui5-drift/webapp/fragments/PosDeterminationDialog.fragment.xml
: > test/fixtures/ui5-drift/webapp/i18n/i18n.properties
printf 'export default class PosDetermination {}\n' \
  > test/fixtures/ui5-drift/webapp/controller/PosDetermination.ts
printf 'export function get() {}\n' > test/fixtures/ui5-drift/webapp/util/I18n.ts
```

This fixture reproduces the three real drifts from the spec: the `fragments/`
folder, `util/I18n.ts` mis-cased, and a fragment controller whose basename does
not match its fragment.

- [ ] **Step 2: Write the failing test**

`test/lib/checks/ui5-naming.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { checkUi5Naming } from "../../../scripts/lib/checks/ui5-naming.mjs";

const drift = fileURLToPath(new URL("../../fixtures/ui5-drift", import.meta.url));
const clean = fileURLToPath(new URL("../../fixtures/full-repo", import.meta.url));
const byId = (fs, id) => fs.filter((f) => f.id === id);

test("plural fragments folder is a violation with a rename fix", () => {
    const hits = byId(checkUi5Naming(drift, "webapp"), "ui5-folder-name");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].severity, "violation");
    assert.equal(hits[0].file, "webapp/fragments");
    assert.deepEqual(hits[0].fix, { kind: "rename", to: "webapp/fragment" });
});

test("plain module in util must be camelCase", () => {
    const hits = byId(checkUi5Naming(drift, "webapp"), "ui5-module-case");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].file, "webapp/util/I18n.ts");
    assert.deepEqual(hits[0].fix, { kind: "rename", to: "webapp/util/i18n.ts" });
});

test("controller module without a view or fragment partner is a question", () => {
    const hits = byId(checkUi5Naming(drift, "webapp"), "ui5-controller-pairing");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].file, "webapp/controller/PosDetermination.ts");
    assert.equal(hits[0].severity, "question");
    assert.equal(hits[0].fix, null);
});

test("a conforming webapp produces no findings", () => {
    assert.deepEqual(checkUi5Naming(clean, "app/priceview/webapp"), []);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/lib/checks/ui5-naming.test.mjs`
Expected: FAIL — `Cannot find module '../../../scripts/lib/checks/ui5-naming.mjs'`.

- [ ] **Step 4: Implement `scripts/lib/checks/ui5-naming.mjs`**

```js
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listFiles } from "../walk.mjs";
import { finding, rename, PASCAL, CAMEL, VIOLATION, QUESTION } from "../finding.mjs";

const ALLOWED_FOLDERS = new Set([
    "view", "controller", "fragment", "model", "util", "delegate", "service", "i18n", "css", "test",
]);
const PLURAL_FIX = {
    views: "view", controllers: "controller", fragments: "fragment",
    models: "model", utils: "util", delegates: "delegate", services: "service",
};
const MODULE_FOLDERS = new Set(["model", "util", "delegate", "service"]);
const I18N_FILE = /^i18n(_[a-zA-Z]{2}(_[A-Za-z]{2})?)?\.properties$/;
const DEFAULT_CLASS = /^export default class\s/m;

export function checkUi5Naming(root, webappDir) {
    const files = listFiles(root, webappDir).map((f) => f.slice(webappDir.length + 1));
    const out = [];
    const at = (p) => `${webappDir}/${p}`;

    for (const folder of new Set(files.filter((f) => f.includes("/")).map((f) => f.split("/")[0]))) {
        if (ALLOWED_FOLDERS.has(folder)) continue;
        const to = PLURAL_FIX[folder];
        out.push(finding({
            check: 5, id: "ui5-folder-name", severity: VIOLATION, file: at(folder),
            message: to
                ? `webapp folders are singular: rename "${folder}" to "${to}"`
                : `unexpected webapp folder "${folder}"; allowed: ${[...ALLOWED_FOLDERS].join(", ")}`,
            fix: to ? rename(at(to)) : null,
        }));
    }

    for (const file of files) {
        const [folder, name] = split(file);
        if (!name) continue;

        if ((folder === "view" && name.endsWith(".view.xml")) ||
            (folder === "fragment" && name.endsWith(".fragment.xml"))) {
            const base = name.split(".")[0];
            if (!PASCAL.test(base)) {
                out.push(finding({
                    check: 1, id: "ui5-artifact-case", severity: VIOLATION, file: at(file),
                    message: `${folder} artifacts are PascalCase; "${base}" is not`,
                }));
            }
        }

        if (folder === "test") continue;

        if (MODULE_FOLDERS.has(folder) && name.endsWith(".ts") && !name.endsWith(".test.ts")) {
            const base = name.slice(0, -3);
            const isClass = DEFAULT_CLASS.test(readFileSync(join(root, webappDir, file), "utf8"));
            const ok = isClass ? PASCAL.test(base) : CAMEL.test(base);
            if (!ok) {
                const to = isClass ? upperFirst(base) : lowerFirst(base);
                out.push(finding({
                    check: 1, id: "ui5-module-case", severity: VIOLATION, file: at(file),
                    message: isClass
                        ? `module with a default class export must be PascalCase; "${base}" is not`
                        : `plain module must be camelCase; "${base}" is not`,
                    fix: rename(at(`${folder}/${to}.ts`)),
                }));
            }
        }

        if (folder === "i18n" && !I18N_FILE.test(name)) {
            out.push(finding({
                check: 1, id: "ui5-i18n-name", severity: VIOLATION, file: at(file),
                message: `i18n files are i18n.properties or i18n_<locale>.properties`,
            }));
        }
    }

    out.push(...pairing(files, at));
    return out;
}

function pairing(files, at) {
    const out = [];
    const views = basenames(files, "view", ".view.xml");
    const fragments = basenames(files, "fragment", ".fragment.xml");

    for (const file of files.filter((f) => f.startsWith("controller/") && f.endsWith(".ts"))) {
        const name = file.slice("controller/".length);
        if (name.endsWith(".controller.ts")) {
            const base = name.slice(0, -".controller.ts".length);
            if (!views.has(base)) {
                out.push(finding({
                    check: 2, id: "ui5-controller-pairing", severity: VIOLATION, file: at(file),
                    message: `no matching view/${base}.view.xml`,
                }));
            }
        } else {
            const base = name.slice(0, -3);
            if (!fragments.has(base)) {
                out.push(finding({
                    check: 2, id: "ui5-controller-pairing", severity: QUESTION, file: at(file),
                    message: `module in controller/ with no view/${base}.view.xml or ` +
                        `fragment/${base}.fragment.xml partner — is it a controller (rename it to ` +
                        `match its artifact) or a helper (move it out of controller/)?`,
                }));
            }
        }
    }
    return out;
}

function basenames(files, folder, suffix) {
    return new Set(files
        .filter((f) => f.startsWith(`${folder}/`) && f.endsWith(suffix))
        .map((f) => f.slice(folder.length + 1, -suffix.length)));
}

function split(file) {
    const i = file.indexOf("/");
    return i === -1 ? [null, null] : [file.slice(0, i), file.slice(i + 1)];
}

const upperFirst = (s) => s[0].toUpperCase() + s.slice(1);
const lowerFirst = (s) => s[0].toLowerCase() + s.slice(1);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/lib/checks/ui5-naming.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/checks/ui5-naming.mjs test/lib/checks/ui5-naming.test.mjs test/fixtures/ui5-drift
git commit -m "feat: add UI5 naming and pairing checks"
```

---

### Task 4: CAP naming checks (spec §5, checks 1, 3, 5)

**Files:**
- Create: `scripts/lib/checks/cap-naming.mjs`
- Create: `test/fixtures/cap-drift/`
- Test: `test/lib/checks/cap-naming.test.mjs`

**Interfaces:**
- Consumes: `finding`, `rename`, `KEBAB`, `VIOLATION` from `finding.mjs`; `listFiles` from `walk.mjs`.
- Produces: `checkCapNaming(root) -> Finding[]`

**Rules implemented:**

1. Every file under `srv/` and `db/`, excluding `srv/external/`, has a kebab-case basename. `.test` is stripped before checking, so `pos-determination.test.ts` is judged on `pos-determination`.
2. A `.cds` under `srv/` that declares a service must be named `<domain>-service.cds` — at least two kebab segments ending in `-service`.
3. Each such service definition has a sibling handler with the identical basename.

- [ ] **Step 1: Build the drift fixture**

```bash
mkdir -p test/fixtures/cap-drift/srv/pos test/fixtures/cap-drift/srv/external
printf 'service PriceViewService {}\n' > test/fixtures/cap-drift/srv/service.cds
: > test/fixtures/cap-drift/srv/service.ts
printf 'export const x = 1;\n' > test/fixtures/cap-drift/srv/pos/posDetermination.ts
printf 'export const y = 2;\n' > test/fixtures/cap-drift/srv/pos/pos-tickets.ts
printf 'service C4C {}\n' > test/fixtures/cap-drift/srv/external/C4C.cds
```

- [ ] **Step 2: Write the failing test**

`test/lib/checks/cap-naming.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { checkCapNaming } from "../../../scripts/lib/checks/cap-naming.mjs";

const drift = fileURLToPath(new URL("../../fixtures/cap-drift", import.meta.url));
const clean = fileURLToPath(new URL("../../fixtures/full-repo", import.meta.url));
const byId = (fs, id) => fs.filter((f) => f.id === id);

test("camelCase module in srv is a violation with a kebab rename", () => {
    const hits = byId(checkCapNaming(drift), "cap-filename-case");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].file, "srv/pos/posDetermination.ts");
    assert.deepEqual(hits[0].fix, { kind: "rename", to: "srv/pos/pos-determination.ts" });
});

test("service.cds must be named <domain>-service.cds", () => {
    const hits = byId(checkCapNaming(drift), "cap-service-name");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].file, "srv/service.cds");
    assert.equal(hits[0].severity, "violation");
});

test("srv/external is exempt from kebab-case", () => {
    const hits = checkCapNaming(drift).filter((f) => f.file.startsWith("srv/external/"));
    assert.deepEqual(hits, []);
});

test("a conforming CAP half produces no findings", () => {
    assert.deepEqual(checkCapNaming(clean), []);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/lib/checks/cap-naming.test.mjs`
Expected: FAIL — `Cannot find module '../../../scripts/lib/checks/cap-naming.mjs'`.

- [ ] **Step 4: Implement `scripts/lib/checks/cap-naming.mjs`**

```js
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listFiles } from "../walk.mjs";
import { finding, rename, KEBAB, VIOLATION } from "../finding.mjs";

const SERVICE_NAME = /^[a-z0-9]+(-[a-z0-9]+)*-service$/;
const DECLARES_SERVICE = /^\s*service\s+\w+/m;

export function checkCapNaming(root) {
    const files = [...listFiles(root, "srv"), ...listFiles(root, "db")]
        .filter((f) => !f.startsWith("srv/external/"));
    const present = new Set(files);
    const out = [];

    for (const file of files) {
        const name = file.slice(file.lastIndexOf("/") + 1);
        const base = stripExt(name);
        if (!KEBAB.test(base)) {
            out.push(finding({
                check: 1, id: "cap-filename-case", severity: VIOLATION, file,
                message: `files under srv/ and db/ are kebab-case; "${base}" is not`,
                fix: rename(`${file.slice(0, file.lastIndexOf("/") + 1)}${toKebab(base)}${name.slice(base.length)}`),
            }));
        }

        if (!file.endsWith(".cds") || !file.startsWith("srv/")) continue;
        if (!DECLARES_SERVICE.test(readFileSync(join(root, file), "utf8"))) continue;

        if (!SERVICE_NAME.test(base)) {
            out.push(finding({
                check: 1, id: "cap-service-name", severity: VIOLATION, file,
                message: `service definitions are named <domain>-service.cds; "${base}.cds" is not`,
            }));
        }
        const handler = `${file.slice(0, -4)}.ts`;
        if (!present.has(handler)) {
            out.push(finding({
                check: 3, id: "cap-handler-pairing", severity: VIOLATION, file,
                message: `service definition has no handler at ${handler}`,
            }));
        }
    }
    return out;
}

function stripExt(name) {
    const base = name.replace(/\.(cds|ts|js|json|edmx|xml)$/, "");
    return base.endsWith(".test") ? base.slice(0, -5) : base;
}

function toKebab(s) {
    return s
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .replace(/[_\s]+/g, "-")
        .toLowerCase();
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/lib/checks/cap-naming.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/checks/cap-naming.mjs test/lib/checks/cap-naming.test.mjs test/fixtures/cap-drift
git commit -m "feat: add CAP naming and handler pairing checks"
```

---

### Task 5: External service checks (spec §6, checks 4 and 9)

**Files:**
- Create: `scripts/lib/checks/external-services.mjs`
- Create: `test/fixtures/external-drift/`
- Test: `test/lib/checks/external-services.test.mjs`

**Interfaces:**
- Consumes: `finding`, `rename`, `PASCAL`, `VIOLATION` from `finding.mjs`; `listFiles` from `walk.mjs`.
- Produces: `checkExternalServices(root) -> Finding[]`

**Rules implemented:**

1. Three-way identity — for every `cds.requires` entry whose `model` starts with `srv/external/`: the key equals the model basename, the `.cds` file exists, and its `service <Name>` equals the key.
2. The service name is PascalCase.
3. Retained metadata in `srv/external/` uses `.edmx`, not `.xml`.

- [ ] **Step 1: Build the drift fixture**

```bash
mkdir -p test/fixtures/external-drift/srv/external
printf 'service C4C {}\n' > test/fixtures/external-drift/srv/external/C4C.cds
printf 'service CpiPricing {}\n' > test/fixtures/external-drift/srv/external/CpiPricing.cds
printf 'service ZAPI_SALES_ORDER_SIMULATION_SRV {}\n' \
  > test/fixtures/external-drift/srv/external/ZAPI_SALES_ORDER_SIMULATION_SRV.cds
: > test/fixtures/external-drift/srv/external/ZAPI_SALES_ORDER_SIMULATION_SRV.xml
cat > test/fixtures/external-drift/package.json <<'JSON'
{
  "cds": {
    "requires": {
      "C4C": { "kind": "odata-v2", "model": "srv/external/C4C" },
      "CPI_Pricing": { "kind": "rest", "model": "srv/external/CpiPricing" },
      "ZAPI_SALES_ORDER_SIMULATION_SRV": {
        "kind": "odata-v2",
        "model": "srv/external/ZAPI_SALES_ORDER_SIMULATION_SRV"
      }
    }
  }
}
JSON
```

This reproduces both real defects: the `CPI_Pricing` key/filename split and the
SCREAMING_SNAKE service name, plus the `.xml` metadata extension.

- [ ] **Step 2: Write the failing test**

`test/lib/checks/external-services.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { checkExternalServices } from "../../../scripts/lib/checks/external-services.mjs";

const drift = fileURLToPath(new URL("../../fixtures/external-drift", import.meta.url));
const clean = fileURLToPath(new URL("../../fixtures/full-repo", import.meta.url));
const byId = (fs, id) => fs.filter((f) => f.id === id);

test("a cds.requires key that disagrees with its model basename is a violation", () => {
    const hits = byId(checkExternalServices(drift), "external-identity");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].severity, "violation");
    assert.match(hits[0].message, /CPI_Pricing/);
    assert.match(hits[0].message, /CpiPricing/);
});

test("a non-PascalCase service name is a violation", () => {
    const hits = byId(checkExternalServices(drift), "external-name-style");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].file, "srv/external/ZAPI_SALES_ORDER_SIMULATION_SRV.cds");
});

test("retained metadata must be .edmx", () => {
    const hits = byId(checkExternalServices(drift), "external-metadata-ext");
    assert.equal(hits.length, 1);
    assert.deepEqual(hits[0].fix, {
        kind: "rename",
        to: "srv/external/ZAPI_SALES_ORDER_SIMULATION_SRV.edmx",
    });
});

test("C4C is conforming and produces no findings", () => {
    const hits = checkExternalServices(drift).filter((f) => f.file.includes("C4C"));
    assert.deepEqual(hits, []);
});

test("a repo with no external services produces no findings", () => {
    assert.deepEqual(checkExternalServices(clean), []);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/lib/checks/external-services.test.mjs`
Expected: FAIL — `Cannot find module '../../../scripts/lib/checks/external-services.mjs'`.

- [ ] **Step 4: Implement `scripts/lib/checks/external-services.mjs`**

```js
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { listFiles } from "../walk.mjs";
import { finding, rename, PASCAL, VIOLATION } from "../finding.mjs";

const SERVICE_DECL = /^\s*service\s+(\w+)/m;
const EXTERNAL = "srv/external/";

export function checkExternalServices(root) {
    const out = [];
    const requires = readRequires(root);

    for (const [key, config] of Object.entries(requires)) {
        const model = config?.model;
        if (typeof model !== "string" || !model.startsWith(EXTERNAL)) continue;

        const base = model.slice(EXTERNAL.length);
        const file = `${model}.cds`;

        if (key !== base) {
            out.push(finding({
                check: 4, id: "external-identity", severity: VIOLATION, file,
                message: `cds.requires key "${key}" must equal the model basename "${base}" ` +
                    `and the service name inside the file`,
            }));
        }

        if (!existsSync(join(root, file))) {
            out.push(finding({
                check: 4, id: "external-identity", severity: VIOLATION, file,
                message: `cds.requires."${key}".model points at ${model}, but ${file} does not exist`,
            }));
            continue;
        }

        const declared = SERVICE_DECL.exec(readFileSync(join(root, file), "utf8"))?.[1];
        if (declared && declared !== base) {
            out.push(finding({
                check: 4, id: "external-identity", severity: VIOLATION, file,
                message: `file declares "service ${declared}" but its basename is "${base}"`,
            }));
        }
        if (declared && !PASCAL.test(declared)) {
            out.push(finding({
                check: 4, id: "external-name-style", severity: VIOLATION, file,
                message: `external services use a PascalCase logical alias; "${declared}" is not. ` +
                    `The backend id stays in credentials.path.`,
            }));
        }
    }

    for (const file of listFiles(root, "srv/external").filter((f) => f.endsWith(".xml"))) {
        out.push(finding({
            check: 9, id: "external-metadata-ext", severity: VIOLATION, file,
            message: `retained metadata uses .edmx, not .xml`,
            fix: rename(`${file.slice(0, -4)}.edmx`),
        }));
    }

    return out;
}

function readRequires(root) {
    const pkg = join(root, "package.json");
    if (!existsSync(pkg)) return {};
    try {
        return JSON.parse(readFileSync(pkg, "utf8"))?.cds?.requires ?? {};
    } catch {
        return {};
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/lib/checks/external-services.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/checks/external-services.mjs test/lib/checks/external-services.test.mjs test/fixtures/external-drift
git commit -m "feat: add external service identity and metadata checks"
```

---

### Task 6: TypeScript layout checks (spec §7, checks 6, 7, 8)

**Files:**
- Create: `scripts/lib/checks/ts-layout.mjs`
- Create: `test/fixtures/ts-drift/`
- Test: `test/lib/checks/ts-layout.test.mjs`

**Interfaces:**
- Consumes: `finding`, `VIOLATION`, `WARNING` from `finding.mjs`; `listFiles` from `walk.mjs`.
- Produces: `checkTsLayout(root, dirs) -> Finding[]` where `dirs` is the list of directories to scan (`["srv", "db", ...webapps]`).

**Rules implemented:**

6. Line count: `> 500` violation, `> 300` warning. `*.test.ts` exempt.
7. Intra-file order: classify each top-level statement into a phase (1 import, 2 type, 3 constant, 4 exported API, 5 local helper) and report the first statement whose phase is lower than the highest phase already seen. Unclassifiable lines are ignored — this is deliberately conservative, per spec §12.
8. A `type`, `interface` or top-level `const` name declared in two or more files is reported once, naming the nearest common folder and the file it belongs in.

- [ ] **Step 1: Build the drift fixture**

```bash
mkdir -p test/fixtures/ts-drift/srv/pricing
{ echo 'import { a } from "./a.js";'; echo 'export function run() {}'; echo 'const LATE = 1;'; } \
  > test/fixtures/ts-drift/srv/pricing/out-of-order.ts
printf 'export interface Quote { id: string }\nexport const A = 1;\n' \
  > test/fixtures/ts-drift/srv/pricing/first.ts
printf 'export interface Quote { id: string }\nexport const B = 2;\n' \
  > test/fixtures/ts-drift/srv/pricing/second.ts
node -e "require('fs').writeFileSync('test/fixtures/ts-drift/srv/pricing/huge.ts', 'const x = 1;\n'.repeat(520))"
node -e "require('fs').writeFileSync('test/fixtures/ts-drift/srv/pricing/big.ts', 'const y = 2;\n'.repeat(320))"
node -e "require('fs').writeFileSync('test/fixtures/ts-drift/srv/pricing/huge.test.ts', 'const z = 3;\n'.repeat(900))"
```

- [ ] **Step 2: Write the failing test**

`test/lib/checks/ts-layout.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { checkTsLayout } from "../../../scripts/lib/checks/ts-layout.mjs";

const drift = fileURLToPath(new URL("../../fixtures/ts-drift", import.meta.url));
const run = () => checkTsLayout(drift, ["srv"]);
const byId = (id) => run().filter((f) => f.id === id);

test("files over 500 lines are violations, over 300 are warnings", () => {
    const hits = byId("ts-file-size");
    const huge = hits.find((f) => f.file.endsWith("huge.ts"));
    const big = hits.find((f) => f.file.endsWith("big.ts"));
    assert.equal(huge.severity, "violation");
    assert.equal(big.severity, "warning");
});

test("test files are exempt from the size rule", () => {
    assert.ok(!byId("ts-file-size").some((f) => f.file.endsWith(".test.ts")));
});

test("a constant after an exported function is out of order", () => {
    const hits = byId("ts-file-order");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].file, "srv/pricing/out-of-order.ts");
    assert.equal(hits[0].line, 3);
});

test("a name declared in two files belongs in a shared types file", () => {
    const hits = byId("ts-shared-declaration");
    const quote = hits.find((f) => f.message.includes("Quote"));
    assert.ok(quote);
    assert.match(quote.message, /srv\/pricing\/types\.ts/);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/lib/checks/ts-layout.test.mjs`
Expected: FAIL — `Cannot find module '../../../scripts/lib/checks/ts-layout.mjs'`.

- [ ] **Step 4: Implement `scripts/lib/checks/ts-layout.mjs`**

```js
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listFiles } from "../walk.mjs";
import { finding, VIOLATION, WARNING } from "../finding.mjs";

const WARN_LINES = 300;
const FAIL_LINES = 500;
const SHARED_FILES = new Set(["types.ts", "constants.ts"]);

const PHASES = [
    [1, /^import\s/],
    [2, /^(export\s+)?(interface|type)\s+\w/],
    [3, /^(export\s+)?const\s+\w+\s*(:[^=]+)?=\s*(?!\()/],
    [4, /^export\s+(default\s+|async\s+)?(function|class|const)\s/],
    [5, /^(async\s+)?function\s+\w/],
];
const DECLARATION = /^export\s+(interface|type|const)\s+(\w+)/;

export function checkTsLayout(root, dirs) {
    const files = dirs
        .flatMap((d) => listFiles(root, d))
        .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"));
    const out = [];
    const declaredIn = new Map();

    for (const file of files) {
        const lines = readFileSync(join(root, file), "utf8").split("\n");
        if (!file.endsWith(".test.ts")) {
            out.push(...size(file, lines.length));
            out.push(...order(file, lines));
        }
        collect(file, lines, declaredIn);
    }

    out.push(...shared(declaredIn));
    return out;
}

function size(file, count) {
    if (count > FAIL_LINES) {
        return [finding({
            check: 6, id: "ts-file-size", severity: VIOLATION, file,
            message: `${count} lines exceeds the ${FAIL_LINES}-line limit; split it by concern`,
        })];
    }
    if (count > WARN_LINES) {
        return [finding({
            check: 6, id: "ts-file-size", severity: WARNING, file,
            message: `${count} lines is over the ${WARN_LINES}-line guideline`,
        })];
    }
    return [];
}

function order(file, lines) {
    let highest = 0;
    for (let i = 0; i < lines.length; i++) {
        const phase = classify(lines[i]);
        if (phase === null) continue;
        if (phase < highest) {
            return [finding({
                check: 7, id: "ts-file-order", severity: WARNING, file, line: i + 1,
                message: `out of order: expected imports -> types -> constants -> exported API -> ` +
                    `local helpers, but a phase-${phase} statement follows a phase-${highest} one`,
            })];
        }
        highest = Math.max(highest, phase);
    }
    return [];
}

function classify(raw) {
    const line = raw.trimEnd();
    if (line !== raw.trimStart()) return null;
    for (const [phase, re] of PHASES) if (re.test(line)) return phase;
    return null;
}

function collect(file, lines, declaredIn) {
    const name = file.slice(file.lastIndexOf("/") + 1);
    if (SHARED_FILES.has(name) || file.endsWith(".test.ts")) return;
    for (const line of lines) {
        const match = DECLARATION.exec(line);
        if (!match) continue;
        const key = match[2];
        if (!declaredIn.has(key)) declaredIn.set(key, new Set());
        declaredIn.get(key).add(file);
    }
}

function shared(declaredIn) {
    const out = [];
    for (const [name, files] of declaredIn) {
        if (files.size < 2) continue;
        const list = [...files].sort();
        const folder = commonFolder(list);
        out.push(finding({
            check: 8, id: "ts-shared-declaration", severity: WARNING, file: list[0],
            message: `"${name}" is declared in ${list.length} files (${list.join(", ")}); ` +
                `move it to ${folder}/types.ts or ${folder}/constants.ts`,
        }));
    }
    return out;
}

function commonFolder(files) {
    const parts = files.map((f) => f.split("/").slice(0, -1));
    const shared = [];
    for (let i = 0; i < parts[0].length; i++) {
        const seg = parts[0][i];
        if (parts.every((p) => p[i] === seg)) shared.push(seg);
        else break;
    }
    return shared.join("/") || ".";
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/lib/checks/ts-layout.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/checks/ts-layout.mjs test/lib/checks/ts-layout.test.mjs test/fixtures/ts-drift
git commit -m "feat: add TypeScript size, ordering and shared-declaration checks"
```

---

### Task 7: Approuter and MTA checks (spec §9, checks 10 and 11)

**Files:**
- Create: `scripts/lib/checks/deployment.mjs`
- Create: `test/fixtures/deploy-drift/`
- Test: `test/lib/checks/deployment.test.mjs`

**Interfaces:**
- Consumes: `finding`, `VIOLATION`, `QUESTION` from `finding.mjs`; `detectHalves` from `walk.mjs`.
- Produces: `checkDeployment(root) -> Finding[]`

**Rules implemented:**

10. `xs-app.json`: `authenticationMethod` is `"route"`; every route sets `authenticationType`; the last route is the `^(.*)$` catch-all and carries `cacheControl`; no route after the catch-all.
11. `mta.yaml`: every module and resource name starts with the MTA `ID`, except the allowed cross-module names `srv-api` and `app-api`. The `html5` module's `path: app/<app-id>` is compared against the `ID` with hyphens removed; a mismatch is a `question`, since either side can move.

`mta.yaml` is read with line-oriented regex, not a YAML parser — Global
Constraints forbid dependencies, and only `ID:`, `- name:`, `type:` and `path:`
are needed.

- [ ] **Step 1: Build the drift fixture**

```bash
mkdir -p test/fixtures/deploy-drift/app/router test/fixtures/deploy-drift/app/changenotifications/webapp
cat > test/fixtures/deploy-drift/app/router/xs-app.json <<'JSON'
{
  "welcomeFile": "/changenotifications/index.html",
  "authenticationMethod": "route",
  "routes": [
    { "source": "^(.*)$", "target": "$1", "service": "html5-apps-repo-rt", "authenticationType": "xsuaa" },
    { "source": "^/odata/(.*)$", "target": "/odata/$1", "destination": "srv-api" }
  ]
}
JSON
cat > test/fixtures/deploy-drift/mta.yaml <<'YAML'
ID: change-notification
modules:
  - name: change-notification-srv
    type: nodejs
  - name: srv-api
    type: nodejs
  - name: change-notification-ui
    type: html5
    path: app/changenotifications
  - name: legacy-deployer
    type: com.sap.application.content
YAML
```

- [ ] **Step 2: Write the failing test**

`test/lib/checks/deployment.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { checkDeployment } from "../../../scripts/lib/checks/deployment.mjs";

const drift = fileURLToPath(new URL("../../fixtures/deploy-drift", import.meta.url));
const byId = (id) => checkDeployment(drift).filter((f) => f.id === id);

test("the catch-all route must be last", () => {
    const hits = byId("router-route-order");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].severity, "violation");
});

test("every route must set authenticationType", () => {
    const hits = byId("router-auth-type");
    assert.equal(hits.length, 1);
    assert.match(hits[0].message, /\^\/odata/);
});

test("the catch-all route must set cacheControl", () => {
    assert.equal(byId("router-cache-control").length, 1);
});

test("module names must derive from the MTA ID", () => {
    const hits = byId("mta-name-prefix");
    assert.equal(hits.length, 1);
    assert.match(hits[0].message, /legacy-deployer/);
});

test("srv-api and app-api are allowed cross-module names", () => {
    assert.ok(!byId("mta-name-prefix").some((f) => f.message.includes("srv-api")));
});

test("an app folder that disagrees with the MTA ID is a question", () => {
    const hits = byId("mta-app-id");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].severity, "question");
    assert.match(hits[0].message, /changenotifications/);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/lib/checks/deployment.test.mjs`
Expected: FAIL — `Cannot find module '../../../scripts/lib/checks/deployment.mjs'`.

- [ ] **Step 4: Implement `scripts/lib/checks/deployment.mjs`**

```js
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { finding, VIOLATION, QUESTION } from "../finding.mjs";

const CATCH_ALL = "^(.*)$";
const SHARED_MTA_NAMES = new Set(["srv-api", "app-api"]);

export function checkDeployment(root) {
    return [...router(root), ...mta(root)];
}

function router(root) {
    const file = "app/router/xs-app.json";
    const path = join(root, file);
    if (!existsSync(path)) return [];

    let config;
    try {
        config = JSON.parse(readFileSync(path, "utf8"));
    } catch {
        return [finding({
            check: 10, id: "router-parse", severity: VIOLATION, file,
            message: "xs-app.json is not valid JSON",
        })];
    }

    const out = [];
    const routes = config.routes ?? [];

    if (config.authenticationMethod !== "route") {
        out.push(finding({
            check: 10, id: "router-auth-method", severity: VIOLATION, file,
            message: `authenticationMethod must be "route", found ${JSON.stringify(config.authenticationMethod)}`,
        }));
    }

    routes.forEach((route, i) => {
        if (!route.authenticationType) {
            out.push(finding({
                check: 10, id: "router-auth-type", severity: VIOLATION, file,
                message: `route "${route.source}" does not set authenticationType`,
            }));
        }
        if (route.source === CATCH_ALL) {
            if (i !== routes.length - 1) {
                out.push(finding({
                    check: 10, id: "router-route-order", severity: VIOLATION, file,
                    message: `the "${CATCH_ALL}" catch-all route must be last; it is at index ${i} of ${routes.length}`,
                }));
            }
            if (!route.cacheControl) {
                out.push(finding({
                    check: 10, id: "router-cache-control", severity: VIOLATION, file,
                    message: `the catch-all route must set cacheControl: "no-cache, must-revalidate"`,
                }));
            }
        }
    });

    return out;
}

function mta(root) {
    const file = "mta.yaml";
    const path = join(root, file);
    if (!existsSync(path)) return [];

    const text = readFileSync(path, "utf8");
    const id = /^ID:\s*(\S+)/m.exec(text)?.[1];
    if (!id) return [];

    const out = [];
    const entries = parseEntries(text);

    for (const entry of entries) {
        if (SHARED_MTA_NAMES.has(entry.name)) continue;
        if (entry.name === id || entry.name.startsWith(`${id}-`)) continue;
        out.push(finding({
            check: 11, id: "mta-name-prefix", severity: VIOLATION, file,
            message: `module and resource names derive from ID "${id}"; "${entry.name}" does not`,
        }));
    }

    const html5 = entries.find((e) => e.type === "html5");
    if (html5?.path?.startsWith("app/")) {
        const appId = html5.path.slice("app/".length).replace(/\/$/, "");
        const expected = id.replace(/-/g, "");
        if (appId !== expected) {
            out.push(finding({
                check: 11, id: "mta-app-id", severity: QUESTION, file,
                message: `html5 module path is app/${appId} but the MTA ID is "${id}" ` +
                    `(compact form "${expected}") — align the app folder, the UI5 namespace, ` +
                    `the welcomeFile and the MTA ID; either side can move`,
            }));
        }
    }

    return out;
}

function parseEntries(text) {
    const entries = [];
    for (const line of text.split("\n")) {
        const name = /^\s*-\s*name:\s*(\S+)/.exec(line);
        if (name) {
            entries.push({ name: name[1], type: null, path: null });
            continue;
        }
        const current = entries[entries.length - 1];
        if (!current) continue;
        const type = /^\s*type:\s*(\S+)/.exec(line);
        if (type) current.type = type[1];
        const path = /^\s*path:\s*(\S+)/.exec(line);
        if (path) current.path = path[1];
    }
    return entries;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/lib/checks/deployment.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/checks/deployment.mjs test/lib/checks/deployment.test.mjs test/fixtures/deploy-drift
git commit -m "feat: add approuter and MTA deployment checks"
```

---

### Task 8: Testing convention checks (spec §8, checks 12, 13, 14)

**Files:**
- Create: `scripts/lib/checks/testing.mjs`
- Create: `test/fixtures/testing-drift/`
- Test: `test/lib/checks/testing.test.mjs`

**Interfaces:**
- Consumes: `finding`, `rename`, `PASCAL`, `VIOLATION`, `WARNING` from `finding.mjs`; `listFiles` from `walk.mjs`.
- Produces: `checkTesting(root, webapps) -> Finding[]` where `webapps` is `halves.ui5`.

**Rules implemented:**

12. No `*.test.ts` under `srv/` or `db/`. The fix renames it into the mirrored
    path under `test/`, dropping the leading `srv/` or `db/` segment.
13. Under `webapp/test/`: immediate subfolders are only `unit` and
    `integration`; `.ts` files directly in `webapp/test/` must be
    `testsuite.qunit.ts`; modules under `unit/` end in `.qunit.ts`; basenames
    under `integration/pages/` and `integration/journey/` are PascalCase.
14. npm script names match `<area>:<action>` — lowercase segments separated by
    colons. Reported as a `warning`, since renaming a script touches CI.

- [ ] **Step 1: Build the drift fixture**

```bash
mkdir -p test/fixtures/testing-drift/srv/pos
mkdir -p test/fixtures/testing-drift/webapp/test/{unit,integration/pages,legacy}
printf 'export const x = 1;\n' > test/fixtures/testing-drift/srv/pos/pos-determination.ts
: > test/fixtures/testing-drift/srv/pos/pos-determination.test.ts
: > test/fixtures/testing-drift/webapp/test/testsuite.qunit.ts
: > test/fixtures/testing-drift/webapp/test/unit/formatter.qunit.ts
: > test/fixtures/testing-drift/webapp/test/unit/brokenName.ts
: > test/fixtures/testing-drift/webapp/test/integration/pages/priceView.ts
: > test/fixtures/testing-drift/webapp/test/legacy/old.qunit.ts
cat > test/fixtures/testing-drift/package.json <<'JSON'
{
  "scripts": {
    "test": "tsx --test \"test/**/*.test.ts\"",
    "ts-typecheck": "tsc --noEmit",
    "generate:entry-point": "dev-cap-tools gen-entrypoint",
    "start:hybrid": "cds watch --profile hybrid"
  }
}
JSON
```

- [ ] **Step 2: Write the failing test**

`test/lib/checks/testing.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { checkTesting } from "../../../scripts/lib/checks/testing.mjs";

const drift = fileURLToPath(new URL("../../fixtures/testing-drift", import.meta.url));
const run = () => checkTesting(drift, ["webapp"]);
const byId = (id) => run().filter((f) => f.id === id);

test("a test file under srv is relocated into the mirrored test tree", () => {
    const hits = byId("test-location");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].file, "srv/pos/pos-determination.test.ts");
    assert.equal(hits[0].severity, "violation");
    assert.deepEqual(hits[0].fix, { kind: "rename", to: "test/pos/pos-determination.test.ts" });
});

test("only unit and integration are allowed under webapp/test", () => {
    const hits = byId("ui5-test-tree");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].file, "webapp/test/legacy");
});

test("unit modules must carry the .qunit.ts suffix", () => {
    const hits = byId("ui5-test-suffix");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].file, "webapp/test/unit/brokenName.ts");
});

test("page objects are PascalCase", () => {
    const hits = byId("ui5-test-case");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].file, "webapp/test/integration/pages/priceView.ts");
    assert.deepEqual(hits[0].fix, {
        kind: "rename",
        to: "webapp/test/integration/pages/PriceView.ts",
    });
});

test("npm scripts must be <area>:<action>", () => {
    const hits = byId("npm-script-name");
    assert.equal(hits.length, 2);
    assert.equal(hits[0].severity, "warning");
    const named = hits.map((h) => h.message).join(" ");
    assert.match(named, /ts-typecheck/);
    assert.match(named, /generate:entry-point/);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/lib/checks/testing.test.mjs`
Expected: FAIL — `Cannot find module '../../../scripts/lib/checks/testing.mjs'`.

- [ ] **Step 4: Implement `scripts/lib/checks/testing.mjs`**

```js
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { listFiles } from "../walk.mjs";
import { finding, rename, PASCAL, VIOLATION, WARNING } from "../finding.mjs";

const NPM_SCRIPT = /^[a-z0-9]+(:[a-z0-9]+)*$/;
const UI5_TEST_DIRS = new Set(["unit", "integration"]);
const PASCAL_DIRS = ["integration/pages/", "integration/journey/"];

export function checkTesting(root, webapps) {
    return [...capTests(root), ...webapps.flatMap((w) => ui5Tests(root, w)), ...npmScripts(root)];
}

function capTests(root) {
    const out = [];
    for (const dir of ["srv", "db"]) {
        for (const file of listFiles(root, dir).filter((f) => f.endsWith(".test.ts"))) {
            out.push(finding({
                check: 12, id: "test-location", severity: VIOLATION, file,
                message: `tests live in a test/ tree mirroring ${dir}/, not beside the module`,
                fix: rename(`test/${file.slice(dir.length + 1)}`),
            }));
        }
    }
    return out;
}

function ui5Tests(root, webappDir) {
    const prefix = `${webappDir}/test/`;
    const files = listFiles(root, `${webappDir}/test`).map((f) => f.slice(prefix.length));
    const out = [];
    const at = (p) => prefix + p;

    for (const folder of new Set(files.filter((f) => f.includes("/")).map((f) => f.split("/")[0]))) {
        if (UI5_TEST_DIRS.has(folder)) continue;
        out.push(finding({
            check: 13, id: "ui5-test-tree", severity: VIOLATION, file: at(folder),
            message: `webapp/test/ holds only unit/ and integration/; found "${folder}"`,
        }));
    }

    for (const file of files) {
        if (!file.includes("/")) {
            if (file.endsWith(".ts") && file !== "testsuite.qunit.ts") {
                out.push(finding({
                    check: 13, id: "ui5-test-suffix", severity: VIOLATION, file: at(file),
                    message: `the only module directly in webapp/test/ is testsuite.qunit.ts`,
                }));
            }
            continue;
        }

        if (file.startsWith("unit/") && file.endsWith(".ts") && !file.endsWith(".qunit.ts")) {
            out.push(finding({
                check: 13, id: "ui5-test-suffix", severity: VIOLATION, file: at(file),
                message: `unit test modules end in .qunit.ts`,
                fix: rename(at(`${file.slice(0, -3)}.qunit.ts`)),
            }));
        }

        for (const dir of PASCAL_DIRS) {
            if (!file.startsWith(dir) || !file.endsWith(".ts")) continue;
            const name = file.slice(dir.length);
            const base = name.split(".")[0];
            if (!PASCAL.test(base)) {
                out.push(finding({
                    check: 13, id: "ui5-test-case", severity: VIOLATION, file: at(file),
                    message: `${dir.slice(0, -1)} modules are PascalCase; "${base}" is not`,
                    fix: rename(at(dir + base[0].toUpperCase() + base.slice(1) + name.slice(base.length))),
                }));
            }
        }
    }
    return out;
}

function npmScripts(root) {
    const file = "package.json";
    if (!existsSync(join(root, file))) return [];
    let scripts;
    try {
        scripts = JSON.parse(readFileSync(join(root, file), "utf8")).scripts ?? {};
    } catch {
        return [];
    }
    return Object.keys(scripts)
        .filter((name) => !NPM_SCRIPT.test(name))
        .map((name) => finding({
            check: 14, id: "npm-script-name", severity: WARNING, file,
            message: `npm scripts are <area>:<action> in lowercase; "${name}" is not`,
        }));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/lib/checks/testing.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/checks/testing.mjs test/lib/checks/testing.test.mjs test/fixtures/testing-drift
git commit -m "feat: add test placement, UI5 test tree and npm script checks"
```

---

### Task 9: The audit orchestrator and CLI

**Files:**
- Create: `scripts/audit.mjs`
- Test: `test/audit.test.mjs`

**Interfaces:**
- Consumes: every `check*` function from Tasks 3–8, `detectHalves` from `walk.mjs`.
- Produces: `audit(root) -> Report`, and a CLI `node scripts/audit.mjs [path]` printing the report as JSON to stdout.

**Report shape — this is the contract the `conventions-audit` skill parses:**

```json
{
  "root": "/abs/path/to/repo",
  "halves": { "ui5": ["app/priceview/webapp"], "cap": true, "router": true },
  "summary": { "violation": 3, "warning": 8, "question": 2, "total": 13 },
  "findings": [
    {
      "check": 1,
      "id": "ui5-module-case",
      "severity": "violation",
      "file": "app/priceview/webapp/util/I18n.ts",
      "line": null,
      "message": "plain module must be camelCase; \"I18n\" is not",
      "fix": { "kind": "rename", "to": "app/priceview/webapp/util/i18n.ts" }
    }
  ]
}
```

Findings are sorted by severity (violation, warning, question), then `file`,
then `check`. The process exits 0 unless it throws, so the skill can always
parse stdout.

- [ ] **Step 1: Write the failing test**

`test/audit.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { audit } from "../scripts/audit.mjs";

const clean = fileURLToPath(new URL("fixtures/full-repo", import.meta.url));
const ui5Drift = fileURLToPath(new URL("fixtures/ui5-drift", import.meta.url));
const cli = fileURLToPath(new URL("../scripts/audit.mjs", import.meta.url));

test("a conforming repo reports no findings", () => {
    const report = audit(clean);
    assert.equal(report.summary.total, 0);
    assert.deepEqual(report.findings, []);
    assert.deepEqual(report.halves.ui5, ["app/priceview/webapp"]);
});

test("findings are sorted with violations first", () => {
    const { findings } = audit(ui5Drift);
    assert.ok(findings.length > 0);
    const order = { violation: 0, warning: 1, question: 2 };
    for (let i = 1; i < findings.length; i++) {
        assert.ok(order[findings[i - 1].severity] <= order[findings[i].severity]);
    }
});

test("the summary counts each severity", () => {
    const report = audit(ui5Drift);
    const counted = report.findings.filter((f) => f.severity === "violation").length;
    assert.equal(report.summary.violation, counted);
    assert.equal(report.summary.total, report.findings.length);
});

test("the CLI prints parseable JSON and exits 0", () => {
    const out = execFileSync("node", [cli, ui5Drift], { encoding: "utf8" });
    const report = JSON.parse(out);
    assert.equal(report.root, ui5Drift);
    assert.ok(Array.isArray(report.findings));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/audit.test.mjs`
Expected: FAIL — `Cannot find module '../scripts/audit.mjs'`.

- [ ] **Step 3: Implement `scripts/audit.mjs`**

```js
#!/usr/bin/env node
import { resolve } from "node:path";
import { detectHalves } from "./lib/walk.mjs";
import { checkUi5Naming } from "./lib/checks/ui5-naming.mjs";
import { checkCapNaming } from "./lib/checks/cap-naming.mjs";
import { checkExternalServices } from "./lib/checks/external-services.mjs";
import { checkTsLayout } from "./lib/checks/ts-layout.mjs";
import { checkDeployment } from "./lib/checks/deployment.mjs";
import { checkTesting } from "./lib/checks/testing.mjs";

const SEVERITY_ORDER = { violation: 0, warning: 1, question: 2 };

export function audit(root) {
    const halves = detectHalves(root);
    const findings = [];
    const scanned = [];

    for (const webapp of halves.ui5) {
        findings.push(...checkUi5Naming(root, webapp));
        scanned.push(webapp);
    }
    if (halves.cap) {
        findings.push(...checkCapNaming(root));
        findings.push(...checkExternalServices(root));
        scanned.push("srv", "db");
    }
    if (halves.router) {
        findings.push(...checkDeployment(root));
    }
    findings.push(...checkTesting(root, halves.ui5));
    if (scanned.length > 0) {
        findings.push(...checkTsLayout(root, scanned));
    }

    findings.sort((a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        a.file.localeCompare(b.file) ||
        a.check - b.check);

    return { root, halves, summary: summarize(findings), findings };
}

function summarize(findings) {
    const summary = { violation: 0, warning: 0, question: 0, total: findings.length };
    for (const f of findings) summary[f.severity]++;
    return summary;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const root = resolve(process.argv[2] ?? ".");
    process.stdout.write(JSON.stringify(audit(root), null, 2) + "\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/audit.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, all tests green across every file written so far.

- [ ] **Step 6: Commit**

```bash
git add scripts/audit.mjs test/audit.test.mjs
git commit -m "feat: add audit orchestrator and JSON CLI"
```

---

### Task 10: Reference documents

**Files:**
- Create: `references/naming-ui5.md`
- Create: `references/naming-cap.md`
- Create: `references/typescript-layout.md`
- Create: `references/approuter.md`
- Test: `test/references.test.mjs`

**Interfaces:**
- Consumes: the spec.
- Produces: four documents the three skills load. Each rule carries the `check`
  id the script uses for it, so a report line and its reference section can be
  cross-referenced.

These are the single source of truth. Copy the rules verbatim from the spec
sections named below — do not paraphrase, and do not add rules that no spec
section authorizes.

| File | Spec source | Must contain |
| --- | --- | --- |
| `references/naming-ui5.md` | §4 | the artifact table; the singular folder list; the `controller/` pairing rule; the class-like vs plain mechanical test (`export default class`); check ids `ui5-folder-name`, `ui5-artifact-case`, `ui5-module-case`, `ui5-i18n-name`, `ui5-controller-pairing` |
| `references/naming-cap.md` | §5, §6 | the CAP artifact table; CDS identifier casing; the external three-way identity; the PascalCase alias rule with the `credentials.path` note; `.edmx`; check ids `cap-filename-case`, `cap-service-name`, `cap-handler-pairing`, `external-identity`, `external-name-style`, `external-metadata-ext` |
| `references/testing.md` | §8 | the `srv/` -> `test/` mirroring rule; the `webapp/test/` tree; the explicit note that these govern placement and naming, never test existence; npm script naming; check ids `test-location`, `ui5-test-tree`, `ui5-test-suffix`, `ui5-test-case`, `npm-script-name` |
| `references/typescript-layout.md` | §7 | 300/500 thresholds with tests exempt; the nearest-common-folder rule; no `types/` folder and no `.types.ts` suffix; the five-phase intra-file order; check ids `ts-file-size`, `ts-file-order`, `ts-shared-declaration` |
| `references/approuter.md` | §9 | the `xs-app.json` rules; the `mta.yaml` derivation table; app-id alignment; the note that the `cors` block is present only for C4C-embedded apps; check ids `router-auth-method`, `router-auth-type`, `router-route-order`, `router-cache-control`, `mta-name-prefix`, `mta-app-id` |

- [ ] **Step 1: Write the failing test**

`test/references.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(root + p, "utf8");

const REQUIRED = {
    "references/naming-ui5.md": [
        "ui5-folder-name", "ui5-artifact-case", "ui5-module-case",
        "ui5-i18n-name", "ui5-controller-pairing", "export default class",
    ],
    "references/naming-cap.md": [
        "cap-filename-case", "cap-service-name", "cap-handler-pairing",
        "external-identity", "external-name-style", "external-metadata-ext",
        "credentials.path",
    ],
    "references/typescript-layout.md": [
        "ts-file-size", "ts-file-order", "ts-shared-declaration", "300", "500",
    ],
    "references/testing.md": [
        "test-location", "ui5-test-tree", "ui5-test-suffix", "ui5-test-case",
        "npm-script-name", "webapp/test/",
    ],
    "references/approuter.md": [
        "router-auth-method", "router-auth-type", "router-route-order",
        "router-cache-control", "mta-name-prefix", "mta-app-id",
    ],
};

for (const [file, needles] of Object.entries(REQUIRED)) {
    test(`${file} documents every rule it owns`, () => {
        const text = read(file);
        for (const needle of needles) {
            assert.ok(text.includes(needle), `${file} is missing "${needle}"`);
        }
    });
}

test("every check id emitted by the scripts is documented", async () => {
    const documented = Object.keys(REQUIRED).map(read).join("\n");
    const dir = root + "scripts/lib/checks/";
    const ids = new Set();
    for (const file of readdirSync(dir)) {
        for (const m of readFileSync(dir + file, "utf8").matchAll(/id:\s*"([a-z0-9-]+)"/g)) {
            ids.add(m[1]);
        }
    }
    for (const id of ids) {
        assert.ok(documented.includes(id), `check id "${id}" is not documented in references/`);
    }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/references.test.mjs`
Expected: FAIL — `ENOENT` on `references/naming-ui5.md`.

- [ ] **Step 3: Write the four reference documents**

Write each file from its spec sections per the table above. Keep each under 200
lines. Structure every rule the same way, so the audit report and the reference
line up:

```markdown
### Plain modules are camelCase   `ui5-module-case`

A module is class-like if its default export is a class (`export default class`);
otherwise it is plain. Class-like modules are PascalCase, plain modules camelCase.

- `model/formatter.ts`, `util/userPreferences.ts`
- `delegate/ItemsTableDelegate.ts`, `service/UserPreferencesService.ts`

Rationale: the stock UI5 template ships `model/formatter.ts` and `model/models.ts`.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/references.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add references test/references.test.mjs
git commit -m "docs: add the four convention reference documents"
```

---

### Task 11: The three skills

**Files:**
- Create: `skills/ui5-conventions/SKILL.md`
- Create: `skills/cap-conventions/SKILL.md`
- Create: `skills/conventions-audit/SKILL.md`
- Modify: `README.md`
- Test: `test/skills.test.mjs`

**Interfaces:**
- Consumes: `references/*.md`; `scripts/audit.mjs` (the `conventions-audit` skill invokes it).
- Produces: the plugin's user-facing surface.

**REQUIRED SUB-SKILL:** use `superpowers:writing-skills` when authoring these three files.

Frontmatter is `name` and `description` only, matching the installed plugins.
The `description` is what makes a skill auto-load, so it must name the concrete
triggers.

**`skills/ui5-conventions/SKILL.md`** — description must cover: writing or
renaming files under `webapp/`, creating views, fragments, controllers,
formatters, delegates or utils in a UI5 app. Body: point at
`references/naming-ui5.md`, `references/typescript-layout.md` and
`references/testing.md`; state the delegation rule — for UI5 API guidance (controls, tables, MDC, accessibility,
OPA5, QUnit) load `ui5:ui5-best-practices` and its siblings instead of guessing.

**`skills/cap-conventions/SKILL.md`** — description must cover: writing or
renaming files under `srv/` or `db/`, adding a CDS service, importing an
external OData service, editing `cds.requires`. Body: point at
`references/naming-cap.md`, `references/typescript-layout.md`,
`references/testing.md` and `references/approuter.md`. Include the `cds import` follow-up sequence, since
that is the step most likely to reintroduce drift: rename the generated file,
rename the `service` inside it, rename the `cds.requires` key, update `model:`.

**`skills/conventions-audit/SKILL.md`** — description: run when the user asks to
audit, check or clean up project structure, naming or file organization. Body:

1. Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/audit.mjs <path>` and parse the JSON.
2. Render findings grouped by severity, then by file. For each, show
   `file`, `message`, and the rename target when `fix` is present.
3. Summarize `question` findings separately — these need the user's judgement
   and are never auto-fixed.
4. Stop. Do not fix anything yet.
5. On approval, fix **one group at a time**. Before any fix, confirm the
   working tree is clean (`git status --porcelain` is empty) and refuse
   otherwise.
6. Renames use `git mv`. In the same commit, update every reference:
   TypeScript imports, `manifest.json` entries, `Fragment.load({name})` strings
   and any other UI5 module path string, `cds.requires.<key>.model`, and
   `using ... from` in `.cds` files. Search for the old basename across the repo
   before committing to confirm nothing still points at it.
7. One commit per group, message naming the check id.

- [ ] **Step 1: Write the failing test**

`test/skills.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const SKILLS = ["ui5-conventions", "cap-conventions", "conventions-audit"];

test("every declared skill exists", () => {
    assert.deepEqual(readdirSync(root + "skills").sort(), [...SKILLS].sort());
});

for (const skill of SKILLS) {
    test(`${skill} has valid frontmatter`, () => {
        const text = readFileSync(`${root}skills/${skill}/SKILL.md`, "utf8");
        const fm = /^---\nname: (.+)\ndescription: (.+)\n---\n/.exec(text);
        assert.ok(fm, "frontmatter must be name then description");
        assert.equal(fm[1].trim(), skill);
        assert.ok(fm[2].length > 40, "description must name concrete triggers");
    });
}

test("author-time skills delegate UI5 API guidance instead of restating it", () => {
    const text = readFileSync(root + "skills/ui5-conventions/SKILL.md", "utf8");
    assert.match(text, /ui5:ui5-best-practices/);
});

test("the audit skill invokes the checker via CLAUDE_PLUGIN_ROOT", () => {
    const text = readFileSync(root + "skills/conventions-audit/SKILL.md", "utf8");
    assert.match(text, /CLAUDE_PLUGIN_ROOT.*scripts\/audit\.mjs/);
    assert.match(text, /git status --porcelain/);
    assert.match(text, /git mv/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/skills.test.mjs`
Expected: FAIL — `ENOENT` on `skills`.

- [ ] **Step 3: Write the three SKILL.md files and update README.md**

Follow `superpowers:writing-skills`. Update `README.md` to replace the
"implementation not started" status with install instructions
(`/plugin marketplace add P4PER/sap-conventions` then
`/plugin install sap-conventions`, with a local-clone alternative; no absolute
paths from one machine) and a one-line summary of each skill.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/skills.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add skills README.md test/skills.test.mjs
git commit -m "feat: add the three convention skills"
```

---

### Task 12: Validate against the three real repositories

**Files:**
- Create: `test/fixtures/README.md`
- Modify: `docs/2026-09-03-sap-conventions-design.md` (open items in §12 only)

**Interfaces:**
- Consumes: the finished `scripts/audit.mjs`.
- Produces: evidence that the checker's output matches what the spec predicted,
  and a calibration record.

This task has no unit test — its deliverable is a verified run against real
code and a decision about false positives.

- [ ] **Step 1: Run the audit on all three repositories**

```bash
for p in project-a project-b project-c; do
  echo "=== $p"
  node scripts/audit.mjs "../$p" \
    | node -e "
      const r = JSON.parse(require('fs').readFileSync(0, 'utf8'));
      console.log(r.summary);
      for (const f of r.findings) console.log(' ', f.severity.padEnd(9), f.id.padEnd(24), f.file);
    "
done
```

- [ ] **Step 2: Confirm the findings the spec predicted**

The run must include all of these. Any that is missing is a checker bug; fix it
and re-run before continuing.

- `external-identity` on `CPI_Pricing` vs `srv/external/CpiPricing` (change_notification)
- `external-name-style` on `ZAPI_SALES_ORDER_SIMULATION_SRV`, `C4C_PARTY_DET`, `C4C_EMPLOYEE` (pricing) and `zchangenotifications` (change_notification)
- `external-metadata-ext` on `ZAPI_SALES_ORDER_SIMULATION_SRV.xml` (pricing)
- `cap-service-name` on `srv/service.cds` (pricing)
- `cap-filename-case` on the camelCase modules in `srv/pricing/` and `srv/pos/` (pricing)
- `ui5-folder-name` on `webapp/fragments` (pricing)
- `ui5-module-case` on `util/I18n.ts` (pricing, print) and `util/Formatter.ts` (print)
- `ui5-controller-pairing` on `controller/PosDetermination.ts` (pricing)
- `ts-file-size` violations on exactly `srv/service.ts` (754), `srv/change-notification-service.ts` (636), `srv/determination-service.ts` (609)
- `mta-app-id` on change_notification (`app/changenotifications` vs ID `change-notification`)
- `test-location` on all 19 co-located `srv/**/*.test.ts` files in pricing, each with a `test/...` rename fix
- `npm-script-name` on `ts-typecheck` (print), `generate:entry-point` (pricing) and `watch:priceView` (pricing)
- no `ui5-test-tree` or `ui5-test-suffix` findings anywhere, since no repo has a `webapp/test/` folder yet

- [ ] **Step 3: Triage every unexpected finding**

For each finding not in the Step 2 list, decide and record: is it a genuine
convention breach the spec implies, or a false positive? Fix false positives in
the check module, add a regression test to the matching `test/*.test.mjs`, and
re-run. Do not silence a finding by adding a special case for a specific
filename.

Pay particular attention to `ts-file-order` — spec §12 flags it as the check
most likely to be noisy. If it produces more than a handful of findings that a
reader would not accept, narrow it to imports-only ordering (phase 1 versus
everything else) and record that narrowing in §12.

- [ ] **Step 4: Record the calibration**

Write `test/fixtures/README.md` naming each fixture, the real-world drift it
reproduces, and which repository it came from. Update spec §12 to replace the
two open items with what was actually decided about `ts-file-order` and the
`approuter.md` coverage.

- [ ] **Step 5: Run the full suite one last time**

Run: `npm test`
Expected: PASS, all tests, no failures.

- [ ] **Step 6: Commit**

```bash
git add test/fixtures/README.md docs/2026-09-03-sap-conventions-design.md scripts test
git commit -m "test: calibrate checks against the three calibration repositories"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
| --- | --- |
| §3 Distribution | 1 |
| §4 UI5 naming | 3 (checks), 10 (reference), 11 (skill) |
| §5 CAP naming | 4, 10, 11 |
| §6 External services | 5, 10, 11 |
| §7 TypeScript layout | 6, 10 |
| §8 Testing | 8, 10, 11 |
| §9 Approuter and MTA | 7, 10, 11 |
| §10.1 Deterministic checks 1–14 | 3, 4, 5, 6, 7, 8 |
| §10.2 Model-judged findings | 3 (`question` severity), 11 (skill renders them separately) |
| §10.3 Fix pass | 11 (steps 5–7 of the audit skill) |
| §12 Open items | 12 (resolved and recorded) |

**Type consistency:** every check module exports `check<Area>(root, ...)` and
returns `Finding[]` built by `finding()`; `audit.mjs` consumes exactly those
names. `rename(to)` is the only `fix` kind any check emits, and the audit
skill's fix pass handles exactly that kind.

**Deviation recorded:** spec §10.1 lists 14 checks; the plan implements all 14
but splits them across five modules by spec section rather than one module per
check, so each file stays under the 300-line threshold the plugin enforces on
its users.
