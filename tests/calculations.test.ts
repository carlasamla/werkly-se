import { describe, it, expect } from "vitest"
import type { ProjectData } from "@/lib/types"
import {
  calculateWipTM,
  calculateWipFixed,
  mergeProjectData,
  calculateAllWip,
} from "@/lib/calculations"

// ── T&M calculations ──

describe("calculateWipTM", () => {
  it("calculates WIP when under-billed (asset)", () => {
    const project: ProjectData = {
      projectNr: "100",
      projectName: "Test T&M under-billed",
      contractType: "tm",
      customer: "Kund A",
      contractValue: null,
      budgetedCost: null,
      budgetedProfit: null,
      costs: { labor: 50000, material: 20000, subcontractor: 10000 },
      revenueInvoiced: 60000,
      isDualScope: false,
    }

    const result = calculateWipTM(project)
    // Total cost = 80000, invoiced = 60000 → WIP = 20000 (asset)
    expect(result.incurredCost).toBe(80000)
    expect(result.wipAsset1620).toBe(20000)
    expect(result.overBilling2450).toBe(0)
    expect(result.status).toBe("OK")
    expect(result.earnedRevenue).toBeNull()
    expect(result.completionPct).toBeNull()
  })

  it("calculates over-billing when invoiced exceeds cost", () => {
    const project: ProjectData = {
      projectNr: "473",
      projectName: "Hummelhaga",
      contractType: "tm",
      customer: "Brf",
      contractValue: null,
      budgetedCost: null,
      budgetedProfit: null,
      costs: { labor: 5690, material: 4500, subcontractor: 0 },
      revenueInvoiced: 22000,
      isDualScope: false,
    }

    const result = calculateWipTM(project)
    // Total = 10190, invoiced = 22000 → overbilling = 11810
    expect(result.incurredCost).toBe(10190)
    expect(result.wipAsset1620).toBe(0)
    expect(result.overBilling2450).toBe(11810)
    expect(result.status).toBe("Over-billed")
  })
})

// ── Fixed-price calculations ──

describe("calculateWipFixed", () => {
  it("calculates percentage-of-completion correctly", () => {
    const project: ProjectData = {
      projectNr: "462",
      projectName: "Lustigknopp Sara",
      contractType: "fixed",
      customer: "Sara",
      contractValue: 815000,
      budgetedCost: 617000,
      budgetedProfit: 198000,
      costs: { labor: 11290, material: 253500, subcontractor: 350000 },
      revenueInvoiced: 639000,
      isDualScope: false,
    }

    const result = calculateWipFixed(project)
    const totalCost = 11290 + 253500 + 350000 // 614790
    expect(result.incurredCost).toBe(614790)

    // Completion = 614790 / 617000 ≈ 0.9964
    expect(result.completionPct).toBeCloseTo(614790 / 617000, 4)

    // Earned revenue = 815000 * (614790/617000) ≈ 812079
    const expectedEarned = 815000 * (614790 / 617000)
    expect(result.earnedRevenue).toBeCloseTo(expectedEarned, 0)

    // WIP = earned - invoiced = 812079 - 639000 ≈ 173079 (asset)
    expect(result.wipAsset1620).toBeCloseTo(expectedEarned - 639000, 0)
    expect(result.overBilling2450).toBe(0)
    expect(result.isLoss).toBe(false)
    expect(result.status).toBe("OK")
  })

  it("detects loss contract and calculates provision", () => {
    const project: ProjectData = {
      projectNr: "495",
      projectName: "Utbyggnad Lustigknoppsv.",
      contractType: "fixed",
      customer: "Anders",
      contractValue: 350000,
      budgetedCost: 410000,
      budgetedProfit: -60000,
      costs: { labor: 8490, material: 155000, subcontractor: 45000 },
      revenueInvoiced: 380000,
      isDualScope: false,
    }

    const result = calculateWipFixed(project)
    const totalCost = 8490 + 155000 + 45000 // 208490
    expect(result.incurredCost).toBe(208490)
    expect(result.isLoss).toBe(true)
    expect(result.status).toBe("Loss")

    // Projected loss = 350000 - 410000 = -60000
    // Completion = 208490 / 410000 ≈ 50.85%
    expect(result.completionPct).toBeCloseTo(208490 / 410000, 4)

    // Earned revenue = 350000 * 0.5085 ≈ 177985
    // Loss provision: totalExpectedLoss = 60000
    // Loss already realized = max(0, 208490 - 177985) = 30505
    // Remaining provision = max(0, 60000 - 30505) = 29495
    expect(result.lossProvision).toBeGreaterThan(0)
    expect(result.lossProvision).toBeLessThan(60000)
  })

  it("handles over-billing on fixed-price", () => {
    // A project where more has been invoiced than earned
    const project: ProjectData = {
      projectNr: "200",
      projectName: "Over-billed fixed",
      contractType: "fixed",
      customer: "Test",
      contractValue: 1000000,
      budgetedCost: 800000,
      budgetedProfit: 200000,
      costs: { labor: 100000, material: 100000, subcontractor: 0 },
      revenueInvoiced: 500000,
      isDualScope: false,
    }

    const result = calculateWipFixed(project)
    // Total cost = 200000, completion = 200000/800000 = 25%
    // Earned = 1000000 * 0.25 = 250000
    // WIP = 250000 - 500000 = -250000 → overbilling
    expect(result.completionPct).toBeCloseTo(0.25, 4)
    expect(result.earnedRevenue).toBeCloseTo(250000, 0)
    expect(result.wipAsset1620).toBe(0)
    expect(result.overBilling2450).toBeCloseTo(250000, 0)
    expect(result.status).toBe("Over-billed")
  })

  it("caps completion degree at 100% for earned revenue", () => {
    const project: ProjectData = {
      projectNr: "300",
      projectName: "Over budget",
      contractType: "fixed",
      customer: "Test",
      contractValue: 500000,
      budgetedCost: 300000,
      budgetedProfit: 200000,
      costs: { labor: 200000, material: 150000, subcontractor: 0 },
      revenueInvoiced: 500000,
      isDualScope: false,
    }

    const result = calculateWipFixed(project)
    // Total cost = 350000, completion = 350000/300000 = 116.7%
    // Earned should be capped: 500000 * min(1.167, 1) = 500000
    expect(result.completionPct).toBeCloseTo(350000 / 300000, 4)
    expect(result.earnedRevenue).toBe(500000) // capped at contract value
    expect(result.status).toBe("Warning")
  })
})

