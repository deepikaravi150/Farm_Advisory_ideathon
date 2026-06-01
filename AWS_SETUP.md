# AWS Infrastructure Setup Guide — FarmAdvisor

Follow these steps **in order**. Each step depends on the previous one.

---

## Prerequisites

- AWS account with billing enabled
- AWS CLI installed: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html
- Run `aws configure` and enter your root/admin credentials
- Recommended region: **ap-south-1 (Mumbai)** — closest to Tamil Nadu, lowest latency

```bash
aws configure
# AWS Access Key ID: <your key>
# AWS Secret Access Key: <your secret>
# Default region name: ap-south-1
# Default output format: json
```

---

## Step 1 — Create S3 Buckets

You need two buckets: one for media (land images, soil reports) and one for the Bedrock knowledge base documents.

### 1a. Media bucket

```bash
aws s3api create-bucket \
  --bucket farm-advisor-media \
  --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1

# Block all public access
aws s3api put-public-access-block \
  --bucket farm-advisor-media \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

### 1b. Knowledge base documents bucket

```bash
aws s3api create-bucket \
  --bucket farm-advisor-kb-docs \
  --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1

aws s3api put-public-access-block \
  --bucket farm-advisor-kb-docs \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

### 1c. Enable versioning on media bucket (recommended)

```bash
aws s3api put-bucket-versioning \
  --bucket farm-advisor-media \
  --versioning-configuration Status=Enabled
```

### 1d. Upload your existing datasets to the KB bucket

From the `ideathon/` datasets folder, upload all farming data:

```bash
# From the ideathon root directory
aws s3 sync "Datasets/Tamil Nadu Farming/" s3://farm-advisor-kb-docs/tamil-nadu-farming/
aws s3 sync "Datasets/Indian Farming Crops/" s3://farm-advisor-kb-docs/indian-crops/
aws s3 sync "Datasets/Mandi Prices/" s3://farm-advisor-kb-docs/mandi-prices/
aws s3 sync "Datasets/Fertilizers/" s3://farm-advisor-kb-docs/fertilizers/
aws s3 sync "Datasets/Soil test sample report/" s3://farm-advisor-kb-docs/soil-samples/
```

**Verify the upload:**
```bash
aws s3 ls s3://farm-advisor-kb-docs/ --recursive --human-readable
```

---

## Step 2 — Create DynamoDB Tables

### 2a. farmer_profiles

```bash
aws dynamodb create-table \
  --table-name farmer_profiles \
  --attribute-definitions \
    AttributeName=farmer_id,AttributeType=S \
    AttributeName=phone,AttributeType=S \
  --key-schema \
    AttributeName=farmer_id,KeyType=HASH \
  --global-secondary-indexes '[
    {
      "IndexName": "phone-index",
      "KeySchema": [{"AttributeName":"phone","KeyType":"HASH"}],
      "Projection": {"ProjectionType":"ALL"},
      "ProvisionedThroughput": {"ReadCapacityUnits":5,"WriteCapacityUnits":5}
    }
  ]' \
  --billing-mode PAY_PER_REQUEST \
  --region ap-south-1
```

### 2b. chat_history

```bash
aws dynamodb create-table \
  --table-name chat_history \
  --attribute-definitions \
    AttributeName=farmer_id,AttributeType=S \
    AttributeName=timestamp,AttributeType=S \
  --key-schema \
    AttributeName=farmer_id,KeyType=HASH \
    AttributeName=timestamp,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region ap-south-1
```

Enable TTL to auto-delete old chats after 1 year:
```bash
aws dynamodb update-time-to-live \
  --table-name chat_history \
  --time-to-live-specification "Enabled=true,AttributeName=expires_at" \
  --region ap-south-1
```

### 2c. crop_plans

```bash
aws dynamodb create-table \
  --table-name crop_plans \
  --attribute-definitions \
    AttributeName=farmer_id,AttributeType=S \
    AttributeName=plan_id,AttributeType=S \
  --key-schema \
    AttributeName=farmer_id,KeyType=HASH \
    AttributeName=plan_id,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region ap-south-1
```

