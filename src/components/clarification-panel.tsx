"use client"

import type { ClarificationIssue, ContractType } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { IconAlertTriangle } from "@tabler/icons-react"
import { useState } from "react"

interface ClarificationPanelProps {
  issues: ClarificationIssue[]
  onResolve: (resolved: ClarificationIssue[]) => void
  onSkip: () => void
}

export function ClarificationPanel({
  issues,
  onResolve,
  onSkip,
}: ClarificationPanelProps) {
  const [resolutions, setResolutions] = useState<Map<number, string>>(
    new Map()
  )

  const typeIssues = issues.filter(
    (i) => i.kind === "missing_type" || i.kind === "unknown_project"
  )
  const valueIssues = issues.filter(
    (i) =>
      i.kind === "missing_contract_value" || i.kind === "missing_budget_cost"
  )
  const warningIssues = issues.filter(
    (i) => i.kind === "completion_over_100"
  )
  const glIssues = issues.filter(
    (i) => i.kind === "unassigned_gl_transaction"
  )

  const setResolution = (idx: number, value: string) => {
    setResolutions((prev) => {
      const next = new Map(prev)
      next.set(idx, value)
      return next
    })
  }

  const handleSubmit = () => {
    const resolved = issues.map((issue, idx) => ({
      ...issue,
      resolution: resolutions.get(idx) ?? null,
    }))
    onResolve(resolved)
  }

  if (issues.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconAlertTriangle className="h-5 w-5 text-amber-500" />
          Kompletteringar behövs ({issues.length} frågor)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Project type issues */}
        {typeIssues.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Kontraktstyp saknas</h3>
            {typeIssues.map((issue) => {
              const globalIdx = issues.indexOf(issue)
              return (
                <div
                  key={globalIdx}
                  className="flex items-center gap-3 rounded-md border p-3"
                >
                  <div className="flex-1">
                    <p className="text-sm">{issue.message}</p>
                    <Badge variant="outline" className="mt-1">
                      Projekt {issue.projectNr}
                    </Badge>
                  </div>
                  <Select
                    value={resolutions.get(globalIdx) ?? ""}
                    onValueChange={(v) => setResolution(globalIdx, v ?? "")}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Välj typ" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fast pris</SelectItem>
                      <SelectItem value="tm">Löpande</SelectItem>
                      <SelectItem value="exclude">Exkludera</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )
            })}
          </div>
        )}

        {/* Missing values */}
        {valueIssues.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Saknade värden</h3>
            {valueIssues.map((issue) => {
              const globalIdx = issues.indexOf(issue)
              return (
                <div
                  key={globalIdx}
                  className="flex items-center gap-3 rounded-md border p-3"
                >
                  <div className="flex-1">
                    <p className="text-sm">{issue.message}</p>
                    <Badge variant="outline" className="mt-1">
                      Projekt {issue.projectNr}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      {issue.kind === "missing_contract_value"
                        ? "Anbudssumma (SEK)"
                        : "Projektkostnader (SEK)"}
                    </Label>
                    <Input
                      type="number"
                      className="w-40"
                      placeholder="0"
                      value={resolutions.get(globalIdx) ?? ""}
                      onChange={(e) =>
                        setResolution(globalIdx, e.target.value)
                      }
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Completion warnings */}
        {warningIssues.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Varningar — färdigställandegrad &gt;100%</h3>
            <p className="text-xs text-muted-foreground">
              Ange en reviderad budget (Projektkostnader) för att räkna om, eller lämna tomt för att fortsätta med varning.
            </p>
            {warningIssues.map((issue) => {
              const globalIdx = issues.indexOf(issue)
              return (
                <div
                  key={globalIdx}
                  className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950"
                >
                  <div className="flex items-start gap-2">
                    <IconAlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-sm flex-1">{issue.message}</p>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">
                      Reviderad budget (SEK)
                    </Label>
                    <Input
                      type="number"
                      className="w-44"
                      placeholder="lämna tomt = behåll varning"
                      value={resolutions.get(globalIdx) ?? ""}
                      onChange={(e) => setResolution(globalIdx, e.target.value)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Unassigned GL transactions */}
        {glIssues.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">
              Transaktioner utan projektkod ({glIssues.length} st)
            </h3>
            <div className="max-h-48 overflow-y-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="p-2 text-left">Datum</th>
                    <th className="p-2 text-left">Konto</th>
                    <th className="p-2 text-left">Text</th>
                    <th className="p-2 text-right">Debet</th>
                    <th className="p-2 text-right">Kredit</th>
                  </tr>
                </thead>
                <tbody>
                  {glIssues.map((issue, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-2">{issue.details?.date}</td>
                      <td className="p-2">{issue.details?.account}</td>
                      <td className="p-2">{issue.details?.text}</td>
                      <td className="p-2 text-right">
                        {issue.details?.debit || ""}
                      </td>
                      <td className="p-2 text-right">
                        {issue.details?.credit || ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Dessa transaktioner behandlas som overhead och inkluderas inte i
              PUA-beräkningen.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onSkip}>
            Hoppa över (använd standardvärden)
          </Button>
          <Button onClick={handleSubmit}>Bekräfta och beräkna</Button>
        </div>
      </CardContent>
    </Card>
  )
}
