import { matchRow, scoreCandidate } from "./reconcile.util";

const cands = [
  { invoiceId: "i-ada", studentName: "Ada Eze", admissionNo: "ADM1", balanceKobo: 6000000 },
  { invoiceId: "i-bola", studentName: "Bola Ade", admissionNo: "ADM2", balanceKobo: 5000000 },
];

describe("scoreCandidate", () => {
  it("full-name overlap → high", () => {
    expect(scoreCandidate("transfer from Ada Eze", 6000000, cands[0]!).confidence).toBe("high");
  });
  it("admissionNo substring → high", () => {
    expect(scoreCandidate("deposit ADM1 fees", 100, cands[0]!).confidence).toBe("high");
  });
  it("single weak token → low", () => {
    expect(scoreCandidate("ada", 100, cands[0]!).confidence).toBe("low");
  });
  it("no name overlap → none", () => {
    expect(scoreCandidate("random gibberish xyz", 6000000, cands[0]!).confidence).toBe("none");
  });
  it("exact amount boosts score over a partial", () => {
    const exact = scoreCandidate("Ada Eze", 6000000, cands[0]!).score;
    const partial = scoreCandidate("Ada Eze", 100, cands[0]!).score;
    expect(exact).toBeGreaterThan(partial);
  });
});

describe("matchRow", () => {
  it("suggests the best candidate and ranks by score", () => {
    const r = matchRow({ narration: "payment from Bola Ade", amountKobo: 5000000 }, cands);
    expect(r.suggestedInvoiceId).toBe("i-bola");
    expect(r.candidates[0]!.invoiceId).toBe("i-bola");
  });
  it("suggests null when no candidate has a name match", () => {
    const r = matchRow({ narration: "unknown deposit 999", amountKobo: 5000000 }, cands);
    expect(r.suggestedInvoiceId).toBeNull();
  });
  it("returns no suggestion for empty candidates", () => {
    expect(matchRow({ narration: "Ada Eze", amountKobo: 1 }, []).suggestedInvoiceId).toBeNull();
  });
});
