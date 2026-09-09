import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(root + p, "utf8");

const REQUIRED = {
    "references/naming-ui5.md": [
        "ui5-folder-name", "ui5-artifact-case", "ui5-module-case",
        "ui5-i18n-name", "ui5-controller-pairing", "export default class",
    ],
    "references/naming-cap.md": [
        "cap-filename-case", "cap-service-name", "cap-handler-pairing",
        "external-identity", "external-name-style", "external-metadata-ext",
        "credentials.path",
    ],
    "references/typescript-layout.md": [
        "ts-file-size", "ts-file-order", "ts-shared-declaration", "300", "500",
    ],
    "references/testing.md": [
        "test-location", "ui5-test-tree", "ui5-test-suffix", "ui5-test-case",
        "npm-script-name", "webapp/test/",
    ],
    "references/duplication.md": [
        "ts-duplicate-function", "ts-parameterizable-function", "5 lines",
    ],
    "references/approuter.md": [
        "router-auth-method", "router-auth-type", "router-route-order",
        "router-cache-control", "mta-name-prefix", "mta-app-id",
    ],
};

for (const [file, needles] of Object.entries(REQUIRED)) {
    test(`${file} documents every rule it owns`, () => {
        const text = read(file);
        for (const needle of needles) {
            assert.ok(text.includes(needle), `${file} is missing "${needle}"`);
        }
    });
}

test("every check id emitted by the scripts is documented", () => {
    const documented = Object.keys(REQUIRED).map(read).join("\n");
    const dir = root + "scripts/lib/checks/";
    const ids = new Set();
    for (const file of readdirSync(dir)) {
        for (const m of readFileSync(dir + file, "utf8").matchAll(/id:\s*"([a-z0-9-]+)"/g)) {
            ids.add(m[1]);
        }
    }
    for (const id of ids) {
        assert.ok(documented.includes(id), `check id "${id}" is not documented in references/`);
    }
});
