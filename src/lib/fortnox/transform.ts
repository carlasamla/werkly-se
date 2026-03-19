import type { FortnoxVoucher, FortnoxProject } from "./types"
import type {
  GLTransaction,
  TimeEntry,
  ProjectEstimate,
  BalanceSheetData,
} from "@/lib/types"

// ───── Account classification (same as existing GL parser) ─────

const MATERIAL_ACCOUNTS = new Set([4000, 4415, 5410, 5460])
const MATERIAL_ACCOUNT_RANGE = { start: 2890, end: 2897 }
const SUBCONTRACTOR_ACCOUNTS = new Set([4425, 4600])
const REVENUE_ACCOUNTS = new Set([3001, 3231])
const BALANCE_ACCOUNTS = new Set([1620, 2450])

function isRelevantAccount(account: number): boolean {
  return (
    MATERIAL_ACCOUNTS.has(account) ||
    (account >= MATERIAL_ACCOUNT_RANGE.start &&
      account <= MATERIAL_ACCOUNT_RANGE.end) ||
    SUBCONTRACTOR_ACCOUNTS.has(account) ||
    REVENUE_ACCOUNTS.has(account) ||
    BALANCE_ACCOUNTS.has(account)
  )
}

// ───── Vouchers → GLTransaction[] ─────

export function vouchersToGLTransactions(
  vouchers: FortnoxVoucher[],
  reportDate?: string
): { transactions: GLTransaction[]; balanceSheet: BalanceSheetData } {
  const transactions: GLTransaction[] = []
  let account1620Balance = 0
  let account2450Balance = 0

  for (const voucher of vouchers) {
    // Filter by report date if provided
    if (reportDate && voucher.TransactionDate > reportDate) continue

    for (const row of voucher.VoucherRows ?? []) {
      if (!isRelevantAccount(row.Account)) continue

      // Track balance sheet accounts
      if (row.Account === 1620) {
        account1620Balance += row.Debit - row.Credit
      } else if (row.Account === 2450) {
        account2450Balance += row.Debit - row.Credit
      }

      const txn: GLTransaction = {
        voucherNr: `${voucher.VoucherSeries}-${voucher.VoucherNumber}`,
        costCenter: row.CostCenter ?? "",
        projectNr: row.Project ?? "",
        date: voucher.TransactionDate,
        text: row.Description ?? voucher.Description ?? "",
        info: row.TransactionInformation ?? "",
        debit: row.Debit ?? 0,
        credit: row.Credit ?? 0,
        balance: 0, // Not available per-row from API — computed downstream
        account: String(row.Account),
      }
      transactions.push(txn)
    }
  }

  return {
    transactions,
    balanceSheet: { account1620Balance, account2450Balance },
  }
}

// ───── Fortnox Projects → ProjectEstimate[] ─────

export function projectsToEstimates(
  fortnoxProjects: FortnoxProject[],
  projectMetadata?: Map<
    string,
    {
      contractType: string | null
      contractValue: number | null
      budgetedCost: number | null
      budgetedProfit: number | null
    }
  >
): ProjectEstimate[] {
  return fortnoxProjects
    .filter((p) => p.Status !== "COMPLETED")
    .map((p) => {
      const meta = projectMetadata?.get(p.ProjectNumber)
      const contractType =
        meta?.contractType === "fixed" || meta?.contractType === "tm"
          ? meta.contractType
          : null

      return {
        projectNr: p.ProjectNumber,
        projectName: p.Description ?? "",
        contractType,
        customer: "",
        contractValue: meta?.contractValue ?? null,
        budgetedCost: meta?.budgetedCost ?? null,
        budgetedProfit: meta?.budgetedProfit ?? null,
      }
    })
}

// ───── SIE4 parsing ─────
// SIE is a line-based Swedish accounting format.
// Key record types:
//   #VER series number date description
//     #TRANS account {} amount date description quantity
//   }

export function parseSIE4(
  sieContent: string,
  reportDate?: string
): { transactions: GLTransaction[]; balanceSheet: BalanceSheetData } {
  const transactions: GLTransaction[] = []
  let account1620Balance = 0
  let account2450Balance = 0

  const lines = sieContent.split("\n")

  let currentVoucherSeries = ""
  let currentVoucherNr = ""
  let currentVoucherDate = ""
  let currentVoucherText = ""
  let inVoucher = false

  for (const rawLine of lines) {
    const line = rawLine.trim()

    // Parse #VER series number date description
    if (line.startsWith("#VER")) {
      const match = line.match(
        /#VER\s+"?(\w*)"?\s+"?(\d+)"?\s+(\d{8})\s*"?([^"]*)"?/
      )
      if (match) {
        currentVoucherSeries = match[1]
        currentVoucherNr = match[2]
        currentVoucherDate = `${match[3].slice(0, 4)}-${match[3].slice(4, 6)}-${match[3].slice(6, 8)}`
        currentVoucherText = match[4] ?? ""
        inVoucher = true
      }
      continue
    }

    // End of voucher block
    if (line === "}" && inVoucher) {
      inVoucher = false
      continue
    }

    // Parse #TRANS account {dimensions} amount date description
    if (inVoucher && line.startsWith("#TRANS")) {
      // Filter by report date
      if (reportDate && currentVoucherDate > reportDate) continue

      const match = line.match(
        /#TRANS\s+(\d+)\s+\{([^}]*)\}\s+([-\d.]+)(?:\s+(\d{8}))?\s*"?([^"]*)"?/
      )
      if (!match) continue

      const account = parseInt(match[1], 10)
      if (!isRelevantAccount(account)) continue

      const amount = parseFloat(match[3])
      const description = match[5] ?? ""

      // Parse dimensions: {1 "CC" 6 "Project"}
      let costCenter = ""
      let projectNr = ""
      const dims = match[2].trim()
      if (dims) {
        // Dimension 1 = cost center, dimension 6 = project
        const dimPairs = dims.match(/(\d+)\s+"([^"]*)"/g)
        if (dimPairs) {
          for (const pair of dimPairs) {
            const dm = pair.match(/(\d+)\s+"([^"]*)"/)
            if (dm) {
              if (dm[1] === "1") costCenter = dm[2]
              if (dm[1] === "6") projectNr = dm[2]
            }
          }
        }
      }

      // Track balance sheet
      if (account === 1620) account1620Balance += amount
      if (account === 2450) account2450Balance += amount

      transactions.push({
        voucherNr: `${currentVoucherSeries}-${currentVoucherNr}`,
        costCenter,
        projectNr,
        date: currentVoucherDate,
        text: description || currentVoucherText,
        info: "",
        debit: amount > 0 ? amount : 0,
        credit: amount < 0 ? -amount : 0,
        balance: 0,
        account: String(account),
      })
    }

    // Parse opening balance: #IB 0 account amount
    if (line.startsWith("#IB")) {
      const match = line.match(/#IB\s+0\s+(\d+)\s+([-\d.]+)/)
      if (match) {
        const account = parseInt(match[1], 10)
        const amount = parseFloat(match[2])
        if (account === 1620) account1620Balance += amount
        if (account === 2450) account2450Balance += amount
      }
    }
  }

  return {
    transactions,
    balanceSheet: { account1620Balance, account2450Balance },
  }
}
