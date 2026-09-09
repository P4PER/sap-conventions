export function discountUsd(amount: number, tier: number): string {
    const factor = tier > 3 ? 0.25 : 0.1;
    const net = amount - amount * factor;
    const capped = Math.min(net, 8000);
    const label = "USD";
    return `${capped.toFixed(2)} ${label}`;
}
