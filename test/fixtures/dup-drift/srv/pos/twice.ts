interface Order {
    id: string;
    date: Date;
    customer: string;
}

export function buildHeader(order: Order): string {
    const id = order.id.padStart(10, "0");
    const when = order.date.toISOString();
    const who = order.customer.trim().toUpperCase();
    const parts = [id, when, who];
    return parts.join("|");
}

export function buildFooter(order: Order): string {
    const id = order.id.padStart(10, "0");
    const when = order.date.toISOString();
    const who = order.customer.trim().toUpperCase();
    const parts = [id, when, who];
    return parts.join("|");
}
