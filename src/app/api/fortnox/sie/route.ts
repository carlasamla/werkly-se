import { NextRequest } from "next/server"
import { getFortnoxClient, errorResponse } from "@/lib/api-helpers"
import { parseSIE4 } from "@/lib/fortnox"

export async function GET(request: NextRequest) {
  try {
    const client = await getFortnoxClient()

    const { searchParams } = request.nextUrl
    const financialYear = searchParams.get("financialYear")
    const reportDate = searchParams.get("reportDate") ?? undefined

    if (!financialYear) {
      return errorResponse("financialYear is required", 400)
    }

    const sieContent = await client.getSIE(4, financialYear)
    const { transactions, balanceSheet } = parseSIE4(sieContent, reportDate)

    return Response.json({ transactions, balanceSheet })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    if (message === "Unauthorized") return errorResponse(message, 401)
    return errorResponse(message)
  }
}
