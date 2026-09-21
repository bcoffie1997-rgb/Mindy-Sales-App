import { useEffect, useMemo, useState, type DragEvent } from 'react'
import {
  Bot,
  BriefcaseBusiness,
  Building2,
  Calculator,
  Check,
  CircleDollarSign,
  GripVertical,
  Laptop,
  Minus,
  Phone,
  Plus,
  Printer,
  RotateCcw,
  Sparkles,
  UserRoundCog,
  Users,
} from 'lucide-react'

interface ServiceTemplate {
  key: string
  name: string
  description: string
  setup: number
  monthly: number
  included?: boolean
  pricingMode?: 'hourly'
  hours?: number
  hourlyRate?: number
  hourlyBilling?: 'setup' | 'monthly'
  icon: typeof Bot
}

interface ServiceLine extends Omit<ServiceTemplate, 'icon'> {
  id: string
  quantity: number
}

interface QuoteDetails {
  client: string
  contact: string
  packageName: string
  preparedBy: string
  summary: string
  setupDiscount: number
  monthlyDiscount: number
}

const STORAGE_KEY = 'mindy-white-glove-calculator-v1'

const SERVICE_CATALOG: ServiceTemplate[] = [
  {
    key: 'mindy',
    name: 'Mindy Platform',
    description: 'Federal market intelligence, opportunity research, and pursuit support.',
    setup: 0,
    monthly: 0,
    icon: Bot,
  },
  {
    key: 'drm',
    name: 'Digital Relationship Manager (DRM)',
    description: 'Relationship development, outreach coordination, and contact follow-up.',
    setup: 0,
    monthly: 0,
    pricingMode: 'hourly',
    hours: 10,
    hourlyRate: 0,
    hourlyBilling: 'monthly',
    icon: Users,
  },
  {
    key: 'bd-assistant',
    name: 'Dedicated BD Assistant',
    description: 'Full-time trained assistant handling federal calls, email, follow-up, and opportunity tracking.',
    setup: 0,
    monthly: 0,
    pricingMode: 'hourly',
    hours: 160,
    hourlyRate: 8.125,
    hourlyBilling: 'monthly',
    icon: UserRoundCog,
  },
  {
    key: 'bd-manager',
    name: 'BD Manager',
    description: 'Pipeline oversight, weekly strategy, accountability, and pursuit management.',
    setup: 0,
    monthly: 0,
    pricingMode: 'hourly',
    hours: 10,
    hourlyRate: 0,
    hourlyBilling: 'monthly',
    icon: BriefcaseBusiness,
  },
  {
    key: 'crm-phone',
    name: 'CRM + Dedicated Phone',
    description: 'GoHighLevel pipeline, business phone line, SMS, WhatsApp, email, and automated follow-up.',
    setup: 0,
    monthly: 300,
    icon: Phone,
  },
  {
    key: 'slack',
    name: 'Slack Workspace',
    description: 'Team communication, live inquiry alerts, and escalation channels.',
    setup: 0,
    monthly: 0,
    included: true,
    icon: Building2,
  },
  {
    key: 'website',
    name: 'Federal Website Rebuild',
    description: 'Federal-ready website with capabilities, past performance, codes, and CRM-routed inquiry forms.',
    setup: 500,
    monthly: 0,
    icon: Laptop,
  },
  {
    key: 'assistant-training',
    name: 'Assistant Training',
    description: '10 hours of live federal etiquette, capability statement, and opportunity-tracking training.',
    setup: 0,
    monthly: 0,
    pricingMode: 'hourly',
    hours: 10,
    hourlyRate: 50,
    hourlyBilling: 'setup',
    icon: Sparkles,
  },
  {
    key: 'crm-build',
    name: 'CRM, Phone & Slack Build',
    description: 'Initial configuration of the pursuit pipeline, dedicated number, automations, and workspace.',
    setup: 0,
    monthly: 0,
    included: true,
    icon: Calculator,
  },
]

const INITIAL_KEYS = ['bd-assistant', 'crm-phone', 'slack', 'website', 'assistant-training']

function makeId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function lineFromTemplate(template: ServiceTemplate): ServiceLine {
  const { icon: _icon, ...line } = template
  return { ...line, id: makeId(), quantity: 1 }
}

