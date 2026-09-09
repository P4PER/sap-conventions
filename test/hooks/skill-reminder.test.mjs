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
