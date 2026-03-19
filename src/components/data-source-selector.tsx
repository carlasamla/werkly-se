"use client"

import { Card, CardContent } from "@/components/ui/card"
import { IconCloud, IconFileUpload } from "@tabler/icons-react"

interface DataSourceSelectorProps {
  onSelectAPI: () => void
  onSelectUpload: () => void
  hasFortnoxConnection: boolean
}

export function DataSourceSelector({
  onSelectAPI,
  onSelectUpload,
  hasFortnoxConnection,
}: DataSourceSelectorProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card
        className={`cursor-pointer transition-colors hover:border-primary/50 ${!hasFortnoxConnection ? "opacity-50" : ""}`}
        onClick={hasFortnoxConnection ? onSelectAPI : undefined}
      >
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <IconCloud className="h-10 w-10 text-primary" />
          <div>
            <p className="font-medium">Hämta från Fortnox</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Hämtar bokföring, tid och projektdata automatiskt via API.
            </p>
          </div>
          {!hasFortnoxConnection && (
            <p className="text-xs text-muted-foreground">
              Kräver Fortnox-koppling
            </p>
          )}
        </CardContent>
      </Card>

      <Card
        className="cursor-pointer transition-colors hover:border-primary/50"
        onClick={onSelectUpload}
      >
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <IconFileUpload className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-medium">Ladda upp filer</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Exportera huvudbok, tidsrapport och projektfil från Fortnox och
              ladda upp dem här. Vi guidar dig steg för steg.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
