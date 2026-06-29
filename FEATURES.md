# 🌾 FarmAdvisor — Feature Overview

**Your AI agriculture officer, in your pocket and on WhatsApp — in your own language.**

FarmAdvisor is a mobile-first assistant for Tamil Nadu farmers that turns a smartphone (or just WhatsApp) into a personal agronomist. It knows your land, your soil, your crop, and the weather over your field — and gives clear, field-ready advice in **Tamil, Hindi, or English**, by **text, voice, or photo**.

> No long forms. No jargon. Just practical answers a farmer can act on today.

---

## 👤 Who it's for
- Smallholder and mid-size farmers in Tamil Nadu
- Farmers with low digital literacy (voice + photo + WhatsApp-first)
- New farmers unsure what to grow, and experienced farmers optimising yield & profit

---

## ⭐ The 5 things that make us different
1. **Two ways in — app *and* WhatsApp.** Farmers who'll never install an app can still chat with the full AI on WhatsApp.
2. **Truly personal.** Every answer uses *your* profile, soil card, crop plan, and live weather over *your* field — not generic tips.
3. **Talk, type, or snap a photo.** Voice notes and crop photos work everywhere, in three languages.
4. **End-to-end season support.** From "what should I grow?" to a dated plan, daily to-dos, market prices, and profit estimate.
5. **It remembers you.** Long-term memory means the bot learns your land and history over time.

---

## 📱 Channels

### The Web App (mobile-first)
A fast, app-like experience with tabs for **Today, Plan, Chat, Money, Profile** — works on any phone browser.

### WhatsApp Bot 🆕
The same AI brain, right inside WhatsApp:
- **Registered farmers only** — your phone number is your login (no passwords).
- Replies **in your language** and **by your name**.
- Send a **voice note** → it's transcribed and answered.
- Send a **crop photo** → instant pest/disease diagnosis.
- Onboarding folds the WhatsApp opt-in into sign-up via a **QR / tap-to-join** link.

---

## 🤖 AI Farm Advisor (Chat)
Your always-on agronomist for crop choice, planting, pests & disease, fertiliser, irrigation, harvest, storage, and selling.

| Feature | What the farmer gets |
|---|---|
| **Personalised answers** | Advice grounded in your profile, soil report, active crop plan, live weather, and recent chats |
| **Voice in / voice out** | Speak your question, hear the answer — built for low-literacy users (Tamil/Hindi/English) |
| **Crop Doctor 📷** | Snap a leaf/plant photo → diagnosis, severity, cause, low-cost treatment, and prevention |
| **Knowledge-grounded** | Pulls from a curated farming knowledge base so answers are reliable, not guesswork |
| **Long-term memory** | Remembers facts about you and your land across conversations |
| **Daily check-in mode** | A quick "how's the crop today?" status flow with one useful next action |

---

## 🌱 Smart Crop Planning
An AI planner that builds a complete, dated season plan tailored to your land.

- **"Not sure what to grow?"** → AI shortlists the **3 best crops** for your district, soil, season, and water situation.
- **"I want to grow X"** → checks if it's realistic for your land, then builds the plan (with adjustments if needed).
- **"I'm mid-season"** → assesses current growth and plans the **remaining stages** from today.
- **Stage-by-stage milestones** — land prep → seed → sowing → irrigation → nutrients/pest → harvest & sell, each with **dates, exact tasks, estimated cost, and ideal weather**.
- **Weather-aware scheduling** — uses a 16-day forecast to flag stages threatened by rain/storms.
- **Budget estimate** per stage and for the whole season.
- Visual **timeline, flowchart, and stage views**; activate, edit, or chat about your plan.

---

## ☀️ "Today" — your daily to-do
- A one-screen, tappable **checklist of what to do today**, built from your active plan + weather + soil.
- A warm, AI-written **"focus for today"** line.
- **Weather alerts only when it matters** — no daily noise, just real warnings for your crop.
- **"Prepare ahead"** nudges for upcoming stages (buy seed, arrange labour, etc.).

---

## 🧪 Soil Health
- **Upload your Soil Health Card** (photo *or* PDF) → AI reads it automatically.
- Extracts **pH, N-P-K, organic carbon, EC/salinity, and micronutrients**.
- Gives a **plain-language summary, key findings, and recommendations** in your language.
- Soil data then powers smarter crop suggestions, plans, and chat advice.

---

## 💰 Market & Money
- **Live mandi prices** (official Agmarknet / data.gov.in) — min, max, and modal price across nearby markets, with an **up/down/flat trend**.
- **Profit outlook** — combines your plan's costs with current market prices into an **estimated revenue & profit range**, plus practical tips to earn more.
- **Expense breakdown** by crop stage.

---

## 🗺️ Personalised to your land
- **Government Farmer ID sign-up** — auto-fetches your details, so there's no long form to fill.
- **Draw your land on a map** to pin its exact location.
- **Live weather & 15-day forecast** for your field's coordinates, woven into every recommendation.
- **District + soil crop-suitability scoring** — see which crops actually fit your land.

---

## 🏛️ Government Schemes
- **Personalised eligibility** — 71 Tamil Nadu state + Central farmer schemes matched against *your* profile (district, land size, crop, and optional community/gender/age/income), tagged **Eligible / Likely / Check**.
- Each scheme shows the **benefit, why you qualify, conditions to confirm, how to apply, documents, and the official source link**.
- **Ask the bot** — on the web app *and* WhatsApp, the advisor answers "what subsidies can I get?" using the schemes you actually qualify for (no invented schemes).
- Reachable from **Profile → Government Schemes**.

---

## 🔔 Proactive Reminders
- **Daily SMS** reminders for your next farming step.
- **Weather and milestone alerts** so nothing time-sensitive is missed.
- (And now reachable on **WhatsApp** too.)

---

## 🌐 Languages
Full experience in **English, தமிழ் (Tamil), and हिन्दी (Hindi)** — UI, chat, voice, plans, and alerts all localised.

---

## 🛠️ Under the hood (credibility for partners)
- **Mobile-first web app** — no install needed; works on low-end phones.
- **AI**: latest LLMs for advice & planning, vision for photo diagnosis, speech-to-text & text-to-speech for voice, and retrieval (RAG) over a farming knowledge base.
- **Cloud**: AWS (DynamoDB, S3, SNS) + Twilio WhatsApp + Open-Meteo weather + Agmarknet prices.
- **Resilient by design** — every AI feature has a deterministic fallback, so the app keeps working even if a service is down.

---

## 🎯 One-line pitches (for campaigns)
- *"An agriculture officer in every farmer's pocket — and on their WhatsApp."*
- *"Ask in Tamil. By voice. With a photo. Get an answer you can act on today."*
- *"From 'what should I grow?' to harvest and selling — one assistant, your whole season."*
- *"It knows your soil, your crop, and the weather over your field."*
