"use client"

import { useState, useCallback } from "react"
import { FileUpload } from "@/components/file-upload"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  IconCheck,
  IconAlertTriangle,
  IconChevronRight,
  IconArrowLeft,
} from "@tabler/icons-react"

import { parseTimeExport } from "@/lib/parsers/time-export"
import { parseGeneralLedger } from "@/lib/parsers/general-ledger"
import { parseProjectEstimates } from "@/lib/parsers/project-estimates"
import type {
  TimeEntry,
  GLTransaction,
  ProjectEstimate,
  BalanceSheetData,
} from "@/lib/types"

interface GuidedUploadProps {
  reportDate: string
  financialYearStart: string
  onComplete: (data: {
    timeEntries: TimeEntry[]
    glTransactions: GLTransaction[]
    balanceSheet: BalanceSheetData
    estimates: ProjectEstimate[]
  }) => void
  onBack: () => void
}

interface ParseResult<T> {
  success: boolean
  data?: T
  summary?: string
  error?: string
}

export function GuidedUpload({
  reportDate,
  financialYearStart,
  onComplete,
  onBack,
}: GuidedUploadProps) {
  const [step, setStep] = useState(0)

  // Files
  const [glFile, setGLFile] = useState<File | null>(null)
  const [timeFile, setTimeFile] = useState<File | null>(null)
  const [estimateFile, setEstimateFile] = useState<File | null>(null)

  // Parse results
  const [glResult, setGLResult] = useState<
    ParseResult<{ transactions: GLTransaction[]; balanceSheet: BalanceSheetData }> | null
  >(null)
  const [timeResult, setTimeResult] = useState<
    ParseResult<TimeEntry[]> | null
  >(null)
  const [estimateResult, setEstimateResult] = useState<
    ParseResult<ProjectEstimate[]> | null
  >(null)

  const handleGLFile = useCallback(
    async (file: File | null) => {
      setGLFile(file)
      if (!file) {
        setGLResult(null)
        return
      }
      try {
        const buffer = await file.arrayBuffer()
        const content = new TextDecoder("latin1").decode(buffer)
        const { transactions, balanceSheet } = parseGeneralLedger(
          content,
          reportDate
        )
        const projectCount = new Set(
          transactions.filter((t) => t.projectNr).map((t) => t.projectNr)
        ).size
        const unassigned = transactions.filter((t) => !t.projectNr).length
        setGLResult({
          success: true,
          data: { transactions, balanceSheet },
          summary: `${transactions.length} rader, ${projectCount} projekt${unassigned > 0 ? `, ${unassigned} utan projektkod` : ""}`,
        })
      } catch (err) {
        setGLResult({
          success: false,
          error: err instanceof Error ? err.message : "Kunde inte läsa filen",
        })
      }
    },
    [reportDate]
  )

  const handleTimeFile = useCallback(
    async (file: File | null) => {
      setTimeFile(file)
      if (!file) {
        setTimeResult(null)
        return
      }
      try {
        const content = await file.text()
        const entries = parseTimeExport(content, reportDate)
        const projectCount = new Set(entries.map((e) => e.projectNr)).size
        setTimeResult({
          success: true,
          data: entries,
          summary: `${entries.length} rader, ${projectCount} projekt`,
        })
      } catch (err) {
        setTimeResult({
          success: false,
          error: err instanceof Error ? err.message : "Kunde inte läsa filen",
        })
      }
    },
    [reportDate]
  )

  const handleEstimateFile = useCallback(async (file: File | null) => {
    setEstimateFile(file)
    if (!file) {
      setEstimateResult(null)
      return
    }
    try {
      const buffer = await file.arrayBuffer()
      const estimates = parseProjectEstimates(buffer)
      setEstimateResult({
        success: true,
        data: estimates,
        summary: `${estimates.length} projekt`,
      })
    } catch (err) {
      setEstimateResult({
        success: false,
        error: err instanceof Error ? err.message : "Kunde inte läsa filen",
      })
    }
  }, [])

  const canFinish = glResult?.success && timeResult?.success
  const handleFinish = () => {
    if (!glResult?.data || !timeResult?.data) return
    onComplete({
      glTransactions: glResult.data.transactions,
      balanceSheet: glResult.data.balanceSheet,
      timeEntries: timeResult.data,
      estimates: estimateResult?.data ?? [],
    })
  }

  const formatDate = (d: string) => {
    const [y, m, dd] = d.split("-")
    return `${dd}/${m} ${y}`
  }

  const steps = [
    {
      title: "Huvudbok",
      instruction: (
        <>
          <p className="mb-2 text-sm">
            Exportera huvudboken från Fortnox:
          </p>
          <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
            <li>
              Öppna <strong>Bokföring → Huvudbok</strong> i Fortnox
            </li>
            <li>
              Välj period:{" "}
              <Badge variant="secondary">{formatDate(financialYearStart)}</Badge>{" "}
              till <Badge variant="secondary">{formatDate(reportDate)}</Badge>
            </li>
            <li>
              Klicka <strong>Exportera → Textfil (.txt)</strong>
            </li>
          </ol>
        </>
      ),
      upload: (
        <FileUpload
          label="Huvudbok"
          description="Fortnox Huvudbok (TXT)"
          accept=".txt"
          icon="txt"
          file={glFile}
          onFileChange={handleGLFile}
        />
      ),
      result: glResult,
    },
    {
      title: "Tidsrapport",
      instruction: (
        <>
          <p className="mb-2 text-sm">
            Exportera tidsrapporten från Fortnox:
          </p>
          <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
            <li>
              Öppna <strong>Tid → Tidsrapporter → Sammanställning</strong> i
              Fortnox
            </li>
            <li>
              Välj period:{" "}
              <Badge variant="secondary">{formatDate(financialYearStart)}</Badge>{" "}
              till <Badge variant="secondary">{formatDate(reportDate)}</Badge>
            </li>
            <li>
              Klicka <strong>Exportera → CSV</strong>
            </li>
          </ol>
        </>
      ),
      upload: (
        <FileUpload
          label="Tidsrapport"
          description="Fortnox Tid-export (CSV)"
          accept=".csv"
          icon="csv"
          file={timeFile}
          onFileChange={handleTimeFile}
        />
      ),
      result: timeResult,
    },
    {
      title: "Projektfil (valfri)",
      instruction: (
        <>
          <p className="mb-2 text-sm">
            Om du har en projektfil med anbudssummor och budgeterade kostnader,
            ladda upp den här. Annars kan du ange dessa värden manuellt i nästa
            steg.
          </p>
        </>
      ),
      upload: (
        <FileUpload
          label="Projektfil"
          description="Projektkalkyler (Excel)"
          accept=".xlsx,.xls"
          icon="xlsx"
          file={estimateFile}
          onFileChange={handleEstimateFile}
        />
      ),
      result: estimateResult,
      optional: true,
    },
  ]

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
        <IconArrowLeft className="h-4 w-4" /> Tillbaka
      </Button>

      {steps.map((s, i) => (
        <Card
          key={i}
          className={`transition-opacity ${i > step ? "opacity-50" : ""}`}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                  s.result?.success
                    ? "bg-green-500/15 text-green-600"
                    : i <= step
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s.result?.success ? (
                  <IconCheck className="h-3 w-3" />
                ) : (
                  i + 1
                )}
              </span>
              <CardTitle className="text-base">
                {s.title}
                {s.optional && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    valfri
                  </span>
                )}
              </CardTitle>
            </div>
          </CardHeader>
          {i <= step && (
            <CardContent className="space-y-3">
              {s.instruction}
              <div className="max-w-sm">{s.upload}</div>
              {s.result && (
                <div
                  className={`flex items-center gap-2 rounded-md p-2 text-xs ${
                    s.result.success
                      ? "bg-green-500/10 text-green-700 dark:text-green-400"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {s.result.success ? (
                    <IconCheck className="h-3 w-3" />
                  ) : (
                    <IconAlertTriangle className="h-3 w-3" />
                  )}
                  {s.result.success ? s.result.summary : s.result.error}
                </div>
              )}
              {i === step && i < steps.length - 1 && (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setStep(i + 1)}
                    disabled={!s.result?.success && !s.optional}
                    className="gap-1"
                  >
                    Nästa <IconChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      ))}

      {step >= steps.length - 1 && (
        <div className="flex justify-end">
          <Button size="lg" onClick={handleFinish} disabled={!canFinish}>
            Beräkna PUA →
          </Button>
        </div>
      )}
    </div>
  )
}
