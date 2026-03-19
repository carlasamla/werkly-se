import type {
  FortnoxProject,
  FortnoxVoucher,
  FortnoxFinancialYear,
  FortnoxAccount,
} from "./types"

const FORTNOX_API_BASE = "https://api.fortnox.se/3"

// Rate limiting: 25 requests per 5 seconds
const RATE_WINDOW_MS = 5_000
const RATE_LIMIT = 25
const requestTimestamps: number[] = []

async function waitForRateLimit(): Promise<void> {
  const now = Date.now()
  // Remove timestamps outside the current window
  while (
    requestTimestamps.length > 0 &&
    requestTimestamps[0] < now - RATE_WINDOW_MS
  ) {
    requestTimestamps.shift()
  }
  if (requestTimestamps.length >= RATE_LIMIT) {
    const waitMs = requestTimestamps[0] + RATE_WINDOW_MS - now + 50
    await new Promise((r) => setTimeout(r, waitMs))
  }
  requestTimestamps.push(Date.now())
}

export class FortnoxClient {
  private accessToken: string

  constructor(accessToken: string) {
    this.accessToken = accessToken
  }

  private async request<T>(
    path: string,
    params?: Record<string, string>
  ): Promise<T> {
    await waitForRateLimit()

    const url = new URL(`${FORTNOX_API_BASE}${path}`)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== "") url.searchParams.set(k, v)
      }
    }

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
      },
    })

    if (res.status === 429) {
      // Rate limited — wait and retry once
      await new Promise((r) => setTimeout(r, 5_000))
      return this.request(path, params)
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(
        `Fortnox API error ${res.status} on ${path}: ${body}`
      )
    }

    return res.json()
  }

  /** Fetch all pages for a paginated resource */
  private async fetchAll<T>(
    path: string,
    resourceKey: string,
    params?: Record<string, string>
  ): Promise<T[]> {
    const allItems: T[] = []
    let page = 1
    let totalPages = 1

    while (page <= totalPages) {
      const data = await this.request<Record<string, unknown>>(path, {
        ...params,
        limit: "500",
        page: String(page),
      })

      const meta = data.MetaInformation as {
        "@CurrentPage": number
        "@TotalPages": number
      } | undefined

      const items = (data[resourceKey] as T[]) ?? []
      allItems.push(...items)

      totalPages = meta?.["@TotalPages"] ?? 1
      page++
    }

    return allItems
  }

  // ───── Projects ─────

  async getProjects(): Promise<FortnoxProject[]> {
    return this.fetchAll<FortnoxProject>("/projects", "Projects")
  }

  async getProject(projectNumber: string): Promise<FortnoxProject> {
    const data = await this.request<{ Project: FortnoxProject }>(
      `/projects/${encodeURIComponent(projectNumber)}`
    )
    return data.Project
  }

  // ───── Vouchers (General Ledger) ─────

  async getVouchers(params: {
    financialYear: string
    fromDate?: string
    toDate?: string
  }): Promise<FortnoxVoucher[]> {
    const queryParams: Record<string, string> = {
      financialyear: params.financialYear,
    }
    if (params.fromDate) queryParams.fromdate = params.fromDate
    if (params.toDate) queryParams.todate = params.toDate

    // Fetch voucher list (without rows)
    const voucherList = await this.fetchAll<{
      VoucherNumber: number
      VoucherSeries: string
    }>("/vouchers", "Vouchers", queryParams)

    // Fetch each voucher's detail to get rows
    const vouchers: FortnoxVoucher[] = []
    for (const v of voucherList) {
      const detail = await this.request<{ Voucher: FortnoxVoucher }>(
        `/vouchers/${encodeURIComponent(v.VoucherSeries)}/${v.VoucherNumber}`,
        { financialyear: params.financialYear }
      )
      vouchers.push(detail.Voucher)
    }

    return vouchers
  }

  // ───── SIE Export (more efficient than vouchers) ─────

  async getSIE(type: 1 | 2 | 3 | 4, financialYear: string): Promise<string> {
    await waitForRateLimit()

    const url = `${FORTNOX_API_BASE}/sie/${type}?financialyear=${encodeURIComponent(financialYear)}`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    })

    if (!res.ok) {
      throw new Error(`Fortnox SIE export error: ${res.status}`)
    }

    return res.text()
  }

  // ───── Financial Years ─────

  async getFinancialYears(): Promise<FortnoxFinancialYear[]> {
    return this.fetchAll<FortnoxFinancialYear>(
      "/financialyears",
      "FinancialYears"
    )
  }

  async getFinancialYearByDate(date: string): Promise<FortnoxFinancialYear> {
    const data = await this.request<{
      FinancialYears: FortnoxFinancialYear[]
    }>("/financialyears", { Date: date })
    return data.FinancialYears[0]
  }

  // ───── Accounts ─────

  async getAccounts(financialYear?: string): Promise<FortnoxAccount[]> {
    const params = financialYear
      ? { financialyear: financialYear }
      : undefined
    return this.fetchAll<FortnoxAccount>("/accounts", "Accounts", params)
  }

  // ───── Company Info ─────

  async getCompanyInformation() {
    const data = await this.request<{
      CompanyInformation: {
        CompanyName: string
        OrganizationNumber: string
        Email: string
      }
    }>("/companyinformation")
    return data.CompanyInformation
  }

  // ───── Locked Period ─────

  async getLockedPeriod(): Promise<string | null> {
    try {
      const data = await this.request<{
        Settings: { LockedPeriod: { EndDate: string } }
      }>("/settings/lockedperiod")
      return data.Settings?.LockedPeriod?.EndDate ?? null
    } catch {
      return null
    }
  }
}
