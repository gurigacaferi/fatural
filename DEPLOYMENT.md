# Fatural - Google Cloud Deployment Guide

Complete deployment guide for **adept-ethos-483609-j4** in **europe-west3**.

## 📋 Prerequisites

1. **Google Cloud SDK** installed and authenticated
   ```bash
   gcloud auth login
   gcloud config set project adept-ethos-483609-j4
   ```

2. **Cloud SQL Proxy** (for database initialization)
   ```bash
   gcloud components install cloud-sql-proxy
   ```

3. **Gemini API Key** - Store in Secret Manager:
   ```bash
   echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets create gemini-api-key \
       --data-file=- \
       --replication-policy="automatic"
   ```

4. **Service Accounts** - Create with appropriate permissions:
   ```bash
   # API service account
   gcloud iam service-accounts create fatural-api \
       --display-name="Fatural API Service Account"
   
   # Worker service account
   gcloud iam service-accounts create fatural-worker \
       --display-name="Fatural Worker Service Account"
   
   # Grant permissions
   PROJECT_ID="adept-ethos-483609-j4"
   
   # API permissions
   gcloud projects add-iam-policy-binding $PROJECT_ID \
       --member="serviceAccount:fatural-api@$PROJECT_ID.iam.gserviceaccount.com" \
       --role="roles/cloudsql.client"
   
   gcloud projects add-iam-policy-binding $PROJECT_ID \
       --member="serviceAccount:fatural-api@$PROJECT_ID.iam.gserviceaccount.com" \
       --role="roles/storage.objectAdmin"
   
   gcloud projects add-iam-policy-binding $PROJECT_ID \
       --member="serviceAccount:fatural-api@$PROJECT_ID.iam.gserviceaccount.com" \
       --role="roles/pubsub.publisher"
   
   # Worker permissions
   gcloud projects add-iam-policy-binding $PROJECT_ID \
       --member="serviceAccount:fatural-worker@$PROJECT_ID.iam.gserviceaccount.com" \
       --role="roles/cloudsql.client"
   
   gcloud projects add-iam-policy-binding $PROJECT_ID \
       --member="serviceAccount:fatural-worker@$PROJECT_ID.iam.gserviceaccount.com" \
       --role="roles/storage.objectViewer"
   
   gcloud projects add-iam-policy-binding $PROJECT_ID \
       --member="serviceAccount:fatural-worker@$PROJECT_ID.iam.gserviceaccount.com" \
       --role="roles/pubsub.subscriber"
   
   # Grant secret access to both
   for SA in fatural-api fatural-worker; do
       gcloud secrets add-iam-policy-binding db-password \
           --member="serviceAccount:$SA@$PROJECT_ID.iam.gserviceaccount.com" \
           --role="roles/secretmanager.secretAccessor"
       
       gcloud secrets add-iam-policy-binding gemini-api-key \
           --member="serviceAccount:$SA@$PROJECT_ID.iam.gserviceaccount.com" \
           --role="roles/secretmanager.secretAccessor"
   done
   ```

## 🚀 Deployment Steps

### Step 1: Setup Infrastructure

Creates Cloud Storage, Pub/Sub, and Cloud SQL:

```bash
chmod +x scripts/*.sh
./scripts/setup_infrastructure.sh
```

**What it creates:**
- ☁️ **Cloud Storage**: `kosovo-bills-storage` bucket
- 📨 **Pub/Sub**: `bill-extraction` topic and subscription
- 🗄️ **Cloud SQL**: `scanner-db` PostgreSQL 15 instance (db-f1-micro)
- 🔐 **Secrets**: Database password and connection string

**Duration**: ~10 minutes (Cloud SQL provisioning)

---

### Step 2: Initialize Database

Enables pgvector and creates all tables:

```bash
./scripts/init_cloud_db.sh
```

**What it does:**
- Starts Cloud SQL Proxy locally
- Runs `scripts/init_db.py` against Cloud SQL
- Enables `pgvector` extension
- Creates tables: `companies`, `users`, `bills`, `audit_logs`
- Creates HNSW index on `visual_fingerprint` column
- Creates demo company for testing

**Duration**: ~1 minute

---

### Step 3: Deploy API Service

Deploys FastAPI app to Cloud Run:

```bash
./scripts/deploy_api.sh
```

