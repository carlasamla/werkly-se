import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import {
  parseTimeExport,
  aggregateLaborCosts,
  collectProjectNames,
} from "@/lib/parsers/time-export"
import {
  parseGeneralLedger,
  aggregateGLData,
  getUnassignedTransactions,
} from "@/lib/parsers/general-ledger"
import {
  parseProjectEstimates,
  groupEstimatesByProject,
} from "@/lib/parsers/project-estimates"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturesDir = path.join(__dirname, "fixtures")

const REPORT_DATE = "2025-12-31"

// ── Time Export Parser ──

describe("parseTimeExport", () => {
  const csv = fs.readFileSync(path.join(fixturesDir, "time_export.csv"), "utf-8")

  it("parses entries filtered by report date", () => {
    const entries = parseTimeExport(csv, REPORT_DATE)
    // Should exclude: project 20, project 21, and the 2026-01-15 row
    // Valid rows: 462(4) + 473(2) + 495(3) + 510(2) = 11
    expect(entries).toHaveLength(11)
  })

  it("excludes internal projects 20 and 21", () => {
    const entries = parseTimeExport(csv, REPORT_DATE)
    const projectNrs = new Set(entries.map((e) => e.projectNr))
    expect(projectNrs.has("20")).toBe(false)
    expect(projectNrs.has("21")).toBe(false)
  })

  it("excludes entries after report date", () => {
    const entries = parseTimeExport(csv, REPORT_DATE)
    const dates = entries.map((e) => e.date)
    expect(dates.every((d) => d <= REPORT_DATE)).toBe(true)
  })

  it("parses Swedish cost format correctly", () => {
    const entries = parseTimeExport(csv, REPORT_DATE)
    const first = entries.find(
      (e) => e.projectNr === "462" && e.date === "2025-01-15"
    )
    expect(first).toBeDefined()
    expect(first!.cost).toBe(2800)
  })
})

describe("aggregateLaborCosts", () => {
  const csv = fs.readFileSync(path.join(fixturesDir, "time_export.csv"), "utf-8")
  const entries = parseTimeExport(csv, REPORT_DATE)

  it("sums labor cost per project", () => {
    const costs = aggregateLaborCosts(entries)
    // Project 462: 2800 + 3330 + 2360 + 2800 = 11290
    expect(costs.get("462")).toBe(11290)
    // Project 473: 2360 + 3330 = 5690
    expect(costs.get("473")).toBe(5690)
    // Project 495: 2800 + 3330 + 2360 = 8490
    expect(costs.get("495")).toBe(8490)
    // Project 510: 2800 + 2360 = 5160
    expect(costs.get("510")).toBe(5160)
  })
})

describe("collectProjectNames", () => {
  const csv = fs.readFileSync(path.join(fixturesDir, "time_export.csv"), "utf-8")
  const entries = parseTimeExport(csv, REPORT_DATE)

  it("returns project names", () => {
    const names = collectProjectNames(entries)
    expect(names.get("462")).toBe("Lustigknopp Sara")
    expect(names.get("473")).toBe("Hummelhaga")
  })
})

// ── General Ledger Parser ──

describe("parseGeneralLedger", () => {
  const txt = fs.readFileSync(path.join(fixturesDir, "huvudbok.txt"), "utf-8")
  const { transactions, balanceSheet } = parseGeneralLedger(txt, REPORT_DATE)

  it("parses material cost transactions", () => {
    const materialTxns = transactions.filter(
      (t) => t.account === "4000" || t.account === "4415" || t.account === "5410" || t.account === "5460"
    )
    expect(materialTxns.length).toBeGreaterThan(0)
  })

  it("parses revenue transactions", () => {
    const revTxns = transactions.filter(
      (t) => t.account === "3001" || t.account === "3231"
    )
    expect(revTxns.length).toBeGreaterThan(0)
  })

  it("reads balance sheet data", () => {
    expect(balanceSheet.account1620Balance).toBe(12000)
    expect(balanceSheet.account2450Balance).toBe(5000)
  })

  it("detects unassigned transactions", () => {
    const unassigned = getUnassignedTransactions(transactions)
    // C-410 has no project code
    expect(unassigned.length).toBeGreaterThan(0)
    expect(unassigned.some((t) => t.text.includes("Ospecificerat"))).toBe(true)
  })
})