function normalizeSavedLines(savedLines: ServiceLine[]) {
  return savedLines.map(line => {
    const template = SERVICE_CATALOG.find(service => service.key === line.key)
    if (template?.pricingMode !== 'hourly') return { ...line, quantity: line.quantity || 1 }

    const hours = line.hours ?? template.hours ?? 1
    const oldTotal = template.hourlyBilling === 'setup' ? line.setup : line.monthly
    return {
      ...line,
      pricingMode: 'hourly' as const,
      hours,
      hourlyRate: line.hourlyRate ?? (oldTotal ? oldTotal / hours : template.hourlyRate ?? 0),
      hourlyBilling: line.hourlyBilling ?? template.hourlyBilling ?? 'monthly',
      setup: 0,
      monthly: 0,
      quantity: 1,
    }
  })
}

function initialLines() {
  return INITIAL_KEYS
    .map(key => SERVICE_CATALOG.find(service => service.key === key))
    .filter((service): service is ServiceTemplate => Boolean(service))
    .map(lineFromTemplate)
}

function initialDetails(): QuoteDetails {
  return {
    client: '',
    contact: '',
    packageName: 'White Glove Federal BD Services',
    preparedBy: 'Branden Coffie · GovCon Giants',
    summary: 'Your federal business development operation — built, staffed, and managed as one connected system.',
    setupDiscount: 0,
    monthlyDiscount: 0,
  }
}

function money(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function rateMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value || 0)
}

function lineCharge(line: ServiceLine, billing: 'setup' | 'monthly') {
  if (line.included) return 0
  if (line.pricingMode === 'hourly') {
    return line.hourlyBilling === billing ? (line.hours || 0) * (line.hourlyRate || 0) : 0
  }
  return line[billing] * line.quantity
}

function percent(value: number) {
  return Math.min(100, Math.max(0, Number(value) || 0))
}

