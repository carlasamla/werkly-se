import { describe, it, expect } from "vitest"
import type { WipResult, BalanceSheetData } from "@/lib/types"
import {
  computeReconciliation,
  generateJournalEntries,
} from "@/lib/reconciliation"

function makeResult(overrides: Partial<WipResult>): WipResult {
  return {
    projectNr: "100",
    projectName: "Test",
    contractType: "tm",
    customer: "",
    incurredCost: 0,
    revenueInvoiced: 0,
    earnedRevenue: null,
    wipAsset1620: 0,
    overBilling2450: 0,
    completionPct: null,
    status: "OK",
    isLoss: false,
    lossProvision: 0,
    contractValue: null,
    budgetedCost: null,
    costs: { labor: 0, material: 0, subcontractor: 0 },
    isDualScope: false,
    ...overrides,
  }
}

describe("computeReconciliation", () => {
  it("calculates differences correctly", () => {
    const results: WipResult[] = [
      makeResult({ projectNr: "A", wipAsset1620: 50000, overBilling2450: 0 }),
      makeResult({ projectNr: "B", wipAsset1620: 20000, overBilling2450: 0 }),
      makeResult({ projectNr: "C", wipAsset1620: 0, overBilling2450: 15000 }),
    ]
    const bs: BalanceSheetData = {
      account1620Balance: 12000,
      account2450Balance: 5000,
    }

    const recon = computeReconciliation(results, bs)

    expect(recon).toHaveLength(2)

    const row1620 = recon.find((r) => r.account === "1620")!
    expect(row1620.calculated).toBe(70000)
    expect(row1620.currentGLBalance).toBe(12000)
    expect(row1620.difference).toBe(58000)
    expect(row1620.action).toContain("krävs")

    const row2450 = recon.find((r) => r.account === "2450")!
    expect(row2450.calculated).toBe(15000)
    expect(row2450.currentGLBalance).toBe(5000)
    expect(row2450.difference).toBe(10000)
  })

  it("shows no action when balances match", () => {
    const results: WipResult[] = [
      makeResult({ wipAsset1620: 12000, overBilling2450: 5000 }),
    ]
    const bs: BalanceSheetData = {
      account1620Balance: 12000,
      account2450Balance: 5000,
    }

    const recon = computeReconciliation(results, bs)
    expect(recon[0].difference).toBe(0)
    expect(recon[0].action).toContain("Inget")
    expect(recon[1].difference).toBe(0)
  })
})

describe("generateJournalEntries", () => {
  it("generates WIP asset journal entry when 1620 needs increase", () => {
    const results: WipResult[] = [
      makeResult({ wipAsset1620: 50000 }),
    ]
    const bs: BalanceSheetData = {
      account1620Balance: 10000,
      account2450Balance: 0,
    }
    const recon = computeReconciliation(results, bs)
    const entries = generateJournalEntries(recon, results)

    // Should have one entry for 1620 increase
    const wipEntry = entries.find((e) => e.description.includes("ökning"))
    expect(wipEntry).toBeDefined()
    expect(wipEntry!.lines).toHaveLength(2)
    expect(wipEntry!.lines[0].debitAccount).toBe("1620")
    expect(wipEntry!.lines[0].amount).toBe(40000)
    expect(wipEntry!.lines[1].creditAccount).toBe("3081")
    expect(wipEntry!.lines[1].amount).toBe(40000)
  })

  it("generates reverse entry when 1620 needs decrease", () => {
    const results: WipResult[] = [
      makeResult({ wipAsset1620: 5000 }),
    ]
    const bs: BalanceSheetData = {
      account1620Balance: 20000,
      account2450Balance: 0,
    }
    const recon = computeReconciliation(results, bs)
    const entries = generateJournalEntries(recon, results)

    const entry = entries.find((e) => e.description.includes("minskning"))
    expect(entry).toBeDefined()
    expect(entry!.lines[0].debitAccount).toBe("3081")
    expect(entry!.lines[0].amount).toBe(15000)
    expect(entry!.lines[1].creditAccount).toBe("1620")
  })

  it("generates over-billing journal entry for 2450", () => {
    const results: WipResult[] = [
      makeResult({ overBilling2450: 30000 }),
    ]
    const bs: BalanceSheetData = {
      account1620Balance: 0,
      account2450Balance: 10000,
    }
    const recon = computeReconciliation(results, bs)
    const entries = generateJournalEntries(recon, results)

    const entry = entries.find((e) => e.description.includes("2450") || e.description.includes("fakturerad"))
    expect(entry).toBeDefined()
    expect(entry!.lines.some((l) => l.creditAccount === "2450")).toBe(true)
    expect(entry!.lines.some((l) => l.debitAccount === "3081")).toBe(true)
  })

  it("generates loss provision entry", () => {
    const results: WipResult[] = [
      makeResult({
        projectNr: "495",
        projectName: "Loss project",
        isLoss: true,
        lossProvision: 29000,
      }),
    ]
    const bs: BalanceSheetData = {
      account1620Balance: 0,
      account2450Balance: 0,
    }
    const recon = computeReconciliation(results, bs)
    const entries = generateJournalEntries(recon, results)

    const lossEntry = entries.find((e) => e.description.includes("Förlustavsättning"))
    expect(lossEntry).toBeDefined()
    expect(lossEntry!.lines[0].debitAccount).toBe("7290")
    expect(lossEntry!.lines[0].amount).toBe(29000)
    expect(lossEntry!.lines[1].creditAccount).toBe("2290")
    expect(lossEntry!.lines[1].amount).toBe(29000)
  })

  it("generates no entries when balances match and no losses", () => {
    const results: WipResult[] = [
      makeResult({ wipAsset1620: 0, overBilling2450: 0 }),
    ]
    const bs: BalanceSheetData = {
      account1620Balance: 0,
      account2450Balance: 0,
    }
    const recon = computeReconciliation(results, bs)
    const entries = generateJournalEntries(recon, results)
    expect(entries).toHaveLength(0)
  })
})