### 2d. soil_reports

```bash
aws dynamodb create-table \
  --table-name soil_reports \
  --attribute-definitions \
    AttributeName=farmer_id,AttributeType=S \
    AttributeName=uploaded_at,AttributeType=S \
  --key-schema \
    AttributeName=farmer_id,KeyType=HASH \
    AttributeName=uploaded_at,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region ap-south-1
```

### 2e. government_schemes

```bash
aws dynamodb create-table \
  --table-name government_schemes \
  --attribute-definitions \
    AttributeName=scheme_id,AttributeType=S \
  --key-schema \
    AttributeName=scheme_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region ap-south-1
```

### 2f. Verify all tables are ACTIVE

```bash
aws dynamodb list-tables --region ap-south-1
# Wait until each shows ACTIVE:
aws dynamodb describe-table --table-name farmer_profiles --region ap-south-1 --query "Table.TableStatus"
```

---

## Step 3 — Create IAM User for the App

> **Do not use your root account credentials in the app.** Create a dedicated IAM user.

### 3a. Create the user

```bash
aws iam create-user --user-name farm-advisor-app
```

### 3b. Create and attach the permission policy

Save the following to a file named `farm-advisor-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DynamoDB",
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem","dynamodb:PutItem","dynamodb:UpdateItem","dynamodb:DeleteItem","dynamodb:Query","dynamodb:Scan","dynamodb:BatchWriteItem"],
      "Resource": [
        "arn:aws:dynamodb:ap-south-1:*:table/farmer_profiles",
        "arn:aws:dynamodb:ap-south-1:*:table/farmer_profiles/index/*",
        "arn:aws:dynamodb:ap-south-1:*:table/chat_history",
        "arn:aws:dynamodb:ap-south-1:*:table/crop_plans",
        "arn:aws:dynamodb:ap-south-1:*:table/soil_reports",
        "arn:aws:dynamodb:ap-south-1:*:table/government_schemes"
      ]
    },
    {
      "Sid": "S3",
      "Effect": "Allow",
      "Action": ["s3:GetObject","s3:PutObject","s3:DeleteObject","s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::farm-advisor-media",
        "arn:aws:s3:::farm-advisor-media/*",
        "arn:aws:s3:::farm-advisor-kb-docs",
        "arn:aws:s3:::farm-advisor-kb-docs/*"
      ]
    },
    {
      "Sid": "Transcribe",
      "Effect": "Allow",
      "Action": ["transcribe:StartStreamTranscription","transcribe:StartTranscriptionJob","transcribe:GetTranscriptionJob"],
      "Resource": "*"
    },
    {
      "Sid": "Polly",
      "Effect": "Allow",
      "Action": ["polly:SynthesizeSpeech","polly:DescribeVoices"],
      "Resource": "*"
    },
    {
      "Sid": "SNS",
      "Effect": "Allow",
      "Action": ["sns:Publish","sns:SetSMSAttributes","sns:GetSMSAttributes"],
      "Resource": "*"
    }
  ]
}
```

```bash
aws iam create-policy \
  --policy-name FarmAdvisorAppPolicy \
  --policy-document file://farm-advisor-policy.json

# Get your AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Attach the policy to the user
aws iam attach-user-policy \
  --user-name farm-advisor-app \
  --policy-arn arn:aws:iam::${AWS_ACCOUNT_ID}:policy/FarmAdvisorAppPolicy
```

### 3c. Create access keys for the app

```bash
aws iam create-access-key --user-name farm-advisor-app
```

> **IMPORTANT:** Copy the `AccessKeyId` and `SecretAccessKey` from the output — you can only see the secret once.
> Add these to your `farm-advisor/.env` file:
> ```
> AWS_ACCESS_KEY_ID=<AccessKeyId>
> AWS_SECRET_ACCESS_KEY=<SecretAccessKey>
> ```

