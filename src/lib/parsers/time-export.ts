import Papa from "papaparse"
import type { TimeEntry } from "@/lib/types"
import { parseSwedishNumber, parseDate, isOnOrBefore } from "@/lib/format"

/** Internal/admin project numbers to exclude */
const EXCLUDED_PROJECTS = new Set(["20", "21"])

/**
 * Detect the delimiter used in a CSV file by probing the first non-empty line.
 * Fortnox exports typically use semicolons, but may also use commas.
 */
function detectDelimiter(content: string): string {
  const firstLine = content.split(/\r?\n/).find((l) => l.trim().length > 0) ?? ""
  const semicolons = (firstLine.match(/;/g) ?? []).length
  const commas = (firstLine.match(/,/g) ?? []).length
  return semicolons >= commas ? ";" : ","
}

/**
 * Parse a Fortnox Time Export CSV file (UTF-8 BOM, semicolon or comma-delimited).
 *
 * @param fileContent - Raw CSV string content
 * @param reportDate - YYYY-MM-DD cutoff date
 * @returns Array of parsed time entries (filtered and cleaned)
 */
export function parseTimeExport(
  fileContent: string,
  reportDate: string
): TimeEntry[] {
  const delimiter = detectDelimiter(fileContent)

  const result = Papa.parse(fileContent, {
    header: true,
    delimiter,
    skipEmptyLines: true,
  }) as Papa.ParseResult<Record<string, string>>

  const entries: TimeEntry[] = []

  for (const row of result.data) {
    const rawDate = row["Datum"]
    if (!rawDate) continue

    const date = parseDate(rawDate)
    const projectNr = (row["ProjektNr"] ?? "").trim()

    // Skip rows without a project or excluded internal projects
    if (!projectNr || EXCLUDED_PROJECTS.has(projectNr)) continue

    // Apply report date cutoff
    if (!isOnOrBefore(date, reportDate)) continue

    entries.push({
      date,
      projectNr,
      projectName: (row["Projekt"] ?? "").trim(),
      cost: parseSwedishNumber(row["Kostnad"]),
      hours: parseSwedishNumber(row["Arb. h"] ?? row["Arb.h"] ?? row["Arb h"]),
      billableHours: parseSwedishNumber(
        row["Deb. h"] ?? row["Deb.h"] ?? row["Deb h"]
      ),
      user: (row["Användare"] ?? row["Anvandare"] ?? "").trim(),
    })
  }

  return entries
}

/**
 * Aggregate time entries into labor cost per project.
 * @returns Map of projectNr → total labor cost
 */
export function aggregateLaborCosts(
  entries: TimeEntry[]
): Map<string, number> {
  const costs = new Map<string, number>()

  for (const entry of entries) {
    const current = costs.get(entry.projectNr) ?? 0
    costs.set(entry.projectNr, current + entry.cost)
  }

  return costs
}

/**
 * Collect project names from time entries.
 * @returns Map of projectNr → projectName (last seen name wins)
 */
export function collectProjectNames(
  entries: TimeEntry[]
): Map<string, string> {
  const names = new Map<string, string>()

  for (const entry of entries) {
    if (entry.projectName) {
      names.set(entry.projectNr, entry.projectName)
    }
  }

  return names
}
