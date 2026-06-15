import { describe, it, expect } from "vitest";
import { shouldCelebrate, topBandMinScore } from "./reveal.util";

const bands = [
  { grade: "A1", minScore: 75 },
  { grade: "B2", minScore: 70 },
  { grade: "F9", minScore: 0 },
];

describe("topBandMinScore", () => {
  it("returns the highest minScore", () => {
    expect(topBandMinScore(bands)).toBe(75);
  });
  it("returns null for empty", () => {
    expect(topBandMinScore([])).toBeNull();
  });
});

describe("shouldCelebrate", () => {
  it("celebrates position 1 regardless of average", () => {
    expect(shouldCelebrate({ position: 1, average: 40, gradeKey: bands })).toBe(true);
  });
  it("celebrates a distinction average even if not first", () => {
    expect(shouldCelebrate({ position: 3, average: 80, gradeKey: bands })).toBe(true);
  });
  it("does not celebrate a mid result that is not first", () => {
    expect(shouldCelebrate({ position: 3, average: 60, gradeKey: bands })).toBe(false);
  });
  it("falls back to position-only when no gradeKey", () => {
    expect(shouldCelebrate({ position: 1, average: 10, gradeKey: [] })).toBe(true);
    expect(shouldCelebrate({ position: 2, average: 99, gradeKey: [] })).toBe(false);
  });
});
