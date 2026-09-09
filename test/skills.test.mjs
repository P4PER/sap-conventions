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

test("the audit skill explains findings that have no rename fix", () => {
    const text = readFileSync(root + "skills/conventions-audit/SKILL.md", "utf8");
    assert.match(text, /ts-duplicate-function/);
    assert.match(text, /ts-parameterizable-function/);
});

test("the audit skill does not treat every duplicate as worth extracting", () => {
    const text = readFileSync(root + "skills/conventions-audit/SKILL.md", "utf8");
    assert.match(text, /two lines up/);
    assert.match(text, /worth extracting/);
});
