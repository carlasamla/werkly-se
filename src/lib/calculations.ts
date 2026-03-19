import type {
  ProjectData,
  ProjectEstimate,
  WipResult,
  ClarificationIssue,
  GLProjectData,
  ContractType,
} from "@/lib/types"
import {
  aggregateLaborCosts,
  collectProjectNames,
  aggregateGLData,
  getUnassignedTransactions,
  groupEstimatesByProject,
} from "@/lib/parsers"
import type { TimeEntry, GLTransaction } from "@/lib/types"

/**
 * Merge data from all three sources into a unified project list,
 * and identify clarification issues.
 */
export function mergeProjectData(
  timeEntries: TimeEntry[],
  glTransactions: GLTransaction[],
  estimates: ProjectEstimate[]
): { projects: Map<string, ProjectData>; clarifications: ClarificationIssue[] } {
  const laborCosts = aggregateLaborCosts(timeEntries)
  const projectNames = collectProjectNames(timeEntries)
  const glData = aggregateGLData(glTransactions)
  const estimateGroups = groupEstimatesByProject(estimates)
  const unassigned = getUnassignedTransactions(glTransactions)

  const clarifications: ClarificationIssue[] = []
  const projects = new Map<string, ProjectData>()

  // Collect all project numbers from all sources
  const allProjectNrs = new Set<string>()
  for (const nr of laborCosts.keys()) allProjectNrs.add(nr)
  for (const nr of glData.keys()) {
    if (nr !== "__UNASSIGNED__") allProjectNrs.add(nr)
  }
  for (const nr of estimateGroups.keys()) allProjectNrs.add(nr)

  for (const projectNr of allProjectNrs) {
    const labor = laborCosts.get(projectNr) ?? 0
    const gl: GLProjectData = glData.get(projectNr) ?? {
      materialCost: 0,
      subcontractorCost: 0,
      revenueInvoiced: 0,
    }
    const estGroup = estimateGroups.get(projectNr) ?? []

    // Determine name: prefer estimate, fall back to time entries
    const name =
      estGroup[0]?.projectName ||
      projectNames.get(projectNr) ||
      `Projekt ${projectNr}`

    const customer = estGroup[0]?.customer ?? ""

    // If project not in estimates at all → clarification needed
    if (estGroup.length === 0) {
      clarifications.push({
        kind: "unknown_project",
        projectNr,
        message: `Projekt ${projectNr} (${name}) finns i tidsrapportering/huvudbok men saknas i projektfilen. Ange typ (Fast pris / Löpande).`,
      })
    }

    // Handle dual-row projects (fixed + T&M on same project nr)
    // We merge costs but keep separate estimate lines
    const contractType = estGroup.length > 0 ? estGroup[0].contractType : null
    const fixedEst = estGroup.find((e) => e.contractType === "fixed")
    const tmEst = estGroup.find((e) => e.contractType === "tm")

    // If contract type is missing
    if (estGroup.length > 0 && !contractType) {
      clarifications.push({
        kind: "missing_type",
        projectNr,
        message: `Projekt ${projectNr} (${name}) saknar kontraktstyp (Fast pris / Löpande).`,
      })
    }

    // For fixed-price: check contract value and budgeted cost
    if (fixedEst) {
      if (fixedEst.contractValue == null) {
        clarifications.push({
          kind: "missing_contract_value",
          projectNr,
          message: `Projekt ${projectNr} (${name}) är Fast pris men saknar Anbudssumma.`,
        })
      }
      if (fixedEst.budgetedCost == null) {
        clarifications.push({
          kind: "missing_budget_cost",
          projectNr,
          message: `Projekt ${projectNr} (${name}) är Fast pris men saknar Projektkostnader (budget).`,
        })
      }
    }

    projects.set(projectNr, {
      projectNr,
      projectName: name,
      contractType: contractType ?? (fixedEst ? "fixed" : tmEst ? "tm" : null),
      customer,
      contractValue: fixedEst?.contractValue ?? null,
      budgetedCost: fixedEst?.budgetedCost ?? null,
      budgetedProfit: fixedEst?.budgetedProfit ?? null,
      costs: {
        labor,
        material: gl.materialCost,
        subcontractor: gl.subcontractorCost,
      },
      revenueInvoiced: gl.revenueInvoiced,
      isDualScope: fixedEst !== undefined && tmEst !== undefined,
    })
  }

  // Unassigned GL transactions → clarification
  for (const txn of unassigned) {
    clarifications.push({
      kind: "unassigned_gl_transaction",
      projectNr: "",
      message: `Huvudbokstransaktion utan projektkod: ${txn.date}, ${txn.text}, ${txn.account}`,
      details: {
        date: txn.date,
        account: txn.account,
        text: txn.text,
        debit: txn.debit,
        credit: txn.credit,
      },
    })
  }

  return { projects, clarifications }
}

