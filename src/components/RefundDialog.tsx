import { useState } from 'react'
import { X, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { apiFetch, getErrorMessage } from '../lib/api'

export interface RefundableTx {
  id: string
  customer_name?: string
  customer_email?: string
  description?: string
  date?: string
  amount: number
  gross_amount?: number
  amount_refunded?: number
  refundable?: number
}

interface RefundResult {
  id: string
  amount: number
  status: string
  remainingRefundable: number
  logged: boolean
}

const REASONS = [
  { value: 'requested_by_customer', label: 'Requested by customer' },
  { value: 'duplicate', label: 'Duplicate charge' },
  { value: 'fraudulent', label: 'Fraudulent' },
]

function money(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

export default function RefundDialog({ tx, onClose, onRefunded }: { tx: RefundableTx; onClose: () => void; onRefunded: () => void }) {
  const gross = tx.gross_amount ?? tx.amount
  const alreadyRefunded = tx.amount_refunded ?? 0
  const refundable = tx.refundable ?? tx.amount

  const [amount, setAmount] = useState(String(refundable.toFixed(2)))
  const [reason, setReason] = useState('requested_by_customer')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RefundResult | null>(null)

  const parsed = Number(amount)
  const amountValid = Number.isFinite(parsed) && parsed > 0 && parsed <= refundable + 0.0001
  const who = tx.customer_name || tx.customer_email || 'this customer'

  async function submit() {
    if (!amountValid || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await apiFetch<RefundResult>('/api/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chargeId: tx.id, amount: parsed, reason }),
      })
      setResult(res)
      onRefunded()
    } catch (err) {
      setError(getErrorMessage(err, 'Refund failed.'))
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="relative w-full max-w-md card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-white">{result ? 'Refund issued' : 'Issue refund'}</h3>
          <button onClick={onClose} disabled={busy} className="text-slate-500 hover:text-white transition-colors disabled:opacity-40">
            <X size={18} />
          </button>
        </div>

        {result ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-emerald-300">
              <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" />
              <p className="text-sm">
                Refunded <span className="font-semibold">{money(result.amount)}</span> to {who}. Stripe status: {result.status}.
              </p>
            </div>
            {result.remainingRefundable > 0 && (
              <p className="text-xs text-slate-500">{money(result.remainingRefundable)} of this charge is still refundable.</p>
            )}
            {!result.logged && (
              <p className="text-xs text-amber-300/80">
                The refund succeeded, but it couldn't be written to the audit log. Stripe still has the record.
              </p>
            )}
            <button onClick={onClose} className="w-full px-4 py-2.5 rounded-xl bg-white/5 text-slate-200 text-sm font-medium border border-white/10">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-1 text-sm">
              <p className="font-medium text-slate-100">{who}</p>
              <p className="text-xs text-slate-500">{tx.description || 'Payment'}</p>
              <div className="flex justify-between text-xs text-slate-400 pt-1">
                <span>Original charge</span><span>{money(gross)}</span>
              </div>
              {alreadyRefunded > 0 && (
                <div className="flex justify-between text-xs text-amber-300/80">
                  <span>Already refunded</span><span>−{money(alreadyRefunded)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs text-slate-300 font-medium">
                <span>Refundable</span><span>{money(refundable)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-400">Amount to refund (USD)</label>
              <input
                type="number" step="0.01" min="0.01" max={refundable}
                value={amount}
                disabled={confirming || busy}
                onChange={e => { setAmount(e.target.value); setConfirming(false) }}
                className="input-dark w-full disabled:opacity-60"
              />
              {!amountValid && amount !== '' && (
                <p className="text-xs text-red-300">Enter an amount between $0.01 and {money(refundable)}.</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-400">Reason</label>
              <select
                value={reason}
                disabled={confirming || busy}
                onChange={e => setReason(e.target.value)}
                className="input-dark w-full disabled:opacity-60"
              >
                {REASONS.map(r => <option key={r.value} value={r.value} className="bg-slate-900">{r.label}</option>)}
              </select>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-300">
                <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                <span className="break-words">{error}</span>
              </div>
            )}

            {confirming ? (
              <div className="space-y-2">
                <p className="text-sm text-amber-300">
                  Refund {money(parsed)} to {who}? This moves real money and can't be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={submit}
                    disabled={busy}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium disabled:opacity-50"
                  >
                    {busy && <Loader2 size={15} className="animate-spin" />}
                    {busy ? 'Refunding…' : `Yes, refund ${money(parsed)}`}
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    disabled={busy}
                    className="px-4 py-2.5 rounded-xl bg-white/5 text-slate-300 text-sm font-medium border border-white/10 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                disabled={!amountValid}
                className="w-full px-4 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-medium disabled:opacity-50"
              >
                Continue
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
