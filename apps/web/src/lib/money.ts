const SYMBOLS: Record<string, string> = { NGN: "₦", GHS: "GH₵", KES: "KSh", ZAR: "R" };

/** Format an integer minor-unit (kobo) amount for display, e.g. 5000000 NGN → "₦50,000.00". */
export function formatMoney(minor: number, currency: string): string {
  const major = minor / 100;
  const num = new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(major);
  const symbol = SYMBOLS[currency];
  return symbol ? `${symbol}${num}` : `${currency} ${num}`;
}