---

## Step 4 — Get an OpenAI API Key

The app uses OpenAI for all generation (chat, crop plans, soil-report OCR,
summaries) and for embeddings (RAG). Bedrock is no longer used.

1. Go to: **https://platform.openai.com/api-keys**
2. Create a new secret key and copy it (shown only once).
3. Make sure the project/org has access to `gpt-4o` and `text-embedding-3-small`.
4. Add it to your `.env`:
   ```
   OPENAI_API_KEY=sk-...
   OPENAI_CHAT_MODEL=gpt-4o
   OPENAI_EMBED_MODEL=text-embedding-3-small
   ```

> The OpenAI key is read by the app and by the ingestion script — it is **not** an
> AWS credential, so it does not go in the IAM policy above.

---

## Step 5 — Set up the Vector DB (Qdrant) + RAG

We replaced the Bedrock Knowledge Base (Titan embeddings + OpenSearch Serverless,
which is expensive and slow to provision) with a **self-hosted Qdrant** container
and **OpenAI embeddings**. Source documents still live in `s3://farm-advisor-kb-docs/`.
An ingestion script reads them, embeds the chunks, and loads them into Qdrant.

### 5a. Qdrant runs via docker-compose

The `qdrant` service is already defined in `docker-compose.yml` (REST on
`127.0.0.1:6333`, persisted to a `qdrant_data` volume). It comes up automatically:

```bash
docker compose up -d --build
docker compose ps
curl http://localhost:6333/healthz        # expect HTTP 200
```

> Keep port 6333 bound to localhost — do **not** open it in the EC2 security group.

### 5b. Put your knowledge documents in S3

Upload `.txt`, `.md`, `.csv` (and `.pdf` if you install `pdf-parse`) files into the
KB bucket:

```bash
aws s3 cp ./my-farming-docs/ s3://farm-advisor-kb-docs/ --recursive
```

### 5c. Run the ingestion (creates the collection + loads vectors)

From the host (so it can reach Qdrant on localhost):

```bash
export OPENAI_API_KEY=sk-...
export OPENAI_EMBED_MODEL=text-embedding-3-small
export AWS_REGION=ap-south-1
export S3_BUCKET_KB=farm-advisor-kb-docs
export QDRANT_URL=http://localhost:6333
export QDRANT_COLLECTION=farm_docs
# AWS creds via instance role or AWS_ACCESS_KEY_ID/SECRET

npm run ingest        # = tsx scripts/ingest-kb.ts
```

The script auto-creates the `farm_docs` collection (1536-dim, Cosine) on first run.
It is idempotent — re-run it whenever you add or change documents in S3.

### 5d. Verify the collection

```bash
curl http://localhost:6333/collections/farm_docs
# -> result.points_count should be > 0
```

The chatbot (`/api/chat`) now embeds each question, pulls the top-k matching chunks
from Qdrant, and has `gpt-4o` answer grounded on them.

---

## Step 6 — Configure Amazon SNS for SMS

### 6a. Set SMS attributes

```bash
aws sns set-sms-attributes \
  --attributes '{"DefaultSMSType":"Transactional","DefaultSenderID":"FARMADV"}' \
  --region ap-south-1
```

### 6b. For testing — add a verified phone number (Sandbox mode)

New AWS accounts are in SMS Sandbox. Add your test number:

```bash
aws sns create-sms-sandbox-phone-number \
  --phone-number +919XXXXXXXXX \
  --region ap-south-1
```

Then verify the OTP sent to that number:
```bash
aws sns verify-sms-sandbox-phone-number \
  --phone-number +919XXXXXXXXX \
  --one-time-password <OTP> \
  --region ap-south-1
```

### 6c. For production — exit Sandbox

To send SMS to any number in India:
1. Go to **AWS Console → SNS → Text messaging (SMS) → Sandbox**
2. Click **"Exit SMS sandbox"**
3. Fill in the use case form (select: Two-factor verification / Transactional)
4. AWS approves within 24–48 hours

