import { readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const SKIP_DIRS = new Set([
    "node_modules", ".git", "dist", "gen", "@cds-models",
    "_out", "mta_archives", "resources", "coverage",
]);

export function listFiles(root, subdir = ".") {
    const start = join(root, subdir);
    if (!existsSync(start)) return [];
    const out = [];
    walk(start);
    return out.sort();

    function walk(dir) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                if (SKIP_DIRS.has(entry.name)) continue;
                walk(join(dir, entry.name));
            } else if (entry.isFile()) {
                out.push(relative(root, join(dir, entry.name)).split(sep).join("/"));
            }
        }
    }
}

export function detectHalves(root) {
    return {
        ui5: findWebapps(root),
        cap: existsSync(join(root, "srv")) || existsSync(join(root, "db")),
        router: existsSync(join(root, "app", "router", "xs-app.json")),
    };
}

function findWebapps(root) {
    const found = [];
    if (existsSync(join(root, "webapp"))) found.push("webapp");
    const appDir = join(root, "app");
    if (existsSync(appDir) && statSync(appDir).isDirectory()) {
        for (const entry of readdirSync(appDir, { withFileTypes: true })) {
            if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
            if (existsSync(join(appDir, entry.name, "webapp"))) {
                found.push(`app/${entry.name}/webapp`);
            }
        }
    }
    return found.sort();
}

export function commonFolder(files) {
    const parts = files.map((f) => f.split("/").slice(0, -1));
    const shared = [];
    for (let i = 0; i < parts[0].length; i++) {
        const seg = parts[0][i];
        if (parts.every((p) => p[i] === seg)) shared.push(seg);
        else break;
    }
    return shared.join("/") || ".";
}
