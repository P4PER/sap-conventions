# Duplication check — design

A seventh check for the conventions audit: report functions whose bodies are
copies of each other, and functions whose bodies differ only in the constants
they contain.

## Why

`ts-shared-declaration` already reports the same *name* declared in two files.
It says nothing about the same *code* living under two names, which is the
shape copy-paste actually takes in a UI5/CAP repo: a formatter cloned from one
app into another, a rounding helper repeated in `srv/pricing` and `srv/pos`, a
handler body pasted and retuned with different rates.

Two tiers, because the fixes differ:

- Byte-for-byte copies have one obvious repair — extract the function, import
  it from both sites.
- Copies that differ only in literals have a *candidate* repair — one function
  taking those literals as parameters — but whether that abstraction is right
  is a judgement call. It is reported as a `question`, which the audit skill
  already renders separately and never auto-fixes.

## Scope

`.ts` files under the directories the audit already scans (`webapp` trees plus
`srv`/`db`), excluding `.d.ts` and `.test.ts`. Duplication between test cases
is usually deliberate — parallel arrange blocks read better than a shared
helper — so tests are out.

## Detection

No AST parser: the project is dependency-free by decision, so this is a
character scanner in the spirit of `ts-layout.mjs`'s line regexes.

**Scrubbing.** One pass over the source produces two same-length copies:

- `stripped` — comment characters replaced by spaces, string literals intact.
- `masked` — the same, plus the *interior* of every string, char and template
  literal replaced by spaces.

`masked` is what brace matching and shape keys read; `stripped` is what exact
keys and the reported literals read. Newlines survive both, so line numbers
stay accurate.

**Extraction.** Scanning `masked` line by line for function declarations,
arrow and function-expression assignments, and class or object methods. On a
match, the opening `{` is located within the next three lines (and rejected if
a `;` comes first, which is how an expression-bodied arrow is skipped), then
matched to its closing brace by depth counting. The body is the lines strictly
between. Scanning resumes after the closing brace, so a nested inner function
is not reported separately from the outer one that contains it.

**Keys.** Both are built by trimming each body line, collapsing internal
whitespace runs, and dropping blank lines:

- `exactKey` — the normalized `stripped` body.
- `shapeKey` — the normalized `masked` body with every string literal replaced
  by `S` and every number by `N`.

Identifier names stay literal in both keys. Two bodies with the same variable
names and the same structure, differing only in constants, is a strong signal;
normalizing identifiers too would start matching unrelated short accessors.

**Threshold.** Bodies under five non-blank lines are ignored. This is what
keeps one-line getters and `return this.x;` pairs out of the report, and it
matters most on the literal-masked tier.

## Findings

Bodies are grouped by key. Each group produces one finding listing every site
as `file:line`, the way `ts-shared-declaration` lists its files.

| check | id | severity | fires when |
| --- | --- | --- | --- |
| 15 | `ts-duplicate-function` | warning | two or more bodies share an `exactKey` |
| 16 | `ts-parameterizable-function` | question | a `shapeKey` group holds two or more distinct `exactKey`s |

A shape group is reported with **one representative site per distinct
`exactKey`**. A pair already reported as an exact duplicate therefore
contributes a single site to the shape finding rather than two, so no pair of
sites is ever reported twice.

Neither finding carries a `fix` payload. There is no rename to apply, so the
audit skill's `git mv` loop is untouched; both are read-and-decide findings.

## Known limits

- A regular-expression literal containing a quote or a brace can confuse the
  scrubber. The failure mode is a brace that never matches, which drops the
  function from the scan — a miss, not a false report.
- A backtick nested inside a `${}` interpolation is not tracked.
- Two functions that were copied *and* had their variables renamed are not
  matched. That is the deliberate cost of keeping identifiers literal.
