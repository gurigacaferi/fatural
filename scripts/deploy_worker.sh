#!/bin/bash
#
# Deploy Fatural Worker to Cloud Run with Pub/Sub trigger
#

set -e

PROJECT_ID="adept-ethos-483609-j4"
REGION="europe-west3"
SERVICE_NAME="fatural-worker"
SQL_INSTANCE="scanner-db"
BUCKET_NAME="kosovo-bills-storage"
TOPIC_NAME="bill-extraction"
SUBSCRIPTION_NAME="bill-extraction-subscription"

echo "=========================================="
echo "Deploying Fatural Worker to Cloud Run"
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

echo "🚀 Deploying Worker service..."

# Build the container image with custom Dockerfile
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME:latest"

echo "📦 Building container image..."
gcloud builds submit --config cloudbuild.worker.yaml .

echo "🚀 Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
    --image $IMAGE_NAME \
    --region $REGION \
    --platform managed \
    --no-allow-unauthenticated \
    --min-instances 0 \
    --max-instances 5 \
    --memory 1Gi \
    --cpu 2 \
    --timeout 600 \
    --set-env-vars="^||^GCP_PROJECT_ID=$PROJECT_ID||GCS_BUCKET_NAME=$BUCKET_NAME||PUBSUB_SUBSCRIPTION=$SUBSCRIPTION_NAME||ENVIRONMENT=production||INSTANCE_CONNECTION_NAME=$INSTANCE_CONNECTION_NAME||DB_NAME=fatural||DB_USER=fatural-app" \
    --set-secrets="DB_PASSWORD=db-password:latest,GEMINI_API_KEY=gemini-api-key:latest" \
    --add-cloudsql-instances $INSTANCE_CONNECTION_NAME

echo ""
echo "🔗 Configuring Pub/Sub push subscription..."

# Get worker service URL
WORKER_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format='value(status.url)')

# Update subscription to push to worker
gcloud pubsub subscriptions update $SUBSCRIPTION_NAME \
    --push-endpoint="$WORKER_URL/" \
    --push-auth-service-account=fatural-worker@$PROJECT_ID.iam.gserviceaccount.com

# Get project number for Pub/Sub service account
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")

# Grant Pub/Sub permission to invoke worker
gcloud run services add-iam-policy-binding $SERVICE_NAME \
    --region=$REGION \
    --member="serviceAccount:service-$PROJECT_NUMBER@gcp-sa-pubsub.iam.gserviceaccount.com" \
    --role="roles/run.invoker"

echo ""
echo "=========================================="
echo "✅ Worker Deployment Complete!"
echo "=========================================="
echo ""
echo "🔄 Worker Configuration:"
echo "  Service URL: $WORKER_URL"
echo "  Subscription: $SUBSCRIPTION_NAME"
echo "  Push Endpoint: $WORKER_URL/process"
echo ""
echo "📝 How it works:"
echo "  1. API publishes message to Pub/Sub topic: $TOPIC_NAME"
echo "  2. Pub/Sub pushes message to worker endpoint"
echo "  3. Worker processes bill (Gemini extraction + duplicate check)"
echo "  4. Results saved to database"
echo ""
echo "=========================================="
