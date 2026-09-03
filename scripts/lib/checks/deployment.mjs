import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { finding, VIOLATION, QUESTION } from "../finding.mjs";

const CATCH_ALL = "^(.*)$";
const SHARED_MTA_NAMES = new Set(["srv-api", "app-api"]);

export function checkDeployment(root) {
    return [...router(root), ...mta(root)];
}

function router(root) {
    const file = "app/router/xs-app.json";
    const path = join(root, file);
    if (!existsSync(path)) return [];

    let config;
    try {
        config = JSON.parse(readFileSync(path, "utf8"));
    } catch {
        return [finding({
            check: 10, id: "router-parse", severity: VIOLATION, file,
            message: "xs-app.json is not valid JSON",
        })];
    }

    const out = [];
    const declared = config.routes ?? [];
    const routes = Array.isArray(declared) ? declared : [];

    if (!Array.isArray(declared)) {
        out.push(finding({
            check: 10, id: "router-parse", severity: VIOLATION, file,
            message: `"routes" must be an array; no route rule can be evaluated until it is`,
        }));
    }

    if (config.authenticationMethod !== "route") {
        out.push(finding({
            check: 10, id: "router-auth-method", severity: VIOLATION, file,
            message: `authenticationMethod must be "route", found ${JSON.stringify(config.authenticationMethod)}`,
        }));
    }

    routes.forEach((route, i) => {
        if (!route.authenticationType) {
            out.push(finding({
                check: 10, id: "router-auth-type", severity: VIOLATION, file,
                message: `route "${route.source}" does not set authenticationType`,
            }));
        }
        if (route.source === CATCH_ALL) {
            if (i !== routes.length - 1) {
                out.push(finding({
                    check: 10, id: "router-route-order", severity: VIOLATION, file,
                    message: `the "${CATCH_ALL}" catch-all route must be last; it is at index ${i} of ${routes.length}`,
                }));
            }
            if (!route.cacheControl) {
                out.push(finding({
                    check: 10, id: "router-cache-control", severity: VIOLATION, file,
                    message: `the catch-all route must set cacheControl: "no-cache, must-revalidate"`,
                }));
            }
        }
    });

    return out;
}

function mta(root) {
    const file = "mta.yaml";
    const path = join(root, file);
    if (!existsSync(path)) return [];

    const text = readFileSync(path, "utf8");
    const id = /^ID:\s*(\S+)/m.exec(text)?.[1];
    if (!id) return [];

    const out = [];
    const entries = parseEntries(text);

    for (const entry of entries) {
        if (SHARED_MTA_NAMES.has(entry.name)) continue;
        if (entry.name === id || entry.name.startsWith(`${id}-`)) continue;
        out.push(finding({
            check: 11, id: "mta-name-prefix", severity: VIOLATION, file,
            message: `module and resource names derive from ID "${id}"; "${entry.name}" does not`,
        }));
    }

    const html5 = entries.find((e) => e.type === "html5");
    if (html5?.path?.startsWith("app/")) {
        const appId = html5.path.slice("app/".length).replace(/\/$/, "");
        const expected = id.replace(/-/g, "");
        if (appId !== expected) {
            out.push(finding({
                check: 11, id: "mta-app-id", severity: QUESTION, file,
                message: `html5 module path is app/${appId} but the MTA ID is "${id}" ` +
                    `(compact form "${expected}") — align the app folder, the UI5 namespace, ` +
                    `the welcomeFile and the MTA ID; either side can move`,
            }));
        }
    }

    return out;
}

// Reads the modules: and resources: lists without a YAML dependency. Indentation
// is what separates a declaration from a reference: a deeper "- name:" belongs to
// a requires:/provides: block and names something declared elsewhere, and only keys
// at the entry's own indent belong to the entry.
function parseEntries(text) {
    const entries = [];
    let inSection = false;
    let itemIndent = null;
    let keyIndent = null;
    let current = null;

    for (const raw of text.split("\n")) {
        const trimmed = raw.trimStart();
        if (trimmed === "" || trimmed.startsWith("#")) continue;

        if (/^[^\s-]/.test(raw)) {
            inSection = /^(modules|resources):/.test(raw);
            itemIndent = null;
            current = null;
            continue;
        }
        if (!inSection) continue;

        const indent = raw.length - trimmed.length;
        const item = /^-\s*name:\s*(\S+)/.exec(trimmed);
        if (item) {
            if (itemIndent === null) itemIndent = indent;
            if (indent > itemIndent) continue;
            keyIndent = raw.indexOf("name:");
            current = { name: item[1], type: null, path: null };
            entries.push(current);
            continue;
        }
        if (!current || indent !== keyIndent) continue;

        const type = /^type:\s*(\S+)/.exec(trimmed);
        if (type) current.type = type[1];
        const path = /^path:\s*(\S+)/.exec(trimmed);
        if (path) current.path = path[1];
    }
    return entries;
}
