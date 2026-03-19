"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface FinancialYear {
  Id: number
  FromDate: string
  ToDate: string
}

interface PeriodSelectorProps {
  financialYears: FinancialYear[]
  selectedYear: string
  reportDate: string
  onYearChange: (yearId: string) => void
  onReportDateChange: (date: string) => void
}

export function PeriodSelector({
  financialYears,
  selectedYear,
  reportDate,
  onYearChange,
  onReportDateChange,
}: PeriodSelectorProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Period</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          {financialYears.length > 0 && (
            <div className="space-y-1.5">
              <Label>Räkenskapsår</Label>
              <Select value={selectedYear} onValueChange={(v: string | null) => { if (v) onYearChange(v) }}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Välj räkenskapsår" />
                </SelectTrigger>
                <SelectContent>
                  {financialYears.map((fy) => (
                    <SelectItem key={fy.Id} value={String(fy.Id)}>
                      {fy.FromDate} — {fy.ToDate}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="report-date">
              Rapportdatum (t.o.m.)
            </Label>
            <Input
              id="report-date"
              type="date"
              value={reportDate}
              onChange={(e) => onReportDateChange(e.target.value)}
              className="w-44"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
