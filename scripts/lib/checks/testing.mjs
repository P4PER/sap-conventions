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
    const out = [];
    for (const dir of ["srv", "db"]) {
        for (const file of listFiles(root, dir).filter((f) => f.endsWith(".test.ts"))) {
            out.push(finding({
                check: 12, id: "test-location", severity: VIOLATION, file,
                message: `tests live in a test/ tree mirroring ${dir}/, not beside the module`,
                fix: rename(`test/${file.slice(dir.length + 1)}`),
            }));
        }
    }
    return out;
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
            const name = file.slice(dir.length);
            const base = name.split(".")[0];
            if (!PASCAL.test(base)) {
                out.push(finding({
                    check: 13, id: "ui5-test-case", severity: VIOLATION, file: at(file),
                    message: `${dir.slice(0, -1)} modules are PascalCase; "${base}" is not`,
                    fix: rename(at(dir + base[0].toUpperCase() + base.slice(1) + name.slice(base.length))),
                }));
            }
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
