import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { checkExternalServices } from "../../../scripts/lib/checks/external-services.mjs";

const drift = fileURLToPath(new URL("../../fixtures/external-drift", import.meta.url));
const clean = fileURLToPath(new URL("../../fixtures/full-repo", import.meta.url));
const byId = (fs, id) => fs.filter((f) => f.id === id);

test("a cds.requires key that disagrees with its model basename is a violation", () => {
    const hits = byId(checkExternalServices(drift), "external-identity");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].severity, "violation");
    assert.match(hits[0].message, /CPI_Pricing/);
    assert.match(hits[0].message, /CpiPricing/);
});

test("a non-PascalCase service name is a violation", () => {
    const hits = byId(checkExternalServices(drift), "external-name-style");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].file, "srv/external/ZAPI_SALES_ORDER_SIMULATION_SRV.cds");
});

test("retained metadata must be .edmx", () => {
    const hits = byId(checkExternalServices(drift), "external-metadata-ext");
    assert.equal(hits.length, 1);
    assert.deepEqual(hits[0].fix, {
        kind: "rename",
        to: "srv/external/ZAPI_SALES_ORDER_SIMULATION_SRV.edmx",
    });
});

test("C4C is conforming and produces no findings", () => {
    const hits = checkExternalServices(drift).filter((f) => f.file.includes("C4C"));
    assert.deepEqual(hits, []);
});

test("a repo with no external services produces no findings", () => {
    assert.deepEqual(checkExternalServices(clean), []);
});
