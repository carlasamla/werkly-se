/**
 * Parse Swedish number format: "1 234 567,89" → 1234567.89
 * Handles:
 * - Non-breaking spaces (U+00A0) and regular spaces as thousands separators
 * - Comma as decimal separator
 * - Negative numbers with leading minus
 * - Empty/missing values → 0
 */
export function parseSwedishNumber(value: string | null | undefined): number {
  if (value == null || value === "") return 0

  const cleaned = value
    .toString()
    .replace(/\u00a0/g, "") // non-breaking space
    .replace(/ /g, "") // regular space
    .replace(",", ".") // decimal comma → dot
    .trim()

  if (cleaned === "" || cleaned === "-") return 0

  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

/**
 * Format number as Swedish-style string for display: 1 234 567
 * No decimals by default (accounting amounts are whole SEK).
 */
export function formatSEK(value: number, decimals = 0): string {
  return value.toLocaleString("sv-SE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/**
 * Format as percentage: 0.8123 → "81%"
 */
export function formatPct(value: number | null): string {
  if (value == null) return "—"
  return `${Math.round(value * 100)}%`
}

/**
 * Parse a date string in various formats to YYYY-MM-DD.
 * Handles: "2025-12-31", "20251231", "2025/12/31"
 */
export function parseDate(value: string): string {
  const trimmed = value.trim()

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  // Compact format: 20251231
  if (/^\d{8}$/.test(trimmed)) {
    return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`
  }

  // Slash format: 2025/12/31
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(trimmed)) {
    return trimmed.replace(/\//g, "-")
  }

  return trimmed
}

/**
 * Check if a date string (YYYY-MM-DD) is on or before the report date.
 */
export function isOnOrBefore(date: string, reportDate: string): boolean {
  return date <= reportDate
}