**Configuration:**
- **Service**: `fatural-api`
- **Memory**: 512 MB
- **CPU**: 1
- **Min instances**: 0 (scale to zero)
- **Max instances**: 10
- **Timeout**: 300s
- **Authentication**: Public (unauthenticated)

**Environment Variables:**
```bash
GCP_PROJECT_ID=adept-ethos-483609-j4
GCS_BUCKET_NAME=kosovo-bills-storage
PUBSUB_TOPIC=bill-extraction
ENVIRONMENT=production
INSTANCE_CONNECTION_NAME=adept-ethos-483609-j4:europe-west3:scanner-db
DB_NAME=fatural
DB_USER=fatural-app
```

**Secrets:**
- `DB_PASSWORD` → from Secret Manager
- `GOOGLE_AI_API_KEY` → from Secret Manager

**Duration**: ~3 minutes

---

### Step 4: Deploy Worker Service

Deploys background processor triggered by Pub/Sub:

```bash
./scripts/deploy_worker.sh
```

**Configuration:**
- **Service**: `fatural-worker`
- **Memory**: 1 GB (for Gemini processing)
- **CPU**: 2
- **Min instances**: 0
- **Max instances**: 5
- **Timeout**: 600s (10 minutes)
- **Authentication**: Private (Pub/Sub invocation only)
- **Trigger**: Pub/Sub push subscription

**How it works:**
1. API publishes message to `bill-extraction` topic
2. Pub/Sub pushes to Worker's `/process` endpoint
3. Worker downloads image from GCS
4. Worker calls Gemini 3.0 Flash for extraction
5. Worker generates 768-dim embedding
6. Worker checks duplicates via pgvector
7. Worker updates database

**Duration**: ~3 minutes

---

## ✅ Verification

### Test API Health

```bash
SERVICE_URL=$(gcloud run services describe fatural-api \
    --region europe-west3 \
    --format='value(status.url)')

curl $SERVICE_URL/health
```

**Expected response:**
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2026-02-07T12:00:00"
}
```

### Get Demo Company ID

The `init_db.py` script creates a demo company. Retrieve it:

```bash
# Connect via Cloud SQL Proxy
gcloud sql connect scanner-db --user=fatural-app --database=fatural

# In psql:
SELECT id, name, tax_number FROM companies WHERE tax_number = '81234567890';
```

### Upload Test Bill

```bash
COMPANY_ID="<uuid-from-above>"

curl -X POST $SERVICE_URL/upload \
  -H "X-Company-Id: $COMPANY_ID" \
  -F "file=@test_bill.jpg"
```

**Expected response:**
```json
{
  "bill_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "message": "Bill uploaded successfully. Processing will begin shortly.",
  "storage_path": "bills/..."
}
```

### Check Processing Status

```bash
BILL_ID="<bill-id-from-upload>"

curl $SERVICE_URL/bills/$BILL_ID \
  -H "X-Company-Id: $COMPANY_ID"
```

**Response after processing:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "vendor_name": "Supermarketi Viva",
  "vendor_tax_number": "81234567",
  "total_amount": 15.50,
  "currency": "EUR",
  "is_duplicate": false
}
```

---

## 📊 Monitoring

### View Logs

```bash
# API logs
gcloud run services logs read fatural-api --region europe-west3

# Worker logs
gcloud run services logs read fatural-worker --region europe-west3
```

### Check Pub/Sub Metrics

```bash
# Topic metrics
gcloud pubsub topics describe bill-extraction

# Subscription metrics
gcloud pubsub subscriptions describe bill-extraction-subscription
```

### Cloud SQL Metrics

View in console:
```
https://console.cloud.google.com/sql/instances/scanner-db/metrics?project=adept-ethos-483609-j4
```

---

## 🔐 Secret Management

All secrets stored in **Google Secret Manager**:

### View Secrets

```bash
gcloud secrets list
```

### Update Gemini API Key

```bash
echo -n "NEW_API_KEY" | gcloud secrets versions add gemini-api-key --data-file=-
```

### Update Database Password

