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
    const routes = config.routes ?? [];

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

function parseEntries(text) {
    const entries = [];
    for (const line of text.split("\n")) {
        const name = /^\s*-\s*name:\s*(\S+)/.exec(line);
        if (name) {
            entries.push({ name: name[1], type: null, path: null });
            continue;
        }
        const current = entries[entries.length - 1];
        if (!current) continue;
        const type = /^\s*type:\s*(\S+)/.exec(line);
        if (type) current.type = type[1];
        const path = /^\s*path:\s*(\S+)/.exec(line);
        if (path) current.path = path[1];
    }
    return entries;
}
