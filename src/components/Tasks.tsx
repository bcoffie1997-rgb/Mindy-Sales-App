import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, UserPlus, X, ChevronLeft, ChevronRight, CalendarDays, Pencil, Check, Bell, Flag, LayoutGrid, List, Calendar } from 'lucide-react'
import { apiJSON, errorMessage } from '../lib/api'

interface Task {
  id: number
  title: string
  description: string | null
  status: 'todo' | 'in_progress' | 'done' | 'reminder'
  priority: 'low' | 'medium' | 'high'
  assignee: string | null
  due_date: string | null
  created_at: string
  completed_at: string | null
}

interface TeamMember {
  id: number
  name: string
}

const COLUMNS: { key: Task['status']; label: string }[] = [
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
]

const PRIORITY_ORDER: Record<Task['priority'], number> = { high: 0, medium: 1, low: 2 }

const PRIORITY_STYLES: Record<Task['priority'], string> = {
  high: 'bg-red-500/15 text-red-300 border-red-500/30',
  medium: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  low: 'bg-slate-500/15 text-slate-400 border-white/10',
}

interface TaskFormState {
  id: number | null
  title: string
  description: string
  assignee: string
  priority: Task['priority']
  due_date: string
  asReminder: boolean
  origStatus: Task['status']
}

