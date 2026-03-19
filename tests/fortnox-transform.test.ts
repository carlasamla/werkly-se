import { describe, it, expect } from "vitest"
import {
  vouchersToGLTransactions,
  projectsToEstimates,
  parseSIE4,
} from "@/lib/fortnox/transform"
import type { FortnoxVoucher, FortnoxProject } from "@/lib/fortnox/types"

// ─── Helpers ───

function makeVoucher(overrides: Partial<FortnoxVoucher> = {}): FortnoxVoucher {
  return {
    VoucherNumber: 1,
    VoucherSeries: "A",
    Year: 2025,
    TransactionDate: "2025-06-15",
    Description: "Test voucher",
    ReferenceNumber: "",
    ReferenceType: "",
    VoucherRows: [],
    ...overrides,
  }
}

function makeProject(overrides: Partial<FortnoxProject> = {}): FortnoxProject {
  return {
    ProjectNumber: "100",
    Description: "Test project",
    StartDate: "2025-01-01",
    EndDate: null,
    ProjectLeader: null,
    ContactPerson: null,
    Comments: null,
    Status: "ONGOING",
    ...overrides,
  }
}

// ─── vouchersToGLTransactions ───

describe("vouchersToGLTransactions", () => {
  it("returns empty arrays for no vouchers", () => {
    const result = vouchersToGLTransactions([])
    expect(result.transactions).toEqual([])
    expect(result.balanceSheet).toEqual({
      account1620Balance: 0,
      account2450Balance: 0,
    })
  })

  it("extracts transactions from relevant accounts", () => {
    const voucher = makeVoucher({
      VoucherRows: [
        {
          Account: 3001,
          Debit: 0,
          Credit: 50000,
          CostCenter: "CC1",
          Project: "100",
          Description: "Fakturerad intäkt",
          TransactionInformation: "",
        },
      ],
    })

    const { transactions } = vouchersToGLTransactions([voucher])
    expect(transactions).toHaveLength(1)
    expect(transactions[0]).toMatchObject({
      voucherNr: "A-1",
      account: "3001",
      debit: 0,
      credit: 50000,
      projectNr: "100",
      costCenter: "CC1",
    })
  })

  it("ignores rows with irrelevant accounts", () => {
    const voucher = makeVoucher({
      VoucherRows: [
        {
          Account: 1910,
          Debit: 100,
          Credit: 0,
          CostCenter: "",
          Project: "",
          Description: "Bank",
          TransactionInformation: "",
        },
      ],
    })

    const { transactions } = vouchersToGLTransactions([voucher])
    expect(transactions).toHaveLength(0)
  })

  it("tracks balance sheet accounts 1620 and 2450", () => {
    const vouchers = [
      makeVoucher({
        VoucherRows: [
          {
            Account: 1620,
            Debit: 25000,
            Credit: 0,
            CostCenter: "",
            Project: "100",
            Description: "Upparbetad intäkt",
            TransactionInformation: "",
          },
          {
            Account: 2450,
            Debit: 0,
            Credit: 15000,
            CostCenter: "",
            Project: "100",
            Description: "Överfakturering",
            TransactionInformation: "",
          },
        ],
      }),
    ]

    const { balanceSheet } = vouchersToGLTransactions(vouchers)
    expect(balanceSheet.account1620Balance).toBe(25000)
    expect(balanceSheet.account2450Balance).toBe(-15000)
  })

  it("filters vouchers by reportDate", () => {
    const vouchers = [
      makeVoucher({
        TransactionDate: "2025-06-15",
        VoucherRows: [
          {
            Account: 3001,
            Debit: 0,
            Credit: 1000,
            CostCenter: "",
            Project: "100",
            Description: "",
            TransactionInformation: "",
          },
        ],
      }),
      makeVoucher({
        TransactionDate: "2025-12-31",
        VoucherNumber: 2,
        VoucherRows: [
          {
            Account: 3001,
            Debit: 0,
            Credit: 2000,
            CostCenter: "",
            Project: "100",
            Description: "",
            TransactionInformation: "",
          },
        ],
      }),
    ]

    const { transactions } = vouchersToGLTransactions(vouchers, "2025-09-30")
    expect(transactions).toHaveLength(1)
    expect(transactions[0].credit).toBe(1000)
  })

  it("handles all relevant cost accounts", () => {
    const accounts = [4000, 4415, 4425, 4600, 5410, 5460, 2893]
    const voucher = makeVoucher({
      VoucherRows: accounts.map((account, i) => ({
        Account: account,
        Debit: (i + 1) * 100,
        Credit: 0,
        CostCenter: "",
        Project: "100",
        Description: `Account ${account}`,
        TransactionInformation: "",
      })),
    })

    const { transactions } = vouchersToGLTransactions([voucher])
    expect(transactions).toHaveLength(accounts.length)
  })

  it("handles material account range 2890-2897", () => {
    const voucher = makeVoucher({
      VoucherRows: [
        {
          Account: 2890,
          Debit: 100,
          Credit: 0,
          CostCenter: "",
          Project: "",
          Description: "",
          TransactionInformation: "",
        },
        {
          Account: 2897,
          Debit: 200,
          Credit: 0,
          CostCenter: "",
          Project: "",
          Description: "",
          TransactionInformation: "",
        },
        {
          Account: 2899,
          Debit: 300,
          Credit: 0,
          CostCenter: "",
          Project: "",
          Description: "",
          TransactionInformation: "",
        },
      ],
    })

    const { transactions } = vouchersToGLTransactions([voucher])
    expect(transactions).toHaveLength(2) // 2890 and 2897 included, 2899 excluded
  })
})

