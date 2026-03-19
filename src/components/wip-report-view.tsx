"use client"

import { useState } from "react"
import type { WipResult, ReconciliationRow, JournalEntry } from "@/lib/types"
import { formatSEK, formatPct } from "@/lib/format"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  IconDownload,
  IconAlertTriangle,
  IconChevronDown,
  IconChevronRight,
  IconSearch,
  IconRotate2,
} from "@tabler/icons-react"

interface WipReportViewProps {
  reportDate: string
  results: WipResult[]
  reconciliation: ReconciliationRow[]
  journalEntries: JournalEntry[]
  onExport: () => void
  onReset: () => void
}

export function WipReportView({
  reportDate,
  results,
  reconciliation,
  journalEntries,
  onExport,
  onReset,
}: WipReportViewProps) {
  const total1620 = results.reduce((s, r) => s + r.wipAsset1620, 0)
  const total2450 = results.reduce((s, r) => s + r.overBilling2450, 0)
  const totalIncurred = results.reduce((s, r) => s + r.incurredCost, 0)
  const totalInvoiced = results.reduce((s, r) => s + r.revenueInvoiced, 0)
  const lossProjects = results.filter((r) => r.isLoss)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<"all" | "fixed" | "tm">("all")

  function toggleRow(projectNr: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(projectNr)) next.delete(projectNr)
      else next.add(projectNr)
      return next
    })
  }

  const filteredResults = results.filter((r) => {
    const q = search.toLowerCase()
    const matchesSearch =
      !q ||
      r.projectNr.toLowerCase().includes(q) ||
      r.projectName.toLowerCase().includes(q) ||
      r.customer.toLowerCase().includes(q)
    const matchesType =
      typeFilter === "all" ||
      r.contractType === typeFilter
    return matchesSearch && matchesType
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">PUA-rapport</h2>
          <p className="text-sm text-muted-foreground">
            Rapportdatum: {reportDate} · {results.length} projekt
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={onReset} variant="ghost" size="sm" className="gap-2 text-muted-foreground">
            <IconRotate2 className="h-4 w-4" />
            Ny rapport
          </Button>
          <Button onClick={onExport} variant="outline" className="gap-2">
            <IconDownload className="h-4 w-4" />
            Exportera Excel
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard label="Nedlagda kostnader" value={formatSEK(totalIncurred)} />
        <SummaryCard label="Fakturerat" value={formatSEK(totalInvoiced)} />
        <SummaryCard
          label="WIP tillgång (1620)"
          value={formatSEK(total1620)}
          highlight={total1620 > 0}
        />
        <SummaryCard
          label="Överfakturering (2450)"
          value={formatSEK(total2450)}
          highlight={total2450 > 0}
        />
      </div>

      {/* Loss warning */}
      {lossProjects.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <IconAlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-semibold text-destructive">
              {lossProjects.length} förlustprojekt identifierade
            </p>
            <p className="text-xs text-muted-foreground">
              {lossProjects.map((p) => `${p.projectNr} ${p.projectName}`).join(", ")}
              {" — "}förlustavsättning krävs enligt K2.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="wip">
        <TabsList>
          <TabsTrigger value="wip">PUA-sammanställning</TabsTrigger>
          <TabsTrigger value="recon">Avstämning</TabsTrigger>
          <TabsTrigger value="journal">Bokföringsorder</TabsTrigger>
        </TabsList>

        {/* WIP Summary Table */}
        <TabsContent value="wip">
          {/* Search + type filter */}
          <div className="flex flex-wrap items-center gap-3 pb-3 pt-1">
            <div className="relative flex-1 min-w-48">
              <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Sök projektnr, namn eller kund…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <div className="flex rounded-md border text-sm overflow-hidden">
              {(["all", "fixed", "tm"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 transition-colors ${
                    typeFilter === t
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  {t === "all" ? "Alla" : t === "fixed" ? "Fast pris" : "Löpande"}
                </button>
              ))}
            </div>
            {(search || typeFilter !== "all") && (
              <span className="text-xs text-muted-foreground">
                {filteredResults.length} av {results.length} projekt
              </span>
            )}
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Proj #</TableHead>
                      <TableHead>Projektnamn</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead className="text-right">Nedlagd kostnad</TableHead>
                      <TableHead className="text-right">Fakturerat</TableHead>
                      <TableHead className="text-right">Upparbetad intäkt</TableHead>
                      <TableHead className="text-right">1620</TableHead>
                      <TableHead className="text-right">2450</TableHead>
                      <TableHead className="text-right">Grad</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredResults.map((r) => {
                      const isExpanded = expandedRows.has(r.projectNr)
                      return (
                        <>
                          <TableRow
                            key={r.projectNr}
                            className={`cursor-pointer hover:bg-muted/50 ${r.isLoss ? "bg-destructive/5" : ""}`}
                            onClick={() => toggleRow(r.projectNr)}
                          >
                            <TableCell className="font-mono text-sm">
                              <span className="flex items-center gap-1">
                                {isExpanded ? (
                                  <IconChevronDown className="h-3 w-3 text-muted-foreground" />
                                ) : (
                                  <IconChevronRight className="h-3 w-3 text-muted-foreground" />
                                )}
                                {r.projectNr}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{r.projectName}</div>
                              {r.customer && (
                                <div className="text-xs text-muted-foreground">
                                  {r.customer}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {r.isDualScope
                                  ? "Fast + ÄTA"
                                  : r.contractType === "fixed"
                                  ? "Fast"
                                  : "Löpande"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatSEK(r.incurredCost)}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatSEK(r.revenueInvoiced)}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {r.earnedRevenue != null ? formatSEK(r.earnedRevenue) : "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {r.wipAsset1620 > 0 ? formatSEK(r.wipAsset1620) : "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {r.overBilling2450 > 0
                                ? formatSEK(r.overBilling2450)
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatPct(r.completionPct)}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={r.status} />
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow
                              key={`${r.projectNr}-costs`}
                              className="bg-muted/30 print:hidden"
                            >
                              <TableCell />
                              <TableCell colSpan={9}>
                                <div className="flex gap-6 py-1 text-xs text-muted-foreground">
                                  <span>
                                    <span className="font-medium text-foreground">Arbete:</span>{" "}
                                    {formatSEK(r.costs.labor)}
                                  </span>
                                  <span>
                                    <span className="font-medium text-foreground">Material:</span>{" "}
                                    {formatSEK(r.costs.material)}
                                  </span>
                                  <span>
                                    <span className="font-medium text-foreground">UE:</span>{" "}
                                    {formatSEK(r.costs.subcontractor)}
                                  </span>
                                  {r.lossProvision > 0 && (
                                    <span className="text-destructive">
                                      <span className="font-medium">Förlustavsättning:</span>{" "}
                                      {formatSEK(r.lossProvision)}
                                    </span>
                                  )}
                                  {r.contractValue != null && (
                                    <span>
                                      <span className="font-medium text-foreground">Anbudssumma:</span>{" "}
                                      {formatSEK(r.contractValue)}
                                    </span>
                                  )}
                                  {r.budgetedCost != null && (
                                    <span>
                                      <span className="font-medium text-foreground">Budget:</span>{" "}
                                      {formatSEK(r.budgetedCost)}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      )
                    })}
                    {/* Totals row */}
                    <TableRow className="border-t-2 font-bold">
                      <TableCell />
                      <TableCell>
                        {filteredResults.length < results.length
                          ? `Totalt (${filteredResults.length} proj.)`
                          : "Totalt"}
                      </TableCell>
                      <TableCell />
                      <TableCell className="text-right font-mono">
                        {formatSEK(filteredResults.reduce((s, r) => s + r.incurredCost, 0))}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatSEK(filteredResults.reduce((s, r) => s + r.revenueInvoiced, 0))}
                      </TableCell>
                      <TableCell />
                      <TableCell className="text-right font-mono">
                        {formatSEK(filteredResults.reduce((s, r) => s + r.wipAsset1620, 0))}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatSEK(filteredResults.reduce((s, r) => s + r.overBilling2450, 0))}
                      </TableCell>
                      <TableCell />
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reconciliation */}
        <TabsContent value="recon">
          <Card>
            <CardHeader>
              <CardTitle>Balansräkningsavstämning</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Konto</TableHead>
                    <TableHead>Beskrivning</TableHead>
                    <TableHead className="text-right">Beräknat</TableHead>
                    <TableHead className="text-right">Saldo i HB</TableHead>
                    <TableHead className="text-right">Differens</TableHead>
                    <TableHead>Åtgärd</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reconciliation.map((r) => (
                    <TableRow key={r.account}>
                      <TableCell className="font-mono">{r.account}</TableCell>
                      <TableCell>{r.description}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatSEK(r.calculated)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatSEK(r.currentGLBalance)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono ${
                          r.difference !== 0
                            ? "text-destructive font-semibold"
                            : ""
                        }`}
                      >
                        {formatSEK(r.difference)}
                      </TableCell>
                      <TableCell>
                        {r.difference !== 0 ? (
                          <Badge variant="destructive" className="text-xs">
                            {r.action}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {r.action}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Journal Entries */}
        <TabsContent value="journal">
          <div className="space-y-4">
            {journalEntries.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Inga bokföringsorder behövs — beräknade saldon matchar huvudboken.
                </CardContent>
              </Card>
            ) : (
              journalEntries.map((entry, idx) => (
                <Card key={idx}>
                  <CardHeader>
                    <CardTitle className="text-sm">{entry.description}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Konto</TableHead>
                          <TableHead>Beskrivning</TableHead>
                          <TableHead className="text-right">Debet</TableHead>
                          <TableHead className="text-right">Kredit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {entry.lines.map((line, lineIdx) => (
                          <TableRow key={lineIdx}>
                            <TableCell className="font-mono">
                              {line.debitAccount ?? line.creditAccount}
                            </TableCell>
                            <TableCell>{line.description}</TableCell>
                            <TableCell className="text-right font-mono">
                              {line.debitAccount
                                ? formatSEK(line.amount)
                                : ""}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {line.creditAccount
                                ? formatSEK(line.amount)
                                : ""}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={`text-lg font-bold font-mono ${
            highlight ? "text-primary" : ""
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status: WipResult["status"] }) {
  switch (status) {
    case "Loss":
      return (
        <Badge variant="destructive" className="gap-1 text-xs">
          <IconAlertTriangle className="h-3 w-3" />
          Förlust
        </Badge>
      )
    case "Over-billed":
      return (
        <Badge variant="secondary" className="text-xs">
          Överfakt.
        </Badge>
      )
    case "Warning":
      return (
        <Badge variant="outline" className="gap-1 text-xs border-amber-500 text-amber-600">
          <IconAlertTriangle className="h-3 w-3" />
          Varning
        </Badge>
      )
    case "OK":
      return (
        <Badge variant="outline" className="text-xs">
          OK
        </Badge>
      )
  }
}
