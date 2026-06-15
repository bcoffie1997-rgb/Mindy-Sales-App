const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, PageOrientation, LevelFormat, HeadingLevel,
  BorderStyle, WidthType, ShadingType, PageBreak
} = require('docx');

const OUT = "/Users/kkii/Documents/Cursor/Govcon Sales Team/docs/GovCon-Workflow-Explained.docx";

// ── Helpers ──────────────────────────────────────────────────────────
const border = { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };

const P = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, ...opts })],
  spacing: { after: 120 },
});

const B = (text) => new Paragraph({
  children: [new TextRun({ text, bold: true })],
  spacing: { after: 120 },
});

const H1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  children: [new TextRun(text)],
});

const H2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  children: [new TextRun(text)],
});

const H3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  children: [new TextRun(text)],
});

const BULLET = (text, opts = {}) => new Paragraph({
  numbering: { reference: "bullets", level: 0 },
  children: [new TextRun({ text, ...opts })],
});

const NUM = (text) => new Paragraph({
  numbering: { reference: "numbers", level: 0 },
  children: [new TextRun(text)],
});

const SPACER = () => new Paragraph({ children: [new TextRun("")] });

const richPara = (parts) => new Paragraph({
  children: parts.map(p => typeof p === 'string' ? new TextRun(p) : new TextRun(p)),
  spacing: { after: 120 },
});

// Table builder
const mkTable = (headers, rows, colWidths) => {
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const mkCell = (text, isHeader) => new TableCell({
    borders,
    width: { size: colWidths[0], type: WidthType.DXA },
    shading: isHeader
      ? { fill: "1B2A4A", type: ShadingType.CLEAR }
      : { fill: "FFFFFF", type: ShadingType.CLEAR },
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    children: [new Paragraph({
      children: [new TextRun({
        text,
        bold: isHeader,
        color: isHeader ? "FFFFFF" : "2D3748",
        size: 22,
      })]
    })]
  });

  const headerRow = new TableRow({
    children: headers.map((h, i) => new TableCell({
      borders,
      width: { size: colWidths[i], type: WidthType.DXA },
      shading: { fill: "1B2A4A", type: ShadingType.CLEAR },
      margins: { top: 100, bottom: 100, left: 140, right: 140 },
      children: [new Paragraph({
        children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: 22 })]
      })]
    }))
  });

  const dataRows = rows.map((row, rowIdx) => new TableRow({
    children: row.map((cell, i) => new TableCell({
      borders,
      width: { size: colWidths[i], type: WidthType.DXA },
      shading: { fill: rowIdx % 2 === 0 ? "FFFFFF" : "F5F5F5", type: ShadingType.CLEAR },
      margins: { top: 100, bottom: 100, left: 140, right: 140 },
      children: [new Paragraph({
        children: [new TextRun({ text: cell, size: 22 })]
      })]
    }))
  }));

  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [headerRow, ...dataRows],
  });
};

