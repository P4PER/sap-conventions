import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { checkDeployment } from "../../../scripts/lib/checks/deployment.mjs";

const drift = fileURLToPath(new URL("../../fixtures/deploy-drift", import.meta.url));
const byId = (id) => checkDeployment(drift).filter((f) => f.id === id);

test("the catch-all route must be last", () => {
    const hits = byId("router-route-order");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].severity, "violation");
});

test("every route must set authenticationType", () => {
    const hits = byId("router-auth-type");
    assert.equal(hits.length, 1);
    assert.match(hits[0].message, /\^\/odata/);
});

test("the catch-all route must set cacheControl", () => {
    assert.equal(byId("router-cache-control").length, 1);
});

test("module names must derive from the MTA ID", () => {
    const hits = byId("mta-name-prefix");
    assert.equal(hits.length, 1);
    assert.match(hits[0].message, /legacy-deployer/);
});

test("srv-api and app-api are allowed cross-module names", () => {
    assert.ok(!byId("mta-name-prefix").some((f) => f.message.includes("srv-api")));
});

test("an app folder that disagrees with the MTA ID is a question", () => {
    const hits = byId("mta-app-id");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].severity, "question");
    assert.match(hits[0].message, /changenotifications/);
});
