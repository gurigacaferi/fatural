#!/bin/bash
#
# Google Cloud Infrastructure Setup for Fatural Bill Scanner
# Project: adept-ethos-483609-j4
# Region: europe-west3
#

set -e  # Exit on error

PROJECT_ID="adept-ethos-483609-j4"
REGION="europe-west3"
BUCKET_NAME="kosovo-bills-storage"
TOPIC_NAME="bill-extraction"
SUBSCRIPTION_NAME="bill-extraction-subscription"
SQL_INSTANCE="scanner-db"
SQL_DATABASE="fatural"
SQL_USER="fatural-app"

echo "=========================================="
echo "Fatural Infrastructure Setup"
echo "=========================================="
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo ""

# Set active project
echo "🔧 Setting active project..."
gcloud config set project $PROJECT_ID

# Enable required APIs
echo ""
echo "📦 Enabling required Google Cloud APIs..."
gcloud services enable \
    run.googleapis.com \
    sqladmin.googleapis.com \
    storage.googleapis.com \
    pubsub.googleapis.com \
    secretmanager.googleapis.com \
    aiplatform.googleapis.com

# Create Cloud Storage bucket
echo ""
echo "☁️  Creating Cloud Storage bucket: $BUCKET_NAME..."
if gsutil ls -b gs://$BUCKET_NAME 2>/dev/null; then
    echo "   ✅ Bucket already exists"
else
    gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION gs://$BUCKET_NAME
    gsutil uniformbucketlevelaccess set on gs://$BUCKET_NAME
    echo "   ✅ Bucket created"
fi

# Create Pub/Sub topic
echo ""
echo "📨 Creating Pub/Sub topic: $TOPIC_NAME..."
if gcloud pubsub topics describe $TOPIC_NAME 2>/dev/null; then
    echo "   ✅ Topic already exists"
else
    gcloud pubsub topics create $TOPIC_NAME
    echo "   ✅ Topic created"
fi

# Create Pub/Sub subscription
echo ""
echo "📨 Creating Pub/Sub subscription: $SUBSCRIPTION_NAME..."
if gcloud pubsub subscriptions describe $SUBSCRIPTION_NAME 2>/dev/null; then
    echo "   ✅ Subscription already exists"
else
    gcloud pubsub subscriptions create $SUBSCRIPTION_NAME \
        --topic=$TOPIC_NAME \
        --ack-deadline=600 \
        --message-retention-duration=7d \
        --min-retry-delay=10s \
        --max-retry-delay=600s
    echo "   ✅ Subscription created"
fi

# Create Cloud SQL instance
echo ""
echo "🗄️  Creating Cloud SQL PostgreSQL instance: $SQL_INSTANCE..."
echo "   (This may take 5-10 minutes...)"
if gcloud sql instances describe $SQL_INSTANCE 2>/dev/null; then
    echo "   ✅ Instance already exists"
else
    gcloud sql instances create $SQL_INSTANCE \
        --database-version=POSTGRES_15 \
        --tier=db-f1-micro \
        --region=$REGION \
        --root-password=$(openssl rand -base64 32) \
        --storage-type=SSD \
        --storage-size=10GB \
        --storage-auto-increase \
        --backup-start-time=03:00 \
        --maintenance-window-day=SUN \
        --maintenance-window-hour=04 \
        --database-flags=cloudsql.iam_authentication=on
    echo "   ✅ Instance created"
fi

# Create database
echo ""
echo "🗄️  Creating database: $SQL_DATABASE..."
if gcloud sql databases describe $SQL_DATABASE --instance=$SQL_INSTANCE 2>/dev/null; then
    echo "   ✅ Database already exists"
else
    gcloud sql databases create $SQL_DATABASE --instance=$SQL_INSTANCE
    echo "   ✅ Database created"
fi

# Create database user
echo ""
echo "👤 Creating database user: $SQL_USER..."
DB_PASSWORD=$(openssl rand -base64 32)
if gcloud sql users list --instance=$SQL_INSTANCE --filter="name=$SQL_USER" --format="value(name)" | grep -q $SQL_USER; then
    echo "   ⚠️  User already exists, updating password..."
    gcloud sql users set-password $SQL_USER \
        --instance=$SQL_INSTANCE \
        --password="$DB_PASSWORD"
else
    gcloud sql users create $SQL_USER \
        --instance=$SQL_INSTANCE \
        --password="$DB_PASSWORD"
    echo "   ✅ User created"
fi

# Store database password in Secret Manager
echo ""
echo "🔐 Storing database password in Secret Manager..."
echo -n "$DB_PASSWORD" | gcloud secrets create db-password \
    --data-file=- \
    --replication-policy="automatic" 2>/dev/null || \
echo -n "$DB_PASSWORD" | gcloud secrets versions add db-password \
    --data-file=-
echo "   ✅ Secret stored"

# Create DATABASE_URL secret
INSTANCE_CONNECTION_NAME="$PROJECT_ID:$REGION:$SQL_INSTANCE"
DATABASE_URL="postgresql+asyncpg://$SQL_USER:$DB_PASSWORD@/$SQL_DATABASE?host=/cloudsql/$INSTANCE_CONNECTION_NAME"
echo ""
echo "🔐 Storing DATABASE_URL in Secret Manager..."
echo -n "$DATABASE_URL" | gcloud secrets create database-url \
    --data-file=- \
    --replication-policy="automatic" 2>/dev/null || \
echo -n "$DATABASE_URL" | gcloud secrets versions add database-url \
    --data-file=-
echo "   ✅ DATABASE_URL secret stored"

# Get Cloud SQL connection name
echo ""
echo "=========================================="
echo "✅ Infrastructure Setup Complete!"
echo "=========================================="
echo ""
echo "📋 Configuration Summary:"
echo ""
echo "Project ID:              $PROJECT_ID"
echo "Region:                  $REGION"
echo "Cloud Storage Bucket:    gs://$BUCKET_NAME"
echo "Pub/Sub Topic:           $TOPIC_NAME"
echo "Pub/Sub Subscription:    $SUBSCRIPTION_NAME"
echo "Cloud SQL Instance:      $SQL_INSTANCE"
echo "Database:                $SQL_DATABASE"
echo "Database User:           $SQL_USER"
echo "Connection Name:         $INSTANCE_CONNECTION_NAME"
echo ""
echo "🔐 Secrets in Secret Manager:"
echo "  - db-password"
echo "  - database-url"
echo ""
echo "📝 Next Steps:"
echo ""
echo "1. Initialize database (enable pgvector and create tables):"
echo "   ./scripts/init_cloud_db.sh"
echo ""
echo "2. Deploy API service:"
echo "   ./scripts/deploy_api.sh"
echo ""
echo "3. Deploy Worker service:"
echo "   ./scripts/deploy_worker.sh"
echo ""
echo "=========================================="
