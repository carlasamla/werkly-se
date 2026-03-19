import type {
  WipResult,
  BalanceSheetData,
  ReconciliationRow,
  JournalEntry,
  JournalEntryLine,
} from "@/lib/types"

/**
 * Compute the balance sheet reconciliation:
 * compare calculated totals for 1620/2450 vs. current GL balances.
 */
export function computeReconciliation(
  results: WipResult[],
  balanceSheet: BalanceSheetData
): ReconciliationRow[] {
  const total1620 = results.reduce((sum, r) => sum + r.wipAsset1620, 0)
  const total2450 = results.reduce((sum, r) => sum + r.overBilling2450, 0)

  const diff1620 = total1620 - balanceSheet.account1620Balance
  const diff2450 = total2450 - balanceSheet.account2450Balance

  return [
    {
      account: "1620",
      description: "Upparbetad men ej fakturerad intäkt",
      calculated: total1620,
      currentGLBalance: balanceSheet.account1620Balance,
      difference: diff1620,
      action:
        diff1620 !== 0
          ? "Bokföringsorder krävs"
          : "Inget behov av justering",
    },
    {
      account: "2450",
      description: "Fakturerad men ej upparbetad intäkt",
      calculated: total2450,
      currentGLBalance: balanceSheet.account2450Balance,
      difference: diff2450,
      action:
        diff2450 !== 0
          ? "Bokföringsorder krävs"
          : "Inget behov av justering",
    },
  ]
}

/**
 * Generate proposed journal entries based on reconciliation differences.
 */
export function generateJournalEntries(
  reconciliation: ReconciliationRow[],
  results: WipResult[]
): JournalEntry[] {
  const entries: JournalEntry[] = []

  const row1620 = reconciliation.find((r) => r.account === "1620")
  const row2450 = reconciliation.find((r) => r.account === "2450")

  // --- WIP asset adjustment (1620 ↔ 3081) ---
  if (row1620 && row1620.difference !== 0) {
    const diff = row1620.difference
    const lines: JournalEntryLine[] = []

    if (diff > 0) {
      // Need to increase 1620 (asset) → Debit 1620, Credit 3081
      lines.push({
        debitAccount: "1620",
        creditAccount: null,
        amount: diff,
        description: "Upparbetad men ej fakturerad intäkt",
      })
      lines.push({
        debitAccount: null,
        creditAccount: "3081",
        amount: diff,
        description: "Upparbetad intäkt (periodisering)",
      })
    } else {
      // Need to decrease 1620 → Debit 3081, Credit 1620
      lines.push({
        debitAccount: "3081",
        creditAccount: null,
        amount: Math.abs(diff),
        description: "Återföring upparbetad intäkt",
      })
      lines.push({
        debitAccount: null,
        creditAccount: "1620",
        amount: Math.abs(diff),
        description: "Upparbetad men ej fakturerad intäkt",
      })
    }

    entries.push({
      description:
        diff > 0
          ? "Periodisering: ökning av upparbetad ej fakturerad intäkt"
          : "Periodisering: minskning av upparbetad ej fakturerad intäkt",
      lines,
    })
  }

  // --- Over-billing adjustment (2450 ↔ 3081) ---
  if (row2450 && row2450.difference !== 0) {
    const diff = row2450.difference
    const lines: JournalEntryLine[] = []

    if (diff > 0) {
      // Need to increase 2450 (liability) → Debit 3081, Credit 2450
      lines.push({
        debitAccount: "3081",
        creditAccount: null,
        amount: diff,
        description: "Fakturerad ej upparbetad intäkt (periodisering)",
      })
      lines.push({
        debitAccount: null,
        creditAccount: "2450",
        amount: diff,
        description: "Fakturerad men ej upparbetad intäkt",
      })
    } else {
      // Need to decrease 2450 → Debit 2450, Credit 3081
      lines.push({
        debitAccount: "2450",
        creditAccount: null,
        amount: Math.abs(diff),
        description: "Fakturerad men ej upparbetad intäkt",
      })
      lines.push({
        debitAccount: null,
        creditAccount: "3081",
        amount: Math.abs(diff),
        description: "Återföring fakturerad ej upparbetad intäkt",
      })
    }

    entries.push({
      description:
        diff > 0
          ? "Periodisering: ökning av fakturerad ej upparbetad intäkt"
          : "Periodisering: minskning av fakturerad ej upparbetad intäkt",
      lines,
    })
  }

  // --- Loss provisions ---
  const lossProjects = results.filter((r) => r.isLoss && r.lossProvision > 0)
  if (lossProjects.length > 0) {
    const totalProvision = lossProjects.reduce(
      (sum, r) => sum + r.lossProvision,
      0
    )
    const lines: JournalEntryLine[] = [
      {
        debitAccount: "7290",
        creditAccount: null,
        amount: totalProvision,
        description: `Avsättning befarad förlust (${lossProjects.map((p) => p.projectNr).join(", ")})`,
      },
      {
        debitAccount: null,
        creditAccount: "2290",
        amount: totalProvision,
        description: "Avsättning för befarade förluster på pågående projekt",
      },
    ]

    entries.push({
      description: `Förlustavsättning för projekt: ${lossProjects.map((p) => `${p.projectNr} (${p.projectName})`).join(", ")}`,
      lines,
    })
  }

  return entries
}