> **India DLT Registration (required for production SMS in India):**
> All SMS in India require DLT registration.
> Register at: https://www.trai.gov.in/  
> Get a DLT Principal Entity ID and register your template.
> Add DLT Entity ID to your SNS message attributes.

---

## Step 7 — Seed Government Schemes Data

Once your app is running, seed initial government scheme data:

```bash
curl -X POST http://localhost:3000/api/schemes \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: <your-ADMIN_SECRET>" \
  -d '[
    {
      "name": "PM-KISAN Samman Nidhi",
      "description_en": "₹6,000 per year direct income support to farmer families in 3 instalments of ₹2,000 each.",
      "description_ta": "விவசாயி குடும்பங்களுக்கு ஆண்டுக்கு ₹6,000 நேரடி வருமான ஆதரவு.",
      "description_hi": "किसान परिवारों को ₹6,000 प्रति वर्ष तीन किस्तों में।",
      "eligibility": "All land-holding farmer families",
      "deadline": "Ongoing",
      "state": "National",
      "apply_url": "https://pmkisan.gov.in"
    },
    {
      "name": "Tamil Nadu Chief Minister Farmer Protection Scheme",
      "description_en": "Crop loss compensation for farmers affected by natural calamities in Tamil Nadu.",
      "description_ta": "இயற்கை பேரழிவுகளால் பாதிக்கப்பட்ட விவசாயிகளுக்கு பயிர் இழப்பு இழப்பீடு.",
      "description_hi": "तमिलनाडु में प्राकृतिक आपदाओं से प्रभावित किसानों के लिए फसल हानि मुआवजा।",
      "eligibility": "Tamil Nadu farmers with land records",
      "deadline": "Ongoing",
      "state": "Tamil Nadu",
      "apply_url": "https://www.tn.gov.in/agriculture"
    },
    {
      "name": "PM Fasal Bima Yojana",
      "description_en": "Crop insurance scheme with very low premiums (1.5–5%) covering yield losses.",
      "description_ta": "மிகக் குறைந்த பிரீமியத்தில் (1.5–5%) மகசூல் இழப்புகளை உள்ளடக்கிய பயிர் காப்பீடு.",
      "description_hi": "बहुत कम प्रीमियम पर फसल बीमा।",
      "eligibility": "All farmers growing notified crops",
      "deadline": "Season-based enrollment",
      "state": "National",
      "apply_url": "https://pmfby.gov.in"
    },
    {
      "name": "Kisan Credit Card (KCC)",
      "description_en": "Short-term credit for crop cultivation, post-harvest expenses, and allied activities at 4% interest.",
      "description_ta": "4% வட்டியில் பயிர் சாகுபடி மற்றும் அறுவடை பிந்தைய செலவுகளுக்கு குறுகிய கால கடன்.",
      "description_hi": "4% ब्याज पर फसल उत्पादन हेतु अल्पकालिक ऋण।",
      "eligibility": "All farmers, sharecroppers, and tenant farmers",
      "deadline": "Ongoing",
      "state": "National",
      "apply_url": "https://www.nabard.org"
    }
  ]'
```

---

## Step 8 — Get External API Keys

### 8a. Weather — Open-Meteo (free, no key needed)

Open-Meteo is completely free with no API key or registration required. It provides 16-day daily forecasts and current conditions. **No action needed** — the app calls it directly.

### 8b. Maps — Leaflet + OpenStreetMap + Esri (free, no key needed)

The app now uses **react-leaflet** with free tile providers:
- **Esri World Imagery** — free satellite tiles, no API key, no billing
- **Esri World Boundaries** — free label overlay for place names
- **Nominatim (OpenStreetMap)** — free location search and reverse geocoding

**No action needed** — no API keys or accounts required for maps.

---

## Step 9 — Final .env Setup

Your complete `farm-advisor/.env` should look like this:

