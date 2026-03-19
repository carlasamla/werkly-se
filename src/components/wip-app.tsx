"use client"

import { useState, useCallback, useEffect } from "react"
import { ClarificationPanel } from "@/components/clarification-panel"
import { WipReportView } from "@/components/wip-report-view"
import { DataSourceSelector } from "@/components/data-source-selector"
import { GuidedUpload } from "@/components/guided-upload"
import { PeriodSelector } from "@/components/period-selector"
import { ProjectSettings, type ProjectMeta } from "@/components/project-settings"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { IconLoader2 } from "@tabler/icons-react"

import type {
  WipResult,
  ReconciliationRow,
  JournalEntry,
  ClarificationIssue,
  BalanceSheetData,
  ProjectData,
  ContractType,
  TimeEntry,
  GLTransaction,
  ProjectEstimate,
} from "@/lib/types"

import { mergeProjectData, calculateAllWip } from "@/lib/calculations"
import {
  computeReconciliation,
  generateJournalEntries,
} from "@/lib/reconciliation"
import { exportToExcel } from "@/lib/export-excel"

type Step = "choose" | "configure-api" | "upload" | "projects" | "clarify" | "report"

export function WipApp() {
  // Step
  const [step, setStep] = useState<Step>("choose")
  const [dataMode, setDataMode] = useState<"api" | "upload" | null>(null)

  // Period
  const [reportDate, setReportDate] = useState(
    new Date().toISOString().slice(0, 10)
  )
  const [financialYears, setFinancialYears] = useState<
    { Id: number; FromDate: string; ToDate: string }[]
  >([])
  const [selectedYear, setSelectedYear] = useState("")

  // Project metadata
  const [projectMetas, setProjectMetas] = useState<ProjectMeta[]>([])

  // Processing state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Intermediate data (between parse and calculate)
  const [projects, setProjects] = useState<Map<string, ProjectData> | null>(
    null
  )
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetData | null>(
    null
  )
  const [clarifications, setClarifications] = useState<ClarificationIssue[]>(
    []
  )

  // Report results
  const [results, setResults] = useState<WipResult[]>([])
  const [reconciliation, setReconciliation] = useState<ReconciliationRow[]>([])
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])

  // ───── Fetch financial years on mount ─────
  useEffect(() => {
    fetch("/api/fortnox/financial-years")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.financialYears) {
          setFinancialYears(data.financialYears)
          if (data.financialYears.length > 0) {
            const latest = data.financialYears[data.financialYears.length - 1]
            setSelectedYear(String(latest.Id))
          }
        }
      })
      .catch(() => {
        // Not connected or no data — that's fine, upload mode still works
      })
  }, [])

  // ───── Helpers ─────
  const currentYearDates = financialYears.find(
    (fy) => String(fy.Id) === selectedYear
  )
  const financialYearStart = currentYearDates?.FromDate ?? reportDate.slice(0, 4) + "-01-01"

  // ───── Mode selection ─────
  const handleSelectAPI = useCallback(() => {
    setDataMode("api")
    setStep("configure-api")
  }, [])

  const handleSelectUpload = useCallback(() => {
    setDataMode("upload")
    setStep("upload")
  }, [])

  // ───── API mode: fetch data from Fortnox ─────
  const handleFetchFromAPI = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch SIE data (GL transactions)
      const sieRes = await fetch(
        `/api/fortnox/sie?financialYear=${selectedYear}&reportDate=${reportDate}`
      )
      if (!sieRes.ok) throw new Error("Kunde inte hämta huvudboksdata")
      const sieData = await sieRes.json()

      // Fetch projects
      const projRes = await fetch("/api/fortnox/projects")
      if (!projRes.ok) throw new Error("Kunde inte hämta projektdata")
      const projData = await projRes.json()

      setProjectMetas(projData.projects)

      // Convert API projects to estimates (with metadata from DB)
      const estimates: ProjectEstimate[] = projData.projects.map(
        (p: ProjectMeta) => ({
          projectNr: p.projectNr,
          projectName: p.name,
          contractType: p.contractType === "fixed" || p.contractType === "tm" ? p.contractType : null,
          customer: "",
          contractValue: p.contractValue,
          budgetedCost: p.budgetedCost,
          budgetedProfit: p.budgetedProfit,
        })
      )

      // We use GL transactions directly — time entries are included in the GL as labor costs
      // For API mode, we pass empty time entries since costs come from vouchers
      const timeEntries: TimeEntry[] = []

      processData(timeEntries, sieData.transactions, sieData.balanceSheet, estimates)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Okänt fel")
    } finally {
      setLoading(false)
    }
  }, [selectedYear, reportDate])

  // ───── Upload mode: receive parsed data from GuidedUpload ─────
  const handleUploadComplete = useCallback(
    (data: {
      timeEntries: TimeEntry[]
      glTransactions: GLTransaction[]
      balanceSheet: BalanceSheetData
      estimates: ProjectEstimate[]
    }) => {
      processData(data.timeEntries, data.glTransactions, data.balanceSheet, data.estimates)
    },
    []
  )

  // ───── Common processing pipeline ─────
  const processData = (
    timeEntries: TimeEntry[],
    glTransactions: GLTransaction[],
    bs: BalanceSheetData,
    estimates: ProjectEstimate[]
  ) => {
    try {
      setBalanceSheet(bs)

      const { projects: mergedProjects, clarifications: initialClarifications } =
        mergeProjectData(timeEntries, glTransactions, estimates)

      setProjects(mergedProjects)

      const { results: initialResults, clarifications: calcClarifications } =
        calculateAllWip(mergedProjects)

      const allClarifications = [
        ...initialClarifications,
        ...calcClarifications,
      ]

      if (allClarifications.length > 0) {
        setClarifications(allClarifications)
        setStep("clarify")
      } else {
        finishReport(mergedProjects, bs, initialResults)
      }
    } catch (err) {
      setError(
        `Fel vid beräkning: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  // --- Apply clarification resolutions and recalculate ---
  const handleClarificationsResolved = useCallback(
    (resolved: ClarificationIssue[]) => {
      if (!projects || !balanceSheet) return

      // Build resolved types map from user responses
      const resolvedTypes = new Map<string, ContractType>()
      const updatedProjects = new Map(projects)

      for (const issue of resolved) {
        if (
          (issue.kind === "missing_type" || issue.kind === "unknown_project") &&
          issue.resolution
        ) {
          if (issue.resolution === "exclude") {
            updatedProjects.delete(issue.projectNr)
          } else {
            resolvedTypes.set(
              issue.projectNr,
              issue.resolution as ContractType
            )
          }
        }

        if (
          issue.kind === "missing_contract_value" &&
          issue.resolution
        ) {
          const proj = updatedProjects.get(issue.projectNr)
          if (proj) {
            updatedProjects.set(issue.projectNr, {
              ...proj,
              contractValue: parseFloat(issue.resolution),
            })
          }
        }

        if (issue.kind === "missing_budget_cost" && issue.resolution) {
          const proj = updatedProjects.get(issue.projectNr)
          if (proj) {
            updatedProjects.set(issue.projectNr, {
              ...proj,
              budgetedCost: parseFloat(issue.resolution),
            })
          }
        }

        if (issue.kind === "completion_over_100" && issue.resolution) {
          const revised = parseFloat(issue.resolution)
          if (!isNaN(revised) && revised > 0) {
            const proj = updatedProjects.get(issue.projectNr)
            if (proj) {
              updatedProjects.set(issue.projectNr, {
                ...proj,
                budgetedCost: revised,
              })
            }
          }
        }
      }

      // Recalculate
      const { results: finalResults } = calculateAllWip(
        updatedProjects,
        resolvedTypes
      )
      finishReport(updatedProjects, balanceSheet, finalResults)
    },
    [projects, balanceSheet]
  )

  const handleSkipClarifications = useCallback(() => {
    if (!projects || !balanceSheet) return
    const { results: finalResults } = calculateAllWip(projects)
    finishReport(projects, balanceSheet, finalResults)
  }, [projects, balanceSheet])

  const finishReport = (
    projects: Map<string, ProjectData>,
    bs: BalanceSheetData,
    wipResults: WipResult[]
  ) => {
    const recon = computeReconciliation(wipResults, bs)
    const entries = generateJournalEntries(recon, wipResults)

    setResults(wipResults)
    setReconciliation(recon)
    setJournalEntries(entries)
    setStep("report")
  }

  const handleExport = () => {
    exportToExcel(reportDate, results, reconciliation, journalEntries)
  }

  const handleReset = () => {
    setStep("choose")
    setDataMode(null)
    setError(null)
    setProjects(null)
    setBalanceSheet(null)
    setClarifications([])
    setResults([])
    setReconciliation([])
    setJournalEntries([])
  }

  // ───── Project metadata save handler ─────
  const handleProjectSave = useCallback(
    async (projectNr: string, data: Partial<ProjectMeta>) => {
      await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fortnoxProjectNr: projectNr, ...data }),
      })
    },
    []
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <p className="text-sm text-muted-foreground">
          PUA-rapport — Pågående arbeten (K2 successiv vinstavräkning)
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Step: Choose data source */}
      {step === "choose" && (
        <div className="space-y-6">
          <PeriodSelector
            financialYears={financialYears}
            selectedYear={selectedYear}
            reportDate={reportDate}
            onYearChange={setSelectedYear}
            onReportDateChange={setReportDate}
          />
          <Card>
            <CardHeader>
              <CardTitle>Datakälla</CardTitle>
            </CardHeader>
            <CardContent>
              <DataSourceSelector
                onSelectAPI={handleSelectAPI}
                onSelectUpload={handleSelectUpload}
                hasFortnoxConnection={financialYears.length > 0}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step: Configure API + fetch */}
      {step === "configure-api" && (
        <div className="space-y-6">
          <PeriodSelector
            financialYears={financialYears}
            selectedYear={selectedYear}
            reportDate={reportDate}
            onYearChange={setSelectedYear}
            onReportDateChange={setReportDate}
          />

          {projectMetas.length > 0 ? (
            <ProjectSettings
              projects={projectMetas}
              onSave={handleProjectSave}
              onDone={handleFetchFromAPI}
            />
          ) : (
            <div className="flex justify-end">
              <Button
                size="lg"
                onClick={handleFetchFromAPI}
                disabled={loading || !selectedYear}
              >
                {loading ? (
                  <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Hämta data och beräkna
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Step: Guided file upload */}
      {step === "upload" && (
        <GuidedUpload
          reportDate={reportDate}
          financialYearStart={financialYearStart}
          onComplete={handleUploadComplete}
          onBack={handleReset}
        />
      )}

      {/* Step: Clarifications */}
      {step === "clarify" && (
        <div className="space-y-6">
          <Button variant="ghost" onClick={() => setStep(dataMode === "api" ? "configure-api" : "upload")}>
            ← Tillbaka
          </Button>
          <ClarificationPanel
            issues={clarifications}
            onResolve={handleClarificationsResolved}
            onSkip={handleSkipClarifications}
          />
        </div>
      )}

      {/* Step: Report */}
      {step === "report" && (
        <WipReportView
          reportDate={reportDate}
          results={results}
          reconciliation={reconciliation}
          journalEntries={journalEntries}
          onExport={handleExport}
          onReset={handleReset}
        />
      )}
    </div>
  )
}
