import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, UserPlus, X, ChevronLeft, ChevronRight, CalendarDays, Pencil, Check, Bell, Flag } from 'lucide-react'
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

  async function load() {
    try {
      const [t, m] = await Promise.all([
        apiJSON<Task[]>('/api/tasks'),
        apiJSON<TeamMember[]>('/api/team-members'),
      ])
      setTasks(t)
      setMembers(m)
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

  const priorityList = useMemo(() =>
    tasks
      .filter(t => t.status === 'todo' || t.status === 'in_progress')
      .sort((a, b) =>
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
        (a.due_date || '9999').localeCompare(b.due_date || '9999') ||
        a.created_at.localeCompare(b.created_at)
      ),
    [tasks])

  const reminderList = useMemo(() =>
    tasks
      .filter(t => t.status === 'reminder')
      .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')),
    [tasks])

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

      {activeTab === 'team' ? (
        /* Team view: priority list + reminders */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Priority list */}
          <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4">
            <div className="flex items-center gap-2 pb-3">
              <Flag size={16} className="text-purple-400" />
              <h2 className="text-sm font-semibold text-slate-200">Priority List</h2>
              <span className="text-xs text-slate-500">{priorityList.length}</span>
            </div>
            <div className="space-y-2">
              {priorityList.map(task => (
                <TeamRow key={task.id} task={task} onComplete={completeTask} onEdit={openEdit} onDelete={deleteTask} />
              ))}
              {priorityList.length === 0 && <p className="text-xs text-slate-600 px-1 py-2">No open tasks</p>}
            </div>
          </div>

          {/* Reminders */}
          <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4">
            <div className="flex items-center gap-2 pb-3">
              <Bell size={16} className="text-amber-400" />
              <h2 className="text-sm font-semibold text-slate-200">Reminders</h2>
              <span className="text-xs text-slate-500">{reminderList.length}</span>
            </div>
            <div className="space-y-2">
              {reminderList.map(task => (
                <TeamRow key={task.id} task={task} showDue onComplete={completeTask} onEdit={openEdit} onDelete={deleteTask} />
              ))}
              {reminderList.length === 0 && <p className="text-xs text-slate-600 px-1 py-2">No reminders — check "Reminder" when creating a task</p>}
            </div>
          </div>
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
                        <p className={`text-sm font-medium ${task.status === 'done' ? 'text-slate-500 line-through' : 'text-white'}`}>
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
                className="input-dark w-full min-h-[80px]"
                placeholder="Description (optional)"
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
      <div className="flex-1 min-w-0">
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
