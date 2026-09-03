import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listFiles } from "../walk.mjs";
import { finding, rename, KEBAB, VIOLATION } from "../finding.mjs";

const SERVICE_NAME = /^[a-z0-9]+(-[a-z0-9]+)*-service$/;
const DECLARES_SERVICE = /^\s*service\s+\w+/m;

export function checkCapNaming(root) {
    const files = [...listFiles(root, "srv"), ...listFiles(root, "db")]
        .filter((f) => !f.startsWith("srv/external/"));
    const present = new Set(files);
    const out = [];

    for (const file of files) {
        const name = file.slice(file.lastIndexOf("/") + 1);
        const base = stripExt(name);
        if (!KEBAB.test(base)) {
            out.push(finding({
                check: 1, id: "cap-filename-case", severity: VIOLATION, file,
                message: `files under srv/ and db/ are kebab-case; "${base}" is not`,
                fix: rename(`${file.slice(0, file.lastIndexOf("/") + 1)}${toKebab(base)}${name.slice(base.length)}`),
            }));
        }

        if (!file.endsWith(".cds") || !file.startsWith("srv/")) continue;
        if (!DECLARES_SERVICE.test(readFileSync(join(root, file), "utf8"))) continue;

        if (!SERVICE_NAME.test(base)) {
            out.push(finding({
                check: 1, id: "cap-service-name", severity: VIOLATION, file,
                message: `service definitions are named <domain>-service.cds; "${base}.cds" is not`,
            }));
        }
        const handler = `${file.slice(0, -4)}.ts`;
        if (!present.has(handler)) {
            out.push(finding({
                check: 3, id: "cap-handler-pairing", severity: VIOLATION, file,
                message: `service definition has no handler at ${handler}`,
            }));
        }
    }
    return out;
}

function stripExt(name) {
    const base = name.replace(/\.(cds|ts|js|json|edmx|xml)$/, "");
    return base.endsWith(".test") ? base.slice(0, -5) : base;
}

function toKebab(s) {
    return s
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .replace(/[_\s]+/g, "-")
        .toLowerCase();
}
