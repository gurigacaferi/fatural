#!/bin/bash
#
# Deploy Next.js frontend to Cloud Run
#

set -e

PROJECT_ID="adept-ethos-483609-j4"
REGION="europe-west3"
SERVICE_NAME="fatural-frontend"

echo "=========================================="
echo "Deploying Fatural Frontend to Cloud Run"
echo "=========================================="
echo "Service: $SERVICE_NAME"
echo "Region: $REGION"
echo ""

# Build and deploy with Cloud Build
echo "🔨 Building and deploying frontend..."
gcloud run deploy $SERVICE_NAME \
  --source=./frontend \
  --platform=managed \
  --region=$REGION \
  --allow-unauthenticated \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=10 \
  --timeout=300 \
  --project=$PROJECT_ID

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
  --region=$REGION \
  --format='value(status.url)' \
  --project=$PROJECT_ID)

echo ""
echo "=========================================="
echo "✅ Frontend Deployment Complete!"
echo "=========================================="
echo ""
echo "🌐 Public URL: $SERVICE_URL"
echo ""
echo "📝 You can now access your frontend from anywhere!"
echo ""
echo "=========================================="
