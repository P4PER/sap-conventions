# Skill Reminder Hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `UserPromptSubmit` hook inside the plugin that reminds the model to invoke a `sap-conventions` skill, injecting only when the working directory is a UI5 or CAP project.

**Architecture:** `hooks/skill-reminder.mjs` reads the hook payload from stdin, resolves the working directory, and asks the plugin's own `detectHalves()` whether that directory is a UI5/CAP project. If it is, it prints a `hookSpecificOutput.additionalContext` JSON envelope; otherwise it prints nothing. `hooks/hooks.json` wires it to `UserPromptSubmit` using the exec form so `${CLAUDE_PLUGIN_ROOT}` never passes through a shell.

**Tech Stack:** Node >= 22, ESM, zero dependencies, `node --test` with fixtures under `test/fixtures/`.

**Spec:** `docs/2026-09-09-skill-reminder-hook-design.md`

## Global Constraints

- **Zero dependencies.** `test/manifest.test.mjs` asserts `dependencies` and `devDependencies` are both empty. Node built-ins only.
- **ESM only.** `"type": "module"`; `.mjs` extension for scripts and tests.
- **Node >= 22.** `package.json` `engines.node` is `>=22`; CI runs 22 and 24.
- **The hook must never break a turn.** Every failure path exits 0 with no output. No uncaught throw, ever.
- **`package.json` and `.claude-plugin/plugin.json` must declare the same version.** `test/manifest.test.mjs` asserts it. `.claude-plugin/marketplace.json` versions the catalog entry, not the plugin, and stays at `0.1.0`.
- **`test/fixtures/full-repo` must keep reporting zero audit findings.** `test/audit.test.mjs` asserts `summary.total === 0`. Do not add files to it.
- **Style:** 4-space indent, double-quoted strings, `export function` for the module API and plain `function` declarations for local helpers below it — match `scripts/lib/checks/ts-layout.mjs`.
- **Commit messages:** conventional commits (`feat:`, `test:`, `docs:`, `chore:`), matching the existing history.
- **Do not add a `hooks` key to `.claude-plugin/plugin.json`.** Claude Code discovers `hooks/hooks.json` by convention; `superpowers` ships its hook with no manifest entry.

---

### Task 1: The reminder program

The hook script itself, testable as a plain subprocess with no Claude Code involved. It is a script rather than a module because a hook is an executable, but the decision it makes is exported so a test can drive it directly.

**Files:**
- Create: `hooks/skill-reminder.mjs`
- Test: `test/hooks/skill-reminder.test.mjs`

**Interfaces:**
- Consumes: `detectHalves(root: string): { ui5: string[], cap: boolean, router: boolean }` from `scripts/lib/walk.mjs`.
- Produces: `reminderFor(root: string): string | null` exported from `hooks/skill-reminder.mjs` — the JSON line to print for that directory, or `null` when the directory is not a UI5/CAP project. The file is also directly executable: `node hooks/skill-reminder.mjs` reads stdin and prints that line (or nothing).

- [ ] **Step 1: Write the failing tests**

Create `test/hooks/skill-reminder.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { reminderFor } from "../../hooks/skill-reminder.mjs";

const capRepo = fileURLToPath(new URL("../fixtures/full-repo", import.meta.url));
const hook = fileURLToPath(new URL("../../hooks/skill-reminder.mjs", import.meta.url));

const run = (input, cwd) =>
    execFileSync("node", [hook], { input, cwd, encoding: "utf8" });

test("a UI5/CAP project gets the reminder", () => {
    const line = reminderFor(capRepo);
    assert.ok(line, "expected a reminder for the full-repo fixture");
    const payload = JSON.parse(line);
    assert.equal(payload.hookSpecificOutput.hookEventName, "UserPromptSubmit");
    assert.match(payload.hookSpecificOutput.additionalContext, /ui5-conventions/);
    assert.match(payload.hookSpecificOutput.additionalContext, /cap-conventions/);
    assert.match(payload.hookSpecificOutput.additionalContext, /conventions-audit/);
});

test("a directory that is not a UI5 or CAP project gets nothing", () => {
    const dir = mkdtempSync(join(tmpdir(), "plain-"));
    try {
        mkdirSync(join(dir, "lib"));
        assert.equal(reminderFor(dir), null);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("the cwd on the payload wins over the process directory", () => {
    const out = run(JSON.stringify({ cwd: capRepo }), tmpdir());
    assert.match(out, /ui5-conventions/);
});

test("without a cwd on the payload it falls back to the process directory", () => {
    const out = run("{}", capRepo);
    assert.match(out, /ui5-conventions/);
});

test("a non-SAP directory prints nothing at all", () => {
    const dir = mkdtempSync(join(tmpdir(), "plain-"));
    try {
        assert.equal(run("{}", dir), "");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("malformed stdin exits 0 without output", () => {
    const dir = mkdtempSync(join(tmpdir(), "plain-"));
    try {
        assert.equal(run("not json at all", dir), "");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("malformed stdin still reminds inside an SAP project", () => {
    assert.match(run("not json at all", capRepo), /ui5-conventions/);
});

test("a cwd that does not exist exits 0 without output", () => {
    assert.equal(run(JSON.stringify({ cwd: "/no/such/place/at/all" }), tmpdir()), "");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/hooks/skill-reminder.test.mjs 2>&1 | tail -20`
