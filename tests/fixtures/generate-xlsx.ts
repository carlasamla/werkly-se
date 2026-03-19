/**
 * Generate the synthetic projektfil.xlsx test fixture.
 * Run with: npx tsx tests/fixtures/generate-xlsx.ts
 */
import * as XLSX from "xlsx"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const rows = [
  {
    "Projekt nr": 462,
    Projektnamn: "Lustigknopp Sara",
    "Fast/löpande": "Fast pris",
    Kund: "Sara Lustigknopp",
    Anbudssumma: 815000,
    Projektkostnader: 617000,
    "Beräknad vinst/förlust": 198000,
  },
  {
    "Projekt nr": 473,
    Projektnamn: "Hummelhaga",
    "Fast/löpande": "Löpande",
    Kund: "Brf Hummelhaga",
    Anbudssumma: "",
    Projektkostnader: "",
    "Beräknad vinst/förlust": "",
  },
  {
    "Projekt nr": 495,
    Projektnamn: "Utbyggnad Lustigknoppsv.",
    "Fast/löpande": "Fast pris",
    Kund: "Anders Persson",
    Anbudssumma: 350000,
    Projektkostnader: 410000,
    "Beräknad vinst/förlust": -60000,
  },
  {
    "Projekt nr": 510,
    Projektnamn: "Nytt badrum Storgatan",
    "Fast/löpande": "",
    Kund: "Lisa Karlsson",
    Anbudssumma: 120000,
    Projektkostnader: 90000,
    "Beräknad vinst/förlust": 30000,
  },
]

const wb = XLSX.utils.book_new()
const ws = XLSX.utils.json_to_sheet(rows)
XLSX.utils.book_append_sheet(wb, ws, "Projektfil Rader")

const outPath = path.join(__dirname, "projektfil.xlsx")
XLSX.writeFile(wb, outPath)
console.log(`Written to ${outPath}`)
