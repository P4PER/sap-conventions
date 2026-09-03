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
