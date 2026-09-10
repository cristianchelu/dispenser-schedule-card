/**
 * Render a number as a mixed fraction when Unicode has a glyph for it
 * (½, ⅕, ⅒ …) and as a short decimal otherwise. The decimal path also trims
 * the float noise from `ticks * factor` (0.1 * 3 → 0.30000000000000004).
 */

const VULGAR: Record<string, string> = {
  "1/2": "½",
  "1/3": "⅓",
  "2/3": "⅔",
  "1/4": "¼",
  "3/4": "¾",
  "1/5": "⅕",
  "2/5": "⅖",
  "3/5": "⅗",
  "4/5": "⅘",
  "1/6": "⅙",
  "5/6": "⅚",
  "1/7": "⅐",
  "1/8": "⅛",
  "3/8": "⅜",
  "5/8": "⅝",
  "7/8": "⅞",
  "1/9": "⅑",
  "1/10": "⅒",
};

const EPSILON = 1e-9;

export function formatFraction(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const whole = Math.floor(abs);
  const rem = abs - whole;

  if (rem < EPSILON || 1 - rem < EPSILON) return sign + String(Math.round(abs));

  // Smallest denominator first, so the fraction comes out reduced.
  for (let d = 2; d <= 10; d++) {
    const n = Math.round(rem * d);
    if (n > 0 && Math.abs(rem * d - n) < EPSILON) {
      const glyph = VULGAR[`${n}/${d}`];
      if (glyph) return sign + (whole ? `${whole}${glyph}` : glyph);
      break;
    }
  }

  return sign + String(Number(abs.toFixed(2)));
}