// ─── projectsToEstimates ───

describe("projectsToEstimates", () => {
  it("converts Fortnox projects to estimates", () => {
    const projects = [makeProject({ ProjectNumber: "100", Description: "Bygge A" })]
    const estimates = projectsToEstimates(projects)
    expect(estimates).toHaveLength(1)
    expect(estimates[0]).toMatchObject({
      projectNr: "100",
      projectName: "Bygge A",
      contractType: null,
      contractValue: null,
      budgetedCost: null,
      budgetedProfit: null,
    })
  })

  it("excludes completed projects", () => {
    const projects = [
      makeProject({ ProjectNumber: "100", Status: "ONGOING" }),
      makeProject({ ProjectNumber: "101", Status: "COMPLETED" }),
      makeProject({ ProjectNumber: "102", Status: "NOTSTARTED" }),
    ]
    const estimates = projectsToEstimates(projects)
    expect(estimates).toHaveLength(2)
    expect(estimates.map((e) => e.projectNr)).toEqual(["100", "102"])
  })

  it("merges metadata from local DB", () => {
    const projects = [makeProject({ ProjectNumber: "100" })]
    const metadata = new Map([
      [
        "100",
        {
          contractType: "fixed" as const,
          contractValue: 500000,
          budgetedCost: 350000,
          budgetedProfit: 150000,
        },
      ],
    ])

    const estimates = projectsToEstimates(projects, metadata)
    expect(estimates[0]).toMatchObject({
      contractType: "fixed",
      contractValue: 500000,
      budgetedCost: 350000,
      budgetedProfit: 150000,
    })
  })

  it("ignores invalid contract types in metadata", () => {
    const projects = [makeProject()]
    const metadata = new Map([
      [
        "100",
        {
          contractType: "unknown" as string,
          contractValue: null,
          budgetedCost: null,
          budgetedProfit: null,
        },
      ],
    ])

    const estimates = projectsToEstimates(projects, metadata as never)
    expect(estimates[0].contractType).toBeNull()
  })

  it("handles projects without metadata", () => {
    const projects = [makeProject({ ProjectNumber: "100" })]
    const metadata = new Map([
      [
        "999",
        {
          contractType: "tm" as const,
          contractValue: null,
          budgetedCost: null,
          budgetedProfit: null,
        },
      ],
    ])

    const estimates = projectsToEstimates(projects, metadata)
    expect(estimates[0].contractType).toBeNull()
    expect(estimates[0].contractValue).toBeNull()
  })
})

// ─── parseSIE4 ───

