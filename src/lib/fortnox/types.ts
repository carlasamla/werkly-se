// Fortnox API response types

export interface FortnoxProject {
  ProjectNumber: string
  Description: string
  StartDate: string | null
  EndDate: string | null
  ProjectLeader: string | null
  ContactPerson: string | null
  Comments: string | null
  Status: "NOTSTARTED" | "ONGOING" | "COMPLETED"
}

export interface FortnoxVoucherRow {
  Account: number
  Debit: number
  Credit: number
  CostCenter: string
  Project: string
  Description: string
  TransactionInformation: string
}

export interface FortnoxVoucher {
  VoucherNumber: number
  VoucherSeries: string
  Year: number
  TransactionDate: string
  Description: string
  ReferenceNumber: string
  ReferenceType: string
  VoucherRows: FortnoxVoucherRow[]
}

export interface FortnoxInvoice {
  DocumentNumber: number
  CustomerName: string
  CustomerNumber: string
  InvoiceDate: string
  DueDate: string
  Total: number
  Balance: number
  Booked: boolean
  Cancelled: boolean
  Currency: string
  Project: string
  CostCenter: string
  VoucherNumber: number | null
  VoucherSeries: string | null
  VoucherYear: number | null
  InvoiceRows?: FortnoxInvoiceRow[]
}

export interface FortnoxInvoiceRow {
  AccountNumber: number
  ArticleNumber: string
  Description: string
  Price: number
  DeliveredQuantity: number
  Total: number
  Project: string
  CostCenter: string
  VAT: number
}

export interface FortnoxSupplierInvoice {
  GivenNumber: number
  InvoiceNumber: string
  SupplierName: string
  SupplierNumber: string
  InvoiceDate: string
  DueDate: string
  Total: number
  Balance: number
  Booked: boolean
  Currency: string
  Project: string
  CostCenter: string
  Credit: boolean
  SupplierInvoiceRows?: FortnoxSupplierInvoiceRow[]
}

export interface FortnoxSupplierInvoiceRow {
  Account: number
  CostCenter: string
  Project: string
  Debit: number
  Credit: number
  Total: number
}

export interface FortnoxFinancialYear {
  Id: number
  FromDate: string
  ToDate: string
  AccountChartType: string
  AccountingMethod: string
}

export interface FortnoxAccount {
  Number: number
  Description: string
  Active: boolean
  ProjectSettings: "ALLOWED" | "MANDATORY" | "NOTALLOWED"
}

export interface FortnoxCompanyInformation {
  CompanyName: string
  OrganizationNumber: string
  Email: string
  Address: string
  ZipCode: string
  City: string
}

export interface FortnoxPaginatedResponse<T> {
  MetaInformation: {
    "@CurrentPage": number
    "@TotalPages": number
    "@TotalResources": number
  }
  [key: string]: T[] | FortnoxPaginatedResponse<T>["MetaInformation"]
}
