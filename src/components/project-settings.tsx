"use client"

import { useState, useCallback, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { IconAlertTriangle, IconCheck, IconLoader2 } from "@tabler/icons-react"

export interface ProjectMeta {
  projectNr: string
  name: string
  status?: string
  contractType: string | null
  contractValue: number | null
  budgetedCost: number | null
  budgetedProfit: number | null
  notes: string | null
  updatedAt: string | null
}

interface ProjectSettingsProps {
  projects: ProjectMeta[]
  onSave: (projectNr: string, data: Partial<ProjectMeta>) => Promise<void>
  onDone: () => void
}

export function ProjectSettings({
  projects,
  onSave,
  onDone,
}: ProjectSettingsProps) {
  const [saving, setSaving] = useState<string | null>(null)
  const [localEdits, setLocalEdits] = useState<
    Map<string, Partial<ProjectMeta>>
  >(new Map())

  const getEditedValue = <K extends keyof ProjectMeta>(
    projectNr: string,
    field: K,
    original: ProjectMeta[K]
  ): ProjectMeta[K] => {
    const edit = localEdits.get(projectNr)
    if (edit && field in edit) return edit[field] as ProjectMeta[K]
    return original
  }

  const setEdit = (projectNr: string, field: keyof ProjectMeta, value: unknown) => {
    setLocalEdits((prev) => {
      const next = new Map(prev)
      const existing = next.get(projectNr) ?? {}
      next.set(projectNr, { ...existing, [field]: value })
      return next
    })
  }

  const handleSave = useCallback(
    async (projectNr: string) => {
      const edit = localEdits.get(projectNr)
      if (!edit) return
      setSaving(projectNr)
      try {
        await onSave(projectNr, edit)
        setLocalEdits((prev) => {
          const next = new Map(prev)
          next.delete(projectNr)
          return next
        })
      } finally {
        setSaving(null)
      }
    },
    [localEdits, onSave]
  )

  const incompleteFixed = projects.filter((p) => {
    const ct = getEditedValue(p.projectNr, "contractType", p.contractType)
    if (ct !== "fixed") return false
    const cv = getEditedValue(p.projectNr, "contractValue", p.contractValue)
    const bc = getEditedValue(p.projectNr, "budgetedCost", p.budgetedCost)
    return cv == null || bc == null
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Projektinställningar</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Ange avtalstyp, kontraktsvärde och budgeterad kostnad per projekt.
              Dessa värden sparas och återanvänds vid framtida rapporter.
            </p>
          </div>
          <Button onClick={onDone} disabled={incompleteFixed.length > 0}>
            Fortsätt →
          </Button>
        </CardHeader>
        <CardContent>
          {incompleteFixed.length > 0 && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              <IconAlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                {incompleteFixed.length} fastprisprojekt saknar kontraktsvärde
                eller budgeterad kostnad.
              </span>
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Projekt</TableHead>
                  <TableHead>Namn</TableHead>
                  <TableHead className="w-36">Avtalstyp</TableHead>
                  <TableHead className="w-36">Kontraktsvärde</TableHead>
                  <TableHead className="w-36">Budg. kostnad</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((p) => {
                  const ct = getEditedValue(
                    p.projectNr,
                    "contractType",
                    p.contractType
                  )
                  const hasEdits = localEdits.has(p.projectNr)
                  const isSaving = saving === p.projectNr
                  const isExcluded = ct === "exclude"

                  return (
                    <TableRow
                      key={p.projectNr}
                      className={isExcluded ? "opacity-50" : ""}
                    >
                      <TableCell className="font-mono text-xs">
                        {p.projectNr}
                      </TableCell>
                      <TableCell className="text-sm">{p.name}</TableCell>
                      <TableCell>
                        <Select
                          value={ct ?? ""}
                          onValueChange={(v) =>
                            setEdit(p.projectNr, "contractType", v || null)
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Välj…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fixed">Fast pris</SelectItem>
                            <SelectItem value="tm">Löpande</SelectItem>
                            <SelectItem value="exclude">Exkludera</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {ct === "fixed" && (
                          <Input
                            type="number"
                            className="h-8 text-xs"
                            placeholder="0"
                            value={
                              getEditedValue(
                                p.projectNr,
                                "contractValue",
                                p.contractValue
                              ) ?? ""
                            }
                            onChange={(e) =>
                              setEdit(
                                p.projectNr,
                                "contractValue",
                                e.target.value ? Number(e.target.value) : null
                              )
                            }
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        {ct === "fixed" && (
                          <Input
                            type="number"
                            className="h-8 text-xs"
                            placeholder="0"
                            value={
                              getEditedValue(
                                p.projectNr,
                                "budgetedCost",
                                p.budgetedCost
                              ) ?? ""
                            }
                            onChange={(e) =>
                              setEdit(
                                p.projectNr,
                                "budgetedCost",
                                e.target.value ? Number(e.target.value) : null
                              )
                            }
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        {hasEdits && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => handleSave(p.projectNr)}
                            disabled={isSaving}
                          >
                            {isSaving ? (
                              <IconLoader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <IconCheck className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
