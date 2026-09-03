// Shared vocabulary for every check module.

export const PASCAL = /^[A-Z][A-Za-z0-9]*$/;
export const CAMEL = /^[a-z][A-Za-z0-9]*$/;
export const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const VIOLATION = "violation";
export const WARNING = "warning";
export const QUESTION = "question";

export function finding({ check, id, severity, file, message, line = null, fix = null }) {
    return { check, id, severity, file, line, message, fix };
}

export function rename(to) {
    return { kind: "rename", to };
}
