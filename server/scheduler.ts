import 'dotenv/config'
import cron, { type ScheduledTask } from 'node-cron'
import { agentSchedules } from './schedules.js'

const BASE_URL = process.env.SCHEDULER_API_URL || 'http://localhost:3007'
const TIMEZONE = process.env.SCHEDULER_TIMEZONE || 'America/New_York'

// Set timezone for cron schedules (all times are Eastern)
process.env.TZ = TIMEZONE

async function runAgent(id: string, name: string): Promise<void> {
  const url = `${BASE_URL}/api/agents/${id}/run`
  const start = Date.now()

  try {
    const res = await fetch(url, { method: 'POST' })
    const duration = Date.now() - start

    if (!res.ok) {
      const text = await res.text()
      console.error(`[${new Date().toISOString()}] ❌ ${name} failed (${res.status}) in ${duration}ms: ${text}`)
      return
    }

    const data = await res.json()
    const events = data.events?.length || 0
    console.log(`[${new Date().toISOString()}] ✅ ${name} completed in ${duration}ms (${events} events)`)
  } catch (err: any) {
    console.error(`[${new Date().toISOString()}] ❌ ${name} error: ${err.message}`)
  }
}

async function runAllAgents(): Promise<void> {
  console.log(`[${new Date().toISOString()}] 🚀 Running all agents now`)
  for (const agent of agentSchedules) {
    await runAgent(agent.id, agent.name)
  }
}

function startScheduler(): void {
  console.log(`\n🤖 GovCon Sales Agent Scheduler`)
  console.log(`   API: ${BASE_URL}`)
  console.log(`   Timezone: ${TIMEZONE}`)
  console.log(`   Agents scheduled: ${agentSchedules.length}\n`)

  for (const agent of agentSchedules) {
    const task = cron.schedule(
      agent.cron,
      () => {
        runAgent(agent.id, agent.name)
      },
      {
        // node-cron v4 auto-starts tasks; the old `scheduled` option was removed.
        timezone: TIMEZONE,
      }
    )

    console.log(`   📅 ${agent.name}`)
    console.log(`      cron: "${agent.cron}"`)
    console.log(`      ${agent.description}\n`)

    // Keep reference to prevent garbage collection
    scheduledTasks.push(task)
  }

  console.log('Scheduler running. Press Ctrl+C to stop.\n')
}

const scheduledTasks: ScheduledTask[] = []

// Allow running all agents immediately via CLI arg: npm run scheduler -- --run-all
if (process.argv.includes('--run-all')) {
  runAllAgents().then(() => process.exit(0))
} else {
  startScheduler()
}