// ── calculateAllWip ──

describe("calculateAllWip", () => {
  it("sorts results by project number", () => {
    const projects = new Map<string, ProjectData>([
      [
        "510",
        {
          projectNr: "510",
          projectName: "P510",
          contractType: "tm",
          customer: "",
          contractValue: null,
          budgetedCost: null,
          budgetedProfit: null,
          costs: { labor: 1000, material: 0, subcontractor: 0 },
          revenueInvoiced: 500,
          isDualScope: false,
        },
      ],
      [
        "100",
        {
          projectNr: "100",
          projectName: "P100",
          contractType: "tm",
          customer: "",
          contractValue: null,
          budgetedCost: null,
          budgetedProfit: null,
          costs: { labor: 2000, material: 0, subcontractor: 0 },
          revenueInvoiced: 1000,
          isDualScope: false,
        },
      ],
    ])

    const { results } = calculateAllWip(projects)
    expect(results[0].projectNr).toBe("100")
    expect(results[1].projectNr).toBe("510")
  })

  it("warns when completion exceeds 100%", () => {
    const projects = new Map<string, ProjectData>([
      [
        "300",
        {
          projectNr: "300",
          projectName: "Over budget",
          contractType: "fixed",
          customer: "",
          contractValue: 500000,
          budgetedCost: 300000,
          budgetedProfit: 200000,
          costs: { labor: 200000, material: 150000, subcontractor: 0 },
          revenueInvoiced: 500000,
          isDualScope: false,
        },
      ],
    ])

    const { clarifications } = calculateAllWip(projects)
    expect(clarifications.some((c) => c.kind === "completion_over_100")).toBe(true)
  })

  it("uses resolvedTypes when contract type is null", () => {
    const projects = new Map<string, ProjectData>([
      [
        "999",
        {
          projectNr: "999",
          projectName: "Unknown type",
          contractType: null,
          customer: "",
          contractValue: null,
          budgetedCost: null,
          budgetedProfit: null,
          costs: { labor: 5000, material: 0, subcontractor: 0 },
          revenueInvoiced: 3000,
          isDualScope: false,
        },
      ],
    ])

    const resolvedTypes = new Map([["999", "tm" as const]])
    const { results } = calculateAllWip(projects, resolvedTypes)
    expect(results[0].contractType).toBe("tm")
    expect(results[0].wipAsset1620).toBe(2000)
  })
})
