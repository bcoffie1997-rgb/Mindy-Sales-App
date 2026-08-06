import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, CheckCircle, Circle, Plus, UserCheck, RefreshCw } from 'lucide-react'

interface Task { id: string; text: string; done: boolean }
interface Client {
  id: string; name: string; email?: string; company?: string
  client_amount?: string
  metadata?: {
    managed?: boolean; consultant?: string; current_status?: string
    tasks?: Task[]; sessions_total?: number; sessions?: any[]; deliverables?: any[]
    [k: string]: any
  }
}

function progressOf(client: Client): { pct: number; label: string } {
  const meta = client.metadata || {}
  const sessTotal = Number(meta.sessions_total) || 0
  const sessDone = (meta.sessions || []).filter((s: any) => s.done).length
  if (sessTotal) return { pct: Math.round((sessDone / sessTotal) * 100), label: `${sessDone}/${sessTotal} sessions` }
  const delivs = meta.deliverables || []
  if (delivs.length) {
    const done = delivs.filter((d: any) => d.done).length
    return { pct: Math.round((done / delivs.length) * 100), label: `${done}/${delivs.length} delivered` }
  }
  return { pct: 0, label: meta.current_status || 'Not started' }
}

export default function TeamTodos() {
  const navigate = useNavigate()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [newTodo, setNewTodo] = useState('')
  const [targetClient, setTargetClient] = useState('')
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/clients')
      .then(r => r.json())
      .then((data: Client[]) => setClients(Array.isArray(data) ? data : []))
      .catch(() => setClients([]))
      .finally(() => setLoading(false))
  }, [])

  // Team members = distinct consultants assigned across clients
  const members = useMemo(() => {
    const set = new Set<string>()
    for (const c of clients) {
      const name = (c.metadata?.consultant || '').trim()
      if (name) set.add(name)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [clients])

  // Default the selected member to the first one once data arrives
  useEffect(() => {
    if (selected === null && members.length) setSelected(members[0])
  }, [members, selected])

  const active = selected ?? members[0] ?? null

  const memberClients = useMemo(
    () => clients.filter(c => (c.metadata?.consultant || '').trim() === active),
    [clients, active]
  )
  const managedClients = memberClients.filter(c => c.metadata?.managed)

  // Aggregate to-dos from every client this member is assigned to
  const todos = useMemo(() => {
    const out: { task: Task; client: Client }[] = []
    for (const c of memberClients) {
      for (const t of (c.metadata?.tasks || [])) out.push({ task: t, client: c })
    }
    // open items first, then completed
    return out.sort((a, b) => Number(a.task.done) - Number(b.task.done))
  }, [memberClients])

  const openCountByMember = useMemo(() => {
    const map: Record<string, number> = {}
    for (const c of clients) {
      const name = (c.metadata?.consultant || '').trim()
      if (!name) continue
      const open = (c.metadata?.tasks || []).filter(t => !t.done).length
      map[name] = (map[name] || 0) + open
    }
    return map
  }, [clients])

  // Keep the "add to client" selector pointed at a valid client for this member
  useEffect(() => {
    if (!memberClients.some(c => c.id === targetClient)) {
      setTargetClient(memberClients[0]?.id || '')
    }
  }, [memberClients, targetClient])

  async function persistTasks(client: Client, tasks: Task[]) {
    setSavingIds(prev => new Set(prev).add(client.id))
    // optimistic local update
    setClients(prev => prev.map(c =>
      c.id === client.id ? { ...c, metadata: { ...(c.metadata || {}), tasks } } : c
    ))
    try {
      await fetch(`/api/leads/${encodeURIComponent(client.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: { ...(client.metadata || {}), tasks } }),
      })
    } catch { /* keep optimistic state; will resync on next load */ }
    finally {
      setSavingIds(prev => { const n = new Set(prev); n.delete(client.id); return n })
    }
  }

  function toggleTodo(client: Client, taskId: string) {
    const tasks = (client.metadata?.tasks || []).map(t => t.id === taskId ? { ...t, done: !t.done } : t)
    persistTasks(client, tasks)
  }

  function deleteTodo(client: Client, taskId: string) {
    const tasks = (client.metadata?.tasks || []).filter(t => t.id !== taskId)
    persistTasks(client, tasks)
  }

  function addTodo() {
    const text = newTodo.trim()
    const client = memberClients.find(c => c.id === targetClient)
    if (!text || !client) return
    const tasks = [...(client.metadata?.tasks || []), { id: `t${Date.now()}`, text, done: false }]
    persistTasks(client, tasks)
    setNewTodo('')
  }

  const openCount = todos.filter(t => !t.task.done).length
  const doneCount = todos.length - openCount

  return (
    <div className="card p-5 space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Users size={16} className="text-purple-400" /> Team To-Dos
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Toggle a team member to see their to-do list and the clients they manage</p>
        </div>
        {active && <span className="text-xs text-slate-500">{openCount} open · {doneCount} done</span>}
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-500">Loading team…</div>
      ) : members.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-slate-400 font-medium">No team members yet</p>
          <p className="text-xs text-slate-500 mt-1">
            Open a client and assign a <span className="text-purple-400">Consultant</span> to see them here.
          </p>
        </div>
      ) : (
        <>
          {/* Team member toggle */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {members.map(m => {
              const isActive = m === active
              const open = openCountByMember[m] || 0
              return (
                <button
                  key={m}
                  onClick={() => setSelected(m)}
                  className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
                    isActive
                      ? 'bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-500/20'
                      : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/[0.08]'
                  }`}
                >
                  <span className="truncate max-w-[160px]">{m}</span>
                  {open > 0 && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      isActive ? 'bg-white/25 text-white' : 'bg-purple-500/20 text-purple-300'
                    }`}>{open}</span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* To-do list */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">To-Do List</h4>
                {active && savingIds.size > 0 && (
                  <span className="text-[11px] text-slate-500 flex items-center gap-1">
                    <RefreshCw size={10} className="animate-spin" /> Saving…
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                {todos.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4 text-center border border-dashed border-white/10 rounded-xl">
                    No to-dos for {active} yet.
                  </p>
                ) : (
                  todos.map(({ task, client }) => (
                    <div key={client.id + task.id} className="group flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-white/5">
                      <button onClick={() => toggleTodo(client, task.id)} className="flex-shrink-0">
                        {task.done
                          ? <CheckCircle size={17} className="text-emerald-400" />
                          : <Circle size={17} className="text-slate-500 hover:text-slate-300" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm truncate ${task.done ? 'line-through text-slate-500' : 'text-slate-200'}`}>{task.text}</p>
                        <button
                          onClick={() => navigate(`/clients/${encodeURIComponent(client.id)}`)}
                          className="text-[11px] text-slate-500 hover:text-purple-400 transition-colors truncate max-w-full"
                        >
                          {client.name}
                        </button>
                      </div>
                      <button
                        onClick={() => deleteTodo(client, task.id)}
                        className="flex-shrink-0 text-slate-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Delete to-do"
                      >✕</button>
                    </div>
                  ))
                )}
              </div>

              {/* Add a to-do */}
              {memberClients.length > 0 && (
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <input
                    value={newTodo}
                    onChange={e => setNewTodo(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addTodo()}
                    placeholder="Add a to-do…"
                    className="input-dark flex-1 text-sm"
                  />
                  <select
                    value={targetClient}
                    onChange={e => setTargetClient(e.target.value)}
                    className="input-dark text-sm sm:max-w-[40%]"
                    title="Attach this to-do to a client"
                  >
                    {memberClients.map(c => (
                      <option key={c.id} value={c.id} className="bg-slate-900">{c.name}</option>
                    ))}
                  </select>
                  <button onClick={addTodo} className="btn-ghost border border-white/10 px-3 flex-shrink-0">
                    <Plus size={16} />
                  </button>
                </div>
              )}
            </div>

            {/* Managed clients */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Managing {managedClients.length > 0 ? `· ${managedClients.length}` : ''}
              </h4>
              {memberClients.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center border border-dashed border-white/10 rounded-xl">
                  {active} isn’t managing any clients yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {memberClients.map(client => {
                    const { pct, label } = progressOf(client)
                    return (
                      <div
                        key={client.id}
                        onClick={() => navigate(`/manage/${encodeURIComponent(client.id)}`)}
                        className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 cursor-pointer hover:bg-white/[0.06] transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <UserCheck size={14} className="text-purple-400 flex-shrink-0" />
                            <span className="text-sm font-medium text-slate-200 truncate">{client.name}</span>
                            {client.metadata?.managed && (
                              <span className="badge-green flex-shrink-0">Managed</span>
                            )}
                          </div>
                          {client.client_amount && (
                            <span className="text-xs font-semibold text-emerald-400 flex-shrink-0">{client.client_amount}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : pct > 50 ? 'bg-purple-500' : 'bg-blue-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-slate-500 flex-shrink-0 truncate max-w-[45%]">{label}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
