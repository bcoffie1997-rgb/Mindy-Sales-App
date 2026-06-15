# GovCon Giants AI Sales Team — Mac Mini Always-On Setup Guide

## Overview

This guide will configure your Mac Mini to run the AI sales team 24/7 without you being present. Once set up, the 21 AI agents will run on schedule, the dashboard will always be accessible, and Annelle can manage everything from Slack.

---

## Part 1: Prevent Mac Mini from Sleeping

Your agents stop when the Mac sleeps. Fix this permanently.

### Step 1: System Settings (GUI)

1. Click the **Apple menu** > **System Settings**
2. Go to **Energy** (or **Energy Saver** on older macOS)
3. Set these:
   - **Prevent automatic sleeping when the display is off**: **ON**
   - **Wake for network access**: **ON**
   - **Start up automatically after a power failure**: **ON**
4. Close System Settings

### Step 2: Terminal Commands (Belt and Suspenders)

Open Terminal and run these commands one at a time:

```bash
# Prevent sleep entirely — survives restarts
sudo pmset -a disablesleep 1

# Never sleep when plugged in (0 = never)
sudo pmset -a sleep 0

# Keep the system awake for network access
sudo pmset -a womp 1

# Auto-restart after power failure
sudo pmset -a autorestart 1

# Verify your settings
pmset -g
```

You should see `disablesleep 1` and `sleep 0` in the output.

### Step 3: Verify It Worked

```bash
# This should show "sleep 0" and "disablesleep 1"
pmset -g | grep -E "sleep|disablesleep|womp|autorestart"
```

---

## Part 2: Keep Claude Code Running 24/7

Claude Code needs to stay open for scheduled tasks to fire. Here's how to make it persistent.

### Step 1: Install Claude Code CLI (if not already)

```bash
# Check if installed
claude --version

# If not installed, install via npm
npm install -g @anthropic-ai/claude-code
```

### Step 2: Create the Startup Script

Create a script that starts everything automatically:

```bash
# Create the script
cat > ~/start-govcon-agents.sh << 'SCRIPT'
#!/bin/bash

# GovCon Giants AI Sales Team — Startup Script
echo "$(date): Starting GovCon AI Sales Team..."

# 1. Start the dashboard server (backend + frontend)
cd ~/Documents/Cursor/Govcon\ Sales\ Team
npm run dev &
SERVER_PID=$!
echo "$(date): Dashboard server started (PID: $SERVER_PID)"

# 2. Wait for server to be ready
sleep 10

# 3. Start Claude Code in the project directory
# Claude Code will pick up all scheduled tasks automatically
cd ~/Documents/Cursor/Govcon\ Sales\ Team
echo "$(date): Starting Claude Code with scheduled tasks..."
claude

SCRIPT

# Make it executable
chmod +x ~/start-govcon-agents.sh
```

### Step 3: Create a macOS Launch Agent (Auto-Start on Boot)

This makes everything start automatically when the Mac Mini turns on:

```bash
cat > ~/Library/LaunchAgents/com.govcon.dashboard.plist << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.govcon.dashboard</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>-c</string>
        <string>cd /Users/kkii/Documents/Cursor/Govcon\ Sales\ Team && npm run dev</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/govcon-dashboard.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/govcon-dashboard-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
PLIST

# Load it
launchctl load ~/Library/LaunchAgents/com.govcon.dashboard.plist
```

### Step 4: Keep Claude Code Running

Claude Code must stay open for scheduled tasks. The simplest approach:

1. Open **Terminal** on the Mac Mini
2. Navigate to the project: `cd ~/Documents/Cursor/Govcon\ Sales\ Team`
3. Start Claude Code: `claude`
4. **Leave the Terminal window open** — do not close it
5. The scheduled tasks will fire automatically on their cron schedules

> **Important**: If you restart the Mac Mini, you need to re-open Terminal and run `claude` in the project directory. The dashboard server will auto-start via the Launch Agent, but Claude Code needs a terminal session.

### Step 5: Auto-Login After Restart

So the Mac Mini logs in automatically after a reboot:

