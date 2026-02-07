#!/bin/bash
#
# Deploy frontend to Cloud Storage as static website
#

set -e

PROJECT_ID="adept-ethos-483609-j4"
BUCKET_NAME="fatural-frontend"
REGION="europe-west3"

echo "=========================================="
echo "Deploying Frontend to Cloud Storage"
echo "=========================================="
echo "Bucket: $BUCKET_NAME"
echo ""

# Create bucket for frontend
echo "📦 Creating frontend bucket..."
gsutil mb -p $PROJECT_ID -l $REGION -c STANDARD gs://$BUCKET_NAME 2>/dev/null || echo "Bucket already exists"

# Make bucket publicly readable
echo "🔓 Making bucket public..."
gsutil iam ch allUsers:objectViewer gs://$BUCKET_NAME

# Enable website configuration
echo "🌐 Configuring as website..."
gsutil web set -m frontend.html -e frontend.html gs://$BUCKET_NAME

# Upload frontend
echo "📤 Uploading frontend..."
gsutil cp frontend.html gs://$BUCKET_NAME/

# Get public URL
PUBLIC_URL="https://storage.googleapis.com/$BUCKET_NAME/frontend.html"

echo ""
echo "=========================================="
echo "✅ Frontend Deployment Complete!"
echo "=========================================="
echo ""
echo "🌐 Public URL: $PUBLIC_URL"
echo ""
echo "📝 You can now access your frontend from anywhere!"
echo ""
echo "=========================================="
