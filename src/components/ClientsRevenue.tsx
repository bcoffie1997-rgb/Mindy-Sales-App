import { useState } from 'react'
import { UserCheck, DollarSign } from 'lucide-react'
import ClientsList from './ClientsList'
import Revenue from './Revenue'

const tabs = [
  { key: 'clients', label: 'Clients', icon: UserCheck },
  { key: 'revenue', label: 'Revenue', icon: DollarSign },
]

export default function ClientsRevenue() {
  const [activeTab, setActiveTab] = useState('clients')

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-4 sm:px-6 pt-4 sm:pt-5">
        <div className="inline-flex items-center gap-1 bg-white/5 rounded-xl p-1 border border-white/10">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === key
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </div>
      {activeTab === 'clients' ? <ClientsList /> : <Revenue />}
    </div>
  )
}