Expected: FAIL — cannot find module `hooks/skill-reminder.mjs`.

- [ ] **Step 3: Write the hook program**

Create `hooks/skill-reminder.mjs`:

```js
#!/usr/bin/env node
// UserPromptSubmit hook: remind the model that this plugin's skills exist, but
// only inside a UI5 or CAP project. Every failure path exits 0 with no output —
// a hook that throws on a user's prompt is worse than one that stays quiet.
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { detectHalves } from "../scripts/lib/walk.mjs";

const REMINDER = [
    "This is a UI5/CAP project. Before acting, check whether a",
    "sap-conventions skill covers this request and invoke it:",
    "",
    "- ui5-conventions - creating/renaming/moving files under webapp/",
    "- cap-conventions - CAP/CDS service, handler, db naming and layout",
    "- conventions-audit - auditing or cleaning up project structure",
    "",
    "Invoke it before exploring the codebase or answering.",
].join("\n");

export function reminderFor(root) {
    let halves;
    try {
        halves = detectHalves(root);
    } catch {
        return null;
    }
    if (halves.ui5.length === 0 && !halves.cap) return null;
    return JSON.stringify({
        hookSpecificOutput: {
            hookEventName: "UserPromptSubmit",
            additionalContext: REMINDER,
        },
    });
}

function payloadCwd() {
    try {
        const parsed = JSON.parse(readFileSync(0, "utf8"));
        if (parsed && typeof parsed.cwd === "string") return parsed.cwd;
    } catch {
        // No stdin, or not JSON. The process directory is still a fine answer.
    }
    return process.cwd();
}

// Same entry guard as scripts/audit.mjs, for the same two reasons: argv[1] needs
// URL escaping before it matches import.meta.url, and it arrives unresolved
// through symlinked directories such as /tmp and /var on macOS -- which is
// exactly where the tests run this from.
if (process.argv[1] &&
    realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
    const line = reminderFor(payloadCwd());
    if (line) process.stdout.write(line + "\n");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/hooks/skill-reminder.test.mjs 2>&1 | tail -20`
Expected: PASS, 8 tests.

If `a cwd that does not exist exits 0 without output` fails, `detectHalves` did not throw on the missing directory — it calls `existsSync` first, so it returns all-false rather than throwing. Both outcomes yield `null`; the test should still pass. If it does not, check that the entry guard is not writing an empty line.

- [ ] **Step 5: Commit**

```bash
git add hooks/skill-reminder.mjs test/hooks/skill-reminder.test.mjs
git commit -m "feat: add a UserPromptSubmit hook that names this plugin's skills"
```

---

### Task 2: Declare the hook and guard the declaration

The JSON that wires the program to the event, plus a test that the declaration keeps pointing at a program that exists. A hook whose path is wrong fails silently — nothing in Claude Code reports it — so the test is the only thing that would catch a rename.

**Files:**
- Create: `hooks/hooks.json`
- Test: `test/hooks/hooks-json.test.mjs`

**Interfaces:**
- Consumes: `hooks/skill-reminder.mjs` from Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Create `test/hooks/hooks-json.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const config = JSON.parse(readFileSync(root + "hooks/hooks.json", "utf8"));

test("the hook is declared on UserPromptSubmit", () => {
    const entries = config.hooks.UserPromptSubmit;
    assert.ok(Array.isArray(entries) && entries.length === 1);
    assert.equal(entries[0].hooks.length, 1);
});

test("the declaration uses the exec form so no shell parses the path", () => {
    const [hook] = config.hooks.UserPromptSubmit[0].hooks;
    assert.equal(hook.type, "command");
    assert.equal(hook.command, "node");
    assert.ok(Array.isArray(hook.args), "args is what keeps the path off a shell");
});

test("the declared script exists in the repo", () => {
    const [hook] = config.hooks.UserPromptSubmit[0].hooks;
    const arg = hook.args.find((a) => a.includes("${CLAUDE_PLUGIN_ROOT}"));
    assert.ok(arg, "the script path must be rooted at ${CLAUDE_PLUGIN_ROOT}");
    const relative = arg.replace("${CLAUDE_PLUGIN_ROOT}/", "");
    assert.ok(existsSync(root + relative), `${relative} does not exist`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/hooks/hooks-json.test.mjs 2>&1 | tail -20`
Expected: FAIL — `ENOENT`, no such file `hooks/hooks.json`.

- [ ] **Step 3: Write the declaration**

Create `hooks/hooks.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PLUGIN_ROOT}/hooks/skill-reminder.mjs"],
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

There is no `matcher`: `UserPromptSubmit` has no tool name to match on, and the
schema only requires the `hooks` array.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/hooks/hooks-json.test.mjs 2>&1 | tail -20`
Expected: PASS, 3 tests.

