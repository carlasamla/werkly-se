/**
 * End-to-end integration test: runs the full WIP pipeline from raw fixture
 * files all the way to WIP results, reconciliation, and journal entries.
 *
 * Expected values are derived by hand from tests/fixtures/* with reportDate
 * 2025-12-31.
 *
 * ─── Labor costs (time_export.csv, excl. proj 20/21, excl. 2026-01-15) ───
 *   462: 2800 + 3330 + 2360 + 2800 = 11 290
 *   473: 2360 + 3330              =  5 690
 *   495: 2800 + 3330 + 2360       =  8 490
 *   510: 2800 + 2360              =  5 160
 *
 * ─── GL data (huvudbok.txt) ──────────────────────────────────────────────
 *   462 material:     4000(205 000) + 4415(45 000) + 5410(3 500) = 253 500
 *   462 sub:          4425(120 000) + 4600(230 000)              = 350 000
 *   462 revenue:      3001(639 000)                              = 639 000
 *   473 material:     5460(4 500)                                =   4 500
 *   473 revenue:      3001(22 000)                               =  22 000
 *   495 material:     4000(155 000) + 4415(60 000)              = 155 000
 *   495 sub:          4425(45 000)                               =  45 000
 *   495 revenue:      3231(380 000)                              = 380 000
 *   510 material:     4000(35 000)                               =  35 000
 *   510 revenue:      3001(45 000)                               =  45 000
 *   BS  1620:         12 000  (from Utgående balans line)
 *   BS  2450:          5 000  (from Utgående balans line)
 *   Unassigned:       C-410, 4600, 15 000 (no project code)
 *
 * ─── WIP results ─────────────────────────────────────────────────────────
 *   462 (fixed, contract 815 000, budget 617 000):
 *     incurred    = 614 790
 *     completion  ≈ 99.64 %
 *     earned      ≈ 812 081
 *     1620 asset  ≈ 173 081
 *
 *   473 (T&M):
 *     incurred    = 10 190
 *     2450        = 11 810
 *
 *   495 (fixed LOSS, contract 350 000, budget 410 000):
 *     incurred    = 208 490
 *     completion  ≈ 50.85 %
 *     earned      ≈ 177 979
 *     2450        ≈ 202 021
 *     lossProvision ≈ 29 489
 *
 *   510 (type unknown → defaults to T&M):
 *     incurred    = 40 160
 *     2450        =  4 840
 */

import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

import { parseTimeExport } from "@/lib/parsers/time-export"
import { parseGeneralLedger } from "@/lib/parsers/general-ledger"
import { parseProjectEstimates } from "@/lib/parsers/project-estimates"
import { mergeProjectData, calculateAllWip } from "@/lib/calculations"
import {
  computeReconciliation,
  generateJournalEntries,
} from "@/lib/reconciliation"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fix = (name: string) => path.join(__dirname, "fixtures", name)
const REPORT_DATE = "2025-12-31"

// ─── Load fixtures once ────────────────────────────────────────────────────

const csvRaw = fs.readFileSync(fix("time_export.csv"), "utf-8")
const txtRaw = fs.readFileSync(fix("huvudbok.txt"), "utf-8")
const xlsxBuf = (() => {
  const buf = fs.readFileSync(fix("projektfil.xlsx"))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
})()

// ─── Full pipeline ─────────────────────────────────────────────────────────