const emptyForm: TaskFormState = { id: null, title: '', description: '', assignee: '', priority: 'medium', due_date: '', asReminder: false, origStatus: 'todo' }

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function dueState(due_date: string | null, status: Task['status']) {
  if (!due_date || status === 'done') return 'none'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(due_date + 'T00:00:00')
  if (due.getTime() < today.getTime()) return 'overdue'
  if (due.getTime() === today.getTime()) return 'today'
  return 'upcoming'
}

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [members, setMembers] = useState<TeamMember[]>([])
  const [activeTab, setActiveTab] = useState('team')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [setupRequired, setSetupRequired] = useState(false)
  const [form, setForm] = useState<TaskFormState | null>(null)
  const [addingPerson, setAddingPerson] = useState(false)
  const [personName, setPersonName] = useState('')
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState<'board' | 'list' | 'calendar'>('board')

  async function load() {
    try {
      const [t, m] = await Promise.all([
        apiJSON<Task[]>('/api/tasks'),
        apiJSON<TeamMember[]>('/api/team-members'),
      ])
      setTasks(t)
      const pinLast = ['Branden', 'Eric Coffie']
      setMembers([...m].sort((a, b) => {
        const pa = pinLast.includes(a.name) ? 1 : 0
        const pb = pinLast.includes(b.name) ? 1 : 0
        return pa - pb || a.name.localeCompare(b.name)
      }))
      setError('')
      setSetupRequired(false)
    } catch (err: any) {
      if (err?.status === 503) setSetupRequired(true)
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const visibleTasks = useMemo(() => {
    const filtered = activeTab === 'team' ? tasks : tasks.filter(t => t.assignee === activeTab)
    const order: Record<Task['status'], number> = { todo: 0, in_progress: 1, done: 2, reminder: 3 }
    return [...filtered].sort((a, b) => order[a.status] - order[b.status])
  }, [tasks, activeTab])

  // Tasks shown in list/calendar views: team tab = unassigned (team-wide), member tab = theirs
  const viewTasks = useMemo(() =>
    activeTab === 'team' ? tasks.filter(t => !t.assignee) : tasks.filter(t => t.assignee === activeTab),
    [tasks, activeTab])

  const priorityList = useMemo(() =>
    tasks
      .filter(t => (t.status === 'todo' || t.status === 'in_progress') && !t.assignee)
      .sort((a, b) =>
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
        (a.due_date || '9999').localeCompare(b.due_date || '9999') ||
        a.created_at.localeCompare(b.created_at)
      ),
    [tasks])

  const reminderList = useMemo(() =>
    tasks
      .filter(t => t.status === 'reminder' && !t.assignee)
      .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')),
    [tasks])

  // Merge priority items + reminders into one interleaved bulletin board
  const boardItems = useMemo(() => {
    const items: { task: Task; kind: 'priority' | 'reminder' }[] = []
    const maxLen = Math.max(priorityList.length, reminderList.length)
    for (let i = 0; i < maxLen; i++) {
      if (priorityList[i]) items.push({ task: priorityList[i], kind: 'priority' })
      if (reminderList[i]) items.push({ task: reminderList[i], kind: 'reminder' })
    }
    return items
  }, [priorityList, reminderList])

  async function patchTask(id: number, fields: Record<string, unknown>) {
    await apiJSON('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...fields }),
    })
  }

  async function saveTask() {
    if (!form || !form.title.trim()) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        assignee: form.assignee || null,
        priority: form.priority,
        due_date: form.due_date || null,
      }
      if (form.asReminder) payload.status = 'reminder'
      else if (form.origStatus === 'reminder') payload.status = 'todo'
      if (form.id) {
        await patchTask(form.id, payload)
      } else {
        await apiJSON('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      setForm(null)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function moveTask(task: Task, direction: 1 | -1) {
    const idx = COLUMNS.findIndex(c => c.key === task.status)
    const next = COLUMNS[idx + direction]
    if (!next) return
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next.key } : t))
    try {
      await patchTask(task.id, { status: next.key })
    } catch (err) {
      setError(errorMessage(err))
      await load()
    }
  }

  async function completeTask(task: Task) {
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'done' } : t))
    try {
      await patchTask(task.id, { status: 'done' })
    } catch (err) {
      setError(errorMessage(err))
      await load()
    }
  }

  async function deleteTask(task: Task) {
    if (!window.confirm(`Delete "${task.title}"?`)) return
    setTasks(prev => prev.filter(t => t.id !== task.id))
    try {
      await apiJSON(`/api/tasks?id=${task.id}`, { method: 'DELETE' })
    } catch (err) {
      setError(errorMessage(err))
      await load()
    }
  }

  async function addPerson() {
    const name = personName.trim()
    if (!name) return
    setSaving(true)
    try {
      await apiJSON('/api/team-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      setPersonName('')
      setAddingPerson(false)
      await load()
      setActiveTab(name)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function removePerson(member: TeamMember) {
    if (!window.confirm(`Remove ${member.name} from the team? Their tasks stay on the Team board.`)) return
    try {
      await apiJSON(`/api/team-members?id=${member.id}`, { method: 'DELETE' })
      if (activeTab === member.name) setActiveTab('team')
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  function openEdit(task: Task) {
    setForm({
      id: task.id,
      title: task.title,
      description: task.description || '',
      assignee: task.assignee || '',
      priority: task.priority,
      due_date: task.due_date || '',
      asReminder: task.status === 'reminder',
      origStatus: task.status,
    })
  }

  if (loading) {
    return <div className="p-8 text-slate-500">Loading tasks…</div>
  }

  if (setupRequired) {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-2xl font-bold text-white mb-3">Tasks</h1>
        <div className="card p-6 space-y-3">
          <p className="text-slate-300">The task tables haven't been created in the database yet.</p>
          <p className="text-sm text-slate-400">
            Open your Supabase project → SQL Editor, paste the task tables block from
            <code className="text-purple-300"> supabase/schema.sql</code>, and run it. Then refresh this page.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white">Tasks</h1>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-0.5 bg-white/5 rounded-xl p-1 border border-white/10">
            <ViewButton icon={LayoutGrid} label="Board" active={view === 'board'} onClick={() => setView('board')} />
            <ViewButton icon={List} label="List" active={view === 'list'} onClick={() => setView('list')} />
            <ViewButton icon={Calendar} label="Calendar" active={view === 'calendar'} onClick={() => setView('calendar')} />
          </div>
          <button onClick={() => setAddingPerson(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-slate-300 hover:text-white border border-white/10 hover:border-white/20 transition-colors">
            <UserPlus size={16} /> Add person
          </button>
          <button onClick={() => setForm({ ...emptyForm })} className="btn-primary flex items-center gap-1.5">
            <Plus size={16} /> New task
          </button>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}

      {/* Add person inline form */}
      {addingPerson && (
        <div className="card p-4 flex items-center gap-2 max-w-md">
          <input
            autoFocus
            className="input-dark flex-1"
            placeholder="Team member's name"
            value={personName}
            onChange={e => setPersonName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addPerson()}
          />
          <button onClick={addPerson} disabled={saving || !personName.trim()} className="btn-primary disabled:opacity-50">Add</button>
          <button onClick={() => { setAddingPerson(false); setPersonName('') }} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
      )}

      {/* Sub-tabs: Team + members */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-white/10">
        <SubTab label="Team" active={activeTab === 'team'} onClick={() => setActiveTab('team')} />
        {members.map(m => (
          <div key={m.id} className="group flex items-center">
            <SubTab label={m.name} active={activeTab === m.name} onClick={() => setActiveTab(m.name)} />
            <button
              onClick={() => removePerson(m)}
              title={`Remove ${m.name}`}
              className="opacity-0 group-hover:opacity-100 -ml-1 mr-1 text-slate-600 hover:text-red-400 transition-all"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>

      {view === 'list' ? (
        <TaskListView tasks={viewTasks} onComplete={completeTask} onEdit={openEdit} onDelete={deleteTask} />
      ) : view === 'calendar' ? (
        <CalendarView tasks={viewTasks} onEdit={openEdit} onAddForDate={date => setForm({ ...emptyForm, due_date: date, assignee: activeTab === 'team' ? '' : activeTab })} />
      ) : activeTab === 'team' ? (
        /* Team view: a single bulletin board mixing priority items + reminders as pinned notes */
        <div
          className="relative rounded-3xl border border-white/10 p-4 sm:p-6 md:p-8"
          style={{
            backgroundColor: '#0a0f1f',
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1.3px)',
            backgroundSize: '22px 22px',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), inset 0 0 70px rgba(0,0,0,0.55)',
          }}
        >
          {/* Board header + legend */}
          <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
            <h2 className="text-base font-semibold tracking-tight text-white">Team Board</h2>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/30 bg-purple-500/15 px-2.5 py-1 font-medium text-purple-200">
                <Flag size={12} /> Priority <span className="text-purple-300/70">{priorityList.length}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/15 px-2.5 py-1 font-medium text-amber-200">
                <Bell size={12} /> Reminders <span className="text-amber-300/70">{reminderList.length}</span>
              </span>
            </div>
          </div>

          {boardItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Flag size={22} className="text-slate-600" />
              <p className="text-sm text-slate-400">The board is empty</p>
              <p className="text-xs text-slate-600">Add a task to pin it here — check "Reminder" when creating one to post it as a reminder.</p>
            </div>
          ) : (
            <div className="columns-1 sm:columns-2 xl:columns-3 gap-4 [column-fill:_balance]">
              {boardItems.map((item, i) => (
                <BoardNote
                  key={item.task.id}
                  task={item.task}
                  kind={item.kind}
                  index={i}
                  onComplete={completeTask}
                  onEdit={openEdit}
                  onDelete={deleteTask}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Member view: kanban board */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLUMNS.map(col => {
            const colTasks = visibleTasks.filter(t => t.status === col.key)
            return (
              <div key={col.key} className="rounded-2xl bg-white/[0.03] border border-white/10 p-3 min-h-[120px]">
                <div className="flex items-center justify-between px-1 pb-3">
                  <h2 className="text-sm font-semibold text-slate-300">{col.label}</h2>
                  <span className="text-xs text-slate-500">{colTasks.length}</span>
                </div>
                <div className="space-y-2">
                  {colTasks.map(task => (
                    <div key={task.id} className="card p-3.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          onClick={() => openEdit(task)}
                          title="Click to view details"
                          className={`cursor-pointer text-sm font-medium ${task.status === 'done' ? 'text-slate-500 line-through' : 'text-white'}`}
                        >
                          {task.title}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => openEdit(task)} className="text-slate-500 hover:text-white transition-colors" title="Edit">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => deleteTask(task)} className="text-slate-500 hover:text-red-400 transition-colors" title="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      {task.description && <p className="text-xs text-slate-400 line-clamp-2">{task.description}</p>}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${PRIORITY_STYLES[task.priority]}`}>
                          {task.priority}
                        </span>
                        {task.due_date && (
                          <span className="flex items-center gap-1 text-[10px] text-slate-400">
                            <CalendarDays size={11} />
                            {fmtDate(task.due_date)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <button
                          onClick={() => moveTask(task, -1)}
                          disabled={task.status === 'todo'}
                          className="text-slate-500 hover:text-white disabled:opacity-20 transition-colors"
                          title="Move back"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <button
                          onClick={() => moveTask(task, 1)}
                          disabled={task.status === 'done'}
                          className="text-slate-500 hover:text-white disabled:opacity-20 transition-colors"
                          title="Move forward"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {colTasks.length === 0 && <p className="text-xs text-slate-600 px-1 py-2">No tasks</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* New / edit task modal */}
      {form && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setForm(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="card w-full max-w-md p-6 space-y-4 pointer-events-auto">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">{form.id ? 'Edit task' : 'New task'}</h2>
                <button onClick={() => setForm(null)} className="text-slate-400 hover:text-white"><X size={18} /></button>
              </div>
              <input
                autoFocus
                className="input-dark w-full"
                placeholder="Task title"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && saveTask()}
              />
              <textarea
                className="input-dark w-full min-h-[120px]"
                placeholder="Add details, context, links, notes…"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <select className="input-dark w-full" value={form.assignee} onChange={e => setForm({ ...form, assignee: e.target.value })}>
                  <option value="">Unassigned</option>
                  {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
                <select className="input-dark w-full" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as Task['priority'] })}>
                  <option value="low">Low priority</option>
                  <option value="medium">Medium priority</option>
                  <option value="high">High priority</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Due date (optional)</label>
                <input
                  type="date"
                  className="input-dark w-full"
                  value={form.due_date}
                  onChange={e => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2.5 text-sm text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.asReminder}
                  onChange={e => setForm({ ...form, asReminder: e.target.checked })}
                  className="accent-purple-500 w-4 h-4"
                />
                Reminder — shows in the Reminders list instead of the Priority List
              </label>
              <button onClick={saveTask} disabled={saving || !form.title.trim()} className="btn-primary w-full disabled:opacity-50">
                {saving ? 'Saving…' : form.id ? 'Save changes' : 'Add task'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function TeamRow({ task, showDue, onComplete, onEdit, onDelete }: {
  task: Task
  showDue?: boolean
  onComplete: (t: Task) => void
  onEdit: (t: Task) => void
  onDelete: (t: Task) => void
}) {
  const due = dueState(task.due_date, task.status)
  return (
    <div className="card p-3 flex items-center gap-3">
      <button
        onClick={() => onComplete(task)}
        title="Mark done"
        className="w-5 h-5 rounded-md border border-slate-600 hover:border-emerald-400 hover:text-emerald-400 text-transparent flex items-center justify-center shrink-0 transition-colors"
      >
        <Check size={13} />
      </button>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onEdit(task)} title="Click to view details">
        <p className="text-sm font-medium text-white truncate">{task.title}</p>
        <div className="flex items-center gap-2 flex-wrap mt-1">
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${PRIORITY_STYLES[task.priority]}`}>
            {task.priority}
          </span>
          {task.assignee && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-purple-500/30 bg-purple-500/15 text-purple-300">
              {task.assignee}
            </span>
          )}
          {showDue && task.due_date && (
            <span className={`flex items-center gap-1 text-[10px] font-medium ${
              due === 'overdue' ? 'text-red-400' : due === 'today' ? 'text-amber-400' : 'text-slate-400'
            }`}>
              <CalendarDays size={11} />
              {due === 'overdue' ? 'Overdue · ' : due === 'today' ? 'Today · ' : ''}{fmtDate(task.due_date)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => onEdit(task)} className="text-slate-500 hover:text-white transition-colors" title="Edit">
          <Pencil size={14} />
        </button>
        <button onClick={() => onDelete(task)} className="text-slate-500 hover:text-red-400 transition-colors" title="Delete">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

// Varied "paper" tints for the bulletin board — cool hues for priority, warm for reminders
const NOTE_TINTS: Record<'priority' | 'reminder', { surface: string; pin: string }[]> = {
  priority: [
    { surface: 'bg-indigo-500/10 border-indigo-400/25', pin: 'bg-indigo-400' },
    { surface: 'bg-purple-500/10 border-purple-400/25', pin: 'bg-purple-400' },
    { surface: 'bg-sky-500/10 border-sky-400/25', pin: 'bg-sky-400' },
    { surface: 'bg-violet-500/10 border-violet-400/25', pin: 'bg-violet-400' },
  ],
  reminder: [
    { surface: 'bg-amber-500/10 border-amber-400/25', pin: 'bg-amber-400' },
    { surface: 'bg-orange-500/10 border-orange-400/25', pin: 'bg-orange-400' },
    { surface: 'bg-rose-500/10 border-rose-400/25', pin: 'bg-rose-400' },
  ],
}

const NOTE_ROTATIONS = [-1.6, 1.2, -0.8, 1.8, -1.2]

function BoardNote({ task, kind, index, onComplete, onEdit, onDelete }: {
  task: Task
  kind: 'priority' | 'reminder'
  index: number
  onComplete: (t: Task) => void
  onEdit: (t: Task) => void
  onDelete: (t: Task) => void
}) {
  const due = dueState(task.due_date, task.status)
  const palette = NOTE_TINTS[kind]
  const tint = palette[index % palette.length]
  const rotation = NOTE_ROTATIONS[index % NOTE_ROTATIONS.length]
  return (
    <div className="mb-4 break-inside-avoid">
      <div
        style={{ transform: `rotate(${rotation}deg)` }}
        className={`group relative rounded-xl border ${tint.surface} p-4 pt-5 shadow-lg shadow-black/30 backdrop-blur-sm transition-transform duration-200 hover:rotate-0 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:transform-none`}
      >
        {/* Pin */}
        <span className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2">
          <span
            className={`block h-3.5 w-3.5 rounded-full ${tint.pin} ring-2 ring-black/30`}
            style={{ boxShadow: 'inset -1px -1px 2px rgba(0,0,0,0.35), 0 2px 3px rgba(0,0,0,0.45)' }}
          />
        </span>

        {/* Type tag + actions */}
        <div className="flex items-start justify-between gap-2">
          {kind === 'priority' ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-purple-400/30 bg-purple-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-200">
              <Flag size={10} /> Priority
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
              <Bell size={10} /> Reminder
            </span>
          )}
          <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onComplete(task)} title="Mark done" className="text-slate-400 hover:text-emerald-400 transition-colors">
              <Check size={14} />
            </button>
            <button onClick={() => onEdit(task)} title="Edit" className="text-slate-400 hover:text-white transition-colors">
              <Pencil size={13} />
            </button>
            <button onClick={() => onDelete(task)} title="Delete" className="text-slate-400 hover:text-red-400 transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Body — click to view / edit details */}
        <button onClick={() => onEdit(task)} title="Click to view details" className="mt-2.5 block w-full text-left">
          <p className="text-sm font-semibold leading-snug text-white">{task.title}</p>
          {task.description && (
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-300/80 line-clamp-4">{task.description}</p>
          )}
        </button>

        {/* Meta */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${PRIORITY_STYLES[task.priority]}`}>
            {task.priority}
          </span>
          {task.due_date && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${
              due === 'overdue' ? 'text-red-400' : due === 'today' ? 'text-amber-400' : 'text-slate-400'
            }`}>
              <CalendarDays size={11} />
              {due === 'overdue' ? 'Overdue · ' : due === 'today' ? 'Today · ' : ''}{fmtDate(task.due_date)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function SubTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
        active ? 'border-purple-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  )
}

function ViewButton({ icon: Icon, label, active, onClick }: { icon: any; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
        active ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
      }`}
    >
      <Icon size={14} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

function TaskListView({ tasks, onComplete, onEdit, onDelete }: {
  tasks: Task[]
  onComplete: (t: Task) => void
  onEdit: (t: Task) => void
  onDelete: (t: Task) => void
}) {
  const sorted = [...tasks].sort((a, b) => {
    if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1
    return (a.due_date || '9999').localeCompare(b.due_date || '9999') ||
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  })
  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4">
      <div className="space-y-2">
        {sorted.map(task => (
          <TeamRow key={task.id} task={task} showDue onComplete={onComplete} onEdit={onEdit} onDelete={onDelete} />
        ))}
        {sorted.length === 0 && <p className="text-xs text-slate-600 px-1 py-2">No tasks</p>}
      </div>
    </div>
  )
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function CalendarView({ tasks, onEdit, onAddForDate }: {
  tasks: Task[]
  onEdit: (t: Task) => void
  onAddForDate: (date: string) => void
}) {
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const year = month.getFullYear()
  const mon = month.getMonth()
  const firstWeekday = new Date(year, mon, 1).getDay()
  const daysInMonth = new Date(year, mon + 1, 0).getDate()
  const todayIso = new Date().toLocaleDateString('en-CA')

  const byDate = new Map<string, Task[]>()
  for (const t of tasks) {
    if (!t.due_date || t.status === 'done') continue
    const list = byDate.get(t.due_date) || []
    list.push(t)
    byDate.set(t.due_date, list)
  }

  const cells: (string | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(mon + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }

  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4">
      <div className="flex items-center justify-between pb-4">
        <button
          onClick={() => setMonth(new Date(year, mon - 1, 1))}
          className="p-1.5 text-slate-400 hover:text-white transition-colors"
          title="Previous month"
        >
          <ChevronLeft size={18} />
        </button>
        <h2 className="text-base font-semibold text-white">
          {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </h2>
        <button
          onClick={() => setMonth(new Date(year, mon + 1, 1))}
          className="p-1.5 text-slate-400 hover:text-white transition-colors"
          title="Next month"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wide pb-2">{d}</div>
        ))}
        {cells.map((iso, i) => {
          if (!iso) return <div key={`empty-${i}`} />
          const dayTasks = byDate.get(iso) || []
          const isToday = iso === todayIso
          const isPast = iso < todayIso
          return (
            <div
              key={iso}
              onClick={() => onAddForDate(iso)}
              className={`min-h-[80px] rounded-lg border p-1.5 cursor-pointer transition-colors hover:border-purple-500/40 ${
                isToday ? 'border-purple-500/60 bg-purple-500/10' : 'border-white/10 bg-white/[0.02]'
              }`}
            >
              <div className={`text-[10px] font-medium mb-1 ${isToday ? 'text-purple-300' : 'text-slate-500'}`}>
                {Number(iso.slice(-2))}
              </div>
              <div className="space-y-1">
                {dayTasks.map(t => (
                  <button
                    key={t.id}
                    onClick={e => { e.stopPropagation(); onEdit(t) }}
                    className={`block w-full text-left text-[10px] leading-tight px-1.5 py-1 rounded truncate border ${PRIORITY_STYLES[t.priority]} ${
                      isPast ? 'opacity-80' : ''
                    }`}
                    title={t.title}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-slate-600 pt-3">Click a day to add a task due that day. Click a task to edit it.</p>
    </div>
  )
}
