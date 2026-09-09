// Source scanning for checks that need whole function bodies rather than lines.
// No parser: the plugin is dependency-free, so this is a character scan that
// neutralises comments and string interiors and then matches braces by depth.

const KEYWORDS = new Set([
    "if", "for", "while", "switch", "catch", "do", "else", "return", "with",
    "function", "class", "new", "typeof", "await", "yield", "try", "finally",
]);

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
// means this was an expression-bodied arrow, not a block.
function openingBrace(text, starts, line) {
    const from = starts[line];
    const to = starts[Math.min(line + 3, starts.length - 1)] ?? text.length;
    const slice = text.slice(from, to);
    const brace = slice.indexOf("{");
    const semi = slice.indexOf(";");
    if (brace === -1 || (semi !== -1 && semi < brace)) return -1;
    return from + brace;
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
