# Duplication

Applies to every `.ts` file in `srv/`, `db/` and `webapp/`. `.d.ts` and
`.test.ts` files are exempt — parallel arrange blocks in tests read better
than a shared helper.

Function bodies shorter than 5 lines are never reported. One-line accessors
and `return this.x;` pairs are not duplication worth a finding.

## An identical body in two places   `ts-duplicate-function`

Two or more functions whose bodies match once comments are removed, blank
lines dropped and indentation normalised. The names do not have to match —
copy-paste usually renames the function and nothing else.

Reported as a **warning**, naming every site as `file:line` and the nearest
folder the shared version belongs in. There is no automatic fix: extracting
the function and updating both call sites is a code change, not a rename.

This is the sibling of `ts-shared-declaration` in
[typescript-layout.md](typescript-layout.md), which reports the same *name* in
two files. This one reports the same *code* under two names.
