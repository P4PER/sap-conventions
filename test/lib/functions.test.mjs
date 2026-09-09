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

test("extractFunctions reads past a destructured parameter list to the real body", () => {
    const text = [
        "export default async function orderPlacedHandler({",
        "    event: { data },",
        "    container,",
        "}: SubscriberArgs<{ id: string }>) {",
        "    const logger = container.resolve('logger');",
        "    logger.info(data.id);",
        "}",
    ].join("\n");
    const [fn] = extractFunctions(text);
    assert.equal(fn.name, "orderPlacedHandler");
    assert.deepEqual(fn.stripped, [
        "    const logger = container.resolve('logger');",
        "    logger.info(data.id);",
    ]);
});

test("extractFunctions reads past an inline object type annotation to the real body", () => {
    const text = [
        "export function getPostgresAppTemplate(config?: {",
        "    appName?: string,",
        "    dbName?: string,",
        "    dbPassword?: string",
        "}): AppTemplateContentModel {",
        "    return { name: config?.appName ?? '' };",
        "}",
    ].join("\n");
    const [fn] = extractFunctions(text);
    assert.equal(fn.name, "getPostgresAppTemplate");
    assert.deepEqual(fn.stripped, ["    return { name: config?.appName ?? '' };"]);
});

test("extractFunctions skips an arrow whose expression body passes an options object", () => {
    const text = [
        "const fetchCsv = async () =>",
        "    api.get('/admin/exports/orders', {",
        "        headers,",
        "        responseType: 'text',",
        "    });",
    ].join("\n");
    assert.deepEqual(extractFunctions(text), []);
});

test("extractFunctions takes the callback body of an arrow that wraps one", () => {
    const text = [
        "export const registerUser = async (input: Input) =>",
        "    saveFormAction(input, schemaZod, async (data) => {",
        "        const user = await userService.register(data.email);",
        "        return user.id;",
        "    });",
    ].join("\n");
    const [fn] = extractFunctions(text);
    assert.equal(fn.name, "registerUser");
    assert.deepEqual(fn.stripped, [
        "        const user = await userService.register(data.email);",
        "        return user.id;",
    ]);
});

test("extractFunctions reads past a generic return type to the real body", () => {
    const text = [
        "export async function runIngest(opts: {",
        "    databaseUrl: string",
        "    dataDir: string",
        "}): Promise<{ sets: number; cards: number }> {",
        "    const sets = await loadSets(opts.dataDir);",
        "    return { sets: sets.length, cards: 0 };",
        "}",
    ].join("\n");
    const [fn] = extractFunctions(text);
    assert.equal(fn.name, "runIngest");
    assert.deepEqual(fn.stripped, [
        "    const sets = await loadSets(opts.dataDir);",
        "    return { sets: sets.length, cards: 0 };",
    ]);
});
