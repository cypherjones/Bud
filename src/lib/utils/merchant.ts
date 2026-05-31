// Merchant name normalization used by the subscription audit, monthly
// summary, and the dashboard's kill-list. Pure functions, no DB dependency —
// kept here so reports.ts and dashboard.ts can both use them without a
// circular import between the two action files.

/**
 * Strip card-issuer prefixes, phone numbers, store IDs, city tags, and other
 * bank-statement noise so the same merchant collapses to one key regardless
 * of which acquirer formatted the row. Returns an UPPERCASE key for map
 * comparisons; use cleanMerchantDisplay for the user-visible name.
 */
export function normalizeMerchantKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/^["']/, "")
    .replace(/^(DIGITAL CARD PURCHASE - |DEBIT CARD PURCHASE - |ACH WITHDRAWAL |SP |TST |SQ |DD |IC\*?\s?|HLU\s?)/, "")
    .replace(/\*.*$/, "")
    .replace(/\s+\d{3}[\s-]?\d{3,4}[\s-]?\d{4}.*/, "")
    .replace(/\s+(CA|NY|TX|GA|CO|DE|OH|MA|WA|DC|US)\s*$/, "")
    .replace(/\s+(CA|NY|TX|GA|CO|DE|OH|MA|WA|DC|US)\s+(U|US)?\s*"?\s*$/, "")
    .replace(/\s+\d{5,}.*/, "")
    .replace(/\s+(SOLIDGATE|WESTERVILLE|BROOKLYN|SAN FRANCISCO|HOUSTON|ATLANTA|CUPERTINO|HULU COM BIL|WASHINGTON).*/, "")
    .replace(/\s+(INC\.?|LLC|COM|SUBSCR|DIR DEP|BILL PAYMENT|DT RETAIL|PURCHASE\s*\w*|DEBITS|DEBIT|PAYMENT|RETRY PYMT|AUTO|LABS|SYSTEMS|LIMITED|CHATGPT)(\s.*)?$/, "")
    .replace(/\s+(159|161)\s.*/, "")
    .replace(/\s+[A-Z0-9]{8,}.*/, "")
    .replace(/\s+/g, " ")
    .replace(/\b(\w+)\s+\1\b/gi, "$1")
    .replace(/^HULUPLUS.*/, "HULU")
    .replace(/\s+$/, "")
    .trim();
}

/**
 * User-visible display name. Lighter normalization than the dedup key — keeps
 * mixed case, drops the noisy suffixes but leaves the merchant brand recognizable.
 */
export function cleanMerchantDisplay(name: string): string {
  return name
    .replace(/^(Digital Card Purchase - |Debit Card Purchase - |ACH Withdrawal |SP |TST |SQ |DD |IC\*?\s?|HLU\s?)/i, "")
    .replace(/\s+\d{3}[\s-]?\d{3,4}[\s-]?\d{4}.*/, "")
    .replace(/\s+\d{5,}.*/, "")
    .replace(/\s+[A-Z0-9]{8,}.*/, "")
    .replace(/\*.*$/, "")
    .replace(/\s+(CA|NY|TX|GA|CO|DE|OH|MA|WA|DC)\s*(U|US)?\s*"?\s*$/, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}