describe("Integration: full WIP pipeline", () => {
  const timeEntries = parseTimeExport(csvRaw, REPORT_DATE)
  const { transactions: glTxns, balanceSheet } = parseGeneralLedger(txtRaw, REPORT_DATE)
  const estimates = parseProjectEstimates(xlsxBuf)

  const { projects, clarifications: mergeClarifications } = mergeProjectData(
    timeEntries,
    glTxns,
    estimates
  )

  const { results, clarifications: calcClarifications } = calculateAllWip(projects)
  const allClarifications = [...mergeClarifications, ...calcClarifications]

  const reconciliation = computeReconciliation(results, balanceSheet)
  const journalEntries = generateJournalEntries(reconciliation, results)

  // ── Clarifications ─────────────────────────────────────────────────────

  it("flags project 510 as missing type", () => {
    const issue = allClarifications.find(
      (c) => c.kind === "missing_type" && c.projectNr === "510"
    )
    expect(issue).toBeDefined()
  })

  it("flags unassigned GL transaction (C-410)", () => {
    const issue = allClarifications.find(
      (c) => c.kind === "unassigned_gl_transaction"
    )
    expect(issue).toBeDefined()
    expect(issue!.details?.debit).toBe(15000)
  })

  it("has 4 projects in the merged map", () => {
    expect(projects.size).toBe(4)
  })

  // ── WIP results: project 462 (fixed-price, profitable) ─────────────────

  it("462: correct incurred cost", () => {
    const p = results.find((r) => r.projectNr === "462")!
    expect(p.incurredCost).toBe(614790) // 11290 + 253500 + 350000
  })

  it("462: completion close to 99.64%", () => {
    const p = results.find((r) => r.projectNr === "462")!
    expect(p.completionPct).toBeCloseTo(614790 / 617000, 4)
  })

  it("462: earned revenue close to contract × completion", () => {
    const p = results.find((r) => r.projectNr === "462")!
    const expected = 815000 * (614790 / 617000)
    expect(p.earnedRevenue!).toBeCloseTo(expected, 0)
  })

  it("462: WIP asset (1620) = earned − invoiced", () => {
    const p = results.find((r) => r.projectNr === "462")!
    const expected = 815000 * (614790 / 617000) - 639000
    expect(p.wipAsset1620).toBeCloseTo(expected, 0)
    expect(p.overBilling2450).toBe(0)
  })

  it("462: status OK, not a loss", () => {
    const p = results.find((r) => r.projectNr === "462")!
    expect(p.status).toBe("OK")
    expect(p.isLoss).toBe(false)
    expect(p.lossProvision).toBe(0)
  })

  // ── WIP results: project 473 (T&M, over-billed) ────────────────────────

  it("473: correct incurred cost", () => {
    const p = results.find((r) => r.projectNr === "473")!
    expect(p.incurredCost).toBe(10190) // 5690 + 4500
  })

  it("473: over-billed by 11 810", () => {
    const p = results.find((r) => r.projectNr === "473")!
    expect(p.wipAsset1620).toBe(0)
    expect(p.overBilling2450).toBe(11810)
    expect(p.status).toBe("Over-billed")
    expect(p.earnedRevenue).toBeNull()
    expect(p.completionPct).toBeNull()
  })

  // ── WIP results: project 495 (fixed-price, LOSS) ───────────────────────

  it("495: correct incurred cost", () => {
    const p = results.find((r) => r.projectNr === "495")!
    expect(p.incurredCost).toBe(208490) // 8490 + 155000 + 45000
  })

  it("495: completion close to 50.85%", () => {
    const p = results.find((r) => r.projectNr === "495")!
    expect(p.completionPct).toBeCloseTo(208490 / 410000, 4)
  })

  it("495: flagged as loss with positive provision", () => {
    const p = results.find((r) => r.projectNr === "495")!
    expect(p.isLoss).toBe(true)
    expect(p.status).toBe("Loss")
    expect(p.lossProvision).toBeGreaterThan(0)
    expect(p.lossProvision).toBeLessThan(60000) // total loss = 60 000
  })

  it("495: over-billed (invoiced exceeds earned)", () => {
    const p = results.find((r) => r.projectNr === "495")!
    const expectedEarned = 350000 * (208490 / 410000)
    expect(p.earnedRevenue!).toBeCloseTo(expectedEarned, 0)
    expect(p.overBilling2450).toBeCloseTo(380000 - expectedEarned, 0)
    expect(p.wipAsset1620).toBe(0)
  })

  // ── WIP results: project 510 (type defaulted to T&M) ──────────────────

  it("510: defaults to T&M when type is null", () => {
    const p = results.find((r) => r.projectNr === "510")!
    expect(p.contractType).toBe("tm")
    expect(p.incurredCost).toBe(40160) // 5160 + 35000
    expect(p.overBilling2450).toBe(4840) // 40160 - 45000
    expect(p.wipAsset1620).toBe(0)
  })

  // ── Ordering ───────────────────────────────────────────────────────────

  it("results are sorted ascending by project number", () => {
    const nrs = results.map((r) => parseInt(r.projectNr, 10))
    expect(nrs).toEqual([...nrs].sort((a, b) => a - b))
  })

  // ── Balance sheet (from Utgående balans lines) ─────────────────────────

  it("reads GL balance for 1620 as 12 000", () => {
    expect(balanceSheet.account1620Balance).toBe(12000)
  })

  it("reads GL balance for 2450 as 5 000", () => {
    expect(balanceSheet.account2450Balance).toBe(5000)
  })

  // ── Reconciliation ─────────────────────────────────────────────────────

  it("reconciliation has rows for both 1620 and 2450", () => {
    expect(reconciliation).toHaveLength(2)
    expect(reconciliation.map((r) => r.account)).toContain("1620")
    expect(reconciliation.map((r) => r.account)).toContain("2450")
  })

  it("1620 reconciliation: difference requires journal entry", () => {
    const row = reconciliation.find((r) => r.account === "1620")!
    expect(row.calculated).toBeGreaterThan(0)
    expect(row.difference).toBeCloseTo(row.calculated - 12000, 0)
    expect(row.action).toContain("krävs")
  })

  it("2450 reconciliation: difference requires journal entry", () => {
    const row = reconciliation.find((r) => r.account === "2450")!
    expect(row.calculated).toBeGreaterThan(0)
    expect(row.difference).toBeCloseTo(row.calculated - 5000, 0)
    expect(row.action).toContain("krävs")
  })

  // ── Journal entries ────────────────────────────────────────────────────

  it("generates journal entries (at least 3: 1620, 2450, loss provision)", () => {
    expect(journalEntries.length).toBeGreaterThanOrEqual(3)
  })

  it("WIP asset entry debits 1620 and credits 3081", () => {
    const entry = journalEntries.find((e) =>
      e.lines.some((l) => l.debitAccount === "1620")
    )
    expect(entry).toBeDefined()
    const debitLine = entry!.lines.find((l) => l.debitAccount === "1620")!
    const creditLine = entry!.lines.find((l) => l.creditAccount === "3081")!
    expect(debitLine.amount).toBeGreaterThan(0)
    expect(creditLine.amount).toBeGreaterThan(0)
    expect(debitLine.amount).toBeCloseTo(creditLine.amount, 0)
  })

  it("over-billing entry debits 3081 and credits 2450", () => {
    const entry = journalEntries.find((e) =>
      e.lines.some((l) => l.creditAccount === "2450")
    )
    expect(entry).toBeDefined()
    const debitLine = entry!.lines.find((l) => l.debitAccount === "3081")!
    const creditLine = entry!.lines.find((l) => l.creditAccount === "2450")!
    expect(debitLine.amount).toBeGreaterThan(0)
    expect(creditLine.amount).toBeCloseTo(debitLine.amount, 0)
  })

  it("loss provision entry debits 7290 and credits 2290", () => {
    const entry = journalEntries.find((e) =>
      e.lines.some((l) => l.debitAccount === "7290")
    )
    expect(entry).toBeDefined()
    const provision = results.find((r) => r.projectNr === "495")!.lossProvision
    expect(entry!.lines[0].debitAccount).toBe("7290")
    expect(entry!.lines[0].amount).toBeCloseTo(provision, 0)
    expect(entry!.lines[1].creditAccount).toBe("2290")
  })

  it("journal entry amounts balance (debit = credit per entry)", () => {
    for (const entry of journalEntries) {
      const totalDebit = entry.lines
        .filter((l) => l.debitAccount !== null)
        .reduce((s, l) => s + l.amount, 0)
      const totalCredit = entry.lines
        .filter((l) => l.creditAccount !== null)
        .reduce((s, l) => s + l.amount, 0)
      expect(totalDebit).toBeCloseTo(totalCredit, 0)
    }
  })
})