```env
# AWS — use the farm-advisor-app IAM user keys from Step 3c
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...

# OpenAI — LLM (chat, crop plans, soil OCR, summaries) + embeddings
OPENAI_API_KEY=sk-...
OPENAI_CHAT_MODEL=gpt-4o
OPENAI_EMBED_MODEL=text-embedding-3-small

# Qdrant vector DB (RAG) — from Step 5
# App (in docker-compose) uses the service name; the host ingest uses localhost
QDRANT_URL=http://qdrant:6333
QDRANT_COLLECTION=farm_docs

# S3 buckets — from Step 1
S3_BUCKET_MEDIA=farm-advisor-media
S3_BUCKET_KB=farm-advisor-kb-docs

# SNS
SNS_REGION=ap-south-1

# Auth — generate a long random string
JWT_SECRET=<run: openssl rand -hex 32>

# Admin secret for seeding schemes data
ADMIN_SECRET=<any strong random string>

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Step 10 — Run the App

### Option A: Local development

```bash
cd farm-advisor
npm install
npm run dev
# Open http://localhost:3000
```

### Option B: Docker

```bash
cd farm-advisor
cp .env.example .env
# Fill in .env values
docker compose up --build
# Open http://localhost:3000
```

---

## Step 11 — Verify Everything Works

Run through this checklist after setup:

- [ ] `http://localhost:3000` loads the landing page with government schemes
- [ ] Register a new farmer with a real Tamil Nadu map location
- [ ] Login and check the dashboard loads with weather data
- [ ] Send a chat message in English — confirm reply from gpt-4o
- [ ] Send a chat message in Tamil — confirm reply in Tamil
- [ ] Ask something only in your S3 KB docs — confirm the answer reflects them (RAG)
- [ ] Try voice input (mic button) — confirm transcription
- [ ] Open Crop Plan page — confirm assessment modal appears
- [ ] Go to Profile → upload a soil report image — confirm NPK extracted
- [ ] Check DynamoDB Console → `chat_history` table has entries
- [ ] Check S3 Console → `farm-advisor-media` bucket has uploaded files

---

## Estimated AWS Costs (Monthly)

| Service | Usage | Est. Cost |
|---|---|---|
| OpenAI gpt-4o | ~1,000 chat/plan/OCR calls/month | ~$10–25 |
| OpenAI embeddings (text-embedding-3-small) | ingest + per-query | <$1 |
| Qdrant (self-hosted on existing EC2) | container, ~small RAM | $0 (no extra) |
| DynamoDB | On-demand, light usage | <$1 |
| S3 | <5 GB storage | <$1 |
| SNS SMS (India) | 100 SMS/month | ~$1 |
| Amazon Transcribe | ~100 min/month | ~$1.50 |
| Amazon Polly | ~50,000 characters/month | ~$0.20 |
| **Total estimate** | | **~$15–30/month** |

> Switching the vector store from OpenSearch Serverless (~$25–50/mo, the old biggest
> cost driver) to a self-hosted Qdrant container removes that line item entirely —
> Qdrant rides along on the EC2 instance you already pay for.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| OpenAI `401`/`invalid_api_key` | Check `OPENAI_API_KEY` in `.env` and that the project has `gpt-4o` access (Step 4) |
| Chat returns generic answers / RAG empty | Confirm Qdrant is up and `npm run ingest` loaded points (`curl .../collections/farm_docs`) |
| `ResourceNotFoundException` on DynamoDB | Confirm table names match exactly (case-sensitive) and region is `ap-south-1` |
| Weather widget shows error | Verify `OPENWEATHER_API_KEY` is set and land coordinates exist in profile |
| Google Maps not loading | Check `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and that Maps JavaScript API is enabled |
| SMS not delivered | Check SNS Sandbox — phone number must be verified for sandbox mode |
| Knowledge Base returns no results | Re-run the sync (Step 5f) and wait for `Available` status |
| `phone-index` GSI not found | The GSI takes ~1 min to become ACTIVE after table creation — wait and retry |
