import { getFortnoxClient, errorResponse } from "@/lib/api-helpers"

export async function GET() {
  try {
    const client = await getFortnoxClient()
    const years = await client.getFinancialYears()
    return Response.json({ financialYears: years })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    if (message === "Unauthorized") return errorResponse(message, 401)
    return errorResponse(message)
  }
}
