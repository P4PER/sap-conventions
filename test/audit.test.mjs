import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { audit } from "../scripts/audit.mjs";

const clean = fileURLToPath(new URL("fixtures/full-repo", import.meta.url));
const ui5Drift = fileURLToPath(new URL("fixtures/ui5-drift", import.meta.url));
const cli = fileURLToPath(new URL("../scripts/audit.mjs", import.meta.url));

test("a conforming repo reports no findings", () => {
    const report = audit(clean);
    assert.equal(report.summary.total, 0);
    assert.deepEqual(report.findings, []);
    assert.deepEqual(report.halves.ui5, ["app/priceview/webapp"]);
});

test("findings are sorted with violations first", () => {
    const { findings } = audit(ui5Drift);
    assert.ok(findings.length > 0);
    const order = { violation: 0, warning: 1, question: 2 };
    for (let i = 1; i < findings.length; i++) {
        assert.ok(order[findings[i - 1].severity] <= order[findings[i].severity]);
    }
});

test("the summary counts each severity", () => {
    const report = audit(ui5Drift);
    const counted = report.findings.filter((f) => f.severity === "violation").length;
    assert.equal(report.summary.violation, counted);
    assert.equal(report.summary.total, report.findings.length);
});

test("the CLI prints parseable JSON and exits 0", () => {
    const out = execFileSync("node", [cli, ui5Drift], { encoding: "utf8" });
    const report = JSON.parse(out);
    assert.equal(report.root, ui5Drift);
    assert.ok(Array.isArray(report.findings));
});
