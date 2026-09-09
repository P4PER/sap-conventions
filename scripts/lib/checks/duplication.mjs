import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listFiles, commonFolder } from "../walk.mjs";
import { extractFunctions } from "../functions.mjs";
import { finding, WARNING, QUESTION } from "../finding.mjs";

// Two lines is the floor: a one-line accessor repeated across files is not
// copy-paste, but a two-line helper carried from one app into the next is.
const MIN_BODY_LINES = 2;
// Constructors are excluded outright. Assigning the injected dependencies is
// the same two lines in every service, and there is nothing to extract.
const EXCLUDED_NAMES = new Set(["constructor"]);
const MAX_LITERALS_SHOWN = 3;
const STRING = /"[^"]*"|'[^']*'|`[^`]*`/g;
const NUMBER = /\b\d+(?:\.\d+)?\b/g;

export function checkDuplication(root, dirs) {
    const bodies = collect(root, dirs);
    const out = [];
    for (const group of groupBy(bodies, (b) => b.exactKey).values()) {
        if (group.length > 1) out.push(identical(group));
    }
    // One representative per distinct body, so a pair already reported as an
    // exact copy contributes a single site here instead of two.
    for (const group of groupBy(bodies, (b) => b.shapeKey).values()) {
        const shapes = [...groupBy(group, (b) => b.exactKey).values()].map((g) => g[0]);
        if (shapes.length > 1) out.push(parameterizable(shapes));
    }
    return out;
}

function collect(root, dirs) {
    const files = dirs
        .flatMap((d) => listFiles(root, d))
        .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts") && !f.endsWith(".test.ts"));
    const bodies = [];

    for (const file of files) {
        const text = readFileSync(join(root, file), "utf8");
        for (const fn of extractFunctions(text)) {
            if (EXCLUDED_NAMES.has(fn.name)) continue;
            const exact = normalize(fn.stripped);
            if (exact.length < MIN_BODY_LINES) continue;
            bodies.push({
                file,
                line: fn.line,
                name: fn.name,
                size: exact.length,
                exactKey: exact.join("\n"),
                shapeKey: normalize(fn.masked).join("\n")
                    .replace(STRING, "S").replace(NUMBER, "N"),
                literals: exact.join("\n").match(new RegExp(
                    `${STRING.source}|${NUMBER.source}`, "g")) ?? [],
            });
        }
    }
    return bodies;
}

function normalize(lines) {
    return lines.map((l) => l.trim().replace(/\s+/g, " ")).filter(Boolean);
}

function identical(group) {
    const sites = group.map((b) => `${b.file}:${b.line}`);
    return finding({
        check: 15, id: "ts-duplicate-function", severity: WARNING,
        file: group[0].file, line: group[0].line,
        message: `an identical ${group[0].size}-line body appears in ${group.length} places ` +
            `(${sites.join(", ")}); extract it into ` +
            `${commonFolder(group.map((b) => b.file))}/`,
    });
}

function parameterizable(shapes) {
    const sites = shapes.map((b) => `${b.name ?? "an anonymous function"} at ${b.file}:${b.line}`);
    const diff = differing(shapes[0].literals, shapes[1].literals);
    return finding({
        check: 16, id: "ts-parameterizable-function", severity: QUESTION,
        file: shapes[0].file, line: shapes[0].line,
        message: `${shapes.length} bodies share the same ${shapes[0].size}-line shape and ` +
            `differ only in constants (${sites.join(", ")})${diff}; consider one function in ` +
            `${commonFolder(shapes.map((b) => b.file))}/ taking them as parameters`,
    });
}

function differing(a, b) {
    const pairs = [];
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] !== b[i]) pairs.push(`${a[i]} vs ${b[i]}`);
    }
    if (pairs.length === 0) return "";
    return `; values differ: ${pairs.slice(0, MAX_LITERALS_SHOWN).join(", ")}`;
}

function groupBy(items, key) {
    const map = new Map();
    for (const item of items) {
        const k = key(item);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(item);
    }
    return map;
}
