# Duplication Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a seventh audit check that reports functions with identical bodies, and functions whose bodies differ only in their literal constants.

**Architecture:** A reusable source scanner (`scripts/lib/functions.mjs`) extracts function bodies without an AST parser, by scrubbing comments and string interiors and then depth-matching braces. A check module (`scripts/lib/checks/duplication.mjs`) hashes each body twice — once verbatim, once with literals masked — groups the hashes, and emits one finding per group. `scripts/audit.mjs` calls it alongside `checkTsLayout`.

**Tech Stack:** Node >= 22, ESM, zero dependencies, `node --test` with fixtures under `test/fixtures/`.

**Spec:** `docs/2026-09-09-duplication-check-design.md`

## Global Constraints

- **Zero dependencies.** `test/manifest.test.mjs` asserts `dependencies` and `devDependencies` are both empty. Node built-ins only.
- **ESM only.** `"type": "module"`; every file uses `import`/`export`, `.mjs` extension for scripts and tests.
- **Node >= 22.** `package.json` `engines.node` is `>=22`; CI runs 22 and 24.
- **Every emitted check id must be documented.** `test/references.test.mjs` scans `scripts/lib/checks/` for `id: "..."` and asserts each id appears in one of the files listed in its `REQUIRED` map. Emitting an id without documenting it fails the suite.
- **`test/fixtures/full-repo` must keep reporting zero findings.** `test/audit.test.mjs` asserts `summary.total === 0` for it.
- **Check numbers 1–14 are taken.** New checks are 15 and 16.
- **`package.json` and `.claude-plugin/plugin.json` must declare the same version.** `test/manifest.test.mjs` asserts it. `.claude-plugin/marketplace.json` versions the catalog entry, not the plugin, and stays at `0.1.0`.
- **Style:** 4-space indent, double-quoted strings, no semicolon omission, `export function` for the module's API and plain `function` declarations for local helpers below it — match `scripts/lib/checks/ts-layout.mjs`.
- **Commit messages:** conventional commits (`feat:`, `refactor:`, `test:`, `docs:`), matching the existing history.

---

### Task 1: Move `commonFolder` into `walk.mjs`

Both `ts-layout.mjs` and the new check need to name the nearest shared folder of a set of files. `commonFolder` is currently a private helper at the bottom of `ts-layout.mjs`. Copying it would be a poor look in a change about duplication, so it moves to `walk.mjs`, which already owns path handling.

**Files:**
- Modify: `scripts/lib/walk.mjs` (append the exported function)
- Modify: `scripts/lib/checks/ts-layout.mjs` (import it; delete the local copy at the bottom of the file)
- Test: `test/lib/walk.test.mjs` (append)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `commonFolder(files: string[]): string` exported from `scripts/lib/walk.mjs`. Takes repo-relative POSIX paths, returns the longest shared directory prefix, or `"."` when there is none.

- [ ] **Step 1: Write the failing test**

Append to `test/lib/walk.test.mjs` (add `commonFolder` to the existing import from `../../scripts/lib/walk.mjs`):

