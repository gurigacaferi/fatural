# External Setup Requirements

This document flags **external services and infrastructure** that must be configured outside of the codebase. These cannot be auto-provisioned from code alone.

---

## 1. PostgreSQL + pgvector

You need a PostgreSQL 15+ instance with the **pgvector** extension installed.

### Option A: Google Cloud SQL for PostgreSQL
```bash
gcloud sql instances create fatural-db \
  --database-version=POSTGRES_15 \
  --tier=db-custom-2-8192 \
  --region=europe-west1 \
  --database-flags=cloudsql.enable_pgvector=on

gcloud sql databases create fatural --instance=fatural-db
```

### Option B: Self-managed / Docker
```bash
docker run -d --name fatural-pg \
  -e POSTGRES_DB=fatural \
  -e POSTGRES_USER=fatural \
  -e POSTGRES_PASSWORD=your_password \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

### After provisioning, run the schema:
```bash
psql -h <host> -U fatural -d fatural -f backend/src/models/schema.sql
```

### Seed initial admin company + user:
```sql
INSERT INTO companies (id, name, nui)
VALUES ('your-company-uuid', 'Your Company', 'YOUR-NUI');

INSERT INTO users (id, company_id, email, password_hash, role)
VALUES (
  'admin-uuid',
  'your-company-uuid',
  'admin@yourcompany.com',
  '$2b$12$...',  -- bcrypt hash of your chosen password
  'admin'
);
```

---

## 2. Google Cloud Pub/Sub

### Create topic and subscription:
```bash
gcloud pubsub topics create bill-upload
gcloud pubsub subscriptions create bill-upload-sub \
  --topic=bill-upload \
  --ack-deadline=600 \
  --message-retention-duration=7d
```

### Environment variables:
```
PUBSUB_TOPIC=bill-upload
PUBSUB_SUBSCRIPTION=bill-upload-sub
GCP_PROJECT_ID=your-project-id
```

---

## 3. Google Cloud Storage (GCS)

### Create bucket:
```bash
gsutil mb -l europe-west1 gs://fatural-bills
gsutil iam ch serviceAccount:your-sa@your-project.iam.gserviceaccount.com:objectAdmin gs://fatural-bills
```

### Environment variable:
```
GCS_BUCKET=fatural-bills
```

---

## 4. Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Create an API key
3. Set in `.env`:
```
GEMINI_API_KEY=your-api-key
```

The backend uses:
- **gemini-2.0-flash** for OCR / expense extraction
- **text-embedding-004** for 768-dimensional duplicate-detection embeddings

---

## 5. GCP Service Account (for Pub/Sub + GCS)

```bash
gcloud iam service-accounts create fatural-backend \
  --display-name="Fatural Backend"

# Grant permissions
gcloud projects add-iam-policy-binding your-project-id \
  --member="serviceAccount:fatural-backend@your-project-id.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher"

gcloud projects add-iam-policy-binding your-project-id \
  --member="serviceAccount:fatural-backend@your-project-id.iam.gserviceaccount.com" \
  --role="roles/pubsub.subscriber"

gcloud projects add-iam-policy-binding your-project-id \
  --member="serviceAccount:fatural-backend@your-project-id.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# Download key
gcloud iam service-accounts keys create key.json \
  --iam-account=fatural-backend@your-project-id.iam.gserviceaccount.com
```

Set `GOOGLE_APPLICATION_CREDENTIALS=./key.json` or deploy on Cloud Run (auto-attached SA).

---

## 6. QuickBooks Online App (Optional)

1. Go to [Intuit Developer Portal](https://developer.intuit.com/)
2. Create an app → select "Accounting" scope
3. Note the **Client ID** and **Client Secret**
4. Set redirect URI to: `https://your-domain/api/quickbooks/callback`
5. Environment variables:
```
QUICKBOOKS_CLIENT_ID=...
QUICKBOOKS_CLIENT_SECRET=...
QUICKBOOKS_REDIRECT_URI=https://your-domain/api/quickbooks/callback
QUICKBOOKS_ENVIRONMENT=sandbox   # or "production"
```

---

## 7. JWT Secrets

Generate secure random secrets:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Set in `.env`:
```
JWT_ACCESS_SECRET=<generated>
JWT_REFRESH_SECRET=<different-generated>
```

---

## 8. Cloud Run Deployment (Production)

### API
```bash
gcloud run deploy fatural-api \
  --source=./backend \
  --region=europe-west1 \
  --allow-unauthenticated \
  --set-env-vars="..." \
  --service-account=fatural-backend@your-project-id.iam.gserviceaccount.com
```

### Worker
```bash
gcloud run deploy fatural-worker \
  --source=./backend \
  --region=europe-west1 \
  --no-allow-unauthenticated \
  --command="npx","tsx","src/worker/processor.ts" \
  --min-instances=1 \
  --set-env-vars="..." \
  --service-account=fatural-backend@your-project-id.iam.gserviceaccount.com
```

### Frontend (Next.js)
```bash
gcloud run deploy fatural-frontend \
  --source=./frontend \
  --region=europe-west1 \
  --allow-unauthenticated \
  --set-env-vars="NEXT_PUBLIC_API_URL=https://fatural-api-xxxxx.run.app/api"
```

---

## Summary checklist

| # | Requirement              | Status |
|---|--------------------------|--------|
| 1 | PostgreSQL + pgvector    | ☐      |
| 2 | Schema applied           | ☐      |
| 3 | Admin user seeded        | ☐      |
| 4 | GCP Pub/Sub topic + sub  | ☐      |
| 5 | GCS bucket               | ☐      |
| 6 | Gemini API key           | ☐      |
| 7 | Service account          | ☐      |
| 8 | JWT secrets generated    | ☐      |
| 9 | QuickBooks app (optional)| ☐      |
| 10| Deploy API to Cloud Run  | ☐      |
| 11| Deploy Worker            | ☐      |
| 12| Deploy Frontend          | ☐      |
