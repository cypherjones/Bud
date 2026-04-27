import chalk from "chalk";

export const purple = chalk.hex("#7C3AED");
export const amber = chalk.hex("#F59E0B");
export const dim = chalk.dim;
export const bold = chalk.bold;
export const green = chalk.green;
export const red = chalk.red;
export const cyan = chalk.cyan;

export function header(title: string, subtitle?: string) {
  console.log();
  console.log(purple.bold(` BUD `) + "  " + bold(title));
  if (subtitle) console.log(dim(`       ${subtitle}`));
  console.log();
}

export function section(title: string) {
  console.log(purple("  ■ ") + bold(title));
}

export function progressBar(value: number, max: number, width = 20): string {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = purple("█".repeat(filled)) + dim("░".repeat(empty));
  return `${bar} ${Math.round(pct * 100)}%`;
}

export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function formatCentsFull(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}
