import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listFiles, commonFolder } from "../walk.mjs";
import { extractFunctions } from "../functions.mjs";
import { finding, WARNING } from "../finding.mjs";

const MIN_BODY_LINES = 5;
const STRING = /"[^"]*"|'[^']*'|`[^`]*`/g;
const NUMBER = /\b\d+(?:\.\d+)?\b/g;

export function checkDuplication(root, dirs) {
    const bodies = collect(root, dirs);
    const out = [];
    for (const group of groupBy(bodies, (b) => b.exactKey).values()) {
        if (group.length > 1) out.push(identical(group));
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

function groupBy(items, key) {
    const map = new Map();
    for (const item of items) {
        const k = key(item);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(item);
    }
    return map;
}
