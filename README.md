# 🌾 FarmAdvisor

AI-powered crop planning, weather alerts, and personalized farming advice — built for Tamil Nadu farmers. Multilingual (English / हिन्दी / தமிழ்) with voice in and out.

---

## Features

- **AI Crop Planning** — a detailed, project-management-style timeline with date-ranged stages, per-stage tasks, costs, live weather forecast, and weather alerts.
- **Plan Assistant Chatbot** — chat alongside your plan to ask questions or request changes (shift dates, add stages, adjust budget); changes are previewed and applied on confirm.
- **Farm Advisor Chat** — RAG-grounded agronomy Q&A, aware of your profile, soil report, active plan, recent chats, and live weather.
- **Voice** — speech-to-text (OpenAI Whisper) and text-to-speech (OpenAI TTS) in all three languages.
- **Soil Report OCR** — upload a lab report (image/PDF); AI extracts pH/N/P/K and recommendations.
- **Weather** — current conditions + 16-day forecast for your land (Open-Meteo).
- **Land mapping** — draw your land boundary on a map at registration (Leaflet).
- **Government schemes** & **SMS alerts** (AWS SNS).

---

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS, lucide-react icons |
| i18n | next-intl (`en` / `hi` / `ta`) |
| LLM / AI | OpenAI — `gpt-4o` (chat/planning), `whisper-1` (STT), `gpt-4o-mini-tts` (TTS), `text-embedding-3-small` (embeddings) |
| Vector DB (RAG) | Qdrant |
| Data | AWS DynamoDB |
| Storage / media | AWS S3 |
| Notifications | AWS SNS |
| Weather | Open-Meteo (no key required) |
| Auth | JWT in an httpOnly cookie + bcrypt |

---

## Architecture

```
Browser ──► Next.js API routes (app/api/*) ──► OpenAI (LLM, STT, TTS, embeddings)
                      │                     └─► Qdrant   (RAG over knowledge base)
                      ├─► DynamoDB  (profiles, soil reports, crop plans, chat history, schemes)
                      ├─► S3        (media, KB docs)
                      ├─► SNS       (SMS alerts)
                      └─► Open-Meteo (weather)
```

**LLM context is rebuilt per request (stateless model).** Each chat/plan call gathers, in parallel: farmer profile, latest soil report, latest crop plan, recent chat *summaries*, RAG matches from the knowledge base, and live weather — then composes a single system prompt. After replying, the conversation is summarized + tagged and stored back to `chat_history`.

### Key directories
```
app/            Pages (auth, dashboard, crop-plan, chat, profile) + API routes
components/     UI (crop-plan timeline & chat, chatbot, dashboard widgets, ...)
lib/ai/         OpenAI client (chat, STT, TTS, embeddings), RAG, vector store
lib/aws/        DynamoDB, S3, SNS clients
lib/weather.ts  Open-Meteo current + 16-day forecast
scripts/ingest-kb.ts  Embed S3 knowledge-base docs into Qdrant
public/locales/ en | hi | ta translation files
```

---

## Getting Started

### Prerequisites
- Node.js 20+
- An OpenAI API key (required for AI, voice, and embeddings)
- AWS credentials with DynamoDB / S3 / SNS access
- Qdrant (local via Docker, or hosted)

### 1. Configure environment
```bash
cp .env.example .env
```
Fill in `.env` — at minimum `OPENAI_API_KEY`, AWS creds, and `JWT_SECRET`. See **Environment Variables** below.

### 2. Run locally (dev)
```bash
npm install
npm run dev
```
App: http://localhost:3000

### 3. Run with Docker (app + Qdrant)
```bash
docker compose up --build
```
This starts the web app (port 3000) and Qdrant (localhost:6333), reading secrets from `.env`.

### 4. Seed the knowledge base (RAG) — optional
```bash
npm run ingest
```
Embeds the knowledge-base documents from S3 into Qdrant.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | Lint |
| `npm run ingest` | Embed S3 KB docs into Qdrant |

> ⚠️ If you `npm run build` then `npm run dev` in the same checkout, delete the `.next/` folder first — a stale production cache (especially on a OneDrive-synced path) can cause an `EINVAL readlink` error and unstyled pages.

---

## Environment Variables

See [`.env.example`](.env.example) for the full list. Highlights:

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | OpenAI access (chat, voice, embeddings) — **required** |
| `OPENAI_CHAT_MODEL` | Default `gpt-4o` |
| `OPENAI_EMBED_MODEL` | Default `text-embedding-3-small` |
| `OPENAI_TTS_MODEL` / `OPENAI_TTS_VOICE` / `OPENAI_STT_MODEL` | Voice models (defaults provided) |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | AWS access |
| `QDRANT_URL`, `QDRANT_COLLECTION` | Vector DB (use `http://localhost:6333` from the host) |
| `S3_BUCKET_MEDIA`, `S3_BUCKET_KB` | S3 buckets |
| `SNS_REGION` | SMS alerts |
| `JWT_SECRET` | Auth signing secret |
| `NEXT_PUBLIC_APP_URL` | App base URL |

> Keep `.env` out of git (already gitignored). Only `.env.example` is committed.

---

## Deployment

`Dockerfile` (multi-stage, Next.js standalone output) + `docker-compose.yml` run the app behind Qdrant. For AWS/EC2 setup, see [`AWS_SETUP.md`](AWS_SETUP.md).

---

## License

Built for a hackathon / ideathon. © 2026 FarmAdvisor.
