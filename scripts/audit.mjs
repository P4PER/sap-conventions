#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { detectHalves } from "./lib/walk.mjs";
import { checkUi5Naming } from "./lib/checks/ui5-naming.mjs";
import { checkCapNaming } from "./lib/checks/cap-naming.mjs";
import { checkExternalServices } from "./lib/checks/external-services.mjs";
import { checkTsLayout } from "./lib/checks/ts-layout.mjs";
import { checkDeployment } from "./lib/checks/deployment.mjs";
import { checkTesting } from "./lib/checks/testing.mjs";

const SEVERITY_ORDER = { violation: 0, warning: 1, question: 2 };

export function audit(root) {
    const halves = detectHalves(root);
    const findings = [];
    const scanned = [];

    for (const webapp of halves.ui5) {
        findings.push(...checkUi5Naming(root, webapp));
        scanned.push(webapp);
    }
    if (halves.cap) {
        findings.push(...checkCapNaming(root));
        findings.push(...checkExternalServices(root));
        scanned.push("srv", "db");
    }
    // Both halves of this check guard on their own file: an MTA without an
    // approuter still gets its module names read.
    findings.push(...checkDeployment(root));
    findings.push(...checkTesting(root, halves.ui5));
    if (scanned.length > 0) {
        findings.push(...checkTsLayout(root, scanned));
    }

    findings.sort((a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        a.file.localeCompare(b.file) ||
        a.check - b.check);

    return { root, halves, summary: summarize(findings), findings };
}

function summarize(findings) {
    const summary = { violation: 0, warning: 0, question: 0, total: findings.length };
    for (const f of findings) summary[f.severity]++;
    return summary;
}

// Compare real paths, not strings: argv[1] needs URL escaping before it can be
// matched against import.meta.url, and it reaches us unresolved through symlinked
// directories such as /tmp and /var on macOS.
if (process.argv[1] &&
    realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
    const root = resolve(process.argv[2] ?? ".");
    process.stdout.write(JSON.stringify(audit(root), null, 2) + "\n");
}
