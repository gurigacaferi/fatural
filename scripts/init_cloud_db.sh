#!/bin/bash
#
# Initialize Cloud SQL database - enable pgvector and create tables
#

set -e

PROJECT_ID="adept-ethos-483609-j4"
REGION="europe-west3"
SQL_INSTANCE="scanner-db"
SQL_DATABASE="fatural"

echo "=========================================="
echo "Database Initialization"
echo "=========================================="
echo "Instance: $SQL_INSTANCE"
echo "Database: $SQL_DATABASE"
echo ""

# Get database password from Secret Manager
echo "🔐 Retrieving database credentials..."
DB_PASSWORD=$(gcloud secrets versions access latest --secret="db-password")
DB_USER="fatural-app"

# Create temporary connection config
echo ""
echo "🔌 Setting up Cloud SQL Proxy connection..."
INSTANCE_CONNECTION_NAME="$PROJECT_ID:$REGION:$SQL_INSTANCE"

# Export environment variables for init_db.py
export DB_USER="$DB_USER"
export DB_PASSWORD="$DB_PASSWORD"
export DB_NAME="$SQL_DATABASE"
export DB_HOST="localhost"
export DB_PORT="5432"
export ENVIRONMENT="development"

# Start Cloud SQL Proxy in background
echo "   Starting Cloud SQL Proxy..."
cloud-sql-proxy $INSTANCE_CONNECTION_NAME --port=5432 &
PROXY_PID=$!

# Wait for proxy to be ready
echo "   Waiting for proxy connection..."
sleep 5

# Run database initialization
echo ""
echo "📊 Running database initialization script..."
python scripts/init_db.py

# Stop proxy
echo ""
echo "🛑 Stopping Cloud SQL Proxy..."
kill $PROXY_PID

echo ""
echo "=========================================="
echo "✅ Database Initialization Complete!"
echo "=========================================="
echo ""
echo "Your database is now ready with:"
echo "  ✓ pgvector extension enabled"
echo "  ✓ All tables created"
echo "  ✓ Indexes configured"
echo "  ✓ Demo company created"
echo ""
