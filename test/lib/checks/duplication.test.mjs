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

test("one-line bodies are ignored", () => {
    assert.ok(!run().some((f) => f.message.includes("small.ts")));
});

test("a two-line body copied into another file is reported", () => {
    const hit = byId("ts-duplicate-function").find((f) => f.message.includes("label.ts"));
    assert.ok(hit, "expected the formatCode copy to be reported");
    assert.match(hit.message, /srv\/pos\/receipt\.ts:1/);
    assert.match(hit.message, /srv\/pricing\/label\.ts:1/);
});

test("identical constructors are not reported", () => {
    assert.ok(!run().some((f) => f.message.includes("register.ts")));
    assert.ok(!run().some((f) => f.message.includes("engine.ts")));
});

test("copies inside test files are ignored", () => {
    assert.ok(!run().some((f) => f.message.includes("rate.test.ts")));
});

test("no finding carries a rename fix", () => {
    assert.ok(run().every((f) => f.fix === null));
});

test("bodies differing only in constants are a question, not a warning", () => {
    const hits = byId("ts-parameterizable-function");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].severity, "question");
    assert.equal(hits[0].check, 16);
    assert.match(hits[0].message, /discountEur at srv\/pricing\/eur\.ts:1/);
    assert.match(hits[0].message, /discountUsd at srv\/pricing\/usd\.ts:1/);
});

test("the question names the constants that differ", () => {
    const [hit] = byId("ts-parameterizable-function");
    assert.match(hit.message, /0\.15 vs 0\.25/);
    assert.match(hit.message, /5000 vs 8000/);
    assert.match(hit.message, /parameters/);
});

test("a pair reported as an exact copy is not reported again as a shape", () => {
    assert.ok(!byId("ts-parameterizable-function").some((f) =>
        f.message.includes("ticket.ts")));
    assert.ok(!byId("ts-parameterizable-function").some((f) =>
        f.message.includes("twice.ts")));
});
