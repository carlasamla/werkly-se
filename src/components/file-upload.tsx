"use client"

import { useCallback } from "react"
import { IconUpload, IconFileTypeCsv, IconFileSpreadsheet, IconFileText } from "@tabler/icons-react"

interface FileUploadProps {
  label: string
  description: string
  accept: string
  icon: "csv" | "txt" | "xlsx"
  file: File | null
  onFileChange: (file: File | null) => void
}

const icons = {
  csv: IconFileTypeCsv,
  txt: IconFileText,
  xlsx: IconFileSpreadsheet,
}

export function FileUpload({
  label,
  description,
  accept,
  icon,
  file,
  onFileChange,
}: FileUploadProps) {
  const Icon = icons[icon]

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      const droppedFile = e.dataTransfer.files[0]
      if (droppedFile) onFileChange(droppedFile)
    },
    [onFileChange]
  )

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
        file
          ? "border-primary/50 bg-primary/5"
          : "border-muted-foreground/25 hover:border-muted-foreground/50"
      }`}
    >
      <Icon className="mb-2 h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>

      {file ? (
        <div className="mt-3 flex items-center gap-2 rounded-md bg-muted px-3 py-1.5">
          <span className="text-xs font-medium text-foreground truncate max-w-48">
            {file.name}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onFileChange(null)
            }}
            className="text-xs text-muted-foreground hover:text-destructive"
          >
            ✕
          </button>
        </div>
      ) : (
        <label className="mt-3 cursor-pointer rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
          Välj fil
          <input
            type="file"
            accept={accept}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              onFileChange(f)
              e.target.value = ""
            }}
          />
        </label>
      )}
    </div>
  )
}
