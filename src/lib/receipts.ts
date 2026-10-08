/**
 * Auto-generated rent receipt PDFs (spec section 35).
 *
 * After a payment is recorded with SUCCESS status, a receipt PDF is
 * generated, uploaded to the private `payment-receipts` bucket, and its
 * path stored on the payments row. Never includes Aadhaar data.
 */
import { jsPDF } from "jspdf"
import { supabase } from "@/lib/supabase"

export interface ReceiptData {
  tenantName: string
  propertyName: string
  flatNumber: string
  monthLabel: string
  amount: number
  method: string
  transactionId: string | null
  paymentDate: string
  totalPayable: number
  totalPaid: number
  remainingDue: number
  status: string
}

const MARGIN = 16
const INDIGO: [number, number, number] = [37, 64, 153]

/** Build the receipt PDF. Pure — no I/O. */
export function generateReceiptPdf(d: ReceiptData): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  const W = 210
  let y = MARGIN

  // Header
  doc.setFont("helvetica", "bold")
  doc.setFontSize(20)
  doc.setTextColor(...INDIGO)
  doc.text("RentTrack", MARGIN, y + 6)
  doc.setFontSize(11)
  doc.setTextColor(80, 80, 80)
  doc.text("Payment Receipt", MARGIN, y + 13)
  y += 22

  doc.setDrawColor(...INDIGO)
  doc.setLineWidth(0.8)
  doc.line(MARGIN, y, W - MARGIN, y)
  y += 8

  const row = (label: string, value: string) => {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    doc.setTextColor(110, 110, 110)
    doc.text(label, MARGIN, y)
    doc.setTextColor(20, 20, 20)
    doc.setFont("helvetica", "bold")
    doc.text(value, MARGIN + 52, y)
    doc.setFont("helvetica", "normal")
    y += 7
  }

  row("Tenant", d.tenantName)
  row("Property", d.propertyName)
  row("Flat", d.flatNumber)
  row("Month", d.monthLabel)
  row("Payment date", d.paymentDate)
  row("Method", d.method.replace("_", " "))
  row("Transaction ID", d.transactionId ?? "—")
  y += 3

  doc.setDrawColor(220, 220, 220)
  doc.setLineWidth(0.4)
  doc.line(MARGIN, y, W - MARGIN, y)
  y += 8

  const money = (label: string, value: number, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal")
    doc.setFontSize(bold ? 12 : 10)
    doc.setTextColor(bold ? 20 : 110, bold ? 20 : 110, bold ? 20 : 110)
    doc.text(label, MARGIN, y)
    doc.text(`Rs. ${value.toFixed(2)}`, W - MARGIN, y, { align: "right" })
    y += 7
  }

  money("Amount received", d.amount, true)
  money("Month total payable", d.totalPayable)
  money("Month total paid", d.totalPaid)
  money("Month remaining due", d.remainingDue)

  y += 4
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(...INDIGO)
  doc.text(`Status: ${d.status.replace("_", " ")}`, MARGIN, y)

  // Footer
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(150, 150, 150)
  doc.text(
    `Generated ${new Date().toLocaleString("en-IN")} · This is a system-generated receipt.`,
    MARGIN,
    287
  )
  return doc
}

/**
 * Upload a receipt PDF to the private payment-receipts bucket.
 * Returns the storage path. Throws on failure (caller decides how to
 * handle — receipt failure must never fail the payment itself).
 */
export async function uploadReceiptPdf(
  doc: jsPDF,
  propertyId: string,
  paymentId: string
): Promise<string> {
  const blob = doc.output("blob")
  const path = `${propertyId}/${paymentId}-receipt.pdf`
  const { error } = await supabase.storage
    .from("payment-receipts")
    .upload(path, blob, { contentType: "application/pdf", upsert: true })
  if (error) throw new Error(error.message)
  return path
}

/** Signed download URL for a stored receipt (1 hour). */
export async function getReceiptSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("payment-receipts")
    .createSignedUrl(storagePath, 3600)
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Could not create receipt download link.")
  }
  return data.signedUrl
}