- [ ] **Step 5: Verify the wiring by hand**

Run the exact command the harness will run, with the placeholder expanded:

```bash
echo '{}' | node "$(pwd)/hooks/skill-reminder.mjs"
```

Expected: one line of JSON containing `ui5-conventions` — this repo has a `srv/`
directory of its own only inside fixtures, so run it against a fixture to be
sure:

```bash
echo "{\"cwd\": \"$(pwd)/test/fixtures/full-repo\"}" | node hooks/skill-reminder.mjs
```

Expected: the JSON envelope. And from a directory that is not an SAP project:

```bash
echo '{"cwd": "/tmp"}' | node hooks/skill-reminder.mjs
```

Expected: no output at all, exit 0.

- [ ] **Step 6: Run the full suite**

Run: `npm test 2>&1 | tail -10`
Expected: PASS, every test.

- [ ] **Step 7: Commit**

```bash
git add hooks/hooks.json test/hooks/hooks-json.test.mjs
git commit -m "feat: wire the skill reminder to UserPromptSubmit"
```

---

### Task 3: Document the hook and release 1.2.0

The hook changes what every teammate's session does, so it needs to be findable in the README rather than discovered by surprise. A new capability is a minor bump: `1.1.0` -> `1.2.0`.

**Files:**
- Modify: `README.md`
- Modify: `package.json` (`version`)
- Modify: `.claude-plugin/plugin.json` (`version`)
- Leave alone: `.claude-plugin/marketplace.json`

**Interfaces:**
- Consumes: the hook from Tasks 1 and 2.
- Produces: nothing.

**Do not touch `marketplace.json`.** Its `metadata.version` reads `0.1.0` and that is deliberate — it versions the catalog entry, not the plugin, and no test asserts on it.

- [ ] **Step 1: Add a README section**

In `README.md`, after the `## The rules` list, add:

```markdown
## The skill reminder

The plugin ships a `UserPromptSubmit` hook (`hooks/hooks.json`). On every
message, in a UI5 or CAP project only, it injects a short reminder naming the
three skills and what each one covers.

It exists because a skill is only used if the model remembers to look for one,
and the instruction to look arrives once per session — at `SessionStart` — then
competes with everything after it. `UserPromptSubmit` fires every turn instead.

Whether a directory counts as a UI5 or CAP project is the same test the audit
uses: a `webapp/` tree, or a `srv/` or `db/` directory. Everywhere else the hook
prints nothing, so it costs nothing.

To see it, disable it, or check that it ran, use `/hooks`.
```

- [ ] **Step 2: Confirm the tree is clean and the suite is green**

```bash
git status --porcelain
npm test 2>&1 | tail -5
```

Expected: only the README modification outstanding, and a passing suite. Do not
bump a version on top of unrelated uncommitted work.

- [ ] **Step 3: Bump both manifests**

In `package.json`:

```json
  "version": "1.2.0",
```

In `.claude-plugin/plugin.json`:

```json
  "version": "1.2.0",
```

- [ ] **Step 4: Verify the two stay in sync**

Run: `node --test test/manifest.test.mjs 2>&1 | tail -10`
Expected: PASS. `plugin.json and package.json declare the same version` is the
test that catches a half-finished bump.

- [ ] **Step 5: Run the full suite once more**

Run: `npm test 2>&1 | tail -5`
Expected: PASS, every test.

- [ ] **Step 6: Commit**

```bash
git add README.md package.json .claude-plugin/plugin.json
git commit -m "chore: release 1.2.0

Ship a UserPromptSubmit hook that names the plugin's skills on every
turn, but only inside a UI5 or CAP project. The marketplace metadata
version stays at 0.1.0 -- it versions the catalog entry, not the plugin."
```

---

### Task 4: Verify the hook end to end in a real session

The suite proves the program is correct. It cannot prove Claude Code loads the
declaration — that needs a session. This task is the handoff, and it is the only
one whose steps a person has to run.

**Files:** none.

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Reinstall or update the plugin**

The plugin is installed from this repo. A new `hooks/` directory is picked up
when the plugin is re-read, not while a session is running.

- [ ] **Step 2: Open a fresh session in a UI5 or CAP project and type `/hooks`**

Expected: a `UserPromptSubmit` entry naming `node .../hooks/skill-reminder.mjs`.
If it is absent, the plugin has not been re-read — reinstall it.

- [ ] **Step 3: Open a fresh session somewhere that is not an SAP project**

Expected: the hook is still listed under `/hooks` — it is declared regardless —
but injects nothing. The listing is the declaration; silence is the behaviour.

- [ ] **Step 4: Report the outcome**

If the hook fires in an SAP project and stays quiet elsewhere, the work is done.
If it never appears in `/hooks`, the declaration is not being read: check that
`hooks/hooks.json` sits at the plugin root, beside `.claude-plugin/`, and that
the plugin was reinstalled rather than merely restarted.
