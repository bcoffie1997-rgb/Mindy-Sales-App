# GovCon Giants — AI Sales Team Operations Guide

## Your Sales Team

You have 8 AI agents that run your entire sales operation automatically. Annelle's job is to make phone calls and send the emails the agents draft. Everything else is handled.

---

## The 8 Agents

### 1. Lead Intake & Scoring
**Runs:** Every 30 minutes, 9 AM — 7 PM
**What it does:** Monitors Gmail for every new lead that comes in. Scores them HOT, WARM, or BASIC based on buying signals. Logs them to the CRM. If someone is HOT (mentions proposals, RFPs, budget, ready to start), Branden gets an iMessage alert immediately.

**What Annelle sees:** New lead alerts in #ai-assistant with the person's name, score, phone number, and what they're interested in.

**What Annelle does:** Call HOT leads within the hour. WARM leads get called same day. BASIC leads get automated email sequences.

---

### 2. Email Responder & Follow-Up
**Runs:** Hourly, 9 AM — 6 PM
**What it does:** For every new HOT or WARM lead, it drafts a personalized first-touch email using Eric's voice. It monitors the inbox for replies and classifies them (wants a meeting, positive, question, objection, unsubscribe). If someone wants a meeting, it hands off to the Appointment Setter. It also runs a daily follow-up sweep — anyone who hasn't responded in 48 hours gets a follow-up (up to 3 total).

**What Annelle sees:** Gmail drafts ready to review and send. Reply classifications in #ai-assistant.

**What Annelle does:** Review drafts in Gmail, personalize if needed, hit Send. For meeting-interest replies, the Appointment Setter takes over automatically.

---

### 3. Appointment Setter
**Runs:** 5x/day (9 AM, 11 AM, 1 PM, 3 PM, 5 PM)
**What it does:** When a lead wants a meeting, it drafts an email with the Calendly link. When someone books, it sends a confirmation. It sends 24-hour and 1-hour reminders. 30 minutes before each call, it sends Branden/Annelle a pre-call briefing with the lead's background, what they said, and the recommended sales angle. After the call, it checks Fireflies — if no transcript found, it flags a no-show and drafts a re-engagement email.

**What Annelle sees:** Pre-call briefing in Gmail and iMessage 30 minutes before every call. No-show alerts if someone doesn't show up.

**What Annelle does:** Read the pre-call briefing before each call. Make the call. If someone no-shows, send the re-engagement draft.

---

### 4. Post-Call & Proposal
**Runs:** Hourly, 9 AM — 6 PM
**What it does:** After every call, it pulls the Fireflies transcript, extracts pain points, interest level, objections, budget mentions, timeline, and next steps. It drafts a follow-up email referencing specific things discussed. If interest is HIGH, it generates a full proposal with pricing tiers and an engagement letter. If interest is MEDIUM/LOW, it drafts a softer follow-up to keep the door open.

**What Annelle sees:** Post-call follow-up email drafts in Gmail. Proposals in the data/proposals/ folder. Proposal delivery email drafts ready to send.

**What Annelle does:** Review the follow-up email and send it same day. For proposals, review with Branden before sending. Customize pricing if needed.

---

### 5. CRM Morning Briefing
**Runs:** 7:00 AM daily
**What it does:** Generates the daily game plan. Pipeline snapshot (total leads, breakdown by score and status, conversion funnel). Today's calls with talking points. Pending actions (unsent drafts, leads awaiting response, follow-ups due). Stripe payments in the last 24 hours. On Fridays, includes a weekly summary with week-over-week comparison.

**What Annelle sees:** Morning briefing in #ai-assistant and as a Gmail draft. This is the "here's what you need to do today" playbook.

**What Annelle does:** Read it first thing. Print the call list. Work through it top to bottom — HOT leads first, then follow-ups, then new outreach.

---

### 6. CRM Evening Reconciliation
**Runs:** 5:30 PM daily
**What it does:** End-of-day wrap-up. Checks what actually happened vs. what was planned. Reconciles emails Annelle sent manually. Verifies calls had transcripts recorded. Lists every uncalled HOT lead (these carry forward to tomorrow). Checks for stuck deals. Verifies all agents ran properly that day.

**What Annelle sees:** Evening summary in #ai-assistant and Gmail with "Uncalled HOT Leads" list — the top priority for tomorrow morning.

**What Annelle does:** Review at end of day. Note any leads she needs to prioritize tomorrow. Flag anything that looks wrong.

---

### 7. QA & System Health
**Runs:** 7:15 AM daily
**What it does:** The quality control agent. Validates all data is clean (no duplicate leads, no missing fields). Verifies every other agent ran yesterday. Counts unsent Gmail drafts (warns if backlog building up). Checks for bounced emails. Verifies Fireflies recorded every meeting. If anything critical is broken, it sends an iMessage alert.

**What Annelle sees:** System status (GREEN/YELLOW/RED) in #ai-assistant. If RED, iMessage alert to Branden.

**What Annelle does:** If status is GREEN, nothing. If YELLOW or RED, tell Branden so he can investigate.

