# Duplication

Applies to every `.ts` file in `srv/`, `db/` and `webapp/`. `.d.ts` and
`.test.ts` files are exempt — parallel arrange blocks in tests read better
than a shared helper.

Function bodies shorter than 2 lines are never reported: a one-line accessor
repeated across files is not copy-paste, it is the only way to write the line.
A two-line helper carried from one app into the next is, and short helpers are
where copy-paste actually collects — a coercion, a null-guard, a formatter.

A `constructor` is exempt at any length. Assigning the injected dependencies
is the same two lines in every service and there is nothing to extract.

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

## The same shape with different constants   `ts-parameterizable-function`

Two or more bodies that match once every string literal is replaced by `S` and
every number by `N`. Variable names still have to match exactly — two bodies
with the same names and the same structure, differing only in constants, is a
copy that was retuned. Normalising names too would start matching unrelated
short accessors.

Reported as a **question**, naming each site and the constants that differ:

```
2 bodies share the same 5-line shape and differ only in constants
(discountEur at srv/pricing/eur.ts:1, discountUsd at srv/pricing/usd.ts:1);
values differ: 0.15 vs 0.25, 0.05 vs 0.1, 5000 vs 8000;
consider one function in srv/pricing/ taking them as parameters
```

It is a question rather than a warning because the repair is a design call.
One function with three new parameters is not always better than two readable
ones — the audit reports the candidate and leaves the decision to a person.

Groups are reported with one site per distinct body, so a pair already listed
under `ts-duplicate-function` never appears here twice.

Both tiers depend on the function-body scanner reading a signature correctly.
A brace inside a parameter list — a destructured argument, an inline object
type, a generic return type — does not open a body, and neither does an
options object handed to a call by an expression-bodied arrow. A brace right
after `=>` does: an arrow that wraps its whole expression in a call keeps its
real code in that callback.
