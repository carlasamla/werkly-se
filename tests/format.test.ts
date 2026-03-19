import { describe, it, expect } from "vitest"
import { parseSwedishNumber, formatSEK, formatPct, parseDate, isOnOrBefore } from "@/lib/format"

describe("parseSwedishNumber", () => {
  it("parses simple integer", () => {
    expect(parseSwedishNumber("1234")).toBe(1234)
  })

  it("parses with comma decimal", () => {
    expect(parseSwedishNumber("1234,56")).toBe(1234.56)
  })

  it("parses with space thousands separator", () => {
    expect(parseSwedishNumber("1 234 567,89")).toBe(1234567.89)
  })

  it("parses with non-breaking space separator", () => {
    expect(parseSwedishNumber("1\u00a0234\u00a0567,89")).toBe(1234567.89)
  })

  it("parses negative numbers", () => {
    expect(parseSwedishNumber("-1 234,56")).toBe(-1234.56)
  })

  it("returns 0 for null/undefined/empty", () => {
    expect(parseSwedishNumber(null)).toBe(0)
    expect(parseSwedishNumber(undefined)).toBe(0)
    expect(parseSwedishNumber("")).toBe(0)
  })

  it("returns 0 for lone dash", () => {
    expect(parseSwedishNumber("-")).toBe(0)
  })

  it("parses zero", () => {
    expect(parseSwedishNumber("0,00")).toBe(0)
  })

  it("parses common Fortnox format", () => {
    expect(parseSwedishNumber("2 800,00")).toBe(2800)
    expect(parseSwedishNumber("150 000,00")).toBe(150000)
  })
})

describe("formatSEK", () => {
  it("formats with Swedish locale", () => {
    const result = formatSEK(1234567)
    // Accept both non-breaking space and regular space
    expect(result.replace(/\u00a0/g, " ")).toBe("1 234 567")
  })

  it("formats with decimals", () => {
    const result = formatSEK(1234.56, 2)
    expect(result.replace(/\u00a0/g, " ")).toMatch(/1 234,56/)
  })
})

describe("formatPct", () => {
  it("formats percentage", () => {
    expect(formatPct(0.8123)).toBe("81%")
  })

  it("returns dash for null", () => {
    expect(formatPct(null)).toBe("—")
  })
})

describe("parseDate", () => {
  it("passes through ISO format", () => {
    expect(parseDate("2025-12-31")).toBe("2025-12-31")
  })

  it("parses compact format", () => {
    expect(parseDate("20251231")).toBe("2025-12-31")
  })

  it("parses slash format", () => {
    expect(parseDate("2025/12/31")).toBe("2025-12-31")
  })

  it("trims whitespace", () => {
    expect(parseDate("  2025-12-31  ")).toBe("2025-12-31")
  })
})

describe("isOnOrBefore", () => {
  it("returns true for same date", () => {
    expect(isOnOrBefore("2025-12-31", "2025-12-31")).toBe(true)
  })

  it("returns true for earlier date", () => {
    expect(isOnOrBefore("2025-01-15", "2025-12-31")).toBe(true)
  })

  it("returns false for later date", () => {
    expect(isOnOrBefore("2026-01-15", "2025-12-31")).toBe(false)
  })
})
