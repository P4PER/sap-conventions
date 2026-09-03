# TypeScript layout

Applies to every `.ts` file, in `srv/` and `webapp/` alike. Only the filename
casing differs by half — see [naming-cap.md](naming-cap.md) and
[naming-ui5.md](naming-ui5.md).

## Size: warn at 300 lines, violation at 500   `ts-file-size`

Test files are exempt.

These are not arbitrary. Measured across three real UI5/CAP projects, 53 of 61
source files sit under 300 lines; the eight that do not are exactly the files a
reviewer would point at, and the three over 500 were all CAP service handlers
that had absorbed logic belonging in domain modules.

A handler registers events and delegates. When it grows past 500 lines, the fix
is to move logic out, not to raise the limit.

## Placement: nearest common folder

- A type used by **one** module stays in that module.
- Used by **two or more** modules, it moves to `types.ts` in their nearest
  shared folder.
- The same rule applies to literals, in `constants.ts`.

```
srv/pricing/types.ts        shared by srv/pricing/*
srv/types.ts                shared across the whole srv/ tree
```

No `types/` folder. No `.types.ts` suffix. `srv/types/cbo.types.ts` is wrong
twice over.

### The audit flags duplication, not absence   `ts-shared-declaration`

An exported `type`, `interface` or `const` declared under the same name in two
or more files is reported, naming the nearest common folder. Declarations
already inside `types.ts` or `constants.ts` are ignored, as are test files.

## Intra-file order

One fixed sequence, so any file reads the same way:

```ts
// 1. imports          external, then internal, blank line between
// 2. types            local to this module
// 3. constants        module-level literals
// 4. exported API     the functions this module exists to provide
// 5. local helpers    not exported
```

### How it is checked   `ts-file-order`

Each top-level statement is classified into one of the five phases, and the
first statement whose phase is *lower* than the highest phase already seen is
reported. Lines that cannot be classified confidently are ignored — the check is
deliberately conservative, so it reports real inversions rather than noise.
