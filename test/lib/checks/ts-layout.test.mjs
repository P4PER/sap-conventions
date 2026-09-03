import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { checkTsLayout } from "../../../scripts/lib/checks/ts-layout.mjs";

const drift = fileURLToPath(new URL("../../fixtures/ts-drift", import.meta.url));
const run = () => checkTsLayout(drift, ["srv"]);
const byId = (id) => run().filter((f) => f.id === id);

test("files over 500 lines are violations, over 300 are warnings", () => {
    const hits = byId("ts-file-size");
    const huge = hits.find((f) => f.file.endsWith("huge.ts"));
    const big = hits.find((f) => f.file.endsWith("big.ts"));
    assert.equal(huge.severity, "violation");
    assert.equal(big.severity, "warning");
});

test("test files are exempt from the size rule", () => {
    assert.ok(!byId("ts-file-size").some((f) => f.file.endsWith(".test.ts")));
});

test("a constant after an exported function is out of order", () => {
    const hits = byId("ts-file-order").filter((f) => f.file.endsWith("out-of-order.ts"));
    assert.equal(hits.length, 1);
    assert.equal(hits[0].line, 3);
});

test("an exported arrow function is API, not a constant", () => {
    assert.ok(!byId("ts-file-order").some((f) => f.file.endsWith("arrow-exports.ts")));
});

test("trailing whitespace does not hide a statement from the order check", () => {
    const hits = byId("ts-file-order").filter((f) => f.file.endsWith("trailing-space.ts"));
    assert.equal(hits.length, 1);
    assert.equal(hits[0].line, 3);
});

test("a name declared in two files belongs in a shared types file", () => {
    const hits = byId("ts-shared-declaration");
    const quote = hits.find((f) => f.message.includes("Quote"));
    assert.ok(quote);
    assert.match(quote.message, /srv\/pricing\/types\.ts/);
});
