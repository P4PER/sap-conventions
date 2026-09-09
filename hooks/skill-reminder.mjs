#!/usr/bin/env node
// UserPromptSubmit hook: remind the model that this plugin's skills exist, but
// only inside a UI5 or CAP project. Every failure path exits 0 with no output --
// a hook that throws on a user's prompt is worse than one that stays quiet.
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { detectHalves } from "../scripts/lib/walk.mjs";

const REMINDER = [
    "This is a UI5/CAP project. Before acting, check whether a",
    "sap-conventions skill covers this request and invoke it:",
    "",
    "- ui5-conventions - creating/renaming/moving files under webapp/",
    "- cap-conventions - CAP/CDS service, handler, db naming and layout",
    "- conventions-audit - auditing or cleaning up project structure",
    "",
    "Invoke it before exploring the codebase or answering.",
].join("\n");

export function reminderFor(root) {
    let halves;
    try {
        halves = detectHalves(root);
    } catch {
        return null;
    }
    if (halves.ui5.length === 0 && !halves.cap) return null;
    return JSON.stringify({
        hookSpecificOutput: {
            hookEventName: "UserPromptSubmit",
            additionalContext: REMINDER,
        },
    });
}

function payloadCwd() {
    try {
        const parsed = JSON.parse(readFileSync(0, "utf8"));
        if (parsed && typeof parsed.cwd === "string") return parsed.cwd;
    } catch {
        // No stdin, or not JSON. The process directory is still a fine answer.
    }
    return process.cwd();
}

// Same entry guard as scripts/audit.mjs, for the same two reasons: argv[1] needs
// URL escaping before it matches import.meta.url, and it arrives unresolved
// through symlinked directories such as /tmp and /var on macOS -- which is
// exactly where the tests run this from.
if (process.argv[1] &&
    realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
    const line = reminderFor(payloadCwd());
    if (line) process.stdout.write(line + "\n");
}