describe("aggregateGLData", () => {
  const txt = fs.readFileSync(path.join(fixturesDir, "huvudbok.txt"), "utf-8")
  const { transactions } = parseGeneralLedger(txt, REPORT_DATE)
  const glData = aggregateGLData(transactions)

  it("aggregates material cost for project 462", () => {
    const proj = glData.get("462")
    expect(proj).toBeDefined()
    // 4000: 85000 + 120000 = 205000, 4415: 45000, 5410: 3500 → total 253500
    expect(proj!.materialCost).toBe(253500)
  })

  it("aggregates subcontractor cost for project 462", () => {
    const proj = glData.get("462")
    // 4425: 120000, 4600: 230000 → 350000
    expect(proj!.subcontractorCost).toBe(350000)
  })

  it("aggregates revenue for project 462", () => {
    const proj = glData.get("462")
    // 3001: 150000 + 200000 + 289000 = 639000
    expect(proj!.revenueInvoiced).toBe(639000)
  })

  it("aggregates revenue for project 473 (T&M)", () => {
    const proj = glData.get("473")
    expect(proj).toBeDefined()
    expect(proj!.revenueInvoiced).toBe(22000)
  })

  it("aggregates material for project 473 (förbrukningsmaterial)", () => {
    const proj = glData.get("473")
    // 5460: 4500
    expect(proj!.materialCost).toBe(4500)
  })
})

// ── Project Estimates Parser ──

describe("parseProjectEstimates", () => {
  const buffer = fs.readFileSync(path.join(fixturesDir, "projektfil.xlsx"))
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  )

  it("parses all project rows", () => {
    const estimates = parseProjectEstimates(arrayBuffer)
    expect(estimates).toHaveLength(4)
  })

  it("parses contract types correctly", () => {
    const estimates = parseProjectEstimates(arrayBuffer)
    const fixed = estimates.find((e) => e.projectNr === "462")
    expect(fixed?.contractType).toBe("fixed")

    const tm = estimates.find((e) => e.projectNr === "473")
    expect(tm?.contractType).toBe("tm")

    // Project 510 has empty type
    const missing = estimates.find((e) => e.projectNr === "510")
    expect(missing?.contractType).toBeNull()
  })

  it("parses contract values", () => {
    const estimates = parseProjectEstimates(arrayBuffer)
    const proj462 = estimates.find((e) => e.projectNr === "462")
    expect(proj462?.contractValue).toBe(815000)
    expect(proj462?.budgetedCost).toBe(617000)
    expect(proj462?.budgetedProfit).toBe(198000)
  })

  it("detects loss project from negative profit", () => {
    const estimates = parseProjectEstimates(arrayBuffer)
    const proj495 = estimates.find((e) => e.projectNr === "495")
    expect(proj495?.budgetedProfit).toBe(-60000)
  })

  it("handles empty values for T&M projects", () => {
    const estimates = parseProjectEstimates(arrayBuffer)
    const tm = estimates.find((e) => e.projectNr === "473")
    expect(tm?.contractValue).toBeNull()
    expect(tm?.budgetedCost).toBeNull()
  })
})

describe("groupEstimatesByProject", () => {
  const buffer = fs.readFileSync(path.join(fixturesDir, "projektfil.xlsx"))
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  )

  it("groups estimates by project number", () => {
    const estimates = parseProjectEstimates(arrayBuffer)
    const groups = groupEstimatesByProject(estimates)
    expect(groups.size).toBe(4)
    expect(groups.get("462")).toHaveLength(1)
  })
})
