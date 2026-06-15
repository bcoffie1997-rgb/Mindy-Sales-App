#!/usr/bin/env python3
"""GovCon Giants — Sales Manager Playbook (PDF) — with Discovery-to-Close Script"""

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor, white
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)

NAVY = HexColor('#1B2A4A')
GOLD = HexColor('#C4953A')
DARK = HexColor('#2D3748')
GRAY = HexColor('#4A5568')
LIGHT = HexColor('#EDF2F7')
SCRIPT_BG = HexColor('#F7FAFC')
LISTEN_BG = HexColor('#F0FFF4')
PIVOT_BG = HexColor('#FFFAF0')

def build_pdf():
    doc = SimpleDocTemplate(
        "/Users/kkii/Documents/Cursor/Govcon Sales Team/docs/GovCon-Giants-AI-Sales-Playbook.pdf",
        pagesize=letter,
        topMargin=0.75*inch, bottomMargin=0.75*inch,
        leftMargin=0.75*inch, rightMargin=0.75*inch,
    )
    styles = getSampleStyleSheet()
    W = doc.width

    styles.add(ParagraphStyle('CoverTitle', parent=styles['Title'],
        fontSize=34, textColor=NAVY, spaceAfter=6, alignment=TA_CENTER,
        fontName='Helvetica-Bold', leading=40))
    styles.add(ParagraphStyle('CoverSub', parent=styles['Normal'],
        fontSize=16, textColor=GOLD, alignment=TA_CENTER,
        fontName='Helvetica', spaceAfter=20))
    styles.add(ParagraphStyle('CoverDetail', parent=styles['Normal'],
        fontSize=12, textColor=GRAY, alignment=TA_CENTER,
        fontName='Helvetica', spaceAfter=8))
    styles.add(ParagraphStyle('Sect', parent=styles['Heading1'],
        fontSize=22, textColor=NAVY, spaceBefore=20, spaceAfter=10,
        fontName='Helvetica-Bold'))
    styles.add(ParagraphStyle('Sub', parent=styles['Heading2'],
        fontSize=15, textColor=DARK, spaceBefore=14, spaceAfter=6,
        fontName='Helvetica-Bold'))
    styles.add(ParagraphStyle('Sub2', parent=styles['Heading3'],
        fontSize=12, textColor=GRAY, spaceBefore=10, spaceAfter=4,
        fontName='Helvetica-Bold'))
    styles.add(ParagraphStyle('Body', parent=styles['Normal'],
        fontSize=11, textColor=DARK, spaceAfter=8,
        fontName='Helvetica', leading=16))
    styles.add(ParagraphStyle('BodyBold', parent=styles['Normal'],
        fontSize=11, textColor=DARK, spaceAfter=8,
        fontName='Helvetica-Bold', leading=16))
    styles.add(ParagraphStyle('BulletItem', parent=styles['Normal'],
        fontSize=11, textColor=DARK, spaceAfter=5,
        fontName='Helvetica', leading=16, leftIndent=20, bulletIndent=8))
    styles.add(ParagraphStyle('Script', parent=styles['Normal'],
        fontSize=11, textColor=NAVY, spaceAfter=6,
        fontName='Helvetica-Oblique', leading=16, leftIndent=20, rightIndent=20))
    styles.add(ParagraphStyle('FootNote', parent=styles['Normal'],
        fontSize=8, textColor=GRAY, alignment=TA_CENTER, fontName='Helvetica'))
    styles.add(ParagraphStyle('RuleNum', parent=styles['Normal'],
        fontSize=12, textColor=NAVY, spaceAfter=2,
        fontName='Helvetica-Bold', leading=16))
    styles.add(ParagraphStyle('StageLabel', parent=styles['Normal'],
        fontSize=10, textColor=GOLD, spaceBefore=16, spaceAfter=2,
        fontName='Helvetica-Bold'))
    styles.add(ParagraphStyle('StageName', parent=styles['Heading2'],
        fontSize=15, textColor=NAVY, spaceBefore=0, spaceAfter=6,
        fontName='Helvetica-Bold'))

    story = []

    def hr():
        return HRFlowable(width="100%", thickness=1, color=GOLD, spaceBefore=6, spaceAfter=6)

    def sect(t):
        return Paragraph(t, styles['Sect'])

    def sub(t):
        return Paragraph(t, styles['Sub'])

    def sub2(t):
        return Paragraph(t, styles['Sub2'])

    def body(t):
        return Paragraph(t, styles['Body'])

    def bold(t):
        return Paragraph(t, styles['BodyBold'])

    def bullet(t):
        return Paragraph(f"<bullet>&bull;</bullet> {t}", styles['BulletItem'])

    def script(t):
        return Paragraph(f'"{t}"', styles['Script'])

    def sp(h=10):
        return Spacer(1, h)

    def stage(num, name):
        return [
            Paragraph(f"STAGE {num}", styles['StageLabel']),
            Paragraph(name, styles['StageName']),
        ]

    def script_box(text):
        """Script line in a shaded box"""
        t = Table([[Paragraph(f'<i>"{text}"</i>', styles['Script'])]],
                  colWidths=[W - 8])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), SCRIPT_BG),
            ('LEFTPADDING', (0,0), (-1,-1), 14),
            ('RIGHTPADDING', (0,0), (-1,-1), 14),
            ('TOPPADDING', (0,0), (-1,-1), 10),
            ('BOTTOMPADDING', (0,0), (-1,-1), 10),
            ('LINEBEFOREDECOR', (0,0), (0,-1), 3, GOLD),
        ]))
        return t

    def listen_box(text):
        """Green-tinted listen-for box"""
        t = Table([[Paragraph(f'<b>LISTEN FOR:</b> {text}', styles['Body'])]],
                  colWidths=[W - 8])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), LISTEN_BG),
            ('LEFTPADDING', (0,0), (-1,-1), 12),
            ('RIGHTPADDING', (0,0), (-1,-1), 12),
            ('TOPPADDING', (0,0), (-1,-1), 8),
            ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ]))
        return t

    def pivot_box(text):
        """Orange-tinted pivot box"""
        t = Table([[Paragraph(f'<b>PIVOT:</b> {text}', styles['Body'])]],
                  colWidths=[W - 8])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), PIVOT_BG),
            ('LEFTPADDING', (0,0), (-1,-1), 12),
            ('RIGHTPADDING', (0,0), (-1,-1), 12),
            ('TOPPADDING', (0,0), (-1,-1), 8),
            ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ]))
        return t

    def table(headers, rows, widths=None):
        data = [headers] + rows
        if not widths:
            widths = [W / len(headers)] * len(headers)
        t = Table(data, colWidths=widths)
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), NAVY),
            ('TEXTCOLOR', (0,0), (-1,0), white),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,0), 10),
            ('FONTSIZE', (0,1), (-1,-1), 10),
            ('FONTNAME', (0,1), (-1,-1), 'Helvetica'),
            ('TEXTCOLOR', (0,1), (-1,-1), DARK),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('TOPPADDING', (0,0), (-1,-1), 6),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
            ('LEFTPADDING', (0,0), (-1,-1), 8),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [white, LIGHT]),
            ('GRID', (0,0), (-1,-1), 0.5, HexColor('#CBD5E0')),
        ]))
        return t

    # ══════════════════════════════════════════════════════════════════════
    # COVER PAGE
    # ══════════════════════════════════════════════════════════════════════
    story.append(sp(120))
    story.append(Paragraph("GOVCON GIANTS", styles['CoverTitle']))
    story.append(Paragraph("Sales Manager Playbook", styles['CoverSub']))
    story.append(hr())
    story.append(sp(16))
    story.append(Paragraph("Discovery Call to Close", styles['CoverDetail']))
    story.append(Paragraph("Your daily responsibilities, the call script, and how to use the AI agents.", styles['CoverDetail']))
    story.append(sp(50))
    story.append(Paragraph("Built from Branden's real Fireflies transcripts and closed deals.", styles['CoverDetail']))
    story.append(Paragraph("GovCon Giants  |  GovCon EDU", styles['CoverDetail']))
    story.append(Paragraph("April 2026  |  Internal Use Only", styles['CoverDetail']))
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════
    # 1. YOUR JOB IN ONE PAGE
    # ══════════════════════════════════════════════════════════════════════
    story.append(sect("1. Your Job in One Page"))
    story.append(hr())
    story.append(body("You have 8 AI agents that run the sales operation automatically. Your job is three things:"))
    story.append(sp(4))
    story.append(bold("1. Make phone calls"))
    story.append(body("The agents tell you who to call, when, and what to say. You make the call."))
    story.append(bold("2. Review and send emails"))
    story.append(body("The agents draft every email. You open Gmail, review the draft, and hit Send."))
    story.append(bold("3. Escalate to Branden"))
    story.append(body("High-value proposals and deals go through Branden before sending."))
    story.append(sp(6))
    story.append(body("That's it. The agents score leads, draft emails, book appointments, generate proposals, send reminders, and create daily reports. You handle the human connection."))
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════
    # 2. DAILY SCHEDULE
    # ══════════════════════════════════════════════════════════════════════
    story.append(sect("2. Your Daily Schedule"))
    story.append(hr())

    schedule = [
        ("7:00 AM — Start Your Day", [
            "Check <b>#ai-assistant</b> in Slack for the Morning Briefing",
            "This tells you: today's calls, talking points, pending actions, and overnight leads",
            "Open Gmail — review and send any drafted emails from overnight",
        ]),
        ("8:00 AM — HOT Lead Check", [
            "Check for HOT lead alerts in Slack",
            "Anyone scored HOT needs a call <b>within 1 hour</b>",
            "HOT = they mentioned proposals, RFPs, budget, or 'ready to start'",
        ]),
        ("9:00 AM - 12:00 PM — Morning Calls", [
            "Call HOT leads first — use the talking points from the briefing",
            "Then call WARM leads",
            "After each call, check Gmail in ~1 hour — the agent will have a follow-up draft ready",
            "Review the draft and send it",
        ]),
        ("12:00 - 1:00 PM — Catch Up", [
            "Send any proposals Branden has approved",
            "Clear Gmail draft queue",
            "Check Slack for new lead alerts",
        ]),
        ("1:00 - 5:00 PM — Afternoon Calls", [
            "Continue calls — WARM leads and follow-ups",
            "Anyone who hasn't responded to email in 48+ hours gets a call",
            "Check Gmail drafts every 1-2 hours",
            "Watch Slack for new HOT leads",
        ]),
        ("5:00 PM — End of Day", [
            "Check the <b>Evening Reconciliation</b> report in Slack",
            "Note the <b>Uncalled HOT Leads</b> list — tomorrow's #1 priority",
            "Send any remaining Gmail drafts",
            "Type <b>agent status</b> in #sales-claude to confirm all agents ran",
        ]),
    ]

    for time_block, tasks in schedule:
        story.append(sub(time_block))
        for t in tasks:
            story.append(bullet(t))
        story.append(sp(2))

    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════
    # 3. HOW TO RUN A DISCOVERY CALL
    # ══════════════════════════════════════════════════════════════════════
    story.append(sect("3. How to Run a Discovery Call"))
    story.append(hr())
    story.append(body("This is your call flow from open to close. Every stage comes from Branden's real calls that produced second calls and closed sales. Use it as a guide, not a teleprompter. Know the stages. Know the pivots. Sound like yourself."))
    story.append(sp(6))

    # Stage 1
    story.extend(stage("1", "Open the Call — Give Them the Floor"))
    story.append(body("Say almost nothing for the first 3-5 minutes. Open a door. Let them walk through it. You get your qualifying data without asking 10 questions."))
    story.append(sp(4))
    story.append(script_box("So I always like to start these calls with you talking first. Tell me — what are you looking to do in federal contracting, what experience are you bringing to the table, and how do you think we can help you?"))
    story.append(sp(4))
    story.append(listen_box("Are they a beginner? Been burned by a consultant? Already submitting bids? Know what they want (done-for-you) or confused? Your entire pitch changes based on what you hear here."))
    story.append(sp(6))

    # Qualifying signals table
    story.append(table(
        ["What You Hear", "Where to Route Them"],
        [
            ["Burned by past consultant", "Acknowledge it directly (Stage 3) before anything else"],
            ["Already paying for proposals, wants more BD", "White Glove conversation"],
            ["Working full-time, not enough time", "Accelerator + VA recommendation"],
            ["Total beginner, no revenue yet", "Free resources first, then Pro Member, then Accelerator later"],
            ["Has revenue ($2M+), busy operator", "White Glove — frame as hiring a BD division"],
        ],
        widths=[2.8*inch, 4.2*inch]
    ))
    story.append(sp(8))

    # Stage 2
    story.extend(stage("2", "The Mirror — Reflect Their Words Back"))
    story.append(body("After they finish talking, summarize what they said <b>in their own words</b> before you say anything else. This is the single highest-trust move in the script."))
    story.append(sp(4))
    story.append(script_box("Okay — let me make sure I understand. It sounds like you [RESTATE IN THEIR WORDS]. Is that right?"))
    story.append(sp(4))
    story.append(body("<b>Real examples from Branden's calls:</b>"))
    story.append(bullet('"You\'re working 40+ hours, you\'ve won a contract before, you know the method works — but you just don\'t have time and you need someone to help you immerse in this. Is that correct?"'))
    story.append(bullet('"You know where you want to go, but you don\'t have a clear plan of action specifically on how to get there. More like a roadmap, right?"'))
    story.append(sp(4))
    story.append(listen_box('If they say "yes, exactly" — you\'ve earned trust. Move forward. If they correct you — let them. Thank them. Re-mirror. If they keep talking — let them. More data = better pitch.'))

    story.append(PageBreak())

    # Stage 3
    story.extend(stage("3", "The Burned Prospect Acknowledgment"))
    story.append(body("Many prospects have paid another consultant and got nothing. Don't skip this. Don't defend GCG. Anchor to deliverables."))
    story.append(sp(4))
    story.append(bold("If they brought it up on a previous call:"))
    story.append(script_box("Last time we talked, you mentioned you've been burned by consultants before. Your real question is: how are we different? That's still where we're at, right?"))
    story.append(sp(4))
    story.append(bold("If they bring it up unprompted:"))
    story.append(script_box("That's a completely fair concern — I appreciate you being upfront about it. The difference is going to come down to deliverables. Things we actually commit to doing, not just advice we give you."))
    story.append(sp(4))
    story.append(pivot_box("Don't defend GCG. Don't trash the other consultant. Just anchor to deliverables and accountability. Then move forward."))
    story.append(sp(8))

    # Stage 4
    story.extend(stage("4", "The Education Moment — Reframe Their Strategy"))
    story.append(body("Use this when the prospect says 'I want to do everything' or 'I'm just bidding on SAM.gov.' Don't criticize. Explain the math."))
    story.append(sp(4))
    story.append(script_box("I totally understand that thinking. The issue isn't that you CAN'T do it all — it's that the government doesn't trust someone who says they do 20 things. They want the expert at one. Here's the math: two industries = maybe 80 decision-makers you need to know. Three industries = 120. You can't build a relationship with 120 people cold. But if you pick one — you find the top 10-15 contracting officers who spend the most money in that space, build relationships, and they start sending YOU opportunities. That's when sole source happens."))
    story.append(sp(4))
    story.append(listen_box('"That makes all the sense in the world" — they\'re ready to hear about packages. Move to Stage 5.'))

    story.append(PageBreak())

    # Stage 5
    story.extend(stage("5", "The Three-Tier Introduction"))
    story.append(body("Introduce all three levels simply. <b>Don't lead with price. Lead with fit.</b> Let them self-select — then go deep on only what they respond to."))
    story.append(sp(4))
    story.append(script_box("When it comes to how we work with people, we have three tiers. Tier one is training — community, group coaching, weekly webinars, or a self-paced video series matched to the Action Plan. Tier two is consulting — the 90-Day Accelerator is once a week for 90 days, 12 sessions, built to get you procurement-ready. Or the Consulting Pack is 20 flexible hours you draw down on your own terms. Tier three is white glove — we actually do the work. We make the calls, set the meetings, reach out to primes, support your proposals. It starts at $4,000 a month and goes up depending on how deep you need us to go. Which of those three tiers sounds most like what you're looking for?"))
    story.append(sp(4))
    story.append(listen_box('"Tier 2 or 3" = high intent, go deeper. "Just do it for me" = jump to White Glove. "I just need to learn" = Training tier. "I want coaching but can\'t afford $5,997 all at once" = offer installments ($749/mo x9) or Consulting Pack.'))
    story.append(sp(8))

    # Stage 6
    story.extend(stage("6", "White Glove Pitch — The Done-For-You Tier"))
    story.append(body("Frame it as an extension of their company, not a vendor. The word 'extension' closes deals."))
    story.append(sp(4))
    story.append(script_box("Think of us as an extension of your company. You get a dedicated BD coordinator working your federal pipeline. They're reaching out to contracting officers. Engaging the primes. Setting capability briefings. Helping you put proposals together. White glove starts at $4,000 a month. As your pipeline grows, we can scale to $6K, $8K, even $10K. Here's the way we frame it: for the cost of one hire, you're getting a small consulting team running your entire federal BD division."))
    story.append(sp(4))
    story.append(table(
        ["Level", "Price", "Best For"],
        [
            ["Starter", "$4,000/mo", "New to white glove, getting the BD engine started"],
            ["Growth", "$6,000/mo", "More agency targets, higher outreach volume"],
            ["Pro", "$8,000/mo", "Active capture management, multiple opportunities"],
            ["Enterprise", "$10,000+/mo", "Full BD division replacement, custom scope"],
        ],
        widths=[1.2*inch, 1.2*inch, 4.6*inch]
    ))
    story.append(sp(4))
    story.append(bold("The story that resets timelines (use every time they ask 'how long?'):"))
    story.append(script_box("We had a client on white glove who landed an $800,000 sole source contract in six months. Three months after that, he won a 1.7 million dollar contract. Is that guaranteed? No. But that's what happens when you're positioned correctly and someone's working the pipeline consistently."))
    story.append(sp(4))
    story.append(pivot_box("If they hesitate on white glove price: 'The consulting option — the 90-Day Accelerator — is a one-time $5,997. Twelve sessions, once a week. By the end you're procurement-ready. Or the Consulting Pack gives you 20 flexible hours. If the monthly commitment isn't right yet, either of those gets you moving.'"))

    story.append(PageBreak())

    # Stage 7
    story.extend(stage("7", "Accelerator Pitch — The 90-Day Program"))
    story.append(body("Frame it as procurement readiness, not coaching."))
    story.append(sp(4))
    story.append(script_box("The Accelerator is our 90-day consulting program. Once a week, one-on-one — about 12 sessions total. The entire goal is to make you procurement-ready. By the end, you know your industry, you have your system in place, you know who the decision-makers are, and if we have connections in your space — we're already making introductions. It's a one-time investment of $5,997. That also gives you lifetime access to the group coaching calls and the full program."))
    story.append(sp(4))
    story.append(bold("When they hesitate on price:"))
    story.append(script_box("And you don't have to pay it all at once. We can break it into installments — comes out around $749 a month over nine months."))
    story.append(sp(4))
    story.append(listen_box("The $749/month reframe works immediately — Angie Schyma started doing the math out loud and said 'okay, okay.' Always have this ready."))
    story.append(sp(8))

    # Stage 8
    story.extend(stage("8", "Free Resource Bridge — For Not-Ready Prospects"))
    story.append(body("Never let a prospect leave the call without a next step. Free resources are a filter — the ones who come back are warmer buyers."))
    story.append(sp(4))
    story.append(script_box("Before we talk about any premium service — go to govcongiants.org. Under Beginner Start Here you'll see the Action Plan and the Opportunity Hunter. Download both. The Action Plan gives you every step you'd need to take anyway. The Opportunity Hunter shows you who's spending the most money in your industry, in your area. Both are free. Once you've done those two things, come back — you'll have a completely different level of clarity. It'll take you about 30 minutes."))
    story.append(sp(4))
    story.append(pivot_box('If they say "I already did that" or "I\'ve been doing research" — skip the free tier entirely. They\'re ready for consulting.'))
    story.append(sp(8))

    # Stage 9
    story.extend(stage("9", "Close for the Second Call — Not the Sale"))
    story.append(body("On a first discovery call, <b>don't hard-close for the sale</b>. Close for the second call — and the second call has a consultant on it."))
    story.append(sp(4))
    story.append(script_box("Here's what I want to do. Let me reach out to one of our consultants — Randie, Zach, or Eric — and get a second call set up. On that call, they'll go deeper on exactly what you need, what the market looks like in your space, and what the first 30 days actually look like if we worked together. That call doesn't cost you anything. It just gives you real clarity on whether this makes sense for you. Does that work?"))
    story.append(sp(4))
    story.append(script_box("Great. I'll shoot you an email today with some available times. Look out for it from hello@govconedu.com."))

    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════
    # 4. OBJECTION HANDLING
    # ══════════════════════════════════════════════════════════════════════
    story.append(sect("4. Objection Handling"))
    story.append(hr())
    story.append(body("Every objection below came from real calls. Know them cold."))
    story.append(sp(6))

    objections = [
        ('"I\'ve been burned by consultants before."',
         "That's exactly why we structure it with deliverables. We don't just give advice. In consulting, you see what's being done each week. In white glove, you're seeing the outreach, the meetings, the communications. There's no mystery. You'll see what we're doing."),
        ('"I don\'t know what industry to pick."',
         "That's what the Opportunity Hunter is for. It tells you where the government is spending the most money in your space and area. Most people find their lane in about 20 minutes. Let's get you there before we talk strategy."),
        ('"Can you guarantee results?"',
         "We can't control what the government does. Nobody can. What we can control — and what we guarantee — is our actions. The outreaches, the capability briefings, the meetings we're pursuing. You'll see all of that. Some clients get opportunities in 30 days. Some take 6 months. But everyone who works the system seriously gets traction."),
        ('"I\'m working a 9-to-5. I don\'t have time."',
         "That's the exact profile of someone who benefits most from the Accelerator. Your time goes toward strategy and relationships. For the grunt work — you hire a virtual assistant. We'll give you the Action Plan you hand directly to them. You become the manager. They become the executor."),
        ('"I don\'t have the money right now."',
         "Totally understand. Two things: One — we do have installment plans on the consulting side. Two — if budget is tight, start with the free resources. The Action Plan and Opportunity Hunter are genuinely powerful and cost you nothing. When you're ready to accelerate, we'll be here."),
        ('"Can you write proposals for us?"',
         "We don't write proposals as the core service. What we do is help you put it together — review it, check compliance, identify gaps, make it competitive. If you need full writing, we have trusted people in our network we can connect you with. But our core is BD — the relationship side that makes proposals win in the first place."),
    ]

    for objection, response in objections:
        story.append(bold(f"Objection: {objection}"))
        story.append(script_box(response))
        story.append(sp(4))

    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════
    # 5. QUALIFYING DECISION TREE
    # ══════════════════════════════════════════════════════════════════════
    story.append(sect("5. Qualifying Decision Tree"))
    story.append(hr())
    story.append(body("Run through this mentally while the prospect is talking in Stage 1."))
    story.append(sp(6))

    story.append(table(
        ["Question", "Their Answer", "Route To"],
        [
            ["Been burned by consultant?", "Yes", "Stage 3 — anchor to deliverables first"],
            ["Do they have revenue?", "$2M+", "White Glove — start at $4K"],
            ["Do they have revenue?", "Some / part-time", "Accelerator ($5,997) or Consulting Pack"],
            ["Do they have revenue?", "None / very early", "Free resources, then Pro Member, then upgrade"],
            ["Do they have time?", "No (busy operator)", "White Glove OR Accelerator + VA"],
            ["Do they have time?", "Some", "Accelerator (structured) or Consulting Pack (flexible)"],
            ["Do they have time?", "Lots, low budget", "Pro Member Plan (self-paced) + free resources"],
            ["Want community or solo?", "Community", "Pro Member Group ($99/mo)"],
            ["Want community or solo?", "Self-paced", "Pro Member Plan (video series)"],
            ["Know their industry?", "No", "Opportunity Hunter (free) first"],
            ["Know their industry?", "Yes", "Skip to strategy conversation"],
            ["White Glove level?", "Just starting BD", "Starter — $4,000/mo"],
            ["White Glove level?", "More volume needed", "Growth — $6,000/mo"],
            ["White Glove level?", "Active capture", "Pro — $8,000/mo"],
            ["White Glove level?", "Full BD division", "Enterprise — $10,000+/mo"],
            ["Ready to buy now?", "Yes", "Send invoice immediately"],
            ["Ready to buy now?", "Need more info", "Second call with consultant"],
            ["Ready to buy now?", "Not yet", "Free resources + follow-up sequence"],
        ],
        widths=[1.8*inch, 1.5*inch, 3.7*inch]
    ))

    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════
    # 6. KNOW THE PRICING
    # ══════════════════════════════════════════════════════════════════════
    story.append(sect("6. Know the Pricing"))
    story.append(hr())

    story.append(sub("Tier 1 — Training"))
    story.append(table(
        ["Plan", "Price", "What It Is"],
        [
            ["Pro Member Group", "$99/mo", "Group coaching community, weekly live webinars, peer feedback, community calls. No 1:1."],
            ["Pro Member Plan", "Ask for pricing", "Self-paced video series aligned with GCG Action Plan. Registration through proposal. No live coach needed."],
        ],
        widths=[1.5*inch, 1.2*inch, 4.3*inch]
    ))
    story.append(sp(8))

    story.append(sub("Tier 2 — Consulting"))
    story.append(table(
        ["Plan", "Price", "What It Is"],
        [
            ["90-Day Accelerator", "$5,997 one-time\n(~$749/mo x9)", "12 weekly 1:1 sessions. Goal: procurement readiness. Includes lifetime access to group + program library."],
            ["Consulting Pack", "20 hrs — ask pricing", "Flexible consulting hours. Market research, strategy, proposal review. Not locked into a program structure."],
        ],
        widths=[1.5*inch, 1.3*inch, 4.2*inch]
    ))
    story.append(sp(8))

    story.append(sub("Tier 3 — White Glove / BD Service"))
    story.append(table(
        ["Level", "Price", "What It Is"],
        [
            ["Starter", "$4,000/mo", "Done-for-you BD foundation. Dedicated coordinator, outreach, teaming, pipeline, proposals."],
            ["Growth", "$6,000/mo", "Everything in Starter + more agencies, more outreach, deeper prime engagement."],
            ["Pro", "$8,000/mo", "Everything in Growth + capture management, more proposal support, intensive strategy."],
            ["Enterprise", "$10,000+/mo", "Full BD division. Maximum outreach, dedicated team, custom scope."],
        ],
        widths=[1.2*inch, 1.2*inch, 4.6*inch]
    ))
    story.append(sp(6))
    story.append(body("<b>White Glove is month-to-month.</b> Level is set at onboarding based on pipeline size, revenue stage, and BD goals. Can scale up or down."))
    story.append(sp(6))
    story.append(sub("The Upsell Path"))
    story.append(bold("Free  →  $99/mo  →  $997 Lifetime  →  $749/mo Accelerator  →  $4,000+ White Glove"))
    story.append(sp(4))
    story.append(body("On calls, <b>never lead with price</b>. Lead with fit. Let them self-select the tier. The question is always: 'Do you want to learn how to do it, have us coach you through it, or have us just do it?'"))

    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════
    # 7. POWER PHRASES
    # ══════════════════════════════════════════════════════════════════════
    story.append(sect("7. Power Phrases — Use These Verbatim"))
    story.append(hr())
    story.append(body("Pulled from Branden's highest-converting moments. These are the exact lines that closed deals."))
    story.append(sp(6))

    story.append(table(
        ["Situation", "What to Say"],
        [
            ["Opening every call", '"Tell me what you\'re looking for and how you think we can help."'],
            ["After they finish talking", '"Okay — let me make sure I understand..."'],
            ['"I can do everything" prospect', '"The government doesn\'t trust someone who does 20 things. They trust the expert at one."'],
            ["When they ask about timelines", '"We had a client get $800K sole source in 6 months. Is that long or short when it\'s $800K?"'],
            ["Bridging to white glove", '"For the cost of one person, you get an entire federal BD team."'],
            ["Closing for second call", '"Let me get a consultant on the next call so they can go deeper with you."'],
            ["Burned by past consultant", '"That\'s why we anchor everything to deliverables. You\'ll see exactly what we\'re doing."'],
            ["Confused about tiers", '"Do you want to learn how to do it, have us coach you through it, or have us just do it?"'],
            ["Price hesitation", '"We can break it into installments — doesn\'t have to be all upfront."'],
            ["Closing next step", '"I\'ll shoot you an email today. Look out for it from hello@govconedu.com."'],
            ["They have no time", '"Your time goes toward strategy and relationships. A virtual assistant handles the rest."'],
        ],
        widths=[2.2*inch, 4.8*inch]
    ))

    story.append(sp(12))
    story.append(sub("5 Patterns That Close Sales"))
    story.append(body("These appeared in every high-converting call:"))
    story.append(sp(4))
    story.append(bold("1. The Mirror closes the gap fastest."))
    story.append(body("Reflect their words back. Every prospect who heard this said 'yes, exactly' and moved forward. 30 seconds of mirroring earns more trust than 5 minutes of pitching."))
    story.append(bold("2. The $800K story resets timelines."))
    story.append(body("Use it every time someone asks how long it takes. It's real, specific, and makes the timeline feel manageable."))
    story.append(bold("3. 'Extension of your company' is the White Glove frame."))
    story.append(body("Removes the vendor feeling. When Branden said this, prospects stopped asking about deliverables and started asking about payment."))
    story.append(bold("4. Never push. Always qualify."))
    story.append(body("Branden told Ryan Russell white glove wasn't right for him. Ryan trusted him more for it. Honesty = credibility = referrals."))
    story.append(bold("5. Close for the second call, not the sale."))
    story.append(body("Unless they say 'I'm ready, how do I pay?' — close for the second call with a consultant. Lower resistance. Higher show rate. The consultant does the heavy close."))

    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════
    # 8. WHAT THE AGENTS DO
    # ══════════════════════════════════════════════════════════════════════
    story.append(sect("8. What the 8 Agents Do"))
    story.append(hr())
    story.append(body("You don't manage these — they run automatically. Here's what each one does so you know where things come from."))
    story.append(sp(6))

    story.append(table(
        ["Agent", "What It Does", "What You See"],
        [
            ["Lead Intake", "Scores every new lead HOT / WARM / BASIC", "Lead alerts in Slack"],
            ["Email Responder", "Drafts first-touch and follow-up emails", "Gmail drafts to review and send"],
            ["Appointment Setter", "Sends Calendly links, confirmations, reminders", "Booking emails + pre-call briefings"],
            ["Post-Call", "Pulls call transcript, drafts follow-up + proposals", "Follow-up drafts + proposals in Gmail"],
            ["Morning Briefing", "Creates the daily game plan at 7 AM", "Morning report in Slack + Gmail"],
            ["Evening Report", "End-of-day summary + uncalled HOT leads", "Evening report in Slack + Gmail"],
            ["QA Health Check", "Makes sure all agents ran, flags problems", "GREEN / YELLOW / RED status"],
            ["Slack Commands", "Responds to your messages in #sales-claude", "Thread replies with data"],
        ],
        widths=[1.3*inch, 2.5*inch, 3.2*inch]
    ))
    story.append(sp(8))
    story.append(bullet("Morning QA shows <b>GREEN</b> = everything is fine"))
    story.append(bullet("<b>YELLOW</b> = minor issue, mention it to Branden"))
    story.append(bullet("<b>RED</b> = something is broken, tell Branden immediately"))

    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════
    # 9. LEAD INTELLIGENCE AGENT
    # ══════════════════════════════════════════════════════════════════════
    story.append(sect("9. Lead Intelligence Agent"))
    story.append(hr())
    story.append(body("You have a dedicated intelligence agent that can look up any lead instantly and run follow-ups automatically. Use it from Slack or during calls to get the full picture on anyone."))
    story.append(sp(6))

    story.append(sub("Lead Research — Look Up Anyone"))
    story.append(body("Type a lead's name or email in #sales-claude and the agent pulls a full intelligence brief:"))
    story.append(sp(4))
    story.append(bullet('<b>"Look up Dominic Irvin"</b> or <b>"What\'s the latest on dom@toogsolutions.com"</b>'))
    story.append(sp(4))
    story.append(body("The agent checks 4 sources in order:"))
    story.append(table(
        ["Source", "What It Pulls"],
        [
            ["1. Gmail", "Most recent email thread, who sent last, tone, whether ball is in our court or theirs"],
            ["2. Fireflies", "Call recordings, key topics discussed, action items, verbatim highlights"],
            ["3. Google Calendar", "Scheduled/past meetings, confirmations, declines, no-shows"],
            ["4. Slack", "Internal mentions, team notes, priority flags"],
        ],
        widths=[1.5*inch, 5.5*inch]
    ))
    story.append(sp(6))
    story.append(body("The brief returns: latest communication, last conversation summary, current situation, where we left off, and a <b>recommended next action</b>. Use this before every call to prep."))
    story.append(sp(8))

    story.append(sub("Follow-Up Tracks — Two Types"))
    story.append(body("Say <b>'Run follow-ups'</b> in #sales-claude. The agent identifies who needs follow-up and drafts emails. There are two separate tracks:"))
    story.append(sp(4))

    story.append(table(
        ["", "Track A — Hot Leads", "Track B — Regular Leads"],
        [
            ["Who", "Had a 2nd meeting, considering Consulting or White Glove", "1st call only, interested in tools / training / community"],
            ["Tone", "Personal, direct — like a colleague who remembers them", "Warm, value-driven — feels human but sent at scale"],
            ["Length", "3-5 sentences max", "4-6 sentences"],
            ["Personalization", "References the specific meeting and what they said", "First name + one contextual detail"],
            ["CTA", "Book a call, confirm interest, reply", "Soft — grab a resource, reply, watch a video"],
            ["Frequency", "Every 3-5 business days", "Weekly or bi-weekly"],
            ["Drafting", "Each email written individually", "Template-based with personal fields"],
            ["Goal", "Close or advance to paid service", "Nurture toward tools or training purchase"],
        ],
        widths=[1.3*inch, 2.85*inch, 2.85*inch]
    ))
    story.append(sp(8))

    story.append(sub("How Leads Get Classified"))
    story.append(body("The agent automatically flags leads based on their activity:"))
    story.append(sp(4))
    story.append(bold("HOT — High Touch"))
    story.append(bullet("Attended a second call or meeting"))
    story.append(bullet("Were presented with a Consulting or White Glove offer"))
    story.append(bullet("Asked about pricing, timelines, deliverables, or next steps"))
    story.append(bullet("Said YES, gave times, or requested a proposal"))
    story.append(bullet("Went silent after a second meeting (at risk of going cold)"))
    story.append(sp(4))
    story.append(bold("REGULAR — Nurture"))
    story.append(bullet("Booked a first call or signed up through a landing page"))
    story.append(bullet("Have NOT attended a second meeting"))
    story.append(bullet("Have NOT been offered Consulting or White Glove"))
    story.append(bullet("Haven't replied to any previous outreach"))
    story.append(sp(8))

    story.append(sub("Lead Status Labels"))
    story.append(body("These are the statuses the agent uses to track where each lead stands:"))
    story.append(sp(4))
    story.append(table(
        ["Status", "What It Means"],
        [
            ["Hot — 2nd meeting", "Attended second meeting, being considered for Consulting or White Glove"],
            ["Hot — proposal sent", "Offer made, awaiting decision"],
            ["Hot — went silent", "High-touch lead who stopped responding after second meeting"],
            ["Active - replied YES", "Responded positively, awaiting next step"],
            ["Active - gave times", "Provided availability, needs to be booked NOW"],
            ["Active - gave company info", "Engaged, shared business details"],
            ["Active - ongoing thread", "Conversation in progress, do not re-contact"],
            ["Regular — no reply", "No response to outreach yet"],
            ["Regular — nurture", "In active nurture sequence"],
            ["Draft sent", "Follow-up email drafted, pending send"],
        ],
        widths=[2.2*inch, 4.8*inch]
    ))

    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════
    # 10. SLACK COMMANDS
    # ══════════════════════════════════════════════════════════════════════
    story.append(sect("10. Slack Commands"))
    story.append(hr())
    story.append(body("Go to <b>#sales-claude</b> in Slack and type any of these. You'll get a response in the thread within 3 minutes."))
    story.append(sp(6))

    story.append(sub("Reports & Data"))
    story.append(table(
        ["Type This", "What You Get"],
        [
            ["revenue report", "This month, last month, YTD, MRR"],
            ["full report", "Complete dashboard — everything at once"],
            ["how many leads", "Pipeline numbers"],
            ["top customers", "Highest-paying customers"],
            ["agent status", "Confirm all agents ran today"],
        ],
        widths=[2.8*inch, 4.2*inch]
    ))
    story.append(sp(6))

    story.append(sub("Lead Intelligence"))
    story.append(table(
        ["Type This", "What You Get"],
        [
            ["Look up [name]", "Full intelligence brief — emails, calls, calendar, Slack mentions"],
            ["What's the latest on [name]", "Most recent interaction + recommended next action"],
            ["search [name]", "Find anyone across leads, clients, and transactions"],
            ["Run follow-ups", "Agent scans pipeline and drafts follow-ups for all due leads"],
            ["Follow up with hot leads", "Drafts individual emails for hot leads only"],
            ["upgrade [name] to client", "Update someone's status in the CRM"],
        ],
        widths=[2.8*inch, 4.2*inch]
    ))
    story.append(sp(6))

    story.append(sub("Actions"))
    story.append(table(
        ["Type This", "What You Get"],
        [
            ["run all agents", "Trigger every agent immediately"],
            ["cross reference", "Find Stripe payers who should be marked as clients"],
            ["Or ask anything in plain English", "AI figures out what you need"],
        ],
        widths=[2.8*inch, 4.2*inch]
    ))
    story.append(sp(8))
    story.append(body("Use this anytime:"))
    story.append(bullet("Before a call: <b>Look up John Smith</b> to get the full brief"))
    story.append(bullet("Before a call: <b>search John Smith</b> to find them across all data"))
    story.append(bullet("End of week: <b>revenue report</b> to see the numbers"))
    story.append(bullet("End of day: <b>agent status</b> to make sure everything ran"))
    story.append(bullet("When leads are stale: <b>Run follow-ups</b> to draft all pending emails"))

    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════
    # 11. THE RULES + QUICK REFERENCE
    # ══════════════════════════════════════════════════════════════════════
    story.append(sect("11. The Rules"))
    story.append(hr())

    rules = [
        ("Rule 1: HOT leads get called within 1 hour.",
         "Speed to lead is everything. When you see a HOT alert, drop what you're doing and call."),
        ("Rule 2: Agents draft — you send.",
         "Nothing goes out automatically. Every email sits in Gmail drafts until you review and hit Send."),
        ("Rule 3: Check Gmail drafts 3-4 times per day.",
         "Drafts pile up from the agents. Don't let them sit overnight."),
        ("Rule 4: Read the pre-call briefing before every call.",
         "It arrives 30 min before. It has their background, pain points, and the recommended angle."),
        ("Rule 5: Proposals go through Branden first.",
         "The agent generates them, but never send a proposal without Branden reviewing it."),
        ("Rule 6: The Evening Report is tomorrow's game plan.",
         "The 'Uncalled HOT Leads' list is your #1 priority the next morning."),
        ("Rule 7: If an agent didn't run, tell Branden.",
         "Check 'agent status' at end of day. If anything shows RED or YELLOW, flag it."),
        ("Rule 8: Never pressure a prospect.",
         "If they're not ready: 'We're here whenever it makes sense.' They'll come back."),
        ("Rule 9: Close for the second call, not the sale.",
         "On discovery calls, get them to a consultant call. Don't hard-close on call 1."),
        ("Rule 10: Always leave them with a next step.",
         "Free resources, a second call, a proposal — nobody leaves a call without knowing what happens next."),
    ]
    for title, desc in rules:
        story.append(Paragraph(title, styles['RuleNum']))
        story.append(body(desc))
        story.append(sp(2))

    story.append(sp(8))
    story.append(sub("Quick Reference — Where to Find Things"))
    story.append(table(
        ["What You Need", "Where to Find It"],
        [
            ["Morning game plan", "Slack #ai-assistant at 7 AM"],
            ["Email drafts to send", "Gmail Drafts folder"],
            ["Pre-call briefings", "Email + iMessage, 30 min before call"],
            ["Proposals to review", "Gmail Drafts + data/proposals/ folder"],
            ["Lead alerts", "Slack #ai-assistant (throughout the day)"],
            ["Revenue / pipeline data", "Type 'revenue report' in #sales-claude"],
            ["Full brief on any lead", "Type 'Look up [name]' in #sales-claude"],
            ["Run all follow-ups", "Type 'Run follow-ups' in #sales-claude"],
            ["Evening wrap-up", "Slack #ai-assistant at 5:30 PM"],
            ["GovCon Giants phone", "(786) 477-0477"],
            ["Follow-up email from", "hello@govconedu.com"],
        ],
        widths=[2.5*inch, 4.5*inch]
    ))

    story.append(sp(30))
    story.append(hr())
    story.append(sp(6))
    story.append(Paragraph("GovCon Giants — Sales Manager Playbook", styles['FootNote']))
    story.append(Paragraph("Built from Branden's real Fireflies transcripts  |  April 2026  |  Internal Use Only", styles['FootNote']))

    doc.build(story)
    print("PDF created successfully!")

if __name__ == "__main__":
    build_pdf()
