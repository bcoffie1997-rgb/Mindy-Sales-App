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

/** One recorded payment, stored in `metadata.payments`. */
export interface PaymentEntry {
  amount: number
  date: string
  note?: string
}

export function paymentHistory(metadata: unknown): PaymentEntry[] {
  const raw = (metadata as Record<string, unknown> | null)?.payments
  if (!Array.isArray(raw)) return []
  const parsed: { entry: PaymentEntry; index: number }[] = []
  raw.forEach((entry, index) => {
    const e = (entry || {}) as Record<string, unknown>
    const amount = toNumber(e.amount)
    if (amount === null) return
    const note = typeof e.note === 'string' && e.note.trim() ? e.note.trim() : undefined
    parsed.push({
      index,
      entry: {
        amount,
        date: typeof e.date === 'string' ? e.date.slice(0, 10) : '',
        ...(note ? { note } : {}),
      },
    })
  })
  // Newest first. Payments recorded on the SAME day tie on date, so fall back
  // to the stored order reversed — the one entered last shows at the top.
  parsed.sort((a, b) => {
    const byDate = (b.entry.date || '').localeCompare(a.entry.date || '')
    return byDate !== 0 ? byDate : b.index - a.index
  })
  return parsed.map(p => p.entry)
}

/** The metadata fields a manual edit of the payment card writes. */
export interface PaymentFields {
  amount_paid: number | null
  balance_due: number | null
  next_payment_due: string | null
}

/**
 * Apply a recorded payment to existing metadata and return ONLY the payment
 * keys that change. Pure, so the UI and the tests exercise the same maths.
 *
 * - adds to amount_paid, takes the same off balance_due (never below zero)
 * - appends to the payments log
 * - clears next_payment_due once the balance reaches zero
 */
export function applyPayment(
  metadata: unknown,
  payment: { amount: number; date: string; note?: string },
): PaymentFields & { payments: PaymentEntry[] } {
  const meta = (metadata || {}) as Record<string, unknown>
  const paidBefore = toNumber(meta.amount_paid) ?? 0
  const balanceBefore = toNumber(meta.balance_due) ?? 0

  const amount = Math.max(0, payment.amount)
  const paid = paidBefore + amount
  const balance = Math.max(0, balanceBefore - amount)

  const entry: PaymentEntry = {
    amount,
    date: payment.date || new Date().toISOString().slice(0, 10),
    ...(payment.note && payment.note.trim() ? { note: payment.note.trim() } : {}),
  }
  // Keep the stored log in chronological order; the UI sorts for display.
  const existing = Array.isArray(meta.payments) ? (meta.payments as PaymentEntry[]) : []

  return {
    amount_paid: paid,
    balance_due: balance,
    // Nothing left owing means there is no next payment to chase
    next_payment_due: balance > 0
      ? (typeof meta.next_payment_due === 'string' ? meta.next_payment_due : null)
      : null,
    payments: [...existing, entry],
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