```js
test("commonFolder returns the longest shared directory", () => {
    assert.equal(commonFolder(["srv/pricing/a.ts", "srv/pricing/b.ts"]), "srv/pricing");
    assert.equal(commonFolder(["srv/pricing/a.ts", "srv/pos/b.ts"]), "srv");
    assert.equal(commonFolder(["srv/a.ts", "app/b.ts"]), ".");
    assert.equal(commonFolder(["srv/pricing/a.ts"]), "srv/pricing");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL — `commonFolder is not a function` (it is not exported yet).

- [ ] **Step 3: Add the function to `walk.mjs`**

Append to `scripts/lib/walk.mjs`:

```js
export function commonFolder(files) {
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

- [ ] **Step 4: Point `ts-layout.mjs` at it**

In `scripts/lib/checks/ts-layout.mjs`, change the walk import to:

```js
import { listFiles, commonFolder } from "../walk.mjs";
```

and delete the `function commonFolder(files) { ... }` block at the bottom of the file. Nothing else in that file changes — the call site in `shared()` already reads `commonFolder(list)`.

- [ ] **Step 5: Run the full suite**

Run: `npm test 2>&1 | tail -20`
Expected: PASS, all existing tests plus the new one. `ts-shared-declaration` tests in `test/lib/checks/ts-layout.test.mjs` still pass — they assert on `srv/pricing/types.ts` appearing in the message, which is exactly what `commonFolder` produces.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/walk.mjs scripts/lib/checks/ts-layout.mjs test/lib/walk.test.mjs
git commit -m "refactor: move commonFolder into walk.mjs for reuse"
```

---

### Task 2: The source scanner

A standalone module that turns TypeScript source text into a list of function bodies. It is deliberately separate from the check so it can be tested against inline strings — no fixtures, no filesystem.

**Files:**
- Create: `scripts/lib/functions.mjs`
- Test: `test/lib/functions.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces, both exported from `scripts/lib/functions.mjs`:
  - `scrub(text: string): { stripped: string, masked: string }` — two copies of `text` of exactly the same length. In `stripped`, every comment character is replaced by a space. In `masked`, comment characters *and* the interior characters of every `"`, `'` and `` ` `` literal are replaced by spaces; the quote characters themselves survive. Newlines are never replaced in either.
  - `extractFunctions(text: string): Body[]` where `Body` is `{ name: string | null, line: number, endLine: number, stripped: string[], masked: string[] }`. `line` is the 1-based line of the declaration; `endLine` is the 1-based line of the closing brace; `stripped` and `masked` are the body lines strictly between the opening and closing brace lines, taken from the correspondingly named scrub output.

- [ ] **Step 1: Write the failing tests**

Create `test/lib/functions.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { scrub, extractFunctions } from "../../scripts/lib/functions.mjs";

test("scrub blanks comments in both copies and keeps the length", () => {
    const text = 'const a = 1; // note\nconst b = 2;\n';
    const { stripped, masked } = scrub(text);
    assert.equal(stripped.length, text.length);
    assert.equal(masked.length, text.length);
    assert.ok(!stripped.includes("note"));
    assert.ok(!masked.includes("note"));
    assert.equal(stripped.split("\n").length, text.split("\n").length);
});

test("scrub keeps string contents in stripped and blanks them in masked", () => {
    const { stripped, masked } = scrub('const a = "EUR";\n');
    assert.ok(stripped.includes('"EUR"'));
    assert.ok(!masked.includes("EUR"));
    assert.ok(masked.includes('"'));
});

test("scrub blanks braces inside strings and template interpolations", () => {
    const { masked } = scrub('const a = "{";\nconst b = `${x.y}`;\n');
    assert.ok(!masked.includes("{"));
});

test("extractFunctions finds a function declaration and its body lines", () => {
    const text = [
        "export function applyTax(net: number): number {",
        "    const rate = 0.19;",
        "    return net * rate;",
        "}",
        "",
    ].join("\n");
    const [fn] = extractFunctions(text);
    assert.equal(fn.name, "applyTax");
    assert.equal(fn.line, 1);
    assert.equal(fn.endLine, 4);
    assert.deepEqual(fn.stripped, ["    const rate = 0.19;", "    return net * rate;"]);
});

test("extractFunctions finds arrow assignments and class methods", () => {
    const text = [
        "const round = (v: number) => {",
        "    return Math.round(v);",
        "};",
        "class Pricer {",
        "    apply(net: number): number {",
        "        return net;",
        "    }",
        "}",
    ].join("\n");
    const names = extractFunctions(text).map((f) => f.name);
    assert.deepEqual(names, ["round", "apply"]);
});

test("extractFunctions skips expression-bodied arrows", () => {
    assert.deepEqual(extractFunctions("const double = (v: number) => v * 2;\n"), []);
});

test("extractFunctions does not treat control flow as a function", () => {
    const text = [
        "function outer(v: number): number {",
        "    if (v > 0) {",
        "        return v;",
        "    }",
        "    return 0;",
        "}",
    ].join("\n");
    assert.deepEqual(extractFunctions(text).map((f) => f.name), ["outer"]);
});

test("extractFunctions does not descend into a nested function", () => {
    const text = [
        "function outer(): number {",
        "    function inner(): number {",
        "        return 1;",
        "    }",
        "    return inner();",
        "}",
    ].join("\n");
    assert.deepEqual(extractFunctions(text).map((f) => f.name), ["outer"]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/lib/functions.test.mjs 2>&1 | tail -20`
Expected: FAIL — cannot find module `scripts/lib/functions.mjs`.

- [ ] **Step 3: Write the scrubber**

Create `scripts/lib/functions.mjs` with this content:

```js
// Source scanning for checks that need whole function bodies rather than lines.
// No parser: the plugin is dependency-free, so this is a character scan that
// neutralises comments and string interiors and then matches braces by depth.

const KEYWORDS = new Set([
    "if", "for", "while", "switch", "catch", "do", "else", "return", "with",
    "function", "class", "new", "typeof", "await", "yield", "try", "finally",
]);

const STARTS = [
    // function foo(   /   export default async function* foo(
    /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)?\s*[(<]/,
    // const foo = (a) => {   /   const foo: T = async function (
    /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(?:async\s+)?(?:function\b|[(<]|[A-Za-z_$][\w$]*\s*=>)/,
    // class or object method:   private async apply(net: number): number {
    /^\s*(?:(?:public|private|protected|static|readonly|abstract|async|get|set)\s+)*([A-Za-z_$][\w$]*)\s*\([^;]*\)\s*(?::[^;{]*)?\{\s*$/,
];

export function scrub(text) {
    const stripped = [...text];
    const masked = [...text];
    let i = 0;

    while (i < text.length) {
        const c = text[i];
        const next = text[i + 1];
        if (c === "/" && next === "/") {
            while (i < text.length && text[i] !== "\n") blank(i++);
        } else if (c === "/" && next === "*") {
            blank(i++);
            blank(i++);
            while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) blank(i++);
            blank(i++);
            blank(i++);
        } else if (c === '"' || c === "'" || c === "`") {
            i++;
            while (i < text.length && text[i] !== c) {
                if (text[i] === "\\") mask(i++);
                mask(i++);
            }
            i++;
        } else {
            i++;
        }
    }
    return { stripped: stripped.join(""), masked: masked.join("") };

    function blank(j) {
        if (j < text.length && text[j] !== "\n") {
            stripped[j] = " ";
            masked[j] = " ";
        }
    }

    function mask(j) {
        if (j < text.length && text[j] !== "\n") masked[j] = " ";
    }
}
```

- [ ] **Step 4: Write the extractor**

Append to `scripts/lib/functions.mjs`:

```js
export function extractFunctions(text) {
    const { stripped, masked } = scrub(text);
    const maskedLines = masked.split("\n");
    const strippedLines = stripped.split("\n");
    const starts = lineStarts(masked);
    const out = [];

    for (let i = 0; i < maskedLines.length; i++) {
        const name = declares(maskedLines[i]);
        if (name === undefined) continue;
        const open = openingBrace(masked, starts, i);
        if (open === -1) continue;
        const close = matchBrace(masked, open);
        if (close === -1) continue;

        const openLine = lineOf(starts, open);
        const closeLine = lineOf(starts, close);
        if (closeLine - openLine > 1) {
            out.push({
                name,
                line: i + 1,
                endLine: closeLine + 1,
                stripped: strippedLines.slice(openLine + 1, closeLine),
                masked: maskedLines.slice(openLine + 1, closeLine),
            });
        }
        i = closeLine;
    }
    return out;
}

function declares(line) {
    for (const re of STARTS) {
        const match = re.exec(line);
        if (match && !KEYWORDS.has(match[1])) return match[1] ?? null;
    }
    return undefined;
}

// The brace may sit on the signature line or just below it, but a ";' first
// means this was an expression-bodied arrow, not a block.
function openingBrace(text, starts, line) {
    const from = starts[line];
    const to = starts[Math.min(line + 3, starts.length - 1)] ?? text.length;
    const slice = text.slice(from, to);
    const brace = slice.indexOf("{");
    const semi = slice.indexOf(";");
    if (brace === -1 || (semi !== -1 && semi < brace)) return -1;
    return from + brace;
}

function matchBrace(text, open) {
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        if (text[i] === "{") depth++;
        else if (text[i] === "}" && --depth === 0) return i;
    }
    return -1;
}

function lineStarts(text) {
    const starts = [0];
    for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
    return starts;
}

function lineOf(starts, offset) {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (starts[mid] <= offset) low = mid;
        else high = mid - 1;
    }
    return low;
}
```

`declares` returns `undefined` for "not a function" and `null` for "a function with no name", which is why the caller tests `name === undefined` rather than falsiness.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/lib/functions.test.mjs 2>&1 | tail -20`
Expected: PASS, 8 tests.

If the control-flow test fails, the third `STARTS` pattern matched `if (v > 0) {` — confirm `if` is in `KEYWORDS` and that `declares` checks `match[1]`, not the whole match.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/functions.mjs test/lib/functions.test.mjs
git commit -m "feat: add a dependency-free function-body scanner"
```

---

### Task 3: Exact duplicates — check 15

**Files:**
- Create: `scripts/lib/checks/duplication.mjs`
- Create: `test/fixtures/dup-drift/srv/pricing/rate.ts`
- Create: `test/fixtures/dup-drift/srv/pricing/rate.test.ts`
- Create: `test/fixtures/dup-drift/srv/pricing/small.ts`
- Create: `test/fixtures/dup-drift/srv/pos/ticket.ts`
- Create: `test/fixtures/dup-drift/srv/pos/twice.ts`
- Create: `references/duplication.md`
- Modify: `scripts/audit.mjs` (import and call)
- Modify: `test/references.test.mjs` (register the new reference file)
- Test: `test/lib/checks/duplication.test.mjs`

**Interfaces:**
- Consumes: `commonFolder` from `scripts/lib/walk.mjs` (Task 1); `extractFunctions` from `scripts/lib/functions.mjs` (Task 2).
- Produces: `checkDuplication(root: string, dirs: string[]): Finding[]` exported from `scripts/lib/checks/duplication.mjs`, with the same signature as `checkTsLayout`.

- [ ] **Step 1: Write the fixtures**

`test/fixtures/dup-drift/srv/pricing/rate.ts`:

```ts
export function applyTax(net: number, region: string): number {
    const rate = lookupRate(region);
    const gross = net * (1 + rate);
    const rounded = Math.round(gross * 100) / 100;
    if (rounded < 0) {
        throw new Error("negative gross");
    }
    return rounded;
}

function lookupRate(region: string): number {
    return region === "DE" ? 0.19 : 0.2;
}
```

`test/fixtures/dup-drift/srv/pos/ticket.ts` — the same body under another name, with a comment added, re-indented, and a blank line inserted:

```ts
export function computeTax(net: number, region: string): number {
  // copied from pricing/rate.ts during the POS spike
  const rate = lookupRate(region);
  const gross = net * (1 + rate);

  const rounded = Math.round(gross * 100) / 100;
  if (rounded < 0) {
      throw new Error("negative gross");
  }
  return rounded;
}

function lookupRate(region: string): number {
    return region === "DE" ? 0.19 : 0.2;
}
```

`test/fixtures/dup-drift/srv/pos/twice.ts` — the same body twice inside one file:

```ts
export function buildHeader(order: Order): string {
    const id = order.id.padStart(10, "0");
    const when = order.date.toISOString();
    const who = order.customer.trim().toUpperCase();
    const parts = [id, when, who];
    return parts.join("|");
}

export function buildFooter(order: Order): string {
    const id = order.id.padStart(10, "0");
    const when = order.date.toISOString();
    const who = order.customer.trim().toUpperCase();
    const parts = [id, when, who];
    return parts.join("|");
}

interface Order {
    id: string;
    date: Date;
    customer: string;
}
```

`test/fixtures/dup-drift/srv/pricing/small.ts` — identical bodies of exactly four lines, one below the threshold:

```ts
export function toCents(value: number): number {
    const scaled = value * 100;
    const rounded = Math.round(scaled);
    const safe = Number.isFinite(rounded) ? rounded : 0;
    return safe;
}

export function toPercent(value: number): number {
    const scaled = value * 100;
    const rounded = Math.round(scaled);
    const safe = Number.isFinite(rounded) ? rounded : 0;
    return safe;
}
```

`test/fixtures/dup-drift/srv/pricing/rate.test.ts` — a copy that must be ignored because it lives in a test file:

```ts
export function applyTaxCopy(net: number, region: string): number {
    const rate = lookupRate(region);
    const gross = net * (1 + rate);
    const rounded = Math.round(gross * 100) / 100;
    if (rounded < 0) {
        throw new Error("negative gross");
    }
    return rounded;
}

function lookupRate(region: string): number {
    return region === "DE" ? 0.19 : 0.2;
}
```

- [ ] **Step 2: Write the failing tests**

Create `test/lib/checks/duplication.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { checkDuplication } from "../../../scripts/lib/checks/duplication.mjs";

const drift = fileURLToPath(new URL("../../fixtures/dup-drift", import.meta.url));
const run = () => checkDuplication(drift, ["srv"]);
const byId = (id) => run().filter((f) => f.id === id);

test("a body copied into another file is reported once, listing both sites", () => {
    const hit = byId("ts-duplicate-function").find((f) => f.message.includes("rate.ts"));
    assert.ok(hit, "expected the applyTax copy to be reported");
    assert.equal(hit.severity, "warning");
    assert.equal(hit.check, 15);
    assert.match(hit.message, /srv\/pos\/ticket\.ts:1/);
    assert.match(hit.message, /srv\/pricing\/rate\.ts:1/);
    assert.match(hit.message, /srv\//);
});

test("comments, indentation and blank lines do not hide a copy", () => {
    assert.equal(byId("ts-duplicate-function").filter((f) =>
        f.message.includes("ticket.ts")).length, 1);
});

test("the same body twice in one file is reported", () => {
    const hit = byId("ts-duplicate-function").find((f) => f.file.endsWith("twice.ts"));
    assert.ok(hit);
    assert.match(hit.message, /twice\.ts:1/);
    assert.match(hit.message, /twice\.ts:9/);
});

test("bodies under five lines are ignored", () => {
    assert.ok(!run().some((f) => f.message.includes("small.ts")));
});

test("copies inside test files are ignored", () => {
    assert.ok(!run().some((f) => f.message.includes("rate.test.ts")));
});

test("no finding carries a rename fix", () => {
    assert.ok(run().every((f) => f.fix === null));
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test test/lib/checks/duplication.test.mjs 2>&1 | tail -20`
Expected: FAIL — cannot find module `scripts/lib/checks/duplication.mjs`.

- [ ] **Step 4: Write the check**

Create `scripts/lib/checks/duplication.mjs`:

```js
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listFiles, commonFolder } from "../walk.mjs";
import { extractFunctions } from "../functions.mjs";
import { finding, WARNING } from "../finding.mjs";

const MIN_BODY_LINES = 5;
const STRING = /"[^"]*"|'[^']*'|`[^`]*`/g;
const NUMBER = /\b\d+(?:\.\d+)?\b/g;

export function checkDuplication(root, dirs) {
    const bodies = collect(root, dirs);
    const out = [];
    for (const group of groupBy(bodies, (b) => b.exactKey).values()) {
        if (group.length > 1) out.push(identical(group));
    }
    return out;
}

function collect(root, dirs) {
    const files = dirs
        .flatMap((d) => listFiles(root, d))
        .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts") && !f.endsWith(".test.ts"));
    const bodies = [];

    for (const file of files) {
        const text = readFileSync(join(root, file), "utf8");
        for (const fn of extractFunctions(text)) {
            const exact = normalize(fn.stripped);
            if (exact.length < MIN_BODY_LINES) continue;
            bodies.push({
                file,
                line: fn.line,
                name: fn.name,
                size: exact.length,
                exactKey: exact.join("\n"),
                shapeKey: normalize(fn.masked).join("\n")
                    .replace(STRING, "S").replace(NUMBER, "N"),
                literals: exact.join("\n").match(new RegExp(
                    `${STRING.source}|${NUMBER.source}`, "g")) ?? [],
            });
        }
    }
    return bodies;
}

function normalize(lines) {
    return lines.map((l) => l.trim().replace(/\s+/g, " ")).filter(Boolean);
}

function identical(group) {
    const sites = group.map((b) => `${b.file}:${b.line}`);
    return finding({
        check: 15, id: "ts-duplicate-function", severity: WARNING,
        file: group[0].file, line: group[0].line,
        message: `an identical ${group[0].size}-line body appears in ${group.length} places ` +
            `(${sites.join(", ")}); extract it into ` +
            `${commonFolder(group.map((b) => b.file))}/`,
    });
}

function groupBy(items, key) {
    const map = new Map();
    for (const item of items) {
        const k = key(item);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(item);
    }
    return map;
}
```

`shapeKey` and `literals` are unused until Task 4; they are computed here because both come from the same body scan.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/lib/checks/duplication.test.mjs 2>&1 | tail -20`
Expected: PASS, 6 tests.

- [ ] **Step 6: Wire it into the audit**

In `scripts/audit.mjs`, add the import next to the other check imports:

```js
import { checkDuplication } from "./lib/checks/duplication.mjs";
```

and extend the existing guarded block so it reads:

```js
    if (scanned.length > 0) {
        findings.push(...checkTsLayout(root, scanned));
        findings.push(...checkDuplication(root, scanned));
    }
```

- [ ] **Step 7: Document check 15**

Create `references/duplication.md`:

```markdown
# Duplication

Applies to every `.ts` file in `srv/`, `db/` and `webapp/`. `.d.ts` and
`.test.ts` files are exempt — parallel arrange blocks in tests read better
than a shared helper.

Function bodies shorter than 5 lines are never reported. One-line accessors
and `return this.x;` pairs are not duplication worth a finding.

## An identical body in two places   `ts-duplicate-function`

Two or more functions whose bodies match once comments are removed, blank
lines dropped and indentation normalised. The names do not have to match —
copy-paste usually renames the function and nothing else.

Reported as a **warning**, naming every site as `file:line` and the nearest
folder the shared version belongs in. There is no automatic fix: extracting
the function and updating both call sites is a code change, not a rename.

This is the sibling of `ts-shared-declaration` in
[typescript-layout.md](typescript-layout.md), which reports the same *name* in
two files. This one reports the same *code* under two names.
```

- [ ] **Step 8: Register the reference file**

In `test/references.test.mjs`, add to the `REQUIRED` map:

```js
    "references/duplication.md": [
        "ts-duplicate-function", "5 lines",
    ],
```

The `every check id emitted by the scripts is documented` test joins only the files in `REQUIRED`, so without this entry check 15's id is undocumented and the suite fails.

- [ ] **Step 9: Run the full suite**

Run: `npm test 2>&1 | tail -25`
Expected: PASS, every test. In particular `a conforming repo reports no findings` must still pass — if `test/fixtures/full-repo` now reports a duplicate, inspect it with `node scripts/audit.mjs test/fixtures/full-repo` and fix the fixture rather than loosening the check.

- [ ] **Step 10: Commit**

```bash
git add scripts/lib/checks/duplication.mjs scripts/audit.mjs references/duplication.md \
        test/lib/checks/duplication.test.mjs test/references.test.mjs test/fixtures/dup-drift
git commit -m "feat: report identical function bodies as ts-duplicate-function"
```

---

### Task 4: Same shape, different constants — check 16

**Files:**
- Modify: `scripts/lib/checks/duplication.mjs`
- Create: `test/fixtures/dup-drift/srv/pricing/eur.ts`
- Create: `test/fixtures/dup-drift/srv/pricing/usd.ts`
- Modify: `references/duplication.md`
- Modify: `test/references.test.mjs`
- Test: `test/lib/checks/duplication.test.mjs` (append)

**Interfaces:**
- Consumes: the `shapeKey` and `literals` fields already produced by `collect` in Task 3.
- Produces: no new exports. `checkDuplication` gains findings with `check: 16`, `id: "ts-parameterizable-function"`, `severity: "question"`.

- [ ] **Step 1: Write the fixtures**

`test/fixtures/dup-drift/srv/pricing/eur.ts`:

```ts
export function discountEur(amount: number, tier: number): string {
    const factor = tier > 3 ? 0.15 : 0.05;
    const net = amount - amount * factor;
    const capped = Math.min(net, 5000);
    const label = "EUR";
    return `${capped.toFixed(2)} ${label}`;
}
```

`test/fixtures/dup-drift/srv/pricing/usd.ts` — identical structure and identical variable names, different constants:

```ts
export function discountUsd(amount: number, tier: number): string {
    const factor = tier > 3 ? 0.25 : 0.1;
    const net = amount - amount * factor;
    const capped = Math.min(net, 8000);
    const label = "USD";
    return `${capped.toFixed(2)} ${label}`;
}
```

- [ ] **Step 2: Write the failing tests**

Append to `test/lib/checks/duplication.test.mjs`:

```js
test("bodies differing only in constants are a question, not a warning", () => {
    const hits = byId("ts-parameterizable-function");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].severity, "question");
    assert.equal(hits[0].check, 16);
    assert.match(hits[0].message, /discountEur at srv\/pricing\/eur\.ts:1/);
    assert.match(hits[0].message, /discountUsd at srv\/pricing\/usd\.ts:1/);
});

test("the question names the constants that differ", () => {
    const [hit] = byId("ts-parameterizable-function");
    assert.match(hit.message, /0\.15 vs 0\.25/);
    assert.match(hit.message, /5000 vs 8000/);
    assert.match(hit.message, /parameters/);
});

test("a pair reported as an exact copy is not reported again as a shape", () => {
    assert.ok(!byId("ts-parameterizable-function").some((f) =>
        f.message.includes("ticket.ts")));
    assert.ok(!byId("ts-parameterizable-function").some((f) =>
        f.message.includes("twice.ts")));
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test test/lib/checks/duplication.test.mjs 2>&1 | tail -20`
Expected: FAIL — `hits.length` is 0; no `ts-parameterizable-function` finding exists yet.

- [ ] **Step 4: Add the shape tier**

In `scripts/lib/checks/duplication.mjs`, add `QUESTION` to the finding import:

```js
import { finding, WARNING, QUESTION } from "../finding.mjs";
```

add the constant below `MIN_BODY_LINES`:

```js
const MAX_LITERALS_SHOWN = 3;
```

extend `checkDuplication` to:

```js
export function checkDuplication(root, dirs) {
    const bodies = collect(root, dirs);
    const out = [];
    for (const group of groupBy(bodies, (b) => b.exactKey).values()) {
        if (group.length > 1) out.push(identical(group));
    }
    // One representative per distinct body, so a pair already reported as an
    // exact copy contributes a single site here instead of two.
    for (const group of groupBy(bodies, (b) => b.shapeKey).values()) {
        const shapes = [...groupBy(group, (b) => b.exactKey).values()].map((g) => g[0]);
        if (shapes.length > 1) out.push(parameterizable(shapes));
    }
    return out;
}
```

and add these two helpers after `identical`:

```js
function parameterizable(shapes) {
    const sites = shapes.map((b) => `${b.name ?? "an anonymous function"} at ${b.file}:${b.line}`);
    const diff = differing(shapes[0].literals, shapes[1].literals);
    return finding({
        check: 16, id: "ts-parameterizable-function", severity: QUESTION,
        file: shapes[0].file, line: shapes[0].line,
        message: `${shapes.length} bodies share the same ${shapes[0].size}-line shape and ` +
            `differ only in constants (${sites.join(", ")})${diff}; consider one function in ` +
            `${commonFolder(shapes.map((b) => b.file))}/ taking them as parameters`,
    });
}

function differing(a, b) {
    const pairs = [];
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] !== b[i]) pairs.push(`${a[i]} vs ${b[i]}`);
    }
    if (pairs.length === 0) return "";
    return `; values differ: ${pairs.slice(0, MAX_LITERALS_SHOWN).join(", ")}`;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/lib/checks/duplication.test.mjs 2>&1 | tail -20`
Expected: PASS, 9 tests.

If `the question names the constants that differ` fails on the second assertion, the third differing pair was truncated by `MAX_LITERALS_SHOWN`: the literals in order are `3`, `0.15`/`0.25`, `0.05`/`0.1`, `5000`/`8000`, `"EUR"`/`"USD"`, and the template literal. `3` matches in both, so the first three *differing* pairs are the two factors and the cap — both asserted strings must be present.

- [ ] **Step 6: Document check 16**

Append to `references/duplication.md`:

```markdown
## The same shape with different constants   `ts-parameterizable-function`

Two or more bodies that match once every string literal is replaced by `S` and
every number by `N`. Variable names still have to match exactly — two bodies
with the same names and the same structure, differing only in constants, is a
copy that was retuned. Normalising names too would start matching unrelated
short accessors.

Reported as a **question**, naming each site and the constants that differ:

```
2 bodies share the same 5-line shape and differ only in constants
(discountEur at srv/pricing/eur.ts:1, discountUsd at srv/pricing/usd.ts:1);
values differ: 0.15 vs 0.25, 0.05 vs 0.1, 5000 vs 8000;
consider one function in srv/pricing/ taking them as parameters
```

It is a question rather than a warning because the repair is a design call.
One function with three new parameters is not always better than two readable
ones — the audit reports the candidate and leaves the decision to a person.

Groups are reported with one site per distinct body, so a pair already listed
under `ts-duplicate-function` never appears here twice.
```

- [ ] **Step 7: Register the second id**

In `test/references.test.mjs`, extend the `references/duplication.md` entry to:

```js
    "references/duplication.md": [
        "ts-duplicate-function", "ts-parameterizable-function", "5 lines",
    ],
```

- [ ] **Step 8: Run the full suite**

Run: `npm test 2>&1 | tail -25`
Expected: PASS. `test/fixtures/full-repo` must still report zero findings — the shape tier is the one most likely to fire on innocent code, so check it specifically:

```bash
node scripts/audit.mjs test/fixtures/full-repo | grep -c '"id"'
```

Expected: `0`.

- [ ] **Step 9: Commit**

```bash
git add scripts/lib/checks/duplication.mjs references/duplication.md \
        test/references.test.mjs test/lib/checks/duplication.test.mjs \
        test/fixtures/dup-drift
git commit -m "feat: report parameterizable near-duplicates as a question"
```

---

### Task 5: Teach the audit skill and the README about findings without a rename

Every check shipped so far either produces a `rename` fix or is a question about naming. These two are the first findings whose repair is a code change, and the skill's fix loop only knows `git mv`. Without this task the skill will try to rename its way out of a duplicate.

**Files:**
- Modify: `skills/conventions-audit/SKILL.md`
- Modify: `README.md`
- Test: `test/skills.test.mjs` (append)

**Interfaces:**
- Consumes: check ids `ts-duplicate-function` and `ts-parameterizable-function` from Tasks 3 and 4.
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Write the failing test**

Append to `test/skills.test.mjs`:

```js
test("the audit skill explains findings that have no rename fix", () => {
    const text = readFileSync(root + "skills/conventions-audit/SKILL.md", "utf8");
    assert.match(text, /ts-duplicate-function/);
    assert.match(text, /ts-parameterizable-function/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/skills.test.mjs 2>&1 | tail -20`
Expected: FAIL — the SKILL.md does not mention either id.

- [ ] **Step 3: Update the skill**

In `skills/conventions-audit/SKILL.md`, extend the questions sentence in section 2 so it reads:

```markdown
Report **questions separately and last**. These need human judgement and are
never auto-fixed: a module in `controller/` with no partner, an app folder that
disagrees with the MTA ID, an oversized file whose seams are a design call, two
functions with the same shape but different constants
(`ts-parameterizable-function`).
```

Then add this section immediately before `## Renames that need more than a rename`:

```markdown
## Findings with no rename

`ts-duplicate-function` and `ts-parameterizable-function` arrive without a
`fix`. There is nothing to `git mv` — the repair is to write a shared function
and change the call sites, which is a code change the user has to want.

Report them, name the sites and the folder the shared version belongs in, and
stop there. If the user asks for the extraction, do it as its own commit,
separate from any rename group: move the body into the named folder, replace
each site with a call, run the project's tests, and confirm nothing else still
holds a copy.
```

- [ ] **Step 4: Update the README**

In `README.md`, add the new reference to the list under `## The rules`, after the `typescript-layout.md` line:

```markdown
- [`references/duplication.md`](references/duplication.md)
```

- [ ] **Step 5: Run the full suite**

Run: `npm test 2>&1 | tail -25`
Expected: PASS, every test in the suite.

- [ ] **Step 6: Verify the whole thing end to end**

```bash
node scripts/audit.mjs test/fixtures/dup-drift
```

Expected: `summary.warning` is 2 and `summary.question` is 1. The two warnings are the `applyTax`/`computeTax` pair and the `buildHeader`/`buildFooter` pair; the question is `discountEur`/`discountUsd`. The `lookupRate` copies in `rate.ts` and `ticket.ts` are identical but one line long, so they are correctly absent.

Confirm no finding for `small.ts` or `rate.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add skills/conventions-audit/SKILL.md README.md test/skills.test.mjs
git commit -m "docs: tell the audit skill how to handle duplication findings"
```

---

### Task 6: Release 1.1.0

A new check is a feature, so this is a minor bump: `1.0.0` -> `1.1.0`. It is the
last task because the version should name a state of the repo where the check
exists, is documented and is green.

**Files:**
- Modify: `package.json` (`version`)
- Modify: `.claude-plugin/plugin.json` (`version`)
- Leave alone: `.claude-plugin/marketplace.json`

**Interfaces:**
- Consumes: nothing. Runs after Tasks 1-5 are merged and the suite is green.
- Produces: nothing consumed by other tasks.

**Do not touch `marketplace.json`.** Its `metadata.version` reads `0.1.0` and
that is deliberate — commit `00db068` ("chore: release 1.0.0") states it
versions the catalog entry, not the plugin, and no test asserts on it. Bumping
it to match looks tidy and is wrong.

- [ ] **Step 1: Confirm the tree is clean and the suite is green**

```bash
git status --porcelain
npm test 2>&1 | tail -5
```

Expected: no output from `git status`, and a passing summary from `npm test`.
Do not bump a version on top of uncommitted work.

- [ ] **Step 2: Bump both manifests**

In `package.json`:

```json
  "version": "1.1.0",
```

In `.claude-plugin/plugin.json`:

```json
  "version": "1.1.0",
```

- [ ] **Step 3: Verify the two stay in sync**

Run: `node --test test/manifest.test.mjs 2>&1 | tail -10`
Expected: PASS. `plugin.json and package.json declare the same version` is the
test that catches a half-finished bump — it reads both files and asserts they
are equal, so changing only one fails here.

- [ ] **Step 4: Run the full suite once more**

Run: `npm test 2>&1 | tail -5`
Expected: PASS, every test.

- [ ] **Step 5: Commit**

```bash
git add package.json .claude-plugin/plugin.json
git commit -m "chore: release 1.1.0

Add the duplication check: ts-duplicate-function reports identical
function bodies, ts-parameterizable-function reports bodies that differ
only in their constants. The marketplace metadata version stays at 0.1.0
-- it versions the catalog entry, not the plugin."
```
