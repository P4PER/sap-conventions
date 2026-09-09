export function discountEur(amount: number, tier: number): string {
    const factor = tier > 3 ? 0.15 : 0.05;
    const net = amount - amount * factor;
    const capped = Math.min(net, 5000);
    const label = "EUR";
    return `${capped.toFixed(2)} ${label}`;
}
