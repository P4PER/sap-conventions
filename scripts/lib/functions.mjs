// Source scanning for checks that need whole function bodies rather than lines.
// No parser: the plugin is dependency-free, so this is a character scan that
// neutralises comments and string interiors and then matches braces by depth.

const KEYWORDS = new Set([
    "if", "for", "while", "switch", "catch", "do", "else", "return", "with",
    "function", "class", "new", "typeof", "await", "yield", "try", "finally",
]);

// How far below a signature line the body brace may sit before the match is
// abandoned, and how far a still-open parameter list may be followed.
const GRACE_LINES = 3;
const MAX_SIGNATURE_LINES = 30;

const STARTS = [
    // function foo(   /   export default async function* foo(
    /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)?\s*[(<]/,
    // const foo = (a) => {   /   const foo: T = async function (
    /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(?:async\s+)?(?:function\b|[(<]|[A-Za-z_$][\w$]*\s*=>)/,
    // class or object method:   private async apply(net: number): number {
    /^\s*(?:(?:public|private|protected|static|readonly|abstract|async|get|set)\s+)*([A-Za-z_$][\w$]*)\s*\([^;]*\)\s*(?::[^;{]*)?\{\s*$/,
];

export function scrub(text) {
    const stripped = [...text];
    const masked = [...text];
    let i = 0;

    while (i < text.length) {
        const c = text[i];
        const next = text[i + 1];
        if (c === "/" && next === "/") {
            while (i < text.length && text[i] !== "\n") blank(i++);
        } else if (c === "/" && next === "*") {
            blank(i++);
            blank(i++);
            while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) blank(i++);
            blank(i++);
            blank(i++);
        } else if (c === '"' || c === "'" || c === "`") {
            i++;
            while (i < text.length && text[i] !== c) {
                if (text[i] === "\\") mask(i++);
                mask(i++);
            }
            i++;
        } else {
            i++;
        }
    }
    return { stripped: stripped.join(""), masked: masked.join("") };

    function blank(j) {
        if (j < text.length && text[j] !== "\n") {
            stripped[j] = " ";
            masked[j] = " ";
        }
    }

    function mask(j) {
        if (j < text.length && text[j] !== "\n") masked[j] = " ";
    }
}

export function extractFunctions(text) {
    const { stripped, masked } = scrub(text);
    const maskedLines = masked.split("\n");
    const strippedLines = stripped.split("\n");
    const starts = lineStarts(masked);
    const out = [];

    for (let i = 0; i < maskedLines.length; i++) {
        const name = declares(maskedLines[i]);
        if (name === undefined) continue;
        const open = openingBrace(masked, starts, i);
        if (open === -1) continue;
        const close = matchBrace(masked, open);
        if (close === -1) continue;

        const openLine = lineOf(starts, open);
        const closeLine = lineOf(starts, close);
        if (closeLine - openLine > 1) {
            out.push({
                name,
                line: i + 1,
                endLine: closeLine + 1,
                stripped: strippedLines.slice(openLine + 1, closeLine),
                masked: maskedLines.slice(openLine + 1, closeLine),
            });
        }
        i = closeLine;
    }
    return out;
}

function declares(line) {
    for (const re of STARTS) {
        const match = re.exec(line);
        if (match && !KEYWORDS.has(match[1])) return match[1] ?? null;
    }
    return undefined;
}

// The brace may sit on the signature line or just below it, but a ";" first
// means this was an expression-bodied arrow, not a block. Braces inside the
// parameter list -- a destructured argument, an inline object type, an options
// object handed to a call -- are not the body, so a "{" only counts when it
// sits outside every bracket, and the search follows a parameter list that
// runs past the grace window rather than giving up inside it. The exception is
// a "{" after "=>": an arrow whose expression is a wrapper call keeps its real
// code in that callback, so that block is the body worth reading.
function openingBrace(text, starts, line) {
    const from = starts[line];
    const graceEnd = starts[Math.min(line + GRACE_LINES, starts.length - 1)] ?? text.length;
    const hardEnd = starts[Math.min(line + MAX_SIGNATURE_LINES, starts.length - 1)] ?? text.length;
    let depth = 0;
    let angle = 0;

    for (let i = from; i < hardEnd; i++) {
        const c = text[i];
        if (c === "{" && (depth > 0 || angle > 0) && followsArrow(text, i)) return i;
        if (c === "(" || c === "[") {
            depth++;
        } else if (c === ")" || c === "]") {
            depth--;
        } else if (c === "<" && depth === 0) {
            angle++;
        } else if (c === ">" && angle > 0) {
            angle--;
        } else if (depth === 0 && angle === 0) {
            if (c === "{") return i;
            if (c === ";") return -1;
            // Past the grace window the signature has to still be open to be
            // worth following; otherwise the "{" belongs to a later statement.
            if (c === "\n" && i >= graceEnd) return -1;
        }
    }
    return -1;
}

function followsArrow(text, brace) {
    let i = brace - 1;
    while (i >= 0 && /\s/.test(text[i])) i--;
    return text[i] === ">" && text[i - 1] === "=";
}

function matchBrace(text, open) {
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        if (text[i] === "{") depth++;
        else if (text[i] === "}" && --depth === 0) return i;
    }
    return -1;
}

function lineStarts(text) {
    const starts = [0];
    for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
    return starts;
}

function lineOf(starts, offset) {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (starts[mid] <= offset) low = mid;
        else high = mid - 1;
    }
    return low;
}