```bash
# Generate new password
NEW_PASSWORD=$(openssl rand -base64 32)

# Update Cloud SQL user
gcloud sql users set-password fatural-app \
    --instance=scanner-db \
    --password="$NEW_PASSWORD"

# Update secret
echo -n "$NEW_PASSWORD" | gcloud secrets versions add db-password --data-file=-

# Redeploy services (they'll pick up new secret version)
./scripts/deploy_api.sh
./scripts/deploy_worker.sh
```

---

## 🔧 Configuration

### Environment Variables (both services)

| Variable | Value | Description |
|----------|-------|-------------|
| `GCP_PROJECT_ID` | `adept-ethos-483609-j4` | GCP project |
| `GCS_BUCKET_NAME` | `kosovo-bills-storage` | Storage bucket |
| `PUBSUB_TOPIC` | `bill-extraction` | Pub/Sub topic (API only) |
| `PUBSUB_SUBSCRIPTION` | `bill-extraction-subscription` | Pub/Sub sub (Worker only) |
| `ENVIRONMENT` | `production` | Enables production optimizations |
| `INSTANCE_CONNECTION_NAME` | `adept-ethos-483609-j4:europe-west3:scanner-db` | Cloud SQL |
| `DB_NAME` | `fatural` | Database name |
| `DB_USER` | `fatural-app` | Database user |

### Secrets

| Secret | Description |
|--------|-------------|
| `db-password` | Cloud SQL password |
| `gemini-api-key` | Google AI Gemini API key |

---

## 📈 Scaling Configuration

### API Service

```bash
gcloud run services update fatural-api \
    --region europe-west3 \
    --min-instances 1 \      # Keep warm
    --max-instances 20 \     # High traffic
    --memory 1Gi \           # More memory
    --cpu 2                  # More CPU
```

### Worker Service

```bash
gcloud run services update fatural-worker \
    --region europe-west3 \
    --max-instances 10 \     # Process more bills concurrently
    --concurrency 1          # One bill at a time per instance
```

### Cloud SQL

Upgrade to a larger tier:

```bash
gcloud sql instances patch scanner-db \
    --tier db-n1-standard-1  # 1 vCPU, 3.75 GB RAM
```

---

## 💰 Cost Estimates (Monthly)

**Low Usage (100 bills/month):**
- Cloud Run API: $0 (free tier)
- Cloud Run Worker: $0 (free tier)
- Cloud SQL (db-f1-micro): ~$7
- Cloud Storage: <$1
- Pub/Sub: $0 (free tier)
- **Total: ~$8/month**

**Medium Usage (1000 bills/month):**
- Cloud Run API: ~$5
- Cloud Run Worker: ~$10
- Cloud SQL (db-n1-standard-1): ~$50
- Cloud Storage: ~$2
- Pub/Sub: <$1
- **Total: ~$68/month**

---

## 🐛 Troubleshooting

### Worker not processing bills

```bash
# Check worker logs
gcloud run services logs read fatural-worker --region europe-west3 --limit 50

# Check Pub/Sub subscription
gcloud pubsub subscriptions describe bill-extraction-subscription

# Manual message delivery test
gcloud pubsub topics publish bill-extraction \
    --message='{"bill_id":"test","company_id":"test","storage_path":"test","mime_type":"image/jpeg","uploaded_at":"2026-02-07"}'
```

### Database connection issues

```bash
# Test connection via proxy
cloud-sql-proxy adept-ethos-483609-j4:europe-west3:scanner-db

# Check Cloud SQL IAM
gcloud sql instances describe scanner-db | grep -A 10 "settings"
```

### Gemini API errors

```bash
# Verify secret exists
gcloud secrets versions access latest --secret=gemini-api-key

# Test API key
curl https://generativelanguage.googleapis.com/v1/models \
    -H "Authorization: Bearer $(gcloud secrets versions access latest --secret=gemini-api-key)"
```

---

## 🔄 Update Deployment

### Update API

```bash
# Make code changes, then redeploy
./scripts/deploy_api.sh
```

### Update Worker

```bash
./scripts/deploy_worker.sh
```

### Zero-downtime deployment

Cloud Run handles this automatically - new revision deployed, traffic gradually shifted.

---

## 📞 Support

- **Logs**: Cloud Console → Cloud Run → Logs
- **Metrics**: Cloud Console → Monitoring → Dashboards
- **Errors**: Cloud Console → Error Reporting

---

**Infrastructure deployed to: europe-west3 🇪🇺**
