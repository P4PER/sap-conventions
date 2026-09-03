import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { listFiles } from "../walk.mjs";
import { finding, rename, PASCAL, VIOLATION } from "../finding.mjs";

const SERVICE_DECL = /^\s*service\s+(\w+)/m;
const EXTERNAL = "srv/external/";

export function checkExternalServices(root) {
    const out = [];
    const requires = readRequires(root);

    for (const [key, config] of Object.entries(requires)) {
        const model = config?.model;
        if (typeof model !== "string" || !model.startsWith(EXTERNAL)) continue;

        const base = model.slice(EXTERNAL.length);
        const file = `${model}.cds`;

        if (key !== base) {
            out.push(finding({
                check: 4, id: "external-identity", severity: VIOLATION, file,
                message: `cds.requires key "${key}" must equal the model basename "${base}" ` +
                    `and the service name inside the file`,
            }));
        }

        if (!existsSync(join(root, file))) {
            out.push(finding({
                check: 4, id: "external-identity", severity: VIOLATION, file,
                message: `cds.requires."${key}".model points at ${model}, but ${file} does not exist`,
            }));
            continue;
        }

        const declared = SERVICE_DECL.exec(readFileSync(join(root, file), "utf8"))?.[1];
        if (declared && declared !== base) {
            out.push(finding({
                check: 4, id: "external-identity", severity: VIOLATION, file,
                message: `file declares "service ${declared}" but its basename is "${base}"`,
            }));
        }
        if (declared && !PASCAL.test(declared)) {
            out.push(finding({
                check: 4, id: "external-name-style", severity: VIOLATION, file,
                message: `external services use a PascalCase logical alias; "${declared}" is not. ` +
                    `The backend id stays in credentials.path.`,
            }));
        }
    }

    for (const file of listFiles(root, "srv/external").filter((f) => f.endsWith(".xml"))) {
        out.push(finding({
            check: 9, id: "external-metadata-ext", severity: VIOLATION, file,
            message: `retained metadata uses .edmx, not .xml`,
            fix: rename(`${file.slice(0, -4)}.edmx`),
        }));
    }

    return out;
}

function readRequires(root) {
    const pkg = join(root, "package.json");
    if (!existsSync(pkg)) return {};
    try {
        return JSON.parse(readFileSync(pkg, "utf8"))?.cds?.requires ?? {};
    } catch {
        return {};
    }
}
