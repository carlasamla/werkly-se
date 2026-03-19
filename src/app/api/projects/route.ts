import { NextRequest } from "next/server"
import { getSessionOrThrow, errorResponse } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { project } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

export async function GET() {
  try {
    const session = await getSessionOrThrow()
    const projects = await db
      .select()
      .from(project)
      .where(eq(project.userId, session.user.id))
    return Response.json({ projects })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    if (message === "Unauthorized") return errorResponse(message, 401)
    return errorResponse(message)
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionOrThrow()
    const body = await request.json()

    const { fortnoxProjectNr, name, contractType, contractValue, budgetedCost, budgetedProfit, notes } = body

    if (!fortnoxProjectNr) {
      return errorResponse("fortnoxProjectNr is required", 400)
    }

    // Validate contract type
    if (contractType && !["fixed", "tm", "exclude"].includes(contractType)) {
      return errorResponse("Invalid contractType", 400)
    }

    // Validate required fields for fixed-price
    if (contractType === "fixed") {
      if (contractValue == null || contractValue === "") {
        return errorResponse("contractValue required for fixed-price contracts", 400)
      }
      if (budgetedCost == null || budgetedCost === "") {
        return errorResponse("budgetedCost required for fixed-price contracts", 400)
      }
    }

    // Upsert
    const existing = await db
      .select()
      .from(project)
      .where(
        and(
          eq(project.userId, session.user.id),
          eq(project.fortnoxProjectNr, String(fortnoxProjectNr))
        )
      )
      .limit(1)

    if (existing.length > 0) {
      await db
        .update(project)
        .set({
          name: name ?? existing[0].name,
          contractType: contractType ?? existing[0].contractType,
          contractValue: contractValue != null ? String(contractValue) : existing[0].contractValue,
          budgetedCost: budgetedCost != null ? String(budgetedCost) : existing[0].budgetedCost,
          budgetedProfit: budgetedProfit != null ? String(budgetedProfit) : existing[0].budgetedProfit,
          notes: notes ?? existing[0].notes,
          updatedAt: new Date(),
        })
        .where(eq(project.id, existing[0].id))

      return Response.json({ success: true, id: existing[0].id })
    } else {
      const [inserted] = await db
        .insert(project)
        .values({
          userId: session.user.id,
          fortnoxProjectNr: String(fortnoxProjectNr),
          name: name ?? "",
          contractType: contractType ?? null,
          contractValue: contractValue != null ? String(contractValue) : null,
          budgetedCost: budgetedCost != null ? String(budgetedCost) : null,
          budgetedProfit: budgetedProfit != null ? String(budgetedProfit) : null,
          notes: notes ?? null,
        })
        .returning({ id: project.id })

      return Response.json({ success: true, id: inserted.id }, { status: 201 })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    if (message === "Unauthorized") return errorResponse(message, 401)
    return errorResponse(message)
  }
}
