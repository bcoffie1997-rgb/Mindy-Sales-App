import { useEffect, useMemo, useState } from 'react'
import { CreditCard, Users, Receipt, RefreshCcw, RotateCcw, XCircle, Search, ChevronDown, ChevronUp } from 'lucide-react'
import { apiJSON, errorMessage } from '../lib/api'

interface Tx {
  id: string; amount: number; description: string
  customer_email: string; customer_name: string; date: string
  refunded?: boolean
}

interface Sub {
  id: string; customer_name: string; customer_email: string; status: string
  amount: number; interval: string; product: string; current_period_end: string | null
}

interface Customer {
  key: string; name: string; email: string
  total: number; count: number; lastPayment: string
  txs: Tx[]; subs: Sub[]
}

function fmtFull(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

const payoutTabs = [
  { key: 'customers', label: 'Customers', icon: Users },
  { key: 'payments', label: 'Payments', icon: Receipt },
  { key: 'subscriptions', label: 'Subscriptions', icon: RefreshCcw },
] as const

type ViewKey = typeof payoutTabs[number]['key']

export default function Payments() {
  const [txs, setTxs] = useState<Tx[]>([])
  const [subs, setSubs] = useState<Sub[]>([])
  const [mrr, setMrr] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<ViewKey>('customers')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [refundedIds, setRefundedIds] = useState<string[]>([])
  const [canceledIds, setCanceledIds] = useState<string[]>([])

  const load = () => {
    setLoading(true)
    setError('')
    Promise.all([
      apiJSON<any>('/api/transactions'),
      apiJSON<any>('/api/subscriptions'),
    ]).then(([txData, subData]) => {
      const list: Tx[] = txData.results || []
      list.sort((a, b) => b.date.localeCompare(a.date))
      setTxs(list)
      setSubs(subData.subscriptions || [])
      setMrr(subData.mrr || 0)
    }).catch(err => setError(errorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const customers = useMemo<Customer[]>(() => {
    const map = new Map<string, Customer>()
    for (const t of txs) {
      const key = (t.customer_email || t.customer_name || 'unknown').toLowerCase()
      if (!map.has(key)) {
        map.set(key, { key, name: t.customer_name || t.customer_email || 'Unknown', email: t.customer_email, total: 0, count: 0, lastPayment: t.date, txs: [], subs: [] })
      }
      const c = map.get(key)!
      c.total += t.amount
      c.count++
      if (t.date > c.lastPayment) c.lastPayment = t.date
      c.txs.push(t)
    }
    for (const s of subs) {
      const key = (s.customer_email || s.customer_name || '').toLowerCase()
      const c = key ? map.get(key) : undefined
      if (c) c.subs.push(s)
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [txs, subs])

  const q = search.toLowerCase()
  const filteredCustomers = customers.filter(c =>
    !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
  const filteredTxs = txs.filter(t =>
    !q || t.customer_name.toLowerCase().includes(q) || t.customer_email.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
  const filteredSubs = subs.filter(s =>
    !q || s.customer_name.toLowerCase().includes(q) || s.customer_email.toLowerCase().includes(q) || s.product.toLowerCase().includes(q))

  const grossVolume = txs.filter(t => !t.refunded && !refundedIds.includes(t.id)).reduce((s, t) => s + t.amount, 0)
  const refundedTotal = txs.filter(t => t.refunded || refundedIds.includes(t.id)).reduce((s, t) => s + t.amount, 0)

  const refundTx = async (tx: Tx) => {
    if (!window.confirm(`Refund ${fmtFull(tx.amount)} to ${tx.customer_name || tx.customer_email || 'this customer'}?\n\nThis sends the money back through Stripe and cannot be undone.`)) return
    setBusy(tx.id)
    setError('')
    try {
      await apiJSON('/api/stripe-refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ charge: tx.id }),
      })
      setRefundedIds(prev => [...prev, tx.id])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const cancelSub = async (sub: Sub) => {
    if (!window.confirm(`Cancel ${sub.customer_name || sub.customer_email}'s subscription to ${sub.product} (${fmtFull(sub.amount)}/${sub.interval})?\n\nThis stops all future billing immediately.`)) return
    setBusy(sub.id)
    setError('')
    try {
      await apiJSON('/api/stripe-cancel-sub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.id }),
      })
      setCanceledIds(prev => [...prev, sub.id])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const isRefunded = (t: Tx) => t.refunded || refundedIds.includes(t.id)
  const isCanceled = (s: Sub) => canceledIds.includes(s.id)

  const RefundButton = ({ tx }: { tx: Tx }) => isRefunded(tx) ? (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30">Refunded</span>
  ) : (
    <button
      onClick={e => { e.stopPropagation(); refundTx(tx) }}
      disabled={busy === tx.id}
      className="text-[10px] px-2 py-1 rounded border border-white/10 text-slate-400 hover:text-red-300 hover:border-red-500/40 transition-colors disabled:opacity-50 inline-flex items-center gap-1"
    >
      <RotateCcw size={10} /> {busy === tx.id ? 'Refunding…' : 'Refund'}
    </button>
  )

  const SubRow = ({ sub }: { sub: Sub }) => (
    <div className="flex items-center justify-between gap-3 py-1.5 text-xs">
      <div className="min-w-0">
        <span className="text-slate-200">{sub.product}</span>
        <span className="text-slate-500"> — {fmtFull(sub.amount)}/{sub.interval}</span>
        {sub.current_period_end && <span className="text-slate-600"> · renews {fmtDate(sub.current_period_end)}</span>}
      </div>
      {isCanceled(sub) ? (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-400 border border-white/10 shrink-0">Canceled</span>
      ) : sub.status === 'past_due' ? (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">Past due</span>
      ) : (
        <button
          onClick={e => { e.stopPropagation(); cancelSub(sub) }}
          disabled={busy === sub.id}
          className="text-[10px] px-2 py-1 rounded border border-white/10 text-slate-400 hover:text-red-300 hover:border-red-500/40 transition-colors disabled:opacity-50 inline-flex items-center gap-1 shrink-0"
        >
          <XCircle size={10} /> {busy === sub.id ? 'Canceling…' : 'Cancel'}
        </button>
      )}
    </div>
  )

  if (loading) return <div className="p-6 text-sm text-slate-400">Loading payments from Stripe…</div>

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-[1200px]">
      {error && <div className="card p-3 text-sm text-red-300 border-red-500/30">{error}</div>}

      {/* Summary cards, Stripe-home style */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4">
          <p className="text-xs text-slate-500">Gross volume (12 mo)</p>
          <p className="text-xl font-bold text-emerald-400">{fmtFull(grossVolume)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500">Refunded</p>
          <p className="text-xl font-bold text-red-300">{fmtFull(refundedTotal)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500">MRR</p>
          <p className="text-xl font-bold text-amber-300">{fmtFull(mrr)}</p>
          <p className="text-[10px] text-slate-500">{subs.filter(s => s.status === 'active' && !isCanceled(s)).length} active subscriptions</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500">Customers</p>
          <p className="text-xl font-bold text-slate-100">{customers.length}</p>
        </div>
      </div>

      {/* Internal tabs + search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex items-center gap-1 bg-white/5 rounded-xl p-1 border border-white/10 self-start">
          {payoutTabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                view === key ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            placeholder="Search…"
            className="input-dark w-full pl-8"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Customers */}
      {view === 'customers' && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">Customers ({filteredCustomers.length})</h3>
          <div className="divide-y divide-white/5">
            {filteredCustomers.map(c => (
              <div key={c.key}>
                <button
                  onClick={() => setExpanded(expanded === c.key ? null : c.key)}
                  className="w-full flex items-center justify-between gap-3 py-2.5 hover:bg-white/[0.03] px-2 rounded-lg text-left"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{c.name}</p>
                    {c.email && <p className="text-[10px] text-slate-500 truncate">{c.email}</p>}
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-xs">
                    {c.subs.some(s => s.status === 'active' && !isCanceled(s)) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">Subscribed</span>
                    )}
                    <span className="text-slate-500 hidden sm:inline">{c.count} payment{c.count === 1 ? '' : 's'}</span>
                    <span className="font-semibold text-emerald-400">{fmtFull(c.total)}</span>
                    {expanded === c.key ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                  </div>
                </button>
                {expanded === c.key && (
                  <div className="px-4 pb-4 pt-1 space-y-3 bg-white/[0.02] rounded-lg mb-2">
                    {c.subs.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Subscriptions</p>
                        {c.subs.map(s => <SubRow key={s.id} sub={s} />)}
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Payments</p>
                      {c.txs.map(t => (
                        <div key={t.id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                          <div className="min-w-0">
                            <span className="text-slate-400">{fmtDate(t.date)}</span>
                            <span className="text-slate-500"> — {t.description || 'Payment'}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className={`font-semibold ${isRefunded(t) ? 'text-slate-500 line-through' : 'text-emerald-400'}`}>{fmtFull(t.amount)}</span>
                            <RefundButton tx={t} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {filteredCustomers.length === 0 && <p className="py-8 text-center text-slate-500 text-sm">No customers match "{search}"</p>}
          </div>
        </div>
      )}

      {/* Payments */}
      {view === 'payments' && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">Payments ({filteredTxs.length})</h3>
          <div className="divide-y divide-white/5 max-h-[600px] overflow-y-auto">
            {filteredTxs.slice(0, 200).map(t => (
              <div key={t.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="font-medium text-slate-200 truncate">{t.customer_name || t.customer_email || 'Customer'}</p>
                  <p className="text-[10px] text-slate-500 truncate">{t.description || 'Payment'} · {fmtDate(t.date)}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`font-semibold ${isRefunded(t) ? 'text-slate-500 line-through' : 'text-emerald-400'}`}>{fmtFull(t.amount)}</span>
                  <RefundButton tx={t} />
                </div>
              </div>
            ))}
            {filteredTxs.length === 0 && <p className="py-8 text-center text-slate-500 text-sm">No payments match "{search}"</p>}
          </div>
        </div>
      )}

      {/* Subscriptions */}
      {view === 'subscriptions' && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">Subscriptions ({filteredSubs.length})</h3>
          <div className="divide-y divide-white/5">
            {filteredSubs.map(s => (
              <div key={s.id} className="py-2">
                <p className="text-xs font-medium text-slate-200">{s.customer_name || s.customer_email || 'Customer'}</p>
                <SubRow sub={s} />
              </div>
            ))}
            {filteredSubs.length === 0 && <p className="py-8 text-center text-slate-500 text-sm">No subscriptions match "{search}"</p>}
          </div>
        </div>
      )}
    </div>
  )
}
