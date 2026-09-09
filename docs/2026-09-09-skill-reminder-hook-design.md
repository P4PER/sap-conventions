# Skill reminder hook — design

A `UserPromptSubmit` hook, shipped inside the plugin, that reminds the model to
check for a matching `sap-conventions` skill — but only when the session is
actually working in a UI5 or CAP project.

## Why

Skills reach the model through a listing of names and descriptions. Whether one
gets invoked is a judgement the model makes each turn, and that judgement
degrades as a session grows: the instruction to prefer skills arrives once, at
session start, and then competes with everything that follows.

The observed failure is not that a skill is unavailable. It is that the rule to
look for one has scrolled out of reach. `SessionStart` cannot fix this — it
fires once per session by definition. `UserPromptSubmit` fires on every user
message, which is the cadence the problem actually has.

Shipping it in the plugin rather than in a settings file is what makes it reach
the team. Everyone already installs `sap-conventions`; nobody has to edit their
own `~/.claude/settings.json`. It follows the pattern `superpowers` uses for its
own `SessionStart` hook.

## Scope

The hook injects **only** when the working directory is a UI5 or CAP project.
Reminding someone about `ui5-conventions` while they are writing a Python
service is noise, and noise on every single turn is worse than silence — it
trains the reader to skip the block.

"UI5 or CAP project" already has exactly one definition in this repo:
`detectHalves()` in `scripts/lib/walk.mjs`, which the audit itself uses. A
`webapp/` tree (at the root or under `app/<name>/`), or a `srv/` or `db/`
directory. The hook imports that function rather than restating the rule —
a second copy would be the very thing `ts-duplicate-function` was built to
report.

## Mechanism

`hooks/hooks.json` declares the hook; `hooks/skill-reminder.mjs` is the
program. Claude Code discovers a plugin's `hooks/hooks.json` automatically —
no `plugin.json` entry is required, as `superpowers` demonstrates.

The declaration uses the **exec form** (`command` plus `args`) rather than a
shell string:

```json
{ "type": "command", "command": "node",
  "args": ["${CLAUDE_PLUGIN_ROOT}/hooks/skill-reminder.mjs"] }
```

`${CLAUDE_PLUGIN_ROOT}` is substituted per-element as a plain string, so a
plugin path containing a space, quote or backtick never reaches a shell parser.
The plugin already requires Node >= 22, so invoking `node` costs nothing extra.

**Which directory.** The hook prefers a `cwd` field on the stdin JSON and falls
back to `process.cwd()`. Either alone would probably work; taking both means
the hook is correct whether or not the harness supplies the field, and both
paths are covered by a test.

**Output.** Exit 0. When the directory qualifies, print

```json
{ "hookSpecificOutput": { "hookEventName": "UserPromptSubmit",
                          "additionalContext": "..." } }
```

and when it does not, print nothing at all. Silence is the common case for
anyone using this plugin alongside non-SAP work, and an empty injection costs
no tokens.

**Never break the turn.** Every failure — unreadable stdin, malformed JSON, an
unreadable directory — exits 0 with no output. A hook that throws on a user's
prompt is far worse than a hook that forgets to remind them.

## The reminder

```
This is a UI5/CAP project. Before acting, check whether a
sap-conventions skill covers this request and invoke it:

- ui5-conventions - creating/renaming/moving files under webapp/
- cap-conventions - CAP/CDS service, handler, db naming and layout
- conventions-audit - auditing or cleaning up project structure

Invoke it before exploring the codebase or answering.
```

Naming the three skills and their triggers is deliberate. A generic "check for
a skill" line costs fewer tokens but leaves the model to rediscover which skills
exist — which is the step that was already failing. Roughly 70 tokens per turn,
and only in SAP projects.

## Known limits

- It is a reminder, not an enforcement. `UserPromptSubmit` can inject context;
  it cannot compel a tool call. This removes the "instruction scrolled away"
  failure, not every possible one.
- Detection is directory shape only. A UI5 project opened one level above its
  `webapp/` root is not detected, matching what the audit itself would do.
- Injection is unconditional within an SAP project — a question about CI config
  in a CAP repo still gets the reminder. Gating on prompt wording was considered
  and rejected: it goes quiet exactly when someone phrases a request unusually,
  which is when the reminder is worth most.
