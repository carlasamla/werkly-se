import * as XLSX from "xlsx"
import type { ProjectEstimate, ContractType } from "@/lib/types"

const SHEET_NAME = "Projektfil Rader"

/**
 * Parse the project estimate Excel file.
 *
 * Sheet name: "Projektfil Rader"
 * Columns: Projekt nr, Projektnamn, Fast/löpande, Kund, Anbudssumma, Projektkostnader, Beräknad vinst/förlust
 *
 * @param fileBuffer - ArrayBuffer of the .xlsx file
 * @returns Array of project estimates (may contain duplicate projectNr for dual-row projects)
 */
export function parseProjectEstimates(
  fileBuffer: ArrayBuffer
): ProjectEstimate[] {
  const workbook = XLSX.read(fileBuffer, { type: "array" })

  // Try exact sheet name, then case-insensitive match
  let sheetName: string | undefined = workbook.SheetNames.find((n) => n === SHEET_NAME)
  if (!sheetName) {
    sheetName = workbook.SheetNames.find(
      (n) => n.toLowerCase() === SHEET_NAME.toLowerCase()
    )
  }
  if (!sheetName) {
    // Fallback: first sheet
    sheetName = workbook.SheetNames[0]
  }

  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  })

  const estimates: ProjectEstimate[] = []

  for (const row of rows) {
    const projectNr = normalizeProjectNr(row)
    if (!projectNr) continue

    const contractTypeRaw = findColumn(row, [
      "Fast/löpande",
      "Fast/lopande",
      "Fast/Löpande",
      "Typ",
      "Type",
    ])

    estimates.push({
      projectNr,
      projectName: String(
        findColumn(row, ["Projektnamn", "Projekt namn", "Projekt"]) ?? ""
      ).trim(),
      contractType: parseContractType(String(contractTypeRaw ?? "")),
      customer: String(findColumn(row, ["Kund", "Customer"]) ?? "").trim(),
      contractValue: parseNumericColumn(
        findColumn(row, ["Anbudssumma", "Anbuds summa", "Kontraktsvärde"])
      ),
      budgetedCost: parseNumericColumn(
        findColumn(row, ["Projektkostnader", "Projekt kostnader", "Budgeterad kostnad"])
      ),
      budgetedProfit: parseNumericColumn(
        findColumn(row, [
          "Beräknad vinst/förlust",
          "Beräknad vinst",
          "Vinst/Förlust",
        ])
      ),
    })
  }

  return estimates
}

function normalizeProjectNr(row: Record<string, unknown>): string | null {
  const val = findColumn(row, ["Projekt nr", "ProjektNr", "Projektnr", "Projekt"])
  if (val == null || val === "") return null
  return String(val).trim().replace(/\.0$/, "") // Handle Excel storing numbers as "123.0"
}

function parseContractType(value: string): ContractType | null {
  const lower = value.toLowerCase().trim()
  if (lower.includes("fast")) return "fixed"
  if (lower.includes("löpande") || lower.includes("lopande") || lower.includes("t&m"))
    return "tm"
  return null
}

function parseNumericColumn(value: unknown): number | null {
  if (value == null || value === "") return null
  if (typeof value === "number") return value
  const str = String(value)
    .replace(/\u00a0/g, "")
    .replace(/ /g, "")
    .replace(",", ".")
    .trim()
  const num = parseFloat(str)
  return isNaN(num) ? null : num
}

/**
 * Try multiple possible column names (to handle variations in Excel headers).
 */
function findColumn(
  row: Record<string, unknown>,
  candidates: string[]
): unknown {
  for (const c of candidates) {
    if (c in row) return row[c]
  }
  // Case-insensitive fallback
  const keys = Object.keys(row)
  for (const c of candidates) {
    const match = keys.find((k) => k.toLowerCase().trim() === c.toLowerCase().trim())
    if (match) return row[match]
  }
  return null
}

/**
 * Group estimates by project number.
 * A project can have two rows: one fixed-price and one T&M (ÄTA).
 */
export function groupEstimatesByProject(
  estimates: ProjectEstimate[]
): Map<string, ProjectEstimate[]> {
  const map = new Map<string, ProjectEstimate[]>()
  for (const est of estimates) {
    const existing = map.get(est.projectNr) ?? []
    existing.push(est)
    map.set(est.projectNr, existing)
  }
  return map
}