1. **Apple menu** > **System Settings** > **Users & Groups**
2. Click **Login Options** (at the bottom)
3. Set **Automatic login** to your user account
4. Enter your password to confirm

---

## Part 3: Remote Access (Manage from Anywhere)

### Option A: Slack Command Center (Already Set Up)

The `#sales-claude` channel is your primary remote control. Type commands like:
- `revenue report` — get MRR, monthly trends, YTD
- `full report` — executive dashboard summary
- `search [name]` — find transactions or contacts
- `run all agents` — trigger all agents immediately
- `agent status` — check when agents last ran
- Or just type in plain English

### Option B: Screen Sharing (For Full Control)

1. On the Mac Mini: **System Settings** > **General** > **Sharing**
2. Turn on **Screen Sharing**
3. Turn on **Remote Login** (SSH)
4. Note the IP address shown (e.g., `192.168.1.100`)

From your laptop or phone:
- **Mac**: Finder > Go > Connect to Server > `vnc://192.168.1.100`
- **iPhone/iPad**: Download "Screens" or Apple's built-in Screen Sharing
- **SSH**: `ssh kkii@192.168.1.100`

### Option C: Dashboard Access from Any Device

The dashboard runs at `http://[mac-mini-ip]:3002` on your local network.

1. Find the Mac Mini's IP: Run `ipconfig getifaddr en0` in Terminal
2. On any device on the same network, open: `http://192.168.1.xxx:3002`

---

## Part 4: The Complete Agent Schedule

Here's when every agent runs (all times Eastern, Monday-Friday):

### Morning Block (6:54 AM — 8:38 AM)
| Time | Agent | What It Does |
|------|-------|-------------|
| 6:54 AM | SAM.gov Scanner | Finds new federal opportunities |
| 7:07 AM | CRM Morning Briefing | Pipeline snapshot, pending actions, Stripe payments |
| 7:23 AM | QA & System Health | Validates all agents, Gmail, Fireflies |
| 7:40 AM | BD Morning Briefing | Tasks, deadlines, calendar events |
| 7:54 AM | BD Calendar Review | Meeting prep with talking points |
| 8:10 AM | BD Pipeline Health | Flags stale opps, overdue tasks |
| 8:21 AM | BD Proposal Deadlines | Checks milestones within 7 days |
| 8:38 AM | Gmail RFP Monitor | Scans for RFP/RFQ emails |

### Recurring Throughout the Day
| Schedule | Agent | What It Does |
|----------|-------|-------------|
| Every 30 min (9AM-7PM) | Lead Intake & Scoring | Monitors for new leads, scores HOT/WARM/BASIC |
| Hourly at :32 (9AM-6PM) | Email Responder | Drafts emails for new leads, monitors replies |
| 5x/day at :57 | Appointment Setter | Sends Calendly links, confirms bookings, reminders |
| Hourly at :50 (9AM-6PM) | Post-Call & Proposal | Fetches transcripts, drafts follow-ups |
| 5x/day at :38 | Gmail RFP Monitor | Scans for new RFP/solicitation emails |

### Evening Block
| Time | Agent | What It Does |
|------|-------|-------------|
| 5:39 PM | CRM Evening Reconciliation | End-of-day summary, uncalled HOT leads |
| 5:58 PM | BD Meeting Followup | Fireflies transcripts, action items, follow-up drafts |

### Weekly
| Time | Agent | What It Does |
|------|-------|-------------|
| Monday 10:00 AM | Contact Engagement | Flags stale contacts, drafts check-ins |
| Monday 11:00 AM | Competitive Intel | SAM.gov awards, competitor tracking |
| Friday 4:07 PM | Weekly Pipeline Report | Full analysis with week-over-week deltas |

### Other
| Time | Agent | What It Does |
|------|-------|-------------|
| 11:56 PM daily | Pipeline Snapshot | Saves data for trend charts |
| 1st of month | Monthly Executive Summary | Win/loss, revenue forecast, recommendations |
| 2nd of month | Market Analysis | Agency spending trends, market share |

