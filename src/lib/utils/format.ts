/**
 * Format cents to a dollar string: 4599 -> "$45.99"
 */
export function formatCurrency(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(dollars);
}

/**
 * Format cents to a compact string: 450000 -> "$4,500"
 */
export function formatCurrencyCompact(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(dollars);
}

/**
 * Parse a dollar amount string to cents: "$45.99" -> 4599, "45" -> 4500
 */
export function parseDollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Get current ISO timestamp
 */
export function now(): string {
  return new Date().toISOString();
}

/**
 * Today as YYYY-MM-DD in local time (the container runs on Central time; UTC would turn over at 7pm)
 */
export function today(): string {
  return new Date().toLocaleDateString("en-CA");
}
