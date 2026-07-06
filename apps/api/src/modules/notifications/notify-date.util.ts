const LAGOS_OFFSET_MS = 60 * 60 * 1000; // UTC+1, no DST

export function lagosDateStr(d: Date): string {
  return new Date(d.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

export function shiftDateStr(yyyyMmDd: string, days: number): string {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function sameLagosDay(a: Date, b: Date): boolean {
  return lagosDateStr(a) === lagosDateStr(b);
}
