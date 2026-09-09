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
