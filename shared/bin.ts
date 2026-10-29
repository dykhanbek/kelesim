// Kazakhstan BIN / IIN helpers.

const W1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const W2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2];

/** Validates the 12-digit BIN/IIN including its control digit. */
export function isValidBin(bin: string): boolean {
  if (!/^\d{12}$/.test(bin)) return false;
  const d = bin.split("").map(Number);
  let c = W1.reduce((s, w, i) => s + w * d[i], 0) % 11;
  if (c === 10) {
    c = W2.reduce((s, w, i) => s + w * d[i], 0) % 11;
    if (c === 10) return false;
  }
  return c === d[11];
}

/** Computes the control digit for the first 11 digits (used to build demo data). */
export function withControlDigit(first11: string): string | null {
  for (let c = 0; c <= 9; c++) if (isValidBin(first11 + c)) return first11 + c;
  return null;
}
