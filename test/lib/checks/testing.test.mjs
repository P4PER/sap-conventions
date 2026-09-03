import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { checkTesting } from "../../../scripts/lib/checks/testing.mjs";

const drift = fileURLToPath(new URL("../../fixtures/testing-drift", import.meta.url));
const collision = fileURLToPath(new URL("../../fixtures/test-collision", import.meta.url));
const run = () => checkTesting(drift, ["webapp"]);
const byId = (id) => run().filter((f) => f.id === id);

test("a test file under srv is relocated into the mirrored test tree", () => {
    const hits = byId("test-location").filter((f) => f.file.startsWith("srv/"));
    assert.equal(hits.length, 1);
    assert.equal(hits[0].file, "srv/pos/pos-determination.test.ts");
    assert.equal(hits[0].severity, "violation");
    assert.deepEqual(hits[0].fix, { kind: "rename", to: "test/pos/pos-determination.test.ts" });
});

test("a test file under db drops its leading segment too", () => {
    const hits = byId("test-location").filter((f) => f.file.startsWith("db/"));
    assert.equal(hits.length, 1);
    assert.deepEqual(hits[0].fix, { kind: "rename", to: "test/pricing/rate.test.ts" });
});

test("two tests mapping onto one target are reported without a rename", () => {
    const hits = checkTesting(collision, []).filter((f) => f.id === "test-location");
    assert.equal(hits.length, 2);
    for (const hit of hits) {
        assert.equal(hit.fix, null);
        assert.match(hit.message, /claimed by another test/);
    }
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
    const hits = byId("ui5-test-case").filter((f) => f.file.includes("/pages/"));
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

test("a nested journey is judged by its basename and renamed in its own folder", () => {
    const hits = byId("ui5-test-case").filter((f) => f.file.includes("/journey/"));
    assert.equal(hits.length, 1);
    assert.equal(hits[0].file, "webapp/test/integration/journey/sub/posJourney.ts");
    assert.deepEqual(hits[0].fix, {
        kind: "rename",
        to: "webapp/test/integration/journey/sub/PosJourney.ts",
    });
});
