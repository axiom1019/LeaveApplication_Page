/**
 * Prevents spreadsheet formula injection: a value written to Sheets that starts with
 * = + - @ (or tab / CR) is evaluated as a formula. A leading apostrophe forces plain text
 * and is not part of the stored value Sheets returns.
 */
export function toSafeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export const bool = (v: string): boolean => v === 'TRUE';
export const boolCell = (b: boolean): string => (b ? 'TRUE' : 'FALSE');
export const intCell = (n: number): string => String(Math.trunc(n));
export const int = (v: string, fallback = 0): number => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};