describe("parseSIE4", () => {
  const simpleSIE = `#FLAGGA 0
#PROGRAM "Fortnox"
#FORMAT PC8
#GEN 20251231
#SIETYP 4
#FNAMN "Testföretag AB"
#RAR 0 20250101 20251231
#KONTO 3001 "Intäkter"
#KONTO 4000 "Material"
#KONTO 1620 "Upparbetad intäkt"

#VER "A" "1" 20250615 "Materialinköp"
{
#TRANS 4000 {6 "100"} 15000.00 20250615 "Trä och virke"
#TRANS 1910 {} -15000.00 20250615 "Bank"
}

#VER "A" "2" 20250815 "Fakturering"
{
#TRANS 3001 {6 "100"} -50000.00 20250815 "Projektintäkt"
#TRANS 1510 {} 50000.00 20250815 "Kundfordran"
}

#VER "B" "1" 20251231 "Periodisering"
{
#TRANS 1620 {6 "100"} 25000.00 20251231 "Upparbetad ej fakturerad"
#TRANS 3001 {6 "100"} -25000.00 20251231 "Upparbetad intäkt"
}
`

  it("parses vouchers and extracts relevant transactions", () => {
    const { transactions } = parseSIE4(simpleSIE)
    // 4000 (material), 3001 x2 (revenue), 1620 (balance sheet) — not 1910, 1510
    expect(transactions).toHaveLength(4)
  })

  it("builds correct voucherNr from series and number", () => {
    const { transactions } = parseSIE4(simpleSIE)
    expect(transactions[0].voucherNr).toBe("A-1")
    expect(transactions[1].voucherNr).toBe("A-2")
    expect(transactions[2].voucherNr).toBe("B-1")
  })

  it("parses project number from dimension 6", () => {
    const { transactions } = parseSIE4(simpleSIE)
    expect(transactions[0].projectNr).toBe("100")
  })

  it("formats dates as YYYY-MM-DD", () => {
    const { transactions } = parseSIE4(simpleSIE)
    expect(transactions[0].date).toBe("2025-06-15")
    expect(transactions[1].date).toBe("2025-08-15")
  })

  it("splits amounts into debit/credit", () => {
    const { transactions } = parseSIE4(simpleSIE)
    // 4000 with amount 15000 → debit
    const material = transactions.find((t) => t.account === "4000")!
    expect(material.debit).toBe(15000)
    expect(material.credit).toBe(0)

    // 3001 with amount -50000 → credit
    const revenue = transactions.find(
      (t) => t.account === "3001" && t.voucherNr === "A-2"
    )!
    expect(revenue.debit).toBe(0)
    expect(revenue.credit).toBe(50000)
  })

  it("tracks 1620 balance including opening balances", () => {
    const sieWithIB = `#IB 0 1620 10000.00
#IB 0 2450 -5000.00

#VER "B" "1" 20251231 "Periodisering"
{
#TRANS 1620 {} 25000.00 20251231 "Upparbetad"
}
`
    const { balanceSheet } = parseSIE4(sieWithIB)
    expect(balanceSheet.account1620Balance).toBe(35000) // 10000 + 25000
    expect(balanceSheet.account2450Balance).toBe(-5000) // opening only
  })

  it("filters by reportDate", () => {
    const { transactions } = parseSIE4(simpleSIE, "2025-07-01")
    // Only the A-1 voucher (2025-06-15) should be included
    expect(transactions).toHaveLength(1)
    expect(transactions[0].voucherNr).toBe("A-1")
  })

  it("parses cost center from dimension 1", () => {
    const sieWithCC = `#VER "A" "1" 20250101 "Test"
{
#TRANS 4000 {1 "CC1" 6 "200"} 5000.00 20250101 "Material"
}
`
    const { transactions } = parseSIE4(sieWithCC)
    expect(transactions[0].costCenter).toBe("CC1")
    expect(transactions[0].projectNr).toBe("200")
  })

  it("handles empty SIE content", () => {
    const result = parseSIE4("")
    expect(result.transactions).toEqual([])
    expect(result.balanceSheet).toEqual({
      account1620Balance: 0,
      account2450Balance: 0,
    })
  })

  it("handles #VER with closing brace correctly", () => {
    const sie = `#VER "A" "5" 20250301 "Inköp"
{
#TRANS 4000 {6 "100"} 1000.00 20250301 ""
}
#VER "A" "6" 20250401 "Inköp 2"
{
#TRANS 4000 {6 "101"} 2000.00 20250401 ""
}
`
    const { transactions } = parseSIE4(sie)
    expect(transactions).toHaveLength(2)
    expect(transactions[0].projectNr).toBe("100")
    expect(transactions[1].projectNr).toBe("101")
  })
})
