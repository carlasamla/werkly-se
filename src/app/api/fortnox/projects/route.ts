import { getFortnoxClient, getSessionOrThrow, errorResponse } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { project } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

export async function GET() {
  try {
    const session = await getSessionOrThrow()
    const client = await getFortnoxClient()

    // Fetch Fortnox projects
    const fortnoxProjects = await client.getProjects()

    // Fetch local metadata
    const localMeta = await db
      .select()
      .from(project)
      .where(eq(project.userId, session.user.id))

    const metaMap = new Map(
      localMeta.map((m) => [m.fortnoxProjectNr, m])
    )

    // Merge
    const merged = fortnoxProjects.map((fp) => {
      const meta = metaMap.get(fp.ProjectNumber)
      return {
        projectNr: fp.ProjectNumber,
        name: fp.Description ?? "",
        status: fp.Status,
        startDate: fp.StartDate,
        endDate: fp.EndDate,
        contractType: meta?.contractType ?? null,
        contractValue: meta?.contractValue ? Number(meta.contractValue) : null,
        budgetedCost: meta?.budgetedCost ? Number(meta.budgetedCost) : null,
        budgetedProfit: meta?.budgetedProfit ? Number(meta.budgetedProfit) : null,
        notes: meta?.notes ?? null,
        updatedAt: meta?.updatedAt ?? null,
      }
    })

    return Response.json({ projects: merged })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    if (message === "Unauthorized") return errorResponse(message, 401)
    return errorResponse(message)
  }
}
