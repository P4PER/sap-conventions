import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { checkDuplication } from "../../../scripts/lib/checks/duplication.mjs";

const drift = fileURLToPath(new URL("../../fixtures/dup-drift", import.meta.url));
const run = () => checkDuplication(drift, ["srv"]);
const byId = (id) => run().filter((f) => f.id === id);

test("a body copied into another file is reported once, listing both sites", () => {
    const hit = byId("ts-duplicate-function").find((f) => f.message.includes("rate.ts"));
    assert.ok(hit, "expected the applyTax copy to be reported");
    assert.equal(hit.severity, "warning");
    assert.equal(hit.check, 15);
    assert.match(hit.message, /srv\/pos\/ticket\.ts:1/);
    assert.match(hit.message, /srv\/pricing\/rate\.ts:1/);
    assert.match(hit.message, /srv\//);
});

test("comments, indentation and blank lines do not hide a copy", () => {
    assert.equal(byId("ts-duplicate-function").filter((f) =>
        f.message.includes("ticket.ts")).length, 1);
});

test("the same body twice in one file is reported", () => {
    const hit = byId("ts-duplicate-function").find((f) => f.file.endsWith("twice.ts"));
    assert.ok(hit);
    assert.match(hit.message, /twice\.ts:7/);
    assert.match(hit.message, /twice\.ts:15/);
});

test("bodies under five lines are ignored", () => {
    assert.ok(!run().some((f) => f.message.includes("small.ts")));
});

test("copies inside test files are ignored", () => {
    assert.ok(!run().some((f) => f.message.includes("rate.test.ts")));
});

test("no finding carries a rename fix", () => {
    assert.ok(run().every((f) => f.fix === null));
});