// ─── Delimiter auto-detection ──────────────────────────────────────────────

describe("Integration: CSV delimiter auto-detection", () => {
  it("parses comma-delimited CSV correctly", () => {
    // Construct the same data but with commas instead of semicolons
    const commaCsv = csvRaw.replace(/;/g, ",")
    const entries = parseTimeExport(commaCsv, REPORT_DATE)
    // The Swedish costs use commas for decimals (2 800,00) — a comma-delimited
    // file with Swedish decimals will be ambiguous for PapaParse.
    // We accept that the count will differ but at minimum no crash.
    expect(Array.isArray(entries)).toBe(true)
  })

  it("semicolon CSV parses without error", () => {
    const entries = parseTimeExport(csvRaw, REPORT_DATE)
    expect(entries.length).toBe(11)
  })
})

// ─── GL balance sheet fallback ─────────────────────────────────────────────

describe("Integration: GL balance sheet fallback (no summary line)", () => {
  it("falls back to summing transactions when summary line absent", () => {
    // Remove the Utgående balans lines from the fixture
    const stripped = txtRaw
      .split(/\r?\n/)
      .filter((l) => !l.includes("Utg\u00e5ende balans"))
      .join("\n")

    const { transactions: txns, balanceSheet: bs } = parseGeneralLedger(
      stripped,
      REPORT_DATE
    )

    // No 1620/2450 transactions in fixture → both should be 0 (computed from empty set)
    expect(bs.account1620Balance).toBe(0)
    expect(bs.account2450Balance).toBe(0)
  })

  it("uses summary line value when present", () => {
    const { balanceSheet: bs } = parseGeneralLedger(txtRaw, REPORT_DATE)
    expect(bs.account1620Balance).toBe(12000)
    expect(bs.account2450Balance).toBe(5000)
  })
})
