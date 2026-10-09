/**
 * Partial-payment state for a consulting engagement, read from the lead's
 * `metadata` blob: `amount_paid`, `balance_due` and `next_payment_due`.
 *
 * Shared by the BD / Consulting roster and the client detail page so the two
 * can never disagree about whether someone owes money.
 */
export interface PaymentStatus {
  paid: number
  /** paid + balance, i.e. the contract total */
  total: number
  balance: number
  /** ISO yyyy-mm-dd, or null when no date was recorded */
  dueDate: string | null
  overdue: boolean
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  // Supabase can hand back a JSONB number as a string
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/** Returns null when the lead has no payment tracking recorded at all. */
export function paymentStatus(metadata: unknown): PaymentStatus | null {
  const meta = (metadata || {}) as Record<string, unknown>
  const paid = toNumber(meta.amount_paid)
  const balance = toNumber(meta.balance_due)
  if (paid === null && balance === null) return null

  const paidAmount = paid ?? 0
  const balanceAmount = balance ?? 0
  const total = paidAmount + balanceAmount
  if (total <= 0) return null

  const raw = meta.next_payment_due
  const dueDate = typeof raw === 'string' && raw.trim() !== '' ? raw.slice(0, 10) : null
  const today = new Date().toISOString().slice(0, 10)

  return {
    paid: paidAmount,
    total,
    balance: balanceAmount,
    dueDate,
    // String compare is safe for yyyy-mm-dd and avoids timezone drift
    overdue: balanceAmount > 0 && dueDate !== null && dueDate < today,
  }
}

export function fmtUSD(amount: number): string {
  return '$' + Math.round(amount).toLocaleString('en-US')
}

/** "Paid $3,000 of $6,000" */
export function paidOfLabel(status: PaymentStatus): string {
  return `Paid ${fmtUSD(status.paid)} of ${fmtUSD(status.total)}`
}

/** "Balance due $3,000 — due Nov 30, 2026", or the OVERDUE variant. */
export function balanceLabel(status: PaymentStatus): string {
  const amount = `Balance due ${fmtUSD(status.balance)}`
  if (!status.dueDate) return amount
  const due = new Date(status.dueDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
  return status.overdue ? `OVERDUE ${amount} — was due ${due}` : `${amount} — due ${due}`
}
