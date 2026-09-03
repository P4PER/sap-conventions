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
