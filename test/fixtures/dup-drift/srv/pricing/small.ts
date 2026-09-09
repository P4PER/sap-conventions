export function toCents(value: number): number {
    const scaled = value * 100;
    const rounded = Math.round(scaled);
    const safe = Number.isFinite(rounded) ? rounded : 0;
    return safe;
}

export function toPercent(value: number): number {
    const scaled = value * 100;
    const rounded = Math.round(scaled);
    const safe = Number.isFinite(rounded) ? rounded : 0;
    return safe;
}
