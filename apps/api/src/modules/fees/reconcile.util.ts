export interface MatchCandidate { invoiceId: string; studentName: string; admissionNo: string; balanceKobo: number; }
export type Confidence = "high" | "low" | "none";
export interface ScoredCandidate extends MatchCandidate { score: number; confidence: Confidence; }

export function normalizeTokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 1);
}

export function scoreCandidate(narration: string, amountKobo: number, c: MatchCandidate): { score: number; confidence: Confidence } {
  const narrTokens = new Set(normalizeTokens(narration));
  const nameTokens = normalizeTokens(c.studentName);
  const overlap = nameTokens.filter((t) => narrTokens.has(t)).length;
  const admHit = c.admissionNo.length > 0 && narration.toLowerCase().includes(c.admissionNo.toLowerCase()) ? 1 : 0;

  let score = overlap * 10 + admHit * 50;
  if (amountKobo === c.balanceKobo) score += 8;
  else if (amountKobo > 0 && amountKobo <= c.balanceKobo) score += 3;

  let confidence: Confidence = "none";
  if (admHit === 1 || overlap >= 2) confidence = "high";
  else if (overlap === 1) confidence = "low";
  return { score, confidence };
}

export function matchRow(
  row: { narration: string; amountKobo: number },
  candidates: MatchCandidate[],
): { candidates: ScoredCandidate[]; suggestedInvoiceId: string | null } {
  const scored: ScoredCandidate[] = candidates
    .map((c) => ({ ...c, ...scoreCandidate(row.narration, row.amountKobo, c) }))
    .sort((a, b) => b.score - a.score);
  const top = scored[0];
  const suggestedInvoiceId = top && top.confidence !== "none" ? top.invoiceId : null;
  return { candidates: scored.slice(0, 5), suggestedInvoiceId };
}
