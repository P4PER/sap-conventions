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
