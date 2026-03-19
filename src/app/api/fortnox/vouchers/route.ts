import { NextRequest } from "next/server"
import { getFortnoxClient, errorResponse } from "@/lib/api-helpers"
import { vouchersToGLTransactions } from "@/lib/fortnox"

export async function GET(request: NextRequest) {
  try {
    const client = await getFortnoxClient()

    const { searchParams } = request.nextUrl
    const financialYear = searchParams.get("financialYear")
    const fromDate = searchParams.get("fromDate") ?? undefined
    const toDate = searchParams.get("toDate") ?? undefined

    if (!financialYear) {
      return errorResponse("financialYear is required", 400)
    }

    const vouchers = await client.getVouchers({
      financialYear,
      fromDate,
      toDate,
    })

    const { transactions, balanceSheet } = vouchersToGLTransactions(
      vouchers,
      toDate
    )

    return Response.json({ transactions, balanceSheet })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    if (message === "Unauthorized") return errorResponse(message, 401)
    return errorResponse(message)
  }
}
