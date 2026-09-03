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
