import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listFiles } from "../walk.mjs";
import { finding, rename, PASCAL, CAMEL, VIOLATION, QUESTION } from "../finding.mjs";

const ALLOWED_FOLDERS = new Set([
    "view", "controller", "fragment", "model", "util", "delegate", "service", "i18n", "css", "test",
]);
const PLURAL_FIX = {
    views: "view", controllers: "controller", fragments: "fragment",
    models: "model", utils: "util", delegates: "delegate", services: "service",
};
const MODULE_FOLDERS = new Set(["model", "util", "delegate", "service"]);
const I18N_FILE = /^i18n(_[a-zA-Z]{2}(_[A-Za-z]{2})?)?\.properties$/;
const DEFAULT_CLASS = /^export default class\s/m;

export function checkUi5Naming(root, webappDir) {
    const files = listFiles(root, webappDir).map((f) => f.slice(webappDir.length + 1));
    const out = [];
    const at = (p) => `${webappDir}/${p}`;

    for (const folder of new Set(files.filter((f) => f.includes("/")).map((f) => f.split("/")[0]))) {
        if (ALLOWED_FOLDERS.has(folder)) continue;
        const to = PLURAL_FIX[folder];
        out.push(finding({
            check: 5, id: "ui5-folder-name", severity: VIOLATION, file: at(folder),
            message: to
                ? `webapp folders are singular: rename "${folder}" to "${to}"`
                : `unexpected webapp folder "${folder}"; allowed: ${[...ALLOWED_FOLDERS].join(", ")}`,
            fix: to ? rename(at(to)) : null,
        }));
    }

    for (const file of files) {
        const [folder, name] = split(file);
        if (!name) continue;
        if (folder === "test") continue;

        if ((folder === "view" && name.endsWith(".view.xml")) ||
            (folder === "fragment" && name.endsWith(".fragment.xml"))) {
            const base = name.split(".")[0];
            if (!PASCAL.test(base)) {
                out.push(finding({
                    check: 1, id: "ui5-artifact-case", severity: VIOLATION, file: at(file),
                    message: `${folder} artifacts are PascalCase; "${base}" is not`,
                }));
            }
        }

        if (MODULE_FOLDERS.has(folder) && name.endsWith(".ts") && !name.endsWith(".test.ts")) {
            const base = name.slice(0, -3);
            const isClass = DEFAULT_CLASS.test(readFileSync(join(root, webappDir, file), "utf8"));
            const ok = isClass ? PASCAL.test(base) : CAMEL.test(base);
            if (!ok) {
                const to = isClass ? upperFirst(base) : lowerFirst(base);
                out.push(finding({
                    check: 1, id: "ui5-module-case", severity: VIOLATION, file: at(file),
                    message: isClass
                        ? `module with a default class export must be PascalCase; "${base}" is not`
                        : `plain module must be camelCase; "${base}" is not`,
                    fix: rename(at(`${folder}/${to}.ts`)),
                }));
            }
        }

        if (folder === "i18n" && !I18N_FILE.test(name)) {
            out.push(finding({
                check: 1, id: "ui5-i18n-name", severity: VIOLATION, file: at(file),
                message: `i18n files are i18n.properties or i18n_<locale>.properties`,
            }));
        }
    }

    out.push(...pairing(files, at));
    return out;
}

function pairing(files, at) {
    const out = [];
    const views = basenames(files, "view", ".view.xml");
    const fragments = basenames(files, "fragment", ".fragment.xml");

    for (const file of files.filter((f) => f.startsWith("controller/") && f.endsWith(".ts"))) {
        const name = file.slice("controller/".length);
        if (name.endsWith(".controller.ts")) {
            const base = name.slice(0, -".controller.ts".length);
            if (!views.has(base)) {
                out.push(finding({
                    check: 2, id: "ui5-controller-pairing", severity: VIOLATION, file: at(file),
                    message: `no matching view/${base}.view.xml`,
                }));
            }
        } else {
            const base = name.slice(0, -3);
            if (!fragments.has(base)) {
                out.push(finding({
                    check: 2, id: "ui5-controller-pairing", severity: QUESTION, file: at(file),
                    message: `module in controller/ with no view/${base}.view.xml or ` +
                        `fragment/${base}.fragment.xml partner — is it a controller (rename it to ` +
                        `match its artifact) or a helper (move it out of controller/)?`,
                }));
            }
        }
    }
    return out;
}

function basenames(files, folder, suffix) {
    return new Set(files
        .filter((f) => f.startsWith(`${folder}/`) && f.endsWith(suffix))
        .map((f) => f.slice(folder.length + 1, -suffix.length)));
}

function split(file) {
    const i = file.indexOf("/");
    return i === -1 ? [null, null] : [file.slice(0, i), file.slice(i + 1)];
}

const upperFirst = (s) => s[0].toUpperCase() + s.slice(1);
const lowerFirst = (s) => s[0].toLowerCase() + s.slice(1);
