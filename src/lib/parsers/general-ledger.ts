import type { GLTransaction, GLProjectData, BalanceSheetData } from "@/lib/types"
import { parseSwedishNumber, parseDate, isOnOrBefore } from "@/lib/format"

/** Account classification for WIP calculations */
const MATERIAL_ACCOUNTS = new Set([
  "4000", "4415", "5410", "5460",
  // Fortnox company card 2890–2897
  "2890", "2891", "2892", "2893", "2894", "2895", "2896", "2897",
])

const SUBCONTRACTOR_ACCOUNTS = new Set(["4425", "4600"])

const REVENUE_ACCOUNTS = new Set(["3001", "3231"])

const BALANCE_SHEET_ACCOUNTS = new Set(["1620", "2450"])

/**
 * Parse the Fortnox General Ledger (Huvudbok) TXT file.
 *
 * Format: latin-1 encoded, tab-separated.
 * Lines under each account header. Account header lines start with the account number.
 * Transaction lines have format:
 *   [blank]\t[VoucherNr]\t[CostCenter]\t[ProjectNr]\t[Date]\t[Text]\t[Info]\t[Debit]\t[Credit]\t[Balance]
 *
 * @param fileContent - Raw text content (already decoded from latin-1)
 * @param reportDate - YYYY-MM-DD cutoff date
 */
export function parseGeneralLedger(
  fileContent: string,
  reportDate: string
): { transactions: GLTransaction[]; balanceSheet: BalanceSheetData } {
  const lines = fileContent.split(/\r?\n/)
  const transactions: GLTransaction[] = []
  let currentAccount = ""
  // Use null to distinguish 'not yet found in summary line' from a genuine 0 balance
  let found1620: number | null = null
  let found2450: number | null = null

  for (const line of lines) {
    const trimmedLine = line.trim()
    if (!trimmedLine) continue

    // Detect account header lines: starts with a 4-digit account number
    const accountHeaderMatch = trimmedLine.match(/^(\d{4})\s/)
    if (accountHeaderMatch) {
      currentAccount = accountHeaderMatch[1]
      continue
    }

    // Skip lines that aren't transaction rows (no tabs = not a data row)
    if (!line.includes("\t")) continue

    const cols = line.split("\t")

    // Transaction lines: col[0] is blank/whitespace, data in cols 1–9
    // But some formats vary. We look for the date column to identify valid rows.
    // Try to find a date-like value (YYYY-MM-DD or YYYYMMDD) in the columns.
    let dateCol = -1
    for (let i = 0; i < Math.min(cols.length, 6); i++) {
      const val = cols[i].trim()
      if (/^\d{4}-\d{2}-\d{2}$/.test(val) || /^\d{8}$/.test(val)) {
        dateCol = i
        break
      }
    }

    if (dateCol === -1) {
      // Could be a summary/balance line for the account
      // Check for balance sheet accounts - look for "Utgående balans" or similar
      const isBalanceSummary =
        trimmedLine.includes("Utgående balans") ||
        trimmedLine.includes("Utgående saldo") ||
        trimmedLine.includes("Ing balans") ||
        trimmedLine.includes("Utg. balans")
      if (isBalanceSummary) {
        const lastNum = extractLastNumber(cols)
        if (lastNum !== null) {
          if (currentAccount === "1620") found1620 = lastNum
          else if (currentAccount === "2450") found2450 = lastNum
        }
      }
      continue
    }

    // Now parse as a proper transaction line
    // Determine column layout based on where date was found.
    // Standard layout (0-indexed): [0:blank] [1:VoucherNr] [2:CostCenter] [3:ProjectNr] [4:Date] [5:Text] [6:Info] [7:Debit] [8:Credit] [9:Balance]
    // But date position might shift. We use dateCol as anchor.
    const projectColIdx = dateCol - 1
    const costCenterColIdx = dateCol - 2
    const voucherColIdx = dateCol - 3

    const rawDate = cols[dateCol]?.trim() ?? ""
    const date = parseDate(rawDate)

    // Apply date cutoff
    if (!isOnOrBefore(date, reportDate)) continue

    const projectNr = (cols[projectColIdx] ?? "").trim()
    const voucherNr = (cols[voucherColIdx >= 0 ? voucherColIdx : 0] ?? "").trim()
    const costCenter = (cols[costCenterColIdx >= 0 ? costCenterColIdx : 0] ?? "").trim()

    // Columns after date: text, info, debit, credit, balance
    const textCol = dateCol + 1
    const text = (cols[textCol] ?? "").trim()
    const info = (cols[textCol + 1] ?? "").trim()
    const debit = parseSwedishNumber(cols[textCol + 2])
    const credit = parseSwedishNumber(cols[textCol + 3])
    const balance = parseSwedishNumber(cols[textCol + 4])

    // Only keep transactions for accounts we care about
    const relevantAccounts = new Set([
      ...MATERIAL_ACCOUNTS,
      ...SUBCONTRACTOR_ACCOUNTS,
      ...REVENUE_ACCOUNTS,
      ...BALANCE_SHEET_ACCOUNTS,
    ])

    if (!relevantAccounts.has(currentAccount)) continue

    transactions.push({
      account: currentAccount,
      voucherNr,
      costCenter,
      projectNr,
      date,
      text,
      info,
      debit,
      credit,
      balance,
    })
  }

  // Fall back to summing transactions if no summary line was found in the file
  const balanceSheet: BalanceSheetData = {
    account1620Balance:
      found1620 ??
      transactions
        .filter((t) => t.account === "1620")
        .reduce((sum, t) => sum + t.debit - t.credit, 0),
    account2450Balance:
      found2450 ??
      transactions
        .filter((t) => t.account === "2450")
        .reduce((sum, t) => sum + t.debit - t.credit, 0),
  }

  return { transactions, balanceSheet }
}

/**
 * Extract the last parseable number from an array of tab-separated columns.
 */
function extractLastNumber(cols: string[]): number | null {
  for (let i = cols.length - 1; i >= 0; i--) {
    const val = cols[i].trim()
    if (val) {
      const num = parseSwedishNumber(val)
      if (num !== 0 || val.includes("0")) return num
    }
  }
  return null
}

/**
 * Aggregate GL transactions into per-project cost/revenue data.
 * @returns Map of projectNr → GLProjectData
 */
export function aggregateGLData(
  transactions: GLTransaction[]
): Map<string, GLProjectData> {
  const data = new Map<string, GLProjectData>()

  for (const txn of transactions) {
    // Skip balance sheet accounts from project aggregation
    if (BALANCE_SHEET_ACCOUNTS.has(txn.account)) continue

    const projectNr = txn.projectNr || "__UNASSIGNED__"

    if (!data.has(projectNr)) {
      data.set(projectNr, {
        materialCost: 0,
        subcontractorCost: 0,
        revenueInvoiced: 0,
      })
    }
    const proj = data.get(projectNr)!

    if (MATERIAL_ACCOUNTS.has(txn.account)) {
      proj.materialCost += txn.debit
    } else if (SUBCONTRACTOR_ACCOUNTS.has(txn.account)) {
      proj.subcontractorCost += txn.debit
    } else if (REVENUE_ACCOUNTS.has(txn.account)) {
      proj.revenueInvoiced += txn.credit
    }
  }

  return data
}

/**
 * Get GL transactions that have no project code (for clarification).
 */
export function getUnassignedTransactions(
  transactions: GLTransaction[]
): GLTransaction[] {
  return transactions.filter(
    (t) =>
      !t.projectNr &&
      !BALANCE_SHEET_ACCOUNTS.has(t.account) &&
      (t.debit > 0 || t.credit > 0)
  )
}