---

### 8. Slack Command Center
**Runs:** Every 3 minutes, 24/7
**Channel:** #sales-claude
**What it does:** Monitors the #sales-claude Slack channel for messages. When you type a command, it acknowledges immediately (":eyes: Got it"), executes the request, and replies in the thread with results.

**Commands:**

| What to type | What you get |
|-------------|-------------|
| `revenue report` | This month, last month, YTD, MRR, trends |
| `full report` | Complete executive dashboard summary |
| `subscription report` | All plans, member counts, MRR breakdown |
| `how many leads` | Current pipeline numbers |
| `search [name]` | Find any person across transactions, leads, clients |
| `cross reference` | Find Stripe payers who should be marked as clients |
| `upgrade [name] to client` | Convert a lead to client status |
| `run all agents` | Trigger every agent immediately |
| `agent status` | When each agent last ran |
| `top customers` | Highest-paying customers |
| Or just ask anything in plain English |

---

## Annelle's Capacity & Prioritization

Annelle can handle **30-50 calls per day**. That's a lot — the agents need to prioritize her queue so the highest-value calls happen first:

1. **HOT leads** — Call within 1 hour of scoring. These have buying signals.
2. **Pre-call briefings** — Scheduled meetings take priority (don't miss a booked call)
3. **WARM leads** — Same day if possible, next morning at latest
4. **Follow-up calls** — Leads who didn't respond to email after 48 hours
5. **Re-engagement** — No-shows and lapsed leads at the bottom of the list

If the queue ever exceeds 50 calls in a day, focus on #1-3 only. The agents handle #4-5 via email anyway.

---

## Annelle's Daily Playbook

### Morning (7:00 — 9:00 AM)
1. **Check #ai-assistant** for the Morning Briefing
2. **Open Gmail** — review and send any drafted emails from overnight
3. **Note today's calls** — the briefing lists them with talking points
4. **Check for HOT lead alerts** — anyone scored HOT needs a call ASAP

### Mid-Morning (9:00 — 12:00 PM)
4. **Call HOT leads first** — use the talking points from the briefing
5. **Call WARM leads** — the agents already sent first-touch emails, so leads may be expecting you
6. **After each call** — the Post-Call agent will auto-generate the follow-up within the hour. Check Gmail drafts, review, and send.
7. **Check #ai-assistant every hour** — new leads get scored and alerts posted throughout the day

### Afternoon (12:00 — 5:00 PM)
8. **Send proposals** — if the Post-Call agent generated one, review it with Branden before sending
9. **Follow-up calls** — anyone who hasn't responded to emails in 48+ hours
10. **Check Gmail drafts** — the Email Responder creates follow-up sequences. Review and send.
11. **Monitor #ai-assistant** — watch for new HOT leads, meeting confirmations, no-show alerts

### End of Day (5:00 — 5:30 PM)
12. **Check the Evening Reconciliation** in #ai-assistant
13. **Note uncalled HOT leads** — these are tomorrow's top priority
14. **Send any remaining drafts** in Gmail
15. **Type `agent status`** in #sales-claude — make sure all agents ran today

### Using Slack Commands (Anytime)
Annelle can go to **#sales-claude** and type any command to get instant info. Examples:
- Before a call: `search John Smith` to pull up everything on them
- End of week: `revenue report` to see how the week went
- Checking on a payment: `search transactions for acme` 
- Need to update someone: `upgrade LaDale Carter to client`

---

## How a Lead Flows Through the System

```
Lead comes in (Gmail, Slack, Zapier)
        |
   [Lead Intake Agent]
   Scores: HOT / WARM / BASIC
   Logs to CRM, alerts Branden if HOT
        |
   [Email Responder Agent]
   Drafts first-touch email
   Annelle reviews and sends
        |
   Lead replies "I'd like to schedule a call"
        |
   [Appointment Setter Agent]
   Drafts Calendly link email
   Annelle sends it
   Lead books a call
   Agent sends confirmation + reminders
   30 min before: pre-call briefing to Annelle
        |
   Annelle makes the call (Fireflies records it)
        |
   [Post-Call Agent]
   Pulls transcript, extracts insights
   Drafts follow-up email
   If HIGH interest: generates proposal + engagement letter
   Annelle reviews and sends
        |
   Lead signs → CLIENT
   Lead goes cold → Follow-up sequence (up to 3 emails)
   Lead no-shows → Re-engagement email drafted
```

---

## The Pricing Ladder (Know This Cold)

When qualifying leads, match them to the right tier. The agents recommend tiers based on call insights, but Annelle should understand the path:

| Tier | Price | Who It's For | What They Get |
|------|-------|-------------|---------------|
| **Free** | $0 | Everyone | Action Plan, Opportunity Hunter, 12-Day Email Course, Monthly Bootcamp |
| **Pro Member Group** | $99/month | Newcomers wanting community + training | Live bootcamps, weekly Q&A, 4000+ community, Opportunity Hunter Pro |
| **Pro Member Lifetime** | $997 one-time | Committed self-starters | Lifetime training access, Success Guide, Proposal Bootcamp |
| **90-Day Accelerator** | $749/month ($5,997 total) | Experienced practitioners needing 1:1 | 12 weekly coaching sessions with Eric, personalized strategy |
| **Consulting Pack** | Custom (20 hrs) | Specific project needs | Flexible 1:1 hours, proposal reviews, strategy |
| **White Glove Starter** | $4,000/month | Established biz ($500K+ revenue) | Market research, opportunity ID, pipeline setup |
| **White Glove Growth** | $6,000/month | Growing federal presence | + teaming strategy, capability statements |
| **White Glove Scale** | $8,000/month | Scaling federal revenue | + proposal support, agency outreach |
| **White Glove Enterprise** | $10,000+/month | Full BD outsourcing | Dedicated consultant, full fractional BD |

**The natural upsell path:** Free → $99/mo → $997 lifetime → $749/mo Accelerator → $4K+ White Glove

**For price objections** (the #1 objection): Reframe to ROI ("One federal contract pays for this 10x over"), offer the next tier down, and use a success story. Never pressure — "Take your time, we're here whenever it makes sense."

---

## Eric's Sales Style: Storytelling

Eric doesn't pitch — he tells stories. Stories about real people he's helped and situations he's been through that match what the prospect is dealing with. This is how Annelle should approach calls too.

**On calls:**
1. Ask about THEIR story first — what they do, how long, what they're trying to build
2. Find a connection point — a client in a similar industry or situation
3. Share that story naturally: "Yeah, we actually worked with someone in [similar field] who was facing the same thing..."
4. Let the story do the selling — the prospect connects the dots themselves
5. The more specific the story matches their situation, the more powerful it is

**In emails (the agents do this):**
- Reference a client success: "We worked with a company similar to yours — within 90 days they had their first contract"
- Share a relatable struggle: "I know what it's like to feel overwhelmed by the federal space"
- Connect situations: "One of our members was in a similar spot — here's what happened..."

---

## Key Rules

1. **Agents DRAFT emails — Annelle SENDS them.** Nothing goes out automatically. Every email sits in Gmail drafts until a human reviews and hits Send.

2. **HOT leads get called within 1 hour.** Speed to lead is everything. The agents alert immediately — Annelle needs to act fast.

3. **Check Gmail drafts 3-4 times per day.** Drafts pile up from the Email Responder, Appointment Setter, and Post-Call agents. Don't let them sit.

4. **Pre-call briefings arrive 30 minutes before.** Read them. They contain what the lead said, their company, their pain points, and the recommended angle.

5. **The Evening Report is tomorrow's game plan.** The "Uncalled HOT Leads" list is the #1 priority for the next morning.

6. **Proposals need Branden's eyes.** The Post-Call agent generates them automatically, but always have Branden review pricing and scope before sending.

7. **If an agent didn't run, something is wrong.** The QA agent checks this every morning. If you see a YELLOW or RED status, tell Branden.

8. **Use #sales-claude for everything.** Need a number? Search. Need a report? Ask. Need to trigger agents? Command it. The Slack channel is your control panel.

---

## What Success Looks Like

When this system is running well:
- Every lead gets a response within 30 minutes of arriving
- Every HOT lead gets a phone call within 1 hour
- Every call has a follow-up email sent same day
- No lead goes more than 48 hours without contact
- Proposals go out within 24 hours of a high-interest call
- Zero leads fall through the cracks (Evening Report catches everything)
- Annelle's only job is: make calls, review drafts, send emails

The agents handle the busywork. Annelle handles the human connection. That's how you scale a sales team without hiring more people.

---

## The Sales Team Schedule

| Time | What Happens |
|------|-------------|
| 7:00 AM | Morning Briefing posted — today's game plan |
| 7:15 AM | QA Health Check — system status GREEN/YELLOW/RED |
| 9:00 AM | Agents start running (lead intake, emails, appointments, post-call) |
| 9:00 — 7:00 PM | Lead Intake every 30 min, Email Responder hourly, Post-Call hourly |
| 9, 11, 1, 3, 5 | Appointment Setter runs (bookings, reminders, briefings) |
| 5:30 PM | Evening Reconciliation — end-of-day summary |
| Every 3 min | Slack Command Center monitors #sales-claude |

---

## Mac Mini Setup (Keep Agents Running 24/7)

### Prevent Sleep
In Terminal, run:
```bash
sudo pmset -a disablesleep 1
sudo pmset -a sleep 0
sudo pmset -a womp 1
sudo pmset -a autorestart 1
```

### System Settings
- **Energy**: Prevent automatic sleeping = ON, Wake for network access = ON, Start up after power failure = ON
- **Users & Groups > Login Options**: Automatic login = ON

### Start the System
1. Open Terminal
2. `cd ~/Documents/Cursor/Govcon\ Sales\ Team`
3. `npm run dev &` (starts dashboard server)
4. `claude` (starts AI agents)
5. Leave Terminal open

### If Mac Restarts
The dashboard auto-starts. But you need to open Terminal and run `claude` again.
