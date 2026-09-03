import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { listFiles } from "../walk.mjs";
import { finding, rename, PASCAL, VIOLATION, WARNING } from "../finding.mjs";

const NPM_SCRIPT = /^[a-z0-9]+(:[a-z0-9]+)*$/;
const UI5_TEST_DIRS = new Set(["unit", "integration"]);
const PASCAL_DIRS = ["integration/pages/", "integration/journey/"];

export function checkTesting(root, webapps) {
    return [...capTests(root), ...webapps.flatMap((w) => ui5Tests(root, w)), ...npmScripts(root)];
}

function capTests(root) {
    const moves = [];
    for (const dir of ["srv", "db"]) {
        for (const file of listFiles(root, dir).filter((f) => f.endsWith(".test.ts"))) {
            moves.push({ file, dir, to: `test/${file.slice(dir.length + 1)}` });
        }
    }
    // Dropping the leading segment maps srv/pos/x.test.ts and db/pos/x.test.ts onto
    // one target. The rule stands; the rename does not, because the audit moves each
    // finding on its own and the second move would overwrite the first.
    const claims = new Map();
    for (const move of moves) claims.set(move.to, (claims.get(move.to) ?? 0) + 1);

    return moves.map(({ file, dir, to }) => finding({
        check: 12, id: "test-location", severity: VIOLATION, file,
        message: `tests live in a test/ tree mirroring ${dir}/, not beside the module` +
            (claims.get(to) > 1 ? `; ${to} is claimed by another test too, so pick a target` : ""),
        fix: claims.get(to) > 1 ? null : rename(to),
    }));
}

function ui5Tests(root, webappDir) {
    const prefix = `${webappDir}/test/`;
    const files = listFiles(root, `${webappDir}/test`).map((f) => f.slice(prefix.length));
    const out = [];
    const at = (p) => prefix + p;

    for (const folder of new Set(files.filter((f) => f.includes("/")).map((f) => f.split("/")[0]))) {
        if (UI5_TEST_DIRS.has(folder)) continue;
        out.push(finding({
            check: 13, id: "ui5-test-tree", severity: VIOLATION, file: at(folder),
            message: `webapp/test/ holds only unit/ and integration/; found "${folder}"`,
        }));
    }

    for (const file of files) {
        if (!file.includes("/")) {
            if (file.endsWith(".ts") && file !== "testsuite.qunit.ts") {
                out.push(finding({
                    check: 13, id: "ui5-test-suffix", severity: VIOLATION, file: at(file),
                    message: `the only module directly in webapp/test/ is testsuite.qunit.ts`,
                }));
            }
            continue;
        }

        if (file.startsWith("unit/") && file.endsWith(".ts") && !file.endsWith(".qunit.ts")) {
            out.push(finding({
                check: 13, id: "ui5-test-suffix", severity: VIOLATION, file: at(file),
                message: `unit test modules end in .qunit.ts`,
                fix: rename(at(`${file.slice(0, -3)}.qunit.ts`)),
            }));
        }

        for (const dir of PASCAL_DIRS) {
            if (!file.startsWith(dir) || !file.endsWith(".ts")) continue;
            const cut = file.lastIndexOf("/") + 1;
            const name = file.slice(cut);
            const base = name.split(".")[0];
            if (!base || PASCAL.test(base)) continue;
            out.push(finding({
                check: 13, id: "ui5-test-case", severity: VIOLATION, file: at(file),
                message: `${dir.slice(0, -1)} modules are PascalCase; "${base}" is not`,
                fix: rename(at(file.slice(0, cut) + upperFirst(base) + name.slice(base.length))),
            }));
        }
    }
    return out;
}

function npmScripts(root) {
    const file = "package.json";
    if (!existsSync(join(root, file))) return [];
    let scripts;
    try {
        scripts = JSON.parse(readFileSync(join(root, file), "utf8")).scripts ?? {};
    } catch {
        return [];
    }
    return Object.keys(scripts)
        .filter((name) => !NPM_SCRIPT.test(name))
        .map((name) => finding({
            check: 14, id: "npm-script-name", severity: WARNING, file,
            message: `npm scripts are <area>:<action> in lowercase; "${name}" is not`,
        }));
}

const upperFirst = (s) => s[0].toUpperCase() + s.slice(1);
