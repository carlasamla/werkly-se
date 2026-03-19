/** Contract type for a project line */
export type ContractType = "fixed" | "tm"

/** A project estimate row from the Excel spreadsheet */
export interface ProjectEstimate {
  projectNr: string
  projectName: string
  contractType: ContractType | null
  customer: string
  contractValue: number | null // Anbudssumma (fixed-price only)
  budgetedCost: number | null // Projektkostnader (fixed-price only)
  budgetedProfit: number | null // Beräknad vinst/förlust
}

/** Aggregated costs for a project from time export + general ledger */
export interface CostBreakdown {
  labor: number
  material: number
  subcontractor: number
}

/** Revenue data from general ledger */
export interface RevenueData {
  invoiced: number // Credit from accounts 3001 + 3231
}

/** Complete per-project data merged from all sources */
export interface ProjectData {
  projectNr: string
  projectName: string
  contractType: ContractType | null
  customer: string
  contractValue: number | null
  budgetedCost: number | null
  budgetedProfit: number | null
  costs: CostBreakdown
  revenueInvoiced: number
  /** True when the project has both a fixed-price and a T&M estimate row (ÄTA) */
  isDualScope: boolean
}

/** WIP calculation result for a single project (or sub-line) */
export interface WipResult {
  projectNr: string
  projectName: string
  contractType: ContractType
  customer: string
  incurredCost: number
  revenueInvoiced: number
  earnedRevenue: number | null // only for fixed-price
  wipAsset1620: number // positive = asset (accrued but not invoiced)
  overBilling2450: number // positive = liability (invoiced but not earned)
  completionPct: number | null // only for fixed-price
  status: "OK" | "Over-billed" | "Loss" | "Warning"
  isLoss: boolean
  lossProvision: number // amount to provision if loss contract
  contractValue: number | null
  budgetedCost: number | null
  /** Labor / material / subcontractor cost breakdown */
  costs: CostBreakdown
  /** True when project has both a fixed-price base contract and a T&M (ÄTA) row */
  isDualScope: boolean
}

/** Balance sheet account balance from GL */
export interface BalanceSheetData {
  account1620Balance: number // current GL balance for accrued revenue
  account2450Balance: number // current GL balance for deferred revenue
}

/** Reconciliation row */
export interface ReconciliationRow {
  account: string
  description: string
  calculated: number
  currentGLBalance: number
  difference: number
  action: string
}

/** Journal entry line */
export interface JournalEntryLine {
  debitAccount: string | null
  creditAccount: string | null
  amount: number
  description: string
}

/** A group of journal entry lines forming one entry */
export interface JournalEntry {
  description: string
  lines: JournalEntryLine[]
}

/** Clarification issue that needs user input */
export type ClarificationKind =
  | "missing_type"
  | "missing_contract_value"
  | "missing_budget_cost"
  | "unknown_project"
  | "unassigned_gl_transaction"
  | "completion_over_100"

export interface ClarificationIssue {
  kind: ClarificationKind
  projectNr: string
  message: string
  /** Extra data for display, e.g. amount/date/description for unassigned GL txns */
  details?: Record<string, string | number>
  /** User's resolution (filled in by UI) */
  resolution?: string | null
}

/** Parsed time entry row */
export interface TimeEntry {
  date: string // YYYY-MM-DD
  projectNr: string
  projectName: string
  cost: number // Kostnad
  hours: number // Arb. h
  billableHours: number // Deb. h
  user: string // Användare
}

/** Parsed general ledger transaction */
export interface GLTransaction {
  voucherNr: string
  costCenter: string
  projectNr: string
  date: string // YYYY-MM-DD
  text: string
  info: string
  debit: number
  credit: number
  balance: number
  account: string // the account number this belongs to
}

/** GL data aggregated per project */
export interface GLProjectData {
  materialCost: number
  subcontractorCost: number
  revenueInvoiced: number
}

/** Complete report output */
export interface WipReport {
  reportDate: string
  wipResults: WipResult[]
  reconciliation: ReconciliationRow[]
  journalEntries: JournalEntry[]
  clarifications: ClarificationIssue[]
}
