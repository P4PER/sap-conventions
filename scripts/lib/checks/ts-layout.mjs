import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listFiles } from "../walk.mjs";
import { finding, VIOLATION, WARNING } from "../finding.mjs";

const WARN_LINES = 300;
const FAIL_LINES = 500;
const SHARED_FILES = new Set(["types.ts", "constants.ts"]);

const PHASES = [
    [1, /^import\s/],
    [2, /^(export\s+)?(interface|type)\s+\w/],
    [3, /^(export\s+)?const\s+\w+\s*(:[^=]+)?=\s*(?!\()/],
    [4, /^export\s+(default\s+|async\s+)?(function|class|const)\s/],
    [5, /^(async\s+)?function\s+\w/],
];
const DECLARATION = /^export\s+(interface|type|const)\s+(\w+)/;

export function checkTsLayout(root, dirs) {
    const files = dirs
        .flatMap((d) => listFiles(root, d))
        .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"));
    const out = [];
    const declaredIn = new Map();

    for (const file of files) {
        const lines = readLines(join(root, file));
        if (!file.endsWith(".test.ts")) {
            out.push(...size(file, lines.length));
            out.push(...order(file, lines));
        }
        collect(file, lines, declaredIn);
    }

    out.push(...shared(declaredIn));
    return out;
}

function readLines(path) {
    const lines = readFileSync(path, "utf8").split("\n");
    if (lines.at(-1) === "") lines.pop();
    return lines;
}

function size(file, count) {
    if (count > FAIL_LINES) {
        return [finding({
            check: 6, id: "ts-file-size", severity: VIOLATION, file,
            message: `${count} lines exceeds the ${FAIL_LINES}-line limit; split it by concern`,
        })];
    }
    if (count > WARN_LINES) {
        return [finding({
            check: 6, id: "ts-file-size", severity: WARNING, file,
            message: `${count} lines is over the ${WARN_LINES}-line guideline`,
        })];
    }
    return [];
}

function order(file, lines) {
    let highest = 0;
    for (let i = 0; i < lines.length; i++) {
        const phase = classify(lines[i]);
        if (phase === null) continue;
        if (phase < highest) {
            return [finding({
                check: 7, id: "ts-file-order", severity: WARNING, file, line: i + 1,
                message: `out of order: expected imports -> types -> constants -> exported API -> ` +
                    `local helpers, but a phase-${phase} statement follows a phase-${highest} one`,
            })];
        }
        highest = Math.max(highest, phase);
    }
    return [];
}

function classify(raw) {
    const line = raw.trimEnd();
    if (line !== raw.trimStart()) return null;
    for (const [phase, re] of PHASES) if (re.test(line)) return phase;
    return null;
}

function collect(file, lines, declaredIn) {
    const name = file.slice(file.lastIndexOf("/") + 1);
    if (SHARED_FILES.has(name) || file.endsWith(".test.ts")) return;
    for (const line of lines) {
        const match = DECLARATION.exec(line);
        if (!match) continue;
        const key = match[2];
        if (!declaredIn.has(key)) declaredIn.set(key, new Set());
        declaredIn.get(key).add(file);
    }
}

function shared(declaredIn) {
    const out = [];
    for (const [name, files] of declaredIn) {
        if (files.size < 2) continue;
        const list = [...files].sort();
        const folder = commonFolder(list);
        out.push(finding({
            check: 8, id: "ts-shared-declaration", severity: WARNING, file: list[0],
            message: `"${name}" is declared in ${list.length} files (${list.join(", ")}); ` +
                `move it to ${folder}/types.ts or ${folder}/constants.ts`,
        }));
    }
    return out;
}

function commonFolder(files) {
    const parts = files.map((f) => f.split("/").slice(0, -1));
    const shared = [];
    for (let i = 0; i < parts[0].length; i++) {
        const seg = parts[0][i];
        if (parts.every((p) => p[i] === seg)) shared.push(seg);
        else break;
    }
    return shared.join("/") || ".";
}
