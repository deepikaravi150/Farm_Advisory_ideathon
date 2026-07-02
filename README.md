# 🌾 FarmAdvisor

**An AI agriculture officer in every farmer's pocket — and on their WhatsApp. In Tamil, Hindi, or English. By text, voice, or photo.**

FarmAdvisor turns a smartphone (or just a WhatsApp chat) into a personal agronomist for Tamil Nadu farmers. Every answer is grounded in *that* farmer's land, soil, crop plan, and the live weather over *their* field — delivered as clear, field-ready advice a farmer can act on today.

> Built mobile-first for low digital literacy: no long forms, no jargon, voice + photo + WhatsApp everywhere.

This README is the single source of documentation for the project.

---

## Table of contents

- [What it does](#what-it-does)
- [The two channels](#the-two-channels)
- [Feature reference](#feature-reference)
- [Architecture & tech stack](#architecture--tech-stack)
- [Data model (DynamoDB)](#data-model-dynamodb)
- [Project structure](#project-structure)
- [API reference](#api-reference)
- [Environment variables](#environment-variables)
- [Getting started (local)](#getting-started-local)
- [Operational scripts](#operational-scripts)
- [Deployment](#deployment)
- [Languages & localization](#languages--localization)
- [Security notes](#security-notes)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## What it does

| Capability | One-liner |
|---|---|
| 🤖 **AI Farm Advisor** | A 24/7 agronomist chat for crop choice, pests, fertiliser, irrigation, harvest & selling — grounded in your profile, soil, plan, weather, and a curated knowledge base. |
| 📷 **Crop Doctor** | Snap a leaf/plant photo → instant pest/disease diagnosis, severity, cause, low-cost treatment, prevention. |
| 🎙️ **Voice in / voice out** | Speak a question, hear the answer — built for low-literacy users, in all three languages. |
| 🌱 **Smart crop planning** | A complete, dated, weather-aware season plan tailored to your land, with stage costs and budget. |
| ☀️ **"Today"** | A one-screen, tappable checklist of what to do today, from your plan + weather + soil. |
| 🧪 **Soil health** | Upload a Soil Health Card (photo/PDF) → AI extracts pH/N-P-K and gives plain-language advice. |
| 💰 **Money & finances** | Live mandi prices + plan-based profit outlook, **plus a personal ledger** — log real expenses, crop sales & loans for profit/loss, expense breakdown, above/below-market (anti-scam) checks, and loan-vs-spend tracking. |
| 🏛️ **Government schemes** | 71 TN + Central schemes matched to your profile, tagged Eligible / Likely / Check. |
| 🐛 **Pest geo-alerts** | A confirmed pest photo warns nearby farmers (within ~3 km) over WhatsApp. |
| 👥 **Peer insights** | A weekly anonymized "a farmer like you did X" WhatsApp nudge from similar farmers. |
| 🔔 **Proactive reminders** | Daily SMS/WhatsApp nudges for the next farming step. |
| 🧠 **Long-term memory** | The bot remembers durable facts about your land across conversations. |
| 🌐 **Three languages** | Full English / தமிழ் / हिन्दी across UI, chat, voice, plans, and alerts. |

---

## The two channels

Both channels share **one AI brain** — `generateChatReply()` in `lib/chat-engine.ts` powers the web chat (`/api/chat`) and the WhatsApp bot (`/api/whatsapp`), so a feature added to the engine appears in both at once.

### 📱 Web app (mobile-first)
An app-like experience that works in any phone browser, with a bottom tab bar: **Today · Plan · Chat · Money · Profile** (schemes are reachable from Profile).

### 💬 WhatsApp bot
The same AI, inside WhatsApp:
- **Registered farmers only** — the phone number *is* the login (no passwords).
- Replies in the farmer's language and by name.
- **Voice note** → transcribed (Whisper) and answered.
- **Crop photo** → instant diagnosis.
- Onboarding folds the WhatsApp opt-in into sign-up via a **QR / tap-to-join** link.
- Inbound replies also drive pest-alert responses (`1`/`2`) and tip opt-out (`STOP`).

---

## Feature reference

### 🤖 AI Farm Advisor (chat)
The shared chat engine (`lib/chat-engine.ts`) assembles a personalized system prompt **per request (stateless model)** from, in one parallel pass:
- the farmer's **profile** (district, land, soil type),
- their latest **soil report** and **active crop plan**,
- **live weather** over their field's coordinates,
- **RAG** retrieval from a curated farming knowledge base (Qdrant), and
- **matched government schemes** (so subsidy questions answer from real eligibility, never invented schemes).

After replying, the conversation is summarized + tagged and stored to `chat_history`, and durable **memory** facts are written back (`lib/memory.ts`). The LLM is OpenAI (`chatWithBedrock()` in `lib/ai/openai.ts`); every AI path has a deterministic fallback so the app keeps working if a service is down.

### 📷 Crop Doctor
`lib/crop-doctor.ts` runs vision diagnosis on a crop photo and returns `{ isPlant, healthy, diagnosis, severity, confidence, cause, treatment, prevention }`. A clearly-confirmed pest/disease can trigger the geo-alert broadcast (below).

### 🎙️ Voice
- **Speech-to-text**: OpenAI Whisper (`/api/speech/transcribe`, and inline for WhatsApp voice notes), with the farmer's language as a hint.
- **Text-to-speech**: `/api/speech/synthesize` (OpenAI TTS; AWS Transcribe/Polly SDKs are also wired in).

### 🌱 Smart crop planning
`/api/crop-plan` (types in `lib/types/crop-plan.ts`, weather logic in `lib/crop-plan-weather.ts`) handles three states:
- **"Not sure what to grow?"** → AI shortlists the 3 best crops for your district/soil/season (deterministic fallback: `getSuitableCrops()` in `lib/crop-suitability.ts`).
- **"I want to grow X"** → validates feasibility, then builds the plan.
- **"I'm mid-season"** → plans the remaining stages from today.

Each plan has dated **milestones** (land prep → seed → sowing → irrigation → nutrients/pest → harvest & sell) with tasks, **per-stage cost**, a **total budget estimate**, ideal-weather notes, and 16-day-forecast alerts for threatened stages. A **Plan Assistant chatbot** (`/api/crop-plan/chat`) lets the farmer ask questions or request changes (shift dates, add stages, adjust budget) — previewed and applied on confirm. Visualized as timeline / flowchart / stage views (`reactflow`).

### ☀️ "Today"
`/api/today` (logic in `lib/today-plan.ts`) builds a tappable daily checklist from the active plan + weather + soil, an AI-written "focus for today" line, and weather alerts only when they matter.

### 🧪 Soil health
`/api/soil/upload` reads a Soil Health Card (image *or* PDF via `pdf-parse`), extracts **pH, N-P-K, organic carbon, EC, micronutrients**, and stores a plain-language summary + recommendations. Soil data then powers crop suitability, planning, and chat.

### 💰 Money & finances
The **Money** tab has four sections — **Overview · Expenses · Sales · Loans**.

- **Live market price** — `/api/market-prices` pulls mandi prices from Agmarknet / data.gov.in (min, max, modal, up/down/flat trend).
- **Plan-based profit outlook** — `/api/money` estimates revenue/profit from the active plan's costs × current modal price (LLM + deterministic fallback). Labelled an estimate.
- **Financial ledger (real money)** — `lib/money/` + the `financial_entries` table let a farmer record actual **expenses, crop sales, and loans**:
  - `lib/money/ledger.ts` — CRUD, shared by the API and the WhatsApp path.
  - `lib/money/analysis.ts` — deterministic **profit/loss**, **expense-by-category** breakdown, **per-crop P&L**, an **above/below-market "scam" check** (each sale's ₹/qtl vs the market rate snapshotted at sale time, flagging under-market sales, estimated loss, and buyers who repeatedly underpay), and **loan-vs-spend** (flags when total spending crosses total loans) — plus a short **localized AI narrative** with a deterministic fallback. `buildFinancialPromptContext()` feeds a compact summary into the chat engine so "am I in profit?" / "how much on fertilizer?" answer from real figures on web **and** WhatsApp.
  - **WhatsApp / voice quick-add** — `lib/money/whatsapp-log.ts` parses messages like *"spent 2000 on fertilizer"* or *"sold 5 quintal paddy at 2100"* into entries (a keyword gate avoids an LLM call on every message; questions fall through to chat).
  - APIs: `GET/POST/PATCH/DELETE /api/money/ledger`, `GET /api/money/analysis`.

No realized outcomes are invented — analysis is grounded in what the farmer actually logs.

### 🏛️ Government schemes
A structured, queryable catalogue of **71 schemes** (48 TN State + 23 Central) in `lib/data/tn-schemes.json`, each with human-readable content **plus** structured `criteria` (district, crop, land-size class, community, gender, age, income, occupation).
- `lib/schemes/match.ts` matches a farmer's facts to schemes and tags each **Eligible / Likely / Check eligibility**; hard mismatches exclude, unknowns downgrade and surface as "to confirm".
- Web UI at `/schemes` (reached from Profile); API at `/api/farmer/schemes`.
- The chat engine injects matched schemes (`lib/schemes/chat-context.ts`) so the advisor answers "what subsidies can I get?" from real, matched data on web **and** WhatsApp.
- Dataset is regenerated by `scripts/crawl-tn-farmer-schemes.mjs` → `scripts/extract-scheme-criteria.mjs`.

### 🐛 Pest-outbreak geo-alerts
`lib/pest-alert.ts`: when a crop photo is confirmed as a pest/disease, every registered farmer within `PEST_ALERT_RADIUS_KM` (default 3 km) of the reporter's land is alerted over WhatsApp with prevention tips. Recipients reply `1` (my crop is fine → suppressed) or `2` (I have it too → a new outbreak point expands the zone). Backed by `pest_reports` + `pest_alerts`, with a per-farmer/per-pest cooldown to prevent spam.

### 👥 Peer insights
`lib/insights/peer-insights.ts`: clusters farmers by **similarity — land-size class + soil family + crop — not geography**, so a farmer can learn from a peer in a *different* district (cross-area knowledge transfer). Each week it picks one grounded, **anonymized** "a farmer like you did X" WhatsApp tip, rotating across:
1. **Crop idea** — a crop that suits the recipient's land (crop-suitability) *and* is grown by a similar peer they don't already grow.
2. **Scheme nudge** — a scheme they're actually eligible/likely for, with the real benefit + official link + "verify before applying".
3. **Practice tip** — the agronomic tip for their crop.

No outcomes are fabricated (no "earned ₹X"). Pushed weekly via `/api/cron/peer-insights`; deduped by the `peer_insights` table (30-day cooldown, `PEER_INSIGHT_COOLDOWN_DAYS`). Farmers opt out by replying **STOP** (handled in `/api/whatsapp`).

### 🔔 Proactive reminders
`lib/daily-sms.ts` drafts a daily, plan-aware advice SMS (translated to the farmer's language) sent via AWS SNS. Triggered by `/api/cron/daily-sms`. (See the deployment note about cron scheduling.)

### 🧠 Long-term memory
`lib/memory.ts` stores up to 40 durable `Fact`s per farmer (crop, land, irrigation, soil, pest, preference), auto-extracted from chat — surfaced into future prompts so the bot "knows" the farmer over time.

---

## Architecture & tech stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 15 (App Router), React 19, TypeScript 5.7 |
| **Styling** | Tailwind CSS 3.4, `lucide-react` icons |
| **i18n** | `next-intl` (en/hi/ta); config `lib/i18n.ts`; messages in `public/locales/<locale>/common.json` |
| **LLM / embeddings / speech** | OpenAI — chat (`gpt-5.2`), embeddings (`text-embedding-3-small`), STT (`whisper-1`), TTS (`gpt-4o-mini-tts`) — via `lib/ai/openai.ts` |
| **RAG** | Qdrant vector DB (`lib/ai/rag.ts`, `lib/ai/vectorstore.ts`); collection `farm_docs` |
| **Database** | AWS DynamoDB (region `ap-south-1`) via `lib/aws/dynamodb.ts` |
| **Storage** | AWS S3 (media + KB buckets) |
| **SMS** | AWS SNS (`lib/aws/sns.ts`) |
| **Speech (AWS)** | AWS Transcribe streaming + Polly SDKs |
| **WhatsApp** | Twilio (sandbox) — `lib/whatsapp/twilio.ts` |
| **Weather** | Open-Meteo, 16-day forecast (no key) — `lib/weather.ts` |
| **Market prices** | Agmarknet via data.gov.in |
| **Maps** | Leaflet / `react-leaflet` (draw your land parcel) |
| **Plan visuals** | `reactflow` (flowchart), custom timeline/stage views |
| **Auth** | JWT httpOnly cookie (`auth_token`) via `lib/auth.ts` + `middleware.ts`; `bcryptjs`; OTP (`lib/otp.ts`) |
| **Validation** | `zod`, `react-hook-form` |
| **Runtime** | Next.js **standalone** output; Docker + EC2/pm2 |

```
Browser / WhatsApp ──► Next.js API routes (app/api/*) ──► OpenAI (LLM, STT, TTS, embeddings)
                              │                          └─► Qdrant     (RAG over knowledge base)
                              ├─► DynamoDB   (profiles, soil, plans, chat, schemes, alerts, insights)
                              ├─► S3         (media, KB docs)
                              ├─► SNS        (SMS)        ├─► Twilio (WhatsApp)
                              ├─► Open-Meteo (weather)    └─► data.gov.in (Agmarknet prices)
```

**Resilience:** every AI feature has a deterministic fallback (heuristic crop suitability, rule-based plans, fixed profit ratios), so the app degrades gracefully when an external service is unavailable.

---

## Data model (DynamoDB)

Tables are defined in `lib/aws/dynamodb.ts` (`Tables` enum). DynamoDB is schemaless — fields accrete from the writers noted.

| Table | Keys | Holds |
|---|---|---|
| `farmer_profiles` | PK `farmer_id` (+ `phone-index` GSI) | Identity, land (`land_coordinates`, `land_area_acres`, `typography`, `survey_number`), `district`, `category`, optional `community`/`gender`/`age`/`annual_income`, `preferred_language`, `memory[]`, `peer_insights_opt_out` |
| `chat_history` | PK `farmer_id` | Stored chat turns + summaries |
| `crop_plans` | PK `farmer_id`, SK `plan_id` | Plan, `crop_name`, `milestones[]`, `budget_estimate`, `status` (`planned`/`active`) |
| `soil_reports` | PK `farmer_id`, SK `uploaded_at` | Extracted soil values + summary, `is_current` |
| `government_schemes` | PK scheme id | Scheme catalogue table (catalogue is mainly served from the bundled JSON) |
| `pest_reports` | PK `report_id` | Confirmed outbreak points |
| `pest_alerts` | PK `farmer_id`, SK `pest_key` | Per-recipient alert state + cooldown |
| `peer_insights` | PK `farmer_id`, SK `insight_key` | Peer-insight send log + cooldown |
| `financial_entries` | PK `farmer_id`, SK `entry_id` | Ledger rows: expenses, crop sales, loans |

> Note: `scanItems()` reads a single (~1 MB) page — fine for demo scale; add pagination before large-scale use.

---

## Project structure

```
app/
  (auth)/          login, register, verify-otp
  (app)/           today, plan, chat, money, profile, schemes  (auth-gated)
  page.tsx         landing
  api/             see API reference below
components/
  dashboard/ today/ crop-plan/ plan/ money/ schemes/ profile/
  chatbot/ register/ landing/ layout/
lib/
  chat-engine.ts           shared web+WhatsApp brain
  ai/      openai.ts, rag.ts, vectorstore.ts
  aws/     dynamodb.ts, s3.ts, sns.ts, polly.ts, transcribe.ts
  schemes/ types, store, match, facts, format, chat-context
  insights/ peer-insights.ts, store.ts        # peer-insight engine
  money/   ledger.ts, analysis.ts, whatsapp-log.ts, types.ts  # financial ledger
  whatsapp/ twilio.ts
  crop-info.ts, crop-suitability.ts, crop-plan-weather.ts,
  daily-sms.ts, today-plan.ts, weather.ts, memory.ts,
  pest-alert.ts, crop-doctor.ts, synthetic-gov-data.ts,
  auth.ts, otp.ts, phone.ts, i18n.ts, utils.ts
  data/    tn-schemes.json   (71-scheme catalogue)
public/locales/{en,hi,ta}/common.json
scripts/   setup / seed / crawl / test / export utilities
```

---

## API reference

All routes are App-Router handlers under `app/api/`. Auth-gated routes require the `auth_token` cookie (enforced by `middleware.ts`; public paths: `/`, `/login`, `/register`, `/api/auth`, `/api/health`).

**Auth & onboarding**
- `POST /api/auth/gov-lookup` — fetch the (synthetic) government registry record to pre-fill sign-up.
- `POST /api/auth/otp/send` · `POST /api/auth/otp/verify` · `GET /api/auth/otp/status` — OTP (channel: `mock` | `whatsapp` | `sns`).
- `POST /api/auth/register` · `POST /api/auth/login` — create profile / sign in.
- `GET /api/auth/whatsapp-join` — WhatsApp sandbox join link / QR.

**Farmer**
- `GET/PATCH /api/farmer/profile` — read / edit profile (incl. scheme-matching fields).
- `GET /api/farmer/schemes` — schemes matched to the farmer, with status & counts.
- `GET /api/farmer/memory` — long-term memory facts.

**Advice & planning**
- `POST /api/chat` — web chat (shared engine).
- `GET /api/today` — daily checklist.
- `POST /api/crop-plan` · `POST /api/crop-plan/chat` — generate/save/activate plan; chat about it.
- `GET /api/crop-options` — suitable crops for the farmer's land.

**Data**
- `GET /api/soil` · `POST /api/soil/upload` — soil report read / upload+parse.
- `GET /api/money` — plan-based profit outlook · `GET /api/market-prices` — Agmarknet prices.
- `GET/POST/PATCH/DELETE /api/money/ledger` — financial ledger (expenses/sales/loans).
- `GET /api/money/analysis` — profit/loss, breakdowns, market & loan checks + AI narrative (`?locale=`).
- `GET /api/weather` — forecast for the field.
- `GET /api/schemes` — full scheme catalogue.

**Speech & translation**
- `POST /api/speech/transcribe` · `POST /api/speech/synthesize` · `POST /api/translate`.

**Pest alerts**
- `GET /api/pest-alert` — pending alerts (Today widget) · `POST /api/pest-alert/respond` — in-app reply.

**Messaging & cron**
- `POST /api/whatsapp` — Twilio inbound webhook (chat, voice, photo, pest replies, opt-out).
- `GET/POST /api/daily-sms` · `POST /api/notifications/sms` — daily-advice SMS preview/send.
- `GET /api/cron/daily-sms` — scheduled daily SMS run.
- `GET /api/cron/peer-insights` — weekly peer-insight push. Params: `?dryRun=1`, `?farmerId=<id>`.

**Misc**
- `POST /api/upload/presigned` — S3 presigned upload URL · `GET /api/health` — health check.

> Cron routes accept `x-cron-secret` header or `?secret=` equal to `CRON_SECRET || ADMIN_SECRET` (or the `x-vercel-cron` header).

---

## Environment variables

Copy `.env.example` → `.env.local` (auto-loaded by Next.js dev and the `tsx` scripts) and fill in real values. **Never commit real keys.** See [`.env.example`](.env.example) for the annotated full list.

| Group | Variables |
|---|---|
| **AWS core** | `AWS_REGION` (`ap-south-1`), `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |
| **OpenAI** | `OPENAI_API_KEY` (**required**), `OPENAI_CHAT_MODEL` (`gpt-5.2`), `OPENAI_EMBED_MODEL`, `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE`, `OPENAI_STT_MODEL` |
| **Qdrant (RAG)** | `QDRANT_URL`, `QDRANT_COLLECTION` (`farm_docs`) |
| **S3** | `S3_BUCKET_MEDIA`, `S3_BUCKET_KB` |
| **SNS** | `SNS_REGION` (optional `SNS_ACCESS_KEY_ID` / `SNS_SECRET_ACCESS_KEY`) |
| **Auth** | `JWT_SECRET`, `CRON_SECRET` (and/or `ADMIN_SECRET`) |
| **Market** | `DATA_GOV_IN_API_KEY` (free key from data.gov.in) |
| **App** | `NEXT_PUBLIC_APP_URL` |
| **WhatsApp (Twilio)** | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_SANDBOX_KEYWORD`, `TWILIO_VALIDATE_SIGNATURE`, `WHATSAPP_WEBHOOK_URL` |
| **OTP** | `OTP_CHANNEL` (`mock` \| `whatsapp` \| `sns`) |
| **Pest alerts** | `PEST_ALERT_RADIUS_KM` (3), `PEST_ALERT_COOLDOWN_DAYS` (14) |
| **Peer insights** | `PEER_INSIGHT_COOLDOWN_DAYS` (30) |

> Docker and the standalone server read the repo-root `.env`; `npm run build` copies repo-root `.env` into the standalone dir.

---

## Getting started (local)

**Prerequisites:** Node.js 20+ (22 recommended), an OpenAI key, AWS credentials (DynamoDB/S3/SNS), and a Qdrant instance. Twilio sandbox is optional (WhatsApp only).

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env.local      # then fill in real values

# 3. Create the DynamoDB helper tables (pest + peer-insight + financial ledger)
npx tsx scripts/setup-pest-tables.ts
npx tsx scripts/setup-peer-insights-table.ts
npx tsx scripts/setup-financial-table.ts
#   (needs admin AWS creds — the app IAM user can't create tables;
#    farmer_profiles / crop_plans / soil_reports are created out-of-band)

# 4. (Optional) Ingest the knowledge base into Qdrant for RAG
npm run ingest

# 5. Run
npm run dev                     # http://localhost:3000
```

**Run with Docker (app + Qdrant):**
```bash
docker compose up --build       # web app :3000, Qdrant :6333 — reads .env
```

**WhatsApp (optional):** point the Twilio sandbox "When a message comes in" webhook to `https://<public-url>/api/whatsapp` (use a tunnel like ngrok in dev), set the `TWILIO_*` vars, and join the sandbox with `join <keyword>`.

---

## Operational scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev / production build / serve |
| `npm run lint` | ESLint |
| `npm run ingest` | Ingest KB docs into Qdrant (`scripts/ingest-kb.ts`) |
| `npx tsx scripts/setup-pest-tables.ts` | Create `pest_reports` + `pest_alerts` |
| `npx tsx scripts/setup-peer-insights-table.ts` | Create `peer_insights` |
| `npx tsx scripts/setup-financial-table.ts` | Create `financial_entries` (needs admin creds) |
| `npx tsx scripts/crawl-tn-farmer-schemes.mjs` | Crawl myScheme → raw scheme data |
| `npx tsx scripts/extract-scheme-criteria.mjs` | LLM-extract structured criteria → `lib/data/tn-schemes.json` |
| `npx tsx scripts/seed-sample-profile-fields.ts [--apply]` | Backfill sample profile fields (demo) |
| `npx tsx scripts/seed-demo-neighbour.ts` | Seed a nearby farmer for the pest-alert demo |
| `npx tsx scripts/export-farmers-xlsx.ts [out.xlsx]` | Export `farmer_profiles` to Excel |
| `npx tsx scripts/test-peer-insights.ts` | Offline dry-run of the peer-insight engine |
| `npx tsx scripts/test-financial.ts [farmerId]` | Offline end-to-end ledger + analysis test |
| `npx tsx scripts/test-pest-engine.ts` / `test-pest-tables.ts` | Pest-alert tests |
| `npx tsx scripts/check-whatsapp.ts` | Verify Twilio/WhatsApp config |

---

## Deployment

`Dockerfile` (multi-stage, Next.js **standalone** output) + `docker-compose.yml` run the app behind Qdrant.

**Production (EC2 + pm2):** the app runs on an EC2 box with standalone output under **pm2** (process `farm-advisor`, port 3000, no nginx).

```bash
git fetch origin && git reset --hard origin/<branch>
pm2 stop farm-advisor          # frees RAM (small box → build OOM risk)
export NODE_OPTIONS=--max-old-space-size=2048   # raise V8 heap or the build OOMs on ~1GB RAM
npm run build
cp -r .next/static  .next/standalone/.next/static
cp -r public        .next/standalone/public
pm2 restart farm-advisor
```

> **Build OOM:** on the ~1 GB box `npm run build` dies with "JavaScript heap out of memory" unless `NODE_OPTIONS=--max-old-space-size=2048` is set (V8 caps its heap from RAM; the box's swap doesn't raise that ceiling). Have the deploy script restart the *previous* build if the new build fails, so a failed build never leaves the app down. Note Next's build also type-checks `scripts/**`.

**Runtime env:** the standalone server reads `.next/standalone/.env`, not the repo-root `.env`. `npm run build` copies repo-root `.env` into the standalone dir, so set env **before** building (or `cp .env .next/standalone/.env` + `pm2 restart` for non-`NEXT_PUBLIC_*` changes). `NEXT_PUBLIC_*` vars are baked at build time.

**Scheduling (important):** the `vercel.json` crons do **not** run on EC2. Use a crontab hitting the cron routes, e.g. a weekly peer-insight push (Mondays 03:00):
```cron
0 3 * * 1 curl -s "http://localhost:3000/api/cron/peer-insights?secret=$CRON_SECRET" >> /home/ubuntu/peer-insights.log 2>&1
```

---

## Languages & localization

Full experience in **English, தமிழ் (Tamil), हिन्दी (Hindi)** — UI, chat, voice, plans, and alerts.
- UI strings: `next-intl`, catalogues in `public/locales/<locale>/common.json` (config in `lib/i18n.ts`).
- Proactive/transactional messages (WhatsApp/SMS) use inline per-locale templates keyed off the farmer's `preferred_language`.
- Scheme *content* stays in its source language (English); the surrounding UI chrome is localized.

---

## Security notes

- **Auth:** JWT in an `httpOnly` `auth_token` cookie; all non-public routes are gated by `middleware.ts`. The WhatsApp channel authenticates by verified phone number.
- **Secrets:** keep real keys only in `.env.local` / `.env` (gitignored). `.env.example` is a template with placeholders.
- **Twilio webhooks:** enable `TWILIO_VALIDATE_SIGNATURE=true` (with a stable `WHATSAPP_WEBHOOK_URL`) in production to reject forged inbound requests.
- **Cron routes:** protected by `CRON_SECRET` / `ADMIN_SECRET`.

---

## Troubleshooting

- **`EINVAL readlink` / unstyled pages after switching build modes:** if you `npm run build` then `npm run dev` in the same checkout, delete `.next/` first — a stale production cache (especially on a OneDrive-synced path) can break dev.
- **WhatsApp messages not arriving:** confirm the farmer joined the sandbox (`join <keyword>`), `TWILIO_*` env is set, and the inbound webhook URL points to `/api/whatsapp`. Run `npx tsx scripts/check-whatsapp.ts`.
- **No market prices:** set `DATA_GOV_IN_API_KEY` (the shared sample key is rate-limited).
- **Empty RAG answers:** run `npm run ingest` to populate Qdrant.

---

## License

Built for a hackathon / ideathon. © 2026 FarmAdvisor.

---

*FarmAdvisor — it knows your soil, your crop, and the weather over your field.*
