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
// In delegate/ and service/ the role suffix decides, not the export shape: UI5 loads a
// delegate or service by module path and they are routinely exported by reference
// (`export default MyDelegate;`), while the supporting data modules that live beside them
// (columnTypes.ts, itemsTableProperties.ts) are plain. Export shape is no signal at all —
// model/formatter.ts has a default export and UserPreferencesService.ts does not.
const ROLE_SUFFIX = { delegate: "Delegate", service: "Service" };
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
        const cut = file.lastIndexOf("/");
        if (cut === -1) continue;
        const folder = file.slice(0, file.indexOf("/"));
        if (folder === "test") continue;
        // A nested file is named by its own basename and renamed inside its own
        // directory; only the top folder decides which rule applies.
        const dir = file.slice(0, cut + 1);
        const name = file.slice(cut + 1);

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

        if (MODULE_FOLDERS.has(folder) && name.endsWith(".ts") &&
            !name.endsWith(".test.ts") && !name.endsWith(".d.ts")) {
            const base = name.slice(0, -3);
            if (!base) continue;
            const suffix = ROLE_SUFFIX[folder];
            const isClass = (suffix !== undefined && base.endsWith(suffix)) ||
                DEFAULT_CLASS.test(readFileSync(join(root, webappDir, file), "utf8"));
            const ok = isClass ? PASCAL.test(base) : CAMEL.test(base);
            if (!ok) {
                const to = isClass ? upperFirst(base) : lowerFirst(base);
                out.push(finding({
                    check: 1, id: "ui5-module-case", severity: VIOLATION, file: at(file),
                    message: isClass
                        ? `class-like modules are PascalCase; "${base}" is not`
                        : `plain module must be camelCase; "${base}" is not`,
                    fix: rename(at(`${dir}${to}.ts`)),
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

const upperFirst = (s) => s[0].toUpperCase() + s.slice(1);
const lowerFirst = (s) => s[0].toLowerCase() + s.slice(1);