// ── Content ──────────────────────────────────────────────────────────
const children = [
  // Title page
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 2400, after: 200 },
    children: [new TextRun({ text: "GOVCON GIANTS", size: 56, bold: true, color: "1B2A4A" })]
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
    children: [new TextRun({ text: "AI Sales Team — Workflow Explained", size: 32, color: "C4953A" })]
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 2400 },
    children: [new TextRun({
      text: "How the system works behind the scenes — what runs, when, why, and how it all connects.",
      italics: true, size: 24, color: "4A5568"
    })]
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "April 2026  |  Internal Use Only", size: 20, color: "4A5568" })]
  }),
  new Paragraph({ children: [new PageBreak()] }),

  // Section 1
  H1("1. The Big Picture"),
  P("You run GovCon Giants / GovCon EDU. You sell federal contracting training, consulting, and done-for-you BD services. You get leads from YouTube, podcasts, bootcamps, Calendly, referrals, and paid ads."),
  P("Before this system, every lead touched a human before anything happened — someone had to read the email, decide if it was worth a call, draft a reply, schedule it, remember to follow up, write the follow-up, and track where they were in the pipeline. That bottleneck meant leads fell through the cracks."),
  P("The AI Sales Team is built to remove that bottleneck. 8 agents run 24/7 on your Mac Mini. They handle everything except the actual phone call and the final 'send' click on emails. The manager (Annelle) focuses only on the human work: calls, review, escalation."),
  B("The operating rule: Agents DRAFT — Annelle SENDS."),
  P("Nothing goes out automatically. Every email, every proposal, every report sits as a Gmail draft until a human reviews it. This is the guardrail that keeps the system safe."),
  SPACER(),

  // Section 2
  H1("2. The Full Lead Journey"),
  P("This is what happens from the moment a new lead hits the system to the moment they become a paying client. Each step is handled by a specific agent."),

  H3("Step 1 — Lead Arrives"),
  P("A new email lands in hello@govconedu.com. It could be a YouTube subscriber signing up, a podcast listener filling out a form, a Calendly booking, or a referral reaching out."),
  P("The Lead Intake agent (runs every 30 min, 9 AM – 7 PM) scans Gmail for new unread messages, filters out newsletters, and scores each one."),

  H3("Step 2 — Lead Gets Scored"),
  P("The agent reads the email content and assigns a score:"),
  BULLET("HOT — They mentioned proposals, RFPs, budget, 'ready to start', or similar buying signals. Branden gets an iMessage alert immediately."),
  BULLET("WARM — They mentioned pricing, scheduling a call, or general interest."),
  BULLET("BASIC — Signed up, downloaded something, but no specific intent yet."),
  P("The agent logs the lead to the local CRM (master-sheet.json) and creates an individual lead file with everything known about them."),

  H3("Step 3 — First-Touch Email"),
  P("The Email Responder agent (runs hourly, 9 AM – 6 PM) checks for new leads that need a first touch. It drafts a personalized email using Eric's voice — short, warm, peer-to-peer, always with a clear call to action. HOT leads get priority."),
  P("The draft sits in Gmail. Annelle reviews it, personalizes if needed, and hits Send."),

  H3("Step 4 — Reply Classification"),
  P("When the lead replies, the Email Responder detects it on its next cycle. It reads the reply and classifies the intent:"),
  BULLET("Wants a meeting → hands off to the Appointment Setter"),
  BULLET("Positive reply → drafts a follow-up that keeps the conversation going"),
  BULLET("Question → drafts an answer"),
  BULLET("Objection → drafts a response that handles the pushback"),
  BULLET("Unsubscribe → removes them from the active pipeline"),

  H3("Step 5 — Booking the Call"),
  P("The Appointment Setter (runs 5x/day at 9, 11, 1, 3, 5) handles everything about getting the meeting on the calendar:"),
  BULLET("Drafts an email with the Calendly link"),
  BULLET("When someone books — detects it via Google Calendar integration"),
  BULLET("Sends a booking confirmation draft"),
  BULLET("Sends a 24-hour reminder draft"),
  BULLET("Sends a 1-hour reminder draft"),

  H3("Step 6 — Pre-Call Briefing"),
  P("30 minutes before the call, the Appointment Setter does something critical: it generates a briefing and sends it to Annelle by email AND iMessage."),
  P("The briefing includes: the lead's company, what they do, what they said when they signed up or replied, their pain points, and — most importantly — the recommended sales angle. Which tier to suggest. What story to tell. What questions to ask."),
  P("Annelle reads this 30 min before. Takes the call prepared."),

  H3("Step 7 — The Call"),
  P("Annelle (or Eric/Branden) makes the call. Fireflies records and transcribes it automatically."),
  P("Discovery calls average 16 minutes. Engagement calls average 45 minutes. The system knows the difference based on Calendar metadata and call duration."),

  H3("Step 8 — Post-Call Follow-Up"),
  P("The Post-Call agent (runs hourly, 9 AM – 6 PM) checks Fireflies for completed calls. Within 1 hour of the call ending, it has already:"),
  BULLET("Pulled the full transcript"),
  BULLET("Extracted pain points, interest level, objections, budget mentions, timeline, and next steps"),
  BULLET("Drafted a follow-up email that references specific things discussed"),
  BULLET("If interest was HIGH — generated a complete proposal with the right pricing tier and an engagement letter"),
  P("The follow-up sits in Gmail drafts. Proposals sit in data/proposals/. Annelle reviews the follow-up and sends it same day. Proposals go to Branden first before going out."),

  H3("Step 9 — The Close"),
  P("Data shows: when a proposal goes out, 93.3% of them close. The follow-up sequence handles anyone who goes silent — up to 3 follow-ups over 2 weeks, spaced 48 hours apart."),
  P("For leads not ready to buy yet, the system routes them into the Regular Lead nurture track — weekly or bi-weekly emails that keep them warm with value-driven content until they're ready."),

  H3("Step 10 — Becoming a Client"),
  P("Lead signs, Stripe processes the payment. The status updates to PAID automatically when the Stripe notification email hits Gmail. The lead moves out of the active sales pipeline and into client onboarding."),
  new Paragraph({ children: [new PageBreak()] }),

  // Section 3
  H1("3. The 8 Agents Explained"),
  P("Each agent is a scheduled task that runs on a specific cron schedule. They don't talk to each other directly — they communicate through an event file (agent-events.jsonl) and through Gmail labels. This loose coupling means if one agent fails, the others keep running."),

  H2("Agent 1 — Lead Intake & Scoring"),
  B("Runs: every 30 min, 9 AM – 7 PM (Mon-Fri)"),
  P("This agent is the front door. It watches Gmail and makes sure no new lead goes unnoticed. On every run, it searches for unread, non-newsletter emails received since its last run. For each one, it scores HOT/WARM/BASIC based on keyword patterns and context. It deduplicates against the master sheet so the same lead isn't logged twice. It creates a lead file, appends to master-sheet.json, and writes a handoff event so the Email Responder knows to pick it up. For HOT leads, it fires an iMessage to Branden immediately so he can decide whether to call personally."),

  H2("Agent 2 — Email Responder & Follow-Up"),
  B("Runs: every 15 min, 8 AM – 6 PM"),
  P("This agent handles all conversational email. It has three jobs running concurrently. Job 1: first-touch drafts for new HOT and WARM leads. Job 2: reply classification — when a known lead replies, it reads the reply and decides whether to route the conversation forward. Job 3: the daily follow-up sweep at 10:22 AM — it identifies anyone silent for 48+ hours, drafts a follow-up, and queues it. Max 3 follow-ups per lead, each with a slightly different angle (check-in, value-add, gracious last attempt)."),

  H2("Agent 3 — Appointment Setter"),
  B("Runs: 5x/day at 9, 11, 1, 3, 5"),
  P("This agent is the scheduler. When Agent 2 flags a lead as wants_meeting, Agent 3 picks it up and drafts the Calendly link email. It monitors Google Calendar for new bookings — when a lead books, it matches them to their lead record, drafts a confirmation, and schedules 24-hr and 1-hr reminders. 30 minutes before every scheduled call, it generates the pre-call briefing. After the call, it checks Fireflies for a transcript — if no transcript exists 15+ minutes after the meeting ended, it flags a no-show and drafts a re-engagement email."),

  H2("Agent 4 — Post-Call & Proposal"),
  B("Runs: hourly, 9 AM – 6 PM"),
  P("This is the highest-leverage agent in the system. It fetches Fireflies transcripts for completed calls, runs deep analysis to extract pain points, objections, budget signals, and timeline, then drafts a personalized follow-up within 30 minutes. If the call signals are HIGH interest (asked about pricing, said done-for-you, asked about timeline, requested a proposal), it generates a full proposal document — executive summary, engagement options across 3 tiers, payment schedule, and an engagement letter with the right pricing. The proposal is saved to data/proposals/ and a delivery email is drafted. This is what drives revenue — getting proposals out fast."),

  H2("Agent 5A — CRM Morning Briefing"),
  B("Runs: 7:52 AM daily"),
  P("The day starts here. This agent reads all lead data, builds a pipeline snapshot, pulls today's calendar, identifies pending actions (unsent drafts, leads awaiting response, follow-ups due), and searches Gmail for overnight Stripe payment notifications. On Fridays it also includes a weekly summary with week-over-week metrics. The briefing gets drafted as a Gmail and also posted to Slack #ai-assistant. This is the first thing Annelle reads each morning — it's the daily game plan."),

  H2("Agent 5B — CRM Evening Reconciliation"),
  B("Runs: 6:23 PM daily"),
  P("End-of-day wrap-up. This agent reconciles what actually happened today vs. what was planned. It detects manual emails Branden or Annelle sent that the system didn't auto-draft, verifies each completed meeting has a lead record + transcript + follow-up draft, and generates stats. The most important output is the Uncalled HOT Leads list — HOT leads that came in today but didn't get called. This list becomes tomorrow's #1 priority."),

  H2("Agent 6 — QA & System Health"),
  B("Runs: 8:13 AM daily"),
  P("The system's watchdog. It validates all JSON files for integrity, verifies each other agent ran within its expected window (by checking agent-events.jsonl timestamps), counts Gmail drafts backlog and alerts if over 20, checks for unread lead emails older than 4 hours, and verifies Fireflies has transcripts for yesterday's meetings. Output is a GREEN/YELLOW/RED status posted to Slack. If RED, it fires an iMessage to Branden immediately."),

  H2("Agent 7 — Slack Command Center"),
  B("Runs: every 3 minutes, 24/7"),
  P("This is how you control the system from your phone. It polls Slack #sales-claude every 3 minutes. When it finds a new message from you, it sends an immediate ':eyes: Got it' acknowledgment, processes the command (revenue report, lead lookup, agent trigger, etc.), and replies in the thread. The acknowledgment is critical — it confirms the agent saw your message so you know something is happening."),

  H2("Agent 8 — Leads Intelligence Agent"),
  B("Triggered on demand via Slack"),
  P("The research analyst. When you type 'Look up [name]' or 'Run follow-ups' in Slack, this agent activates. It pulls data from Gmail (email threads), Fireflies (call recordings), Google Calendar (meeting history), and Slack (internal mentions), then composes a full intelligence brief: latest communication, last conversation summary, current situation, where we left off, and a recommended next action. For follow-ups, it classifies leads into Hot (personal, individual drafts) and Regular (scaled, template-based drafts) tracks and drafts emails accordingly."),
  new Paragraph({ children: [new PageBreak()] }),

  // Section 4
  H1("4. How the Agents Talk to Each Other"),
  P("The agents don't call each other directly. Instead they communicate through three shared systems:"),

  H3("1. The Event Bus (agent-events.jsonl)"),
  P("This is an append-only log file. When one agent finishes processing something and another agent needs to act on it, the first agent writes an event. The second agent reads events addressed to it on its next run. This is like leaving a note on a shared bulletin board — nobody has to be awake at the same time."),
  P("Example event flow:"),
  NUM("Lead Intake scores a lead as HOT and writes: {type: 'new_lead', to: 'email-responder', lead_id: 'lead-042'}"),
  NUM("Email Responder reads events, sees it, drafts a first-touch email, writes: {type: 'draft_sent', to: 'crm', lead_id: 'lead-042'}"),
  NUM("Lead replies 'yes let's talk' — Email Responder reads the reply and writes: {type: 'wants_meeting', to: 'appointment-setter', lead_id: 'lead-042'}"),
  NUM("Appointment Setter drafts the Calendly email. And so on."),

  H3("2. Gmail Labels"),
  P("Gmail labels act as visible status markers. The system uses existing labels like 'Proposal Leads', 'Interested', 'Follow Up', 'To Respond', and 'Meetings'. When an agent updates a lead's state, it updates the Gmail label. This way Branden can see the state of any thread just by looking at his inbox."),

  H3("3. Gmail Self-Emails (for urgent handoffs)"),
  P("For urgent handoffs — like a HOT lead needing immediate attention — agents send a self-email with the subject '[AGENT-HANDOFF] [HOT-LEAD] Name - Company'. This creates a second visible alert channel beyond iMessage and Slack."),
  SPACER(),

  // Section 5
  H1("5. Where Data Lives"),
  P("Everything is stored locally on the Mac Mini. There's no external CRM database. This keeps the system fast, private, and resilient."),
  mkTable(
    ["File / Folder", "What's In It"],
    [
      ["data/config.json", "Central config — Calendly link, Branden's phone, email signature, scoring keywords"],
      ["data/master-sheet.json", "The CRM. Every lead with their full record. Replaces Google Sheets."],
      ["data/agent-events.jsonl", "Append-only event bus. Agents communicate through this file."],
      ["data/leads/", "Individual lead JSON files — one per lead with complete history"],
      ["data/proposals/", "Generated proposals + engagement letters"],
      ["data/reports/daily/", "Morning briefings + evening reconciliations"],
      ["data/reports/weekly/", "Friday weekly pipeline reports"],
      ["data/templates/", "Email templates — first-touch, follow-ups, proposals, engagement letters"],
      ["data/stripe-cache.json", "Cached Stripe data to avoid re-fetching (5 min TTL)"],
    ],
    [4000, 5360]
  ),
  new Paragraph({ children: [new PageBreak()] }),

  // Section 6
  H1("6. The Daily Rhythm"),
  P("Here's what happens, in order, on a typical day:"),
  mkTable(
    ["Time", "What Runs", "Output"],
    [
      ["7:52 AM", "Morning Briefing", "Daily game plan posted to Slack + Gmail draft"],
      ["8:13 AM", "QA Health Check", "GREEN/YELLOW/RED system status"],
      ["9:00 AM", "Work day begins — all recurring agents active", ""],
      ["Every 30 min", "Lead Intake (until 7 PM)", "New leads scored and logged"],
      ["Every 15 min", "Email Responder (until 6 PM)", "Gmail drafts created"],
      ["9, 11, 1, 3, 5", "Appointment Setter", "Bookings, reminders, briefings"],
      ["Every hour", "Post-Call & Proposal (until 6 PM)", "Follow-ups + proposals drafted"],
      ["30 min before calls", "Pre-call briefing triggered", "Email + iMessage to Annelle"],
      ["6:23 PM", "Evening Reconciliation", "End-of-day summary + tomorrow's priorities"],
      ["Every 3 min 24/7", "Slack Command Center", "Responds to commands in #sales-claude"],
    ],
    [1600, 3400, 4360]
  ),
  SPACER(),

  // Section 7
  H1("7. The Safety Guardrails"),
  P("This system touches your customers' inboxes, so the guardrails matter more than the features."),

  B("Guardrail 1: Draft-only emails"),
  P("No agent has the ability to auto-send an email. Every draft sits in Gmail until a human clicks Send. This is non-negotiable and hardcoded."),

  B("Guardrail 2: Proposal review by Branden"),
  P("Proposals are generated automatically, but the system flags them for Branden's review before Annelle sends them. This ensures pricing and scope are always right."),

  B("Guardrail 3: Deduplication"),
  P("Lead Intake checks every new email against the existing master sheet. Same email address or same person = update the existing lead, not create a duplicate."),

  B("Guardrail 4: QA watchdog"),
  P("Every morning the QA agent verifies all other agents ran. If something didn't run or something broke, it alerts Branden via iMessage. No silent failures."),

  B("Guardrail 5: Event log is append-only"),
  P("The agent-events.jsonl is never modified — only appended. This creates an audit trail. If something goes wrong, we can replay events to see exactly what happened."),

  B("Guardrail 6: Human in the loop on every outbound"),
  P("The system will never message a customer without Annelle or Branden reviewing it. The AI is aggressive about drafting, conservative about sending."),
  SPACER(),

  // Section 8
  H1("8. What Breaks This System"),
  P("Being honest about failure modes:"),

  B("1. Mac Mini goes to sleep"),
  P("If the Mac Mini sleeps, no agent runs. Prevention: sleep is disabled via pmset and auto-login is on. If power cycles, the dashboard auto-starts but Claude Code needs to be restarted manually."),

  B("2. Claude Code process dies"),
  P("If the claude process crashes or is closed, all scheduled tasks stop. The QA agent will catch this next morning. Recovery: open Terminal, run claude, agents resume."),

  B("3. Gmail API rate limits"),
  P("Heavy lead days can push API usage. Unlikely at current volume but possible. The agents handle rate limits gracefully and retry."),

  B("4. Fireflies doesn't transcribe a call"),
  P("If Fireflies misses a recording, the Post-Call agent has nothing to work with. This is flagged as a 'no transcript' warning in the evening report."),

  B("5. A draft queue backup"),
  P("If Annelle doesn't clear drafts for 48+ hours, emails stop flowing. QA flags this if drafts exceed 20. The fix is simply to catch up on drafts."),
  SPACER(),

  // Section 9
  H1("9. What You Would Change"),
  P("This section is for you to fill in as you use the system and decide what to adjust. Common edits:"),
  BULLET("Scoring keywords in data/config.json — what makes a lead HOT or WARM"),
  BULLET("Email templates in data/templates/ — tone, specific language, signatures"),
  BULLET("Agent cron schedules — when each agent runs"),
  BULLET("Pricing tiers in config — when products change"),
  BULLET("Pre-call briefing template — what info Annelle needs"),
  BULLET("Follow-up cadence — how many touches, what intervals"),
  SPACER(),

  // Closing
  H1("10. The Bottom Line"),
  P("This system replaces what would otherwise require 2-3 full-time sales operations people:"),
  BULLET("A lead qualifier who reads every email and triages"),
  BULLET("A sales assistant who drafts responses and handles scheduling"),
  BULLET("An operations analyst who tracks pipeline and generates reports"),
  BULLET("A proposal writer who pulls call transcripts and drafts offers"),
  P("Instead, it runs on a Mac Mini 24/7 for the cost of the Claude API plus electricity. Annelle becomes the face and voice of the sales operation — making calls, handling real conversations — while the machine handles the back-office work that used to slow everything down."),
  P("The system is designed to be edited. Every template, every schedule, every scoring rule lives in a file you can open and change. When something isn't working, don't fight the system — edit it."),
  SPACER(),

  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 400 },
    children: [new TextRun({
      text: "GovCon Giants  |  GovCon EDU  |  April 2026  |  Internal Use Only",
      size: 18, italics: true, color: "4A5568"
    })]
  }),
];

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Calibri", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Calibri", color: "1B2A4A" },
        paragraph: { spacing: { before: 320, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Calibri", color: "1B2A4A" },
        paragraph: { spacing: { before: 260, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Calibri", color: "C4953A" },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
    ]
  },
  numbering: {
    config: [
      { reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers",
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    children,
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(OUT, buffer);
  console.log(`Created: ${OUT}`);
});
