#!/bin/bash
#
# Deploy Fatural API to Cloud Run
#

set -e

PROJECT_ID="adept-ethos-483609-j4"
REGION="europe-west3"
SERVICE_NAME="fatural-api"
SQL_INSTANCE="scanner-db"
BUCKET_NAME="kosovo-bills-storage"
TOPIC_NAME="bill-extraction"

echo "=========================================="
echo "Deploying Fatural API to Cloud Run"
echo "=========================================="
echo "Service: $SERVICE_NAME"
echo "Region: $REGION"
echo ""

# Get connection name
INSTANCE_CONNECTION_NAME="$PROJECT_ID:$REGION:$SQL_INSTANCE"

# Setup service account permissions
echo "🔐 Setting up service account permissions..."
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Grant Secret Manager access to the default compute service account
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor"

# Get DATABASE_URL from Secret Manager
echo "🔐 Retrieving secrets..."
DATABASE_URL_SECRET="projects/$PROJECT_ID/secrets/database-url/versions/latest"

# Deploy to Cloud Run
echo ""
echo "🚀 Deploying API service..."
gcloud run deploy $SERVICE_NAME \
    --source . \
    --region $REGION \
    --platform managed \
    --allow-unauthenticated \
    --min-instances 0 \
    --max-instances 10 \
    --memory 512Mi \
    --cpu 1 \
    --timeout 300 \
    --set-env-vars="^||^GCP_PROJECT_ID=$PROJECT_ID||GCS_BUCKET_NAME=$BUCKET_NAME||PUBSUB_TOPIC=$TOPIC_NAME||ENVIRONMENT=production||INSTANCE_CONNECTION_NAME=$INSTANCE_CONNECTION_NAME||DB_NAME=fatural||DB_USER=fatural-app" \
    --set-secrets="DB_PASSWORD=db-password:latest" \
    --add-cloudsql-instances $INSTANCE_CONNECTION_NAME

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format='value(status.url)')

echo ""
echo "=========================================="
echo "✅ API Deployment Complete!"
echo "=========================================="
echo ""
echo "🌐 Service URL: $SERVICE_URL"
echo ""
echo "📝 Test the API:"
echo ""
echo "# Health check"
echo "curl $SERVICE_URL/health"
echo ""
echo "# Upload a bill"
echo "curl -X POST $SERVICE_URL/upload \\"
echo "  -H \"X-Company-Id: <your-company-id>\" \\"
echo "  -F \"file=@bill.jpg\""
echo ""
echo "=========================================="