export default function WhiteGloveCalculator() {
  const [lines, setLines] = useState<ServiceLine[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
      return Array.isArray(saved?.lines) ? normalizeSavedLines(saved.lines) : initialLines()
    } catch {
      return initialLines()
    }
  })
  const [details, setDetails] = useState<QuoteDetails>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
      return saved?.details ? { ...initialDetails(), ...saved.details } : initialDetails()
    } catch {
      return initialDetails()
    }
  })
  const [draggedLineId, setDraggedLineId] = useState<string | null>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lines, details }))
  }, [lines, details])

  const totals = useMemo(() => {
    const setupSubtotal = lines.reduce((sum, line) => sum + lineCharge(line, 'setup'), 0)
    const monthlySubtotal = lines.reduce((sum, line) => sum + lineCharge(line, 'monthly'), 0)
    const setup = setupSubtotal * (1 - percent(details.setupDiscount) / 100)
    const monthly = monthlySubtotal * (1 - percent(details.monthlyDiscount) / 100)
    return {
      setupSubtotal,
      monthlySubtotal,
      setup,
      monthly,
      monthOne: setup + monthly,
      firstYear: setup + monthly * 12,
    }
  }, [details.monthlyDiscount, details.setupDiscount, lines])

  const selectedKeys = new Set(lines.map(line => line.key))
  const availableServices = SERVICE_CATALOG.filter(service => !selectedKeys.has(service.key))
  const missingPrices = lines.filter(line =>
    !line.included && (line.pricingMode === 'hourly'
      ? !line.hourlyRate || !line.hours
      : line.setup === 0 && line.monthly === 0)
  )

  function addService(template: ServiceTemplate) {
    setLines(current => current.some(line => line.key === template.key)
      ? current
      : [...current, lineFromTemplate(template)])
  }

  function addCustomService() {
    setLines(current => [...current, {
      id: makeId(),
      key: `custom-${Date.now()}`,
      name: 'Custom BD Service',
      description: 'Describe the service and deliverables.',
      setup: 0,
      monthly: 0,
      quantity: 1,
    }])
  }

  function updateLine(id: string, update: Partial<ServiceLine>) {
    setLines(current => current.map(line => line.id === id ? { ...line, ...update } : line))
  }

  function reorderLine(id: string, beforeId?: string) {
    setLines(current => {
      const moved = current.find(line => line.id === id)
      if (!moved) return current
      const next = current.filter(line => line.id !== id)
      const index = beforeId ? next.findIndex(line => line.id === beforeId) : next.length
      next.splice(index < 0 ? next.length : index, 0, moved)
      return next
    })
  }

  function dragTemplate(event: DragEvent, key: string) {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('application/x-service-template', key)
  }

  function dropIntoQuote(event: DragEvent, beforeId?: string) {
    event.preventDefault()
    const templateKey = event.dataTransfer.getData('application/x-service-template')
    const lineId = event.dataTransfer.getData('application/x-service-line')
    if (templateKey) {
      const template = SERVICE_CATALOG.find(service => service.key === templateKey)
      if (template) {
        const newLine = lineFromTemplate(template)
        setLines(current => {
          if (current.some(line => line.key === template.key)) return current
          const next = [...current]
          const index = beforeId ? next.findIndex(line => line.id === beforeId) : next.length
          next.splice(index < 0 ? next.length : index, 0, newLine)
          return next
        })
      }
    } else if (lineId) {
      reorderLine(lineId, beforeId)
    }
    setDraggedLineId(null)
  }

  function resetQuote() {
    if (!window.confirm('Reset this calculator to the Monarch proposal defaults?')) return
    setLines(initialLines())
    setDetails(initialDetails())
  }

  return (
    <div className="pricing-calculator p-4 md:p-8 space-y-6">
      <div className="no-print flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CircleDollarSign className="text-purple-400" size={24} />
            <h1 className="text-2xl font-bold text-white">White Glove Pricing Calculator</h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">Build the package live, reorder services, and save the proposal as a PDF.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={resetQuote} className="btn-secondary">
            <RotateCcw size={15} /> Reset
          </button>
          <button onClick={() => window.print()} className="btn-primary" disabled={lines.length === 0}>
            <Printer size={15} /> Print / Save PDF
          </button>
        </div>
      </div>

      <div className="no-print grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-6">
        <aside className="space-y-3">
          <div>
            <h2 className="font-semibold text-white">Available services</h2>
            <p className="text-xs text-slate-500 mt-0.5">Adding a service moves it to your selections on the right.</p>
          </div>
          <div className="space-y-2">
            {availableServices.map(service => {
              const Icon = service.icon
              const hasPrice = service.included || service.setup > 0 || service.monthly > 0 || Boolean(service.hourlyRate)
              return (
                <div
                  key={service.key}
                  draggable
                  role="group"
                  aria-label={`${service.name} catalog service`}
                  onDragStart={event => dragTemplate(event, service.key)}
                  className="card p-3 cursor-grab active:cursor-grabbing"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-300 flex items-center justify-center shrink-0">
                      <Icon size={17} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">{service.name}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{service.description}</p>
                      <p className="text-xs text-emerald-400 mt-1">
                        {service.included
                          ? 'Included'
                          : service.pricingMode === 'hourly' && service.hourlyRate
                            ? `${rateMoney(service.hourlyRate)}/hr · ${service.hours} hrs${service.hourlyBilling === 'monthly' ? '/mo' : ''}`
                          : hasPrice
                            ? [service.setup ? `${money(service.setup)} setup` : '', service.monthly ? `${money(service.monthly)}/mo` : ''].filter(Boolean).join(' · ')
                            : service.pricingMode === 'hourly' ? 'Set hourly rate' : 'Set price on call'}
                      </p>
                    </div>
                    <button onClick={() => addService(service)} className="p-1.5 rounded-lg bg-white/5 text-slate-400 hover:text-white" title={`Add ${service.name}`}>
                      <Plus size={15} />
                    </button>
                  </div>
                </div>
              )
            })}
            {availableServices.length === 0 && (
              <div className="card p-5 text-center text-sm text-slate-500">
                All services have been selected. Remove one from the right to return it here.
              </div>
            )}
          </div>
          <button onClick={addCustomService} className="btn-secondary w-full">
            <Plus size={15} /> Custom service
          </button>
        </aside>

        <section className="space-y-4">
          <div className="card p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs text-slate-400">Client / company</span>
              <input className="input-dark w-full" value={details.client} onChange={event => setDetails({ ...details, client: event.target.value })} placeholder="Monarch Yachts" />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-400">Contact</span>
              <input className="input-dark w-full" value={details.contact} onChange={event => setDetails({ ...details, contact: event.target.value })} placeholder="Denton Douglas" />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs text-slate-400">Package name</span>
              <input className="input-dark w-full" value={details.packageName} onChange={event => setDetails({ ...details, packageName: event.target.value })} />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs text-slate-400">Proposal summary</span>
              <textarea className="input-dark w-full min-h-20" value={details.summary} onChange={event => setDetails({ ...details, summary: event.target.value })} />
            </label>
          </div>

          {missingPrices.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              Set a price or mark as included: {missingPrices.map(line => line.name).join(', ')}
            </div>
          )}

          <div
            onDragOver={event => event.preventDefault()}
            onDrop={event => dropIntoQuote(event)}
            className="space-y-2 min-h-32 rounded-2xl border border-dashed border-white/15 bg-white/[0.015] p-3"
          >
            <div className="flex items-center justify-between px-1 pb-1">
              <div>
                <h2 className="font-semibold text-white">Your selections</h2>
                <p className="text-xs text-slate-500">Selected services stay on the right. Drag to reorder.</p>
              </div>
              <span className="text-xs text-slate-500">{lines.length} services</span>
            </div>

            {lines.map(line => (
              <div
                key={line.id}
                role="group"
                aria-label={`${line.name} selected service`}
                onDragOver={event => event.preventDefault()}
                onDrop={event => {
                  event.stopPropagation()
                  dropIntoQuote(event, line.id)
                }}
                className={`card p-4 transition-opacity ${draggedLineId === line.id ? 'opacity-40' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    draggable
                    aria-label={`Drag ${line.name}`}
                    onDragStart={event => {
                      setDraggedLineId(line.id)
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('application/x-service-line', line.id)
                    }}
                    onDragEnd={() => setDraggedLineId(null)}
                    className="text-slate-600 mt-2 cursor-grab active:cursor-grabbing shrink-0"
                  >
                    <GripVertical size={18} />
                  </button>
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_100px_120px_130px] gap-2">
                      <input
                        aria-label="Service name"
                        className="input-dark w-full font-medium"
                        value={line.name}
                        onChange={event => updateLine(line.id, { name: event.target.value })}
                      />
                      {line.pricingMode === 'hourly' ? (
                        <>
                          <label className="space-y-1">
                            <span className="text-[10px] text-slate-500">Hours</span>
                            <input
                              aria-label="Hours"
                              type="number"
                              min="0"
                              step="0.5"
                              className="input-dark w-full"
                              disabled={line.included}
                              value={line.hours || 0}
                              onChange={event => updateLine(line.id, { hours: Math.max(0, Number(event.target.value) || 0) })}
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-[10px] text-slate-500">Rate / hour</span>
                            <input
                              aria-label="Hourly rate"
                              type="number"
                              min="0"
                              step="0.01"
                              className="input-dark w-full"
                              disabled={line.included}
                              value={line.hourlyRate || 0}
                              onChange={event => updateLine(line.id, { hourlyRate: Math.max(0, Number(event.target.value) || 0) })}
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-[10px] text-slate-500">Charged as</span>
                            <select
                              aria-label="Hourly billing period"
                              className="input-dark w-full"
                              disabled={line.included}
                              value={line.hourlyBilling || 'monthly'}
                              onChange={event => updateLine(line.id, { hourlyBilling: event.target.value as 'setup' | 'monthly' })}
                            >
                              <option value="monthly">Monthly</option>
                              <option value="setup">One-time</option>
                            </select>
                          </label>
                        </>
                      ) : (
                        <>
                          <label className="space-y-1">
                            <span className="text-[10px] text-slate-500">Qty</span>
                            <input
                              aria-label="Quantity"
                              type="number"
                              min="1"
                              className="input-dark w-full"
                              value={line.quantity}
                              onChange={event => updateLine(line.id, { quantity: Math.max(1, Number(event.target.value) || 1) })}
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-[10px] text-slate-500">Setup</span>
                            <input
                              aria-label="Setup price"
                              type="number"
                              min="0"
                              className="input-dark w-full"
                              disabled={line.included}
                              value={line.setup}
                              onChange={event => updateLine(line.id, { setup: Math.max(0, Number(event.target.value) || 0) })}
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-[10px] text-slate-500">Monthly</span>
                            <input
                              aria-label="Monthly price"
                              type="number"
                              min="0"
                              className="input-dark w-full"
                              disabled={line.included}
                              value={line.monthly}
                              onChange={event => updateLine(line.id, { monthly: Math.max(0, Number(event.target.value) || 0) })}
                            />
                          </label>
                        </>
                      )}
                    </div>
                    <textarea
                      aria-label="Service description"
                      className="input-dark w-full min-h-16 text-xs"
                      value={line.description}
                      onChange={event => updateLine(line.id, { description: event.target.value })}
                    />
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs text-slate-400">
                        <input
                          type="checkbox"
                          className="accent-purple-500"
                          checked={Boolean(line.included)}
                          onChange={event => updateLine(line.id, { included: event.target.checked })}
                        />
                        Included at no additional cost
                      </label>
                      <button onClick={() => setLines(current => current.filter(item => item.id !== line.id))} className="btn-ghost text-red-300">
                        <Minus size={14} /> Remove
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {lines.length === 0 && (
              <div className="py-12 text-center text-sm text-slate-500">Add or drag services here to build the package.</div>
            )}
          </div>

          <div className="card p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="text-xs text-slate-400">Setup discount</span>
              <div className="relative">
                <input type="number" min="0" max="100" className="input-dark w-full pr-8" value={details.setupDiscount} onChange={event => setDetails({ ...details, setupDiscount: percent(Number(event.target.value)) })} />
                <span className="absolute right-3 top-2 text-slate-500">%</span>
              </div>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-400">Monthly discount</span>
              <div className="relative">
                <input type="number" min="0" max="100" className="input-dark w-full pr-8" value={details.monthlyDiscount} onChange={event => setDetails({ ...details, monthlyDiscount: percent(Number(event.target.value)) })} />
                <span className="absolute right-3 top-2 text-slate-500">%</span>
              </div>
            </label>
          </div>
        </section>
      </div>

      <ProposalPreview details={details} lines={lines} totals={totals} />
    </div>
  )
}

function ProposalPreview({ details, lines, totals }: {
  details: QuoteDetails
  lines: ServiceLine[]
  totals: {
    setupSubtotal: number
    monthlySubtotal: number
    setup: number
    monthly: number
    monthOne: number
    firstYear: number
  }
}) {
  return (
    <section className="print-sheet max-w-5xl mx-auto rounded-3xl border border-white/10 bg-slate-900 p-6 md:p-10 shadow-2xl print:shadow-none">
      <div className="flex items-start justify-between gap-6 border-b border-white/10 pb-6">
        <div>
          <p className="text-xs font-bold tracking-[0.28em] text-purple-400 uppercase">GovCon Giants</p>
          <h2 className="text-3xl md:text-4xl font-bold text-white mt-2">{details.packageName || 'White Glove Federal BD Services'}</h2>
          <p className="text-slate-400 mt-3 max-w-2xl">{details.summary}</p>
        </div>
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 text-white flex items-center justify-center text-xl font-bold shrink-0">G</div>
      </div>

      <div className="grid grid-cols-2 gap-6 py-5 border-b border-white/10 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Prepared for</p>
          <p className="text-lg font-semibold text-white mt-1">{details.client || 'Client company'}</p>
          {details.contact && <p className="text-slate-400">{details.contact}</p>}
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-slate-500">Prepared by</p>
          <p className="font-semibold text-white mt-1">{details.preparedBy}</p>
          <p className="text-slate-400">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>
      </div>

      <div className="py-6">
        <h3 className="text-sm font-bold tracking-wider uppercase text-slate-300 mb-3">Selected services</h3>
        <div className="divide-y divide-white/10">
          {lines.map(line => (
            <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_90px_110px] gap-4 py-3 items-start">
              <div>
                <p className="font-semibold text-white">
                  {line.name}
                  {line.pricingMode === 'hourly'
                    ? ` · ${line.hours || 0} hours @ ${rateMoney(line.hourlyRate || 0)}/hr`
                    : line.quantity > 1 ? ` × ${line.quantity}` : ''}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{line.description}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase text-slate-500">Setup</p>
                <p className="text-sm text-slate-200">{line.included ? 'Included' : lineCharge(line, 'setup') ? money(lineCharge(line, 'setup')) : '—'}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase text-slate-500">Monthly</p>
                <p className="text-sm text-slate-200">{line.included ? 'Included' : lineCharge(line, 'monthly') ? money(lineCharge(line, 'monthly')) : '—'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 border-t border-white/10 pt-6">
        <TotalCard label="One-time setup" value={money(totals.setup)} />
        <TotalCard label="Monthly operating" value={money(totals.monthly)} />
        <TotalCard label="Month one" value={money(totals.monthOne)} featured />
        <TotalCard label="First-year investment" value={money(totals.firstYear)} />
      </div>

      {(details.setupDiscount > 0 || details.monthlyDiscount > 0) && (
        <p className="text-xs text-slate-500 mt-3 text-right">
          Includes {details.setupDiscount > 0 ? `${details.setupDiscount}% setup discount` : ''}
          {details.setupDiscount > 0 && details.monthlyDiscount > 0 ? ' and ' : ''}
          {details.monthlyDiscount > 0 ? `${details.monthlyDiscount}% monthly discount` : ''}.
        </p>
      )}

      <div className="mt-8 rounded-2xl bg-purple-500/10 border border-purple-500/20 p-5">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center shrink-0"><Check size={15} /></div>
          <div>
            <p className="font-semibold text-white">Next step</p>
            <p className="text-sm text-slate-400 mt-0.5">Approve the package and schedule a kickoff call. Final scope, timing, and payment terms will be confirmed in the service agreement.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function TotalCard({ label, value, featured = false }: { label: string; value: string; featured?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${featured ? 'border-purple-500/40 bg-purple-500/15' : 'border-white/10 bg-white/[0.03]'}`}>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-xl font-bold mt-1 ${featured ? 'text-purple-200' : 'text-white'}`}>{value}</p>
    </div>
  )
}
