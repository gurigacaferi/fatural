# Fatural - Quick Deployment Reference

## 🚀 One-Command Deployment

```bash
# 1. Setup infrastructure (bucket, pub/sub, Cloud SQL)
./scripts/setup_infrastructure.sh

# 2. Initialize database (pgvector + tables)
./scripts/init_cloud_db.sh

# 3. Deploy API
./scripts/deploy_api.sh

# 4. Deploy Worker
./scripts/deploy_worker.sh
```

## 📋 Project Details

- **Project ID**: `adept-ethos-483609-j4`
- **Region**: `europe-west3`
- **Bucket**: `kosovo-bills-storage`
- **Pub/Sub Topic**: `bill-extraction`
- **Cloud SQL Instance**: `scanner-db`

## 🔐 Before Deployment

### 1. Store Gemini API Key

```bash
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets create gemini-api-key \
    --data-file=- \
    --replication-policy="automatic"
```

### 2. Create Service Accounts

```bash
PROJECT_ID="adept-ethos-483609-j4"

# Create accounts
gcloud iam service-accounts create fatural-api --display-name="Fatural API"
gcloud iam service-accounts create fatural-worker --display-name="Fatural Worker"

# Grant permissions
for ROLE in roles/cloudsql.client roles/storage.objectAdmin roles/pubsub.publisher; do
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:fatural-api@$PROJECT_ID.iam.gserviceaccount.com" \
        --role="$ROLE"
done

for ROLE in roles/cloudsql.client roles/storage.objectViewer roles/pubsub.subscriber; do
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:fatural-worker@$PROJECT_ID.iam.gserviceaccount.com" \
        --role="$ROLE"
done

# Grant secret access
for SA in fatural-api fatural-worker; do
    for SECRET in db-password gemini-api-key; do
        gcloud secrets add-iam-policy-binding $SECRET \
            --member="serviceAccount:$SA@$PROJECT_ID.iam.gserviceaccount.com" \
            --role="roles/secretmanager.secretAccessor"
    done
done
```

## ✅ Verify Deployment

```bash
# Get API URL
API_URL=$(gcloud run services describe fatural-api --region europe-west3 --format='value(status.url)')

# Health check
curl $API_URL/health

# Get demo company ID (from init_db output or query database)
COMPANY_ID="<your-demo-company-id>"

# Upload test bill
curl -X POST $API_URL/upload \
    -H "X-Company-Id: $COMPANY_ID" \
    -F "file=@test_bill.jpg"
```

## 📊 Monitoring

```bash
# API logs
gcloud run services logs read fatural-api --region europe-west3 --limit 20

# Worker logs
gcloud run services logs read fatural-worker --region europe-west3 --limit 20

# Real-time logs
gcloud run services logs tail fatural-api --region europe-west3
```

## 🔄 Update Services

```bash
# After code changes
./scripts/deploy_api.sh      # Update API
./scripts/deploy_worker.sh   # Update Worker
```

## 🔐 Secret Management

```bash
# View secrets
gcloud secrets list

# Update Gemini API key
echo -n "NEW_KEY" | gcloud secrets versions add gemini-api-key --data-file=-

# Access secret (for debugging)
gcloud secrets versions access latest --secret=gemini-api-key
```

## 🗄️ Database Access

```bash
# Connect via Cloud SQL Proxy
gcloud sql connect scanner-db --user=fatural-app --database=fatural

# Or start proxy locally
cloud-sql-proxy adept-ethos-483609-j4:europe-west3:scanner-db
```

## 💰 Cost Optimization

```bash
# Scale API to zero when idle
gcloud run services update fatural-api \
    --region europe-west3 \
    --min-instances 0

# Limit worker concurrency
gcloud run services update fatural-worker \
    --region europe-west3 \
    --concurrency 1 \
    --max-instances 5

# Use smaller Cloud SQL tier (development)
gcloud sql instances patch scanner-db --tier db-f1-micro
```

## 🐛 Troubleshooting

### Worker not processing

```bash
# Check subscription
gcloud pubsub subscriptions describe bill-extraction-subscription

# Test message
gcloud pubsub topics publish bill-extraction \
    --message='{"bill_id":"test","company_id":"test","storage_path":"test","mime_type":"image/jpeg","uploaded_at":"2026-02-07"}'
```

### Database errors

```bash
# Check Cloud SQL status
gcloud sql instances describe scanner-db

# Reset connection
gcloud sql instances restart scanner-db
```

### Gemini API errors

```bash
# Verify secret
gcloud secrets versions access latest --secret=gemini-api-key

# Check service account permissions
gcloud projects get-iam-policy adept-ethos-483609-j4 \
    --flatten="bindings[].members" \
    --filter="bindings.members:fatural-api@*"
```

## 📈 Production Scaling

```bash
# Upgrade Cloud SQL
gcloud sql instances patch scanner-db --tier db-n1-standard-1

# Increase API instances
gcloud run services update fatural-api \
    --region europe-west3 \
    --min-instances 2 \
    --max-instances 20

# Increase worker capacity
gcloud run services update fatural-worker \
    --region europe-west3 \
    --max-instances 10 \
    --memory 2Gi \
    --cpu 2
```

## 📞 Quick Links

- **Cloud Console**: https://console.cloud.google.com/run?project=adept-ethos-483609-j4
- **SQL Instance**: https://console.cloud.google.com/sql/instances/scanner-db?project=adept-ethos-483609-j4
- **Storage Bucket**: https://console.cloud.google.com/storage/browser/kosovo-bills-storage?project=adept-ethos-483609-j4
- **Pub/Sub**: https://console.cloud.google.com/cloudpubsub/topic/detail/bill-extraction?project=adept-ethos-483609-j4

---

**Ready to deploy!** 🚀
