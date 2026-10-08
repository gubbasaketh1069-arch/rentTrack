import * as XLSX from "xlsx"
import { jsPDF } from "jspdf"

export interface ExportSheet {
  /** Sheet name / PDF section heading. */
  name: string
  headers: string[]
  /** Row values as display strings (already formatted, e.g. INR). */
  rows: string[][]
}

/* ------------------------------------------------------------------ */
/* Excel                                                               */
/* ------------------------------------------------------------------ */

/** Multi-sheet .xlsx download. No Aadhaar data should ever reach here. */
export function exportToExcel(filename: string, sheets: ExportSheet[]): void {
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const aoa = [sheet.headers, ...sheet.rows]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    // Reasonable column widths from header + content length.
    ws["!cols"] = sheet.headers.map((h, i) => {
      const maxLen = Math.max(
        h.length,
        ...sheet.rows.map((r) => (r[i] ?? "").length)
      )
      return { wch: Math.min(Math.max(maxLen + 2, 12), 42) }
    })
    const safeName = sheet.name.slice(0, 31).replace(/[\\/?*[\]]/g, "-") || "Sheet"
    XLSX.utils.book_append_sheet(wb, ws, safeName)
  }
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`)
}

/* ------------------------------------------------------------------ */
/* PDF (manual table rendering — no autotable dependency)               */
/* ------------------------------------------------------------------ */

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 14
const ROW_H = 7
const HEADER_H = 8
const FOOTER_H = 12

function drawTable(
  doc: jsPDF,
  title: string,
  sheet: ExportSheet,
  startY: number
): number {
  let y = startY
  const usableW = PAGE_W - MARGIN * 2
  const colW = usableW / Math.max(sheet.headers.length, 1)

  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE_H - FOOTER_H) {
      doc.addPage()
      y = MARGIN
    }
  }

  const drawRow = (cells: string[], isHeader: boolean) => {
    ensureSpace(ROW_H + 1)
    if (isHeader) {
      doc.setFillColor(37, 64, 153) // deep indigo
      doc.setTextColor(255, 255, 255)
      doc.setFont("helvetica", "bold")
    } else {
      doc.setFillColor(255, 255, 255)
      doc.setTextColor(30, 30, 30)
      doc.setFont("helvetica", "normal")
    }
    doc.setFontSize(8)
    const rowTop = y
    doc.rect(MARGIN, rowTop, usableW, isHeader ? HEADER_H : ROW_H, "F")
    cells.forEach((cell, i) => {
      const x = MARGIN + i * colW
      const text = doc.splitTextToSize(cell ?? "", colW - 3)
      doc.text(text.slice(0, 3), x + 1.5, rowTop + (isHeader ? 5.5 : 5))
      doc.setDrawColor(210, 210, 210)
      doc.rect(x, rowTop, colW, isHeader ? HEADER_H : ROW_H, "S")
    })
    y += isHeader ? HEADER_H : ROW_H
  }

  if (title) {
    ensureSpace(10)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.setTextColor(37, 64, 153)
    doc.text(title, MARGIN, y + 6)
    y += 9
  }
  drawRow(sheet.headers, true)
  for (const row of sheet.rows) drawRow(row, false)
  return y + 6
}

/** Multi-section PDF download. */
export function exportToPdf(
  filename: string,
  reportTitle: string,
  sheets: ExportSheet[]
): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  const generated = new Date().toLocaleString("en-IN")

  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.setTextColor(37, 64, 153)
  doc.text("RentTrack", MARGIN, MARGIN + 2)
  doc.setFontSize(12)
  doc.setTextColor(60, 60, 60)
  doc.text(reportTitle, MARGIN, MARGIN + 10)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(120, 120, 120)
  doc.text(`Generated ${generated}`, MARGIN, MARGIN + 16)

  let y = MARGIN + 22
  if (sheets.length === 0) {
    doc.setFontSize(10)
    doc.setTextColor(60, 60, 60)
    doc.text("No data for the selected criteria.", MARGIN, y)
  }
  for (const sheet of sheets) {
    y = drawTable(doc, sheet.name, sheet, y)
  }

  // Page numbers
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(140, 140, 140)
    doc.text(`Page ${i} of ${pages}`, PAGE_W - MARGIN - 20, PAGE_H - 8)
  }

  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`)
}

/* ------------------------------------------------------------------ */
/* Print                                                               */
/* ------------------------------------------------------------------ */

/** Prints the current page; print CSS hides chrome (see index.css). */
export function printPage(title: string): void {
  const prev = document.title
  document.title = `RentTrack — ${title}`
  window.print()
  // Restore after the print dialog closes.
  setTimeout(() => {
    document.title = prev
  }, 1000)
}