/**
 * Calculate WIP for a single T&M project.
 */
export function calculateWipTM(project: ProjectData): WipResult {
  const incurredCost =
    project.costs.labor + project.costs.material + project.costs.subcontractor
  const wip = incurredCost - project.revenueInvoiced

  return {
    projectNr: project.projectNr,
    projectName: project.projectName,
    contractType: "tm",
    customer: project.customer,
    incurredCost,
    revenueInvoiced: project.revenueInvoiced,
    earnedRevenue: null,
    wipAsset1620: Math.max(0, wip),
    overBilling2450: Math.max(0, -wip),
    completionPct: null,
    status: wip >= 0 ? "OK" : "Over-billed",
    isLoss: false,
    lossProvision: 0,
    contractValue: null,
    budgetedCost: null,
    costs: project.costs,
    isDualScope: project.isDualScope,
  }
}

/**
 * Calculate WIP for a fixed-price project using percentage-of-completion (K2 huvudregeln).
 */
export function calculateWipFixed(project: ProjectData): WipResult {
  const incurredCost =
    project.costs.labor + project.costs.material + project.costs.subcontractor

  const contractValue = project.contractValue ?? 0
  const budgetedCost = project.budgetedCost ?? 0

  // Completion degree = incurred cost / budgeted cost
  const completionPct =
    budgetedCost > 0 ? incurredCost / budgetedCost : 0

  // Earned revenue = contract value × completion degree
  const earnedRevenue = contractValue * Math.min(completionPct, 1)

  // WIP = earned revenue − revenue invoiced
  const wipDiff = earnedRevenue - project.revenueInvoiced

  // Loss detection: projected result = contract value − budgeted cost
  const projectedResult = contractValue - budgetedCost
  const isLoss = projectedResult < 0

  // Loss provision: full expected loss must be recognized immediately
  // Loss already realized = incurred cost - earned revenue (if incurred > earned)
  // Total loss = budgetedCost - contractValue (absolute)
  let lossProvision = 0
  if (isLoss) {
    const totalExpectedLoss = Math.abs(projectedResult)
    const lossAlreadyRealized = Math.max(0, incurredCost - earnedRevenue)
    lossProvision = Math.max(0, totalExpectedLoss - lossAlreadyRealized)
  }

  let status: WipResult["status"] = "OK"
  if (isLoss) {
    status = "Loss"
  } else if (completionPct > 1) {
    status = "Warning"
  } else if (wipDiff < 0) {
    status = "Over-billed"
  }

  return {
    projectNr: project.projectNr,
    projectName: project.projectName,
    contractType: "fixed",
    customer: project.customer,
    incurredCost,
    revenueInvoiced: project.revenueInvoiced,
    earnedRevenue,
    wipAsset1620: Math.max(0, wipDiff),
    overBilling2450: Math.max(0, -wipDiff),
    completionPct,
    status,
    isLoss,
    lossProvision,
    contractValue,
    budgetedCost,
    costs: project.costs,
    isDualScope: project.isDualScope,
  }
}

/**
 * Calculate WIP for all projects.
 * Returns results plus any additional clarifications (e.g. completion > 100%).
 */
export function calculateAllWip(
  projects: Map<string, ProjectData>,
  resolvedTypes?: Map<string, ContractType>
): { results: WipResult[]; clarifications: ClarificationIssue[] } {
  const results: WipResult[] = []
  const clarifications: ClarificationIssue[] = []

  for (const [projectNr, project] of projects) {
    // Apply resolved types from user clarifications
    let effectiveType = project.contractType
    if (!effectiveType && resolvedTypes) {
      effectiveType = resolvedTypes.get(projectNr) ?? null
    }

    if (!effectiveType) {
      // Default to T&M if type still unknown (shouldn't happen if clarifications resolved)
      effectiveType = "tm"
    }

    let result: WipResult

    if (effectiveType === "fixed") {
      result = calculateWipFixed({
        ...project,
        contractType: "fixed",
      })

      // Warn if completion > 100%
      if (result.completionPct != null && result.completionPct > 1) {
        clarifications.push({
          kind: "completion_over_100",
          projectNr,
          message: `Projekt ${projectNr} (${project.projectName}) har en färdigställandegrad på ${Math.round(result.completionPct * 100)}%. Budgeten kan behöva revideras.`,
        })
      }
    } else {
      result = calculateWipTM({
        ...project,
        contractType: "tm",
      })
    }

    results.push(result)
  }

  // Sort by project number
  results.sort((a, b) => {
    const numA = parseInt(a.projectNr, 10)
    const numB = parseInt(b.projectNr, 10)
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB
    return a.projectNr.localeCompare(b.projectNr)
  })

  return { results, clarifications }
}