### Always On
| Schedule | Agent | What It Does |
|----------|-------|-------------|
| Every 3 min | Slack Command Center | Monitors #sales-claude for your messages |

---

## Part 5: Annelle's Guide — Running the Sales Team from Slack

### What Annelle Needs
- Access to the `#sales-claude` Slack channel
- Access to the dashboard at `http://[mac-mini-ip]:3002`
- Her phone for calls (the agents prep her before each one)

### Daily Workflow for Annelle

**7:00 AM — Check Morning Reports**
The agents post to `#ai-assistant` automatically:
- CRM Morning Briefing (pipeline snapshot, who to call)
- Meeting prep (talking points for today's meetings)
- New leads scored (HOT leads need immediate attention)
- System health check (confirms everything is running)

**Throughout the Day — Work the Leads**
1. Check `#ai-assistant` for new HOT lead alerts
2. Call the leads in priority order (agents provide phone numbers and talking points)
3. After each call, the Post-Call agent:
   - Pulls the Fireflies transcript
   - Extracts action items
   - Drafts follow-up emails
   - Updates the CRM

**Using Slack Commands (in #sales-claude)**
Annelle can type these anytime:

| Command | What It Does |
|---------|-------------|
| `revenue report` | Shows current revenue, MRR, trends |
| `full report` | Full executive dashboard summary |
| `how many leads` | Current pipeline count |
| `search John Smith` | Find any contact or transaction |
| `cross reference` | Find paying customers not marked as clients |
| `agent status` | Check if all agents are running |
| `run all agents` | Trigger all agents right now |
| `subscription report` | Who's on what plan |
| `top customers` | Highest-paying customers |

**5:30 PM — Check Evening Reports**
- CRM Evening Reconciliation (what was missed today)
- Uncalled HOT leads list (carry forward to tomorrow)
- Meeting followup summaries

### What the Agents Handle Automatically (Annelle Does NOT Need To Do)
- Lead scoring and intake
- Email drafting and follow-up sequences
- Meeting prep and post-call summaries
- Proposal pipeline tracking
- Stripe payment monitoring
- Database reconciliation
- RFP/solicitation scanning
- Weekly and monthly reports

### What Annelle DOES Need To Do
- Make phone calls to leads (agents tell her who and when)
- Review and send email drafts (agents draft, she approves)
- Attend meetings (agents prep her with talking points)
- Escalate to Branden for high-value deals or decisions
- Check Slack for alerts and morning briefings

---

## Part 6: Troubleshooting

### "Agents aren't running"
1. Check if Claude Code is open on the Mac Mini
2. Check if the dashboard server is running: visit `http://localhost:3002`
3. In Slack #sales-claude, type: `agent status`
4. If nothing works, SSH into the Mac Mini and run:
   ```bash
   cd ~/Documents/Cursor/Govcon\ Sales\ Team
   npm run dev &
   claude
   ```

### "Mac Mini went to sleep"
```bash
# Re-apply sleep prevention
sudo pmset -a disablesleep 1
sudo pmset -a sleep 0

# Verify
pmset -g | grep sleep
```

### "Dashboard not loading"
```bash
# Check if ports are in use
lsof -i :3002
lsof -i :3007

# If not, restart the server
cd ~/Documents/Cursor/Govcon\ Sales\ Team
npm run dev
```

### "Scheduled task says something else is running"
This means two tasks tried to fire at the same time. The schedule has been redesigned with minimum 6-minute gaps between all tasks. If it still happens:
1. Wait 3-5 minutes and try again
2. In Slack, type `run all agents` to force-trigger

---

## Quick Reference: First-Time Setup Checklist

- [ ] Prevent Mac sleep (System Settings + pmset commands)
- [ ] Enable auto-login after restart
- [ ] Create the Launch Agent for the dashboard server
- [ ] Open Terminal and start Claude Code in the project directory
- [ ] Enable Screen Sharing and Remote Login
- [ ] Note the Mac Mini's IP address
- [ ] Test the dashboard from another device
- [ ] Test the Slack Command Center (#sales-claude)
- [ ] Show Annelle how to use Slack commands
- [ ] Verify morning agent reports arrive the next business day
