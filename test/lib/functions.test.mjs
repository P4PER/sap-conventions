import { test } from "node:test";
import assert from "node:assert/strict";
import { scrub, extractFunctions } from "../../scripts/lib/functions.mjs";

test("scrub blanks comments in both copies and keeps the length", () => {
    const text = 'const a = 1; // note\nconst b = 2;\n';
    const { stripped, masked } = scrub(text);
    assert.equal(stripped.length, text.length);
    assert.equal(masked.length, text.length);
    assert.ok(!stripped.includes("note"));
    assert.ok(!masked.includes("note"));
    assert.equal(stripped.split("\n").length, text.split("\n").length);
});

test("scrub keeps string contents in stripped and blanks them in masked", () => {
    const { stripped, masked } = scrub('const a = "EUR";\n');
    assert.ok(stripped.includes('"EUR"'));
    assert.ok(!masked.includes("EUR"));
    assert.ok(masked.includes('"'));
});

test("scrub blanks braces inside strings and template interpolations", () => {
    const { masked } = scrub('const a = "{";\nconst b = `${x.y}`;\n');
    assert.ok(!masked.includes("{"));
});

test("extractFunctions finds a function declaration and its body lines", () => {
    const text = [
        "export function applyTax(net: number): number {",
        "    const rate = 0.19;",
        "    return net * rate;",
        "}",
        "",
    ].join("\n");
    const [fn] = extractFunctions(text);
    assert.equal(fn.name, "applyTax");
    assert.equal(fn.line, 1);
    assert.equal(fn.endLine, 4);
    assert.deepEqual(fn.stripped, ["    const rate = 0.19;", "    return net * rate;"]);
});

test("extractFunctions finds arrow assignments and class methods", () => {
    const text = [
        "const round = (v: number) => {",
        "    return Math.round(v);",
        "};",
        "class Pricer {",
        "    apply(net: number): number {",
        "        return net;",
        "    }",
        "}",
    ].join("\n");
    const names = extractFunctions(text).map((f) => f.name);
    assert.deepEqual(names, ["round", "apply"]);
});

test("extractFunctions skips expression-bodied arrows", () => {
    assert.deepEqual(extractFunctions("const double = (v: number) => v * 2;\n"), []);
});

test("extractFunctions does not treat control flow as a function", () => {
    const text = [
        "function outer(v: number): number {",
        "    if (v > 0) {",
        "        return v;",
        "    }",
        "    return 0;",
        "}",
    ].join("\n");
    assert.deepEqual(extractFunctions(text).map((f) => f.name), ["outer"]);
});

test("extractFunctions does not descend into a nested function", () => {
    const text = [
        "function outer(): number {",
        "    function inner(): number {",
        "        return 1;",
        "    }",
        "    return inner();",
        "}",
    ].join("\n");
    assert.deepEqual(extractFunctions(text).map((f) => f.name), ["outer"]);
});
