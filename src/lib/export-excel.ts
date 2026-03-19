import * as XLSX from "xlsx"
import type { WipResult, ReconciliationRow, JournalEntry } from "@/lib/types"

/** Apply column widths to a worksheet. `widths` is an array of character widths. */
function setCols(ws: XLSX.WorkSheet, widths: number[]) {
  ws["!cols"] = widths.map((w) => ({ wch: w }))
}

/** Add AutoFilter to the first row of a worksheet given its range. */
function setAutoFilter(ws: XLSX.WorkSheet) {
  const ref = ws["!ref"]
  if (!ref) return
  const range = XLSX.utils.decode_range(ref)
  // AutoFilter covers only the header row (row 0)
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: range.s.c }, e: { r: 0, c: range.e.c } }) }
}

/**
 * Export the full WIP report to an Excel file and trigger download.
 */
export function exportToExcel(
  reportDate: string,
  results: WipResult[],
  reconciliation: ReconciliationRow[],
  journalEntries: JournalEntry[]
) {
  const wb = XLSX.utils.book_new()

  // --- Sheet 1: WIP Summary ---
  const wipData = results.map((r) => ({
    "Proj #": r.projectNr,
    Projektnamn: r.projectName,
    Kund: r.customer,
    Typ: r.isDualScope ? "Fast + ÄTA" : r.contractType === "fixed" ? "Fast pris" : "Löpande",
    "Nedlagd kostnad": r.incurredCost,
    "varav Arbete": r.costs.labor,
    "varav Material": r.costs.material,
    "varav UE": r.costs.subcontractor,
    "Fakturerad intäkt": r.revenueInvoiced,
    "Upparbetad intäkt": r.earnedRevenue ?? "",
    "WIP tillgång (1620)": r.wipAsset1620 || "",
    "Överfakturering (2450)": r.overBilling2450 || "",
    "Färdigställandegrad": r.completionPct != null ? r.completionPct : "",
    "Anbudssumma": r.contractValue ?? "",
    "Budgeterad kostnad": r.budgetedCost ?? "",
    "Förlustavsättning": r.lossProvision || "",
    Status: formatStatus(r.status),
  }))
  const ws1 = XLSX.utils.json_to_sheet(wipData)

  // Format percentage column (column M, index 12) as percentage
  const range1 = XLSX.utils.decode_range(ws1["!ref"] ?? "A1")
  for (let row = range1.s.r + 1; row <= range1.e.r; row++) {
    const cell = ws1[XLSX.utils.encode_cell({ r: row, c: 12 })]
    if (cell && typeof cell.v === "number") {
      cell.t = "n"
      cell.z = "0%"
    }
    // Format numeric currency columns (E–L, indexes 4–11) and N–P (13–15)
    for (const col of [4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15]) {
      const c = ws1[XLSX.utils.encode_cell({ r: row, c: col })]
      if (c && typeof c.v === "number") {
        c.t = "n"
        c.z = '#,##0 "kr"'
      }
    }
  }

  setCols(ws1, [8, 30, 22, 12, 14, 12, 12, 12, 14, 14, 14, 16, 14, 14, 16, 14, 14])
  setAutoFilter(ws1)
  XLSX.utils.book_append_sheet(wb, ws1, "PUA-sammanställning")

  // --- Sheet 2: Reconciliation ---
  const reconData = reconciliation.map((r) => ({
    Konto: r.account,
    Beskrivning: r.description,
    "Beräknat belopp": r.calculated,
    "Aktuellt saldo i HB": r.currentGLBalance,
    Differens: r.difference,
    Åtgärd: r.action,
  }))
  const ws2 = XLSX.utils.json_to_sheet(reconData)
  const range2 = XLSX.utils.decode_range(ws2["!ref"] ?? "A1")
  for (let row = range2.s.r + 1; row <= range2.e.r; row++) {
    for (const col of [2, 3, 4]) {
      const c = ws2[XLSX.utils.encode_cell({ r: row, c: col })]
      if (c && typeof c.v === "number") {
        c.t = "n"
        c.z = '#,##0 "kr"'
      }
    }
  }
  setCols(ws2, [8, 36, 16, 18, 12, 24])
  XLSX.utils.book_append_sheet(wb, ws2, "Avstämning")

  // --- Sheet 3: Journal Entries ---
  const jeData: Record<string, string | number>[] = []
  for (const entry of journalEntries) {
    jeData.push({ Beskrivning: entry.description, Konto: "", Debet: "", Kredit: "" })
    for (const line of entry.lines) {
      jeData.push({
        Beskrivning: line.description,
        Konto: line.debitAccount ?? line.creditAccount ?? "",
        Debet: line.debitAccount ? line.amount : "",
        Kredit: line.creditAccount ? line.amount : "",
      })
    }
    jeData.push({ Beskrivning: "", Konto: "", Debet: "", Kredit: "" })
  }
  const ws3 = XLSX.utils.json_to_sheet(jeData)
  const range3 = XLSX.utils.decode_range(ws3["!ref"] ?? "A1")
  for (let row = range3.s.r + 1; row <= range3.e.r; row++) {
    for (const col of [2, 3]) {
      const c = ws3[XLSX.utils.encode_cell({ r: row, c: col })]
      if (c && typeof c.v === "number") {
        c.t = "n"
        c.z = '#,##0 "kr"'
      }
    }
  }
  setCols(ws3, [40, 8, 14, 14])
  XLSX.utils.book_append_sheet(wb, ws3, "Bokföringsorder")

  // Trigger download
  const fileName = `PUA-rapport_${reportDate}.xlsx`
  XLSX.writeFile(wb, fileName)
}

function formatStatus(status: WipResult["status"]): string {
  switch (status) {
    case "Loss":
      return "Förlust"
    case "Over-billed":
      return "Överfakturerad"
    case "Warning":
      return "Varning"
    case "OK":
      return "OK"
  }
}
