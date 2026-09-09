#!/usr/bin/env node
// UserPromptSubmit hook: remind the model that this plugin's skills exist, but
// only inside a UI5 or CAP project. Every failure path exits 0 with no output --
// a hook that throws on a user's prompt is worse than one that stays quiet.
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Imported through a guarded dynamic import rather than a static one: a static
// import is evaluated before any try/catch below it, so a half-installed plugin
// would put a stack trace on every prompt in every project -- including the
// non-SAP ones this hook exists to leave alone. Left undefined, the calls below
// throw inside reminderFor's try and the hook simply says nothing.
let detectHalves, listFiles;
try {
    ({ detectHalves, listFiles } = await import("../scripts/lib/walk.mjs"));
} catch {
    // A broken install. Silence is the only safe answer.
}

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
    try {
        if (!isSapProject(root)) return null;
    } catch {
        return null;
    }
    return JSON.stringify({
        hookSpecificOutput: {
            hookEventName: "UserPromptSubmit",
            additionalContext: REMINDER,
        },
    });
}

// The audit's cap test is a bare existsSync on srv/ or db/. That is fine for a
// command someone points at a repo they already know is CAP, but this hook fires
// on every prompt everywhere, and a top-level db/ is common well outside SAP --
// Rails, migrations, anything. So the UI5 half is taken as-is and the CAP half
// has to be corroborated before the hook speaks up.
function isSapProject(root) {
    const halves = detectHalves(root);
    if (halves.ui5.length > 0) return true;
    return halves.cap && hasCdsSignal(root);
}

function hasCdsSignal(root) {
    try {
        if (readFileSync(join(root, "package.json"), "utf8").includes("@sap/cds")) return true;
    } catch {
        // No package.json, or unreadable. The directories still get a look.
    }
    return ["srv", "db"].some((dir) =>
        listFiles(root, dir).some((file) => file.endsWith(".cds")));
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
