#!/bin/bash
#
# Setup Gemini API Key - Run this before deployment
#

set -e

PROJECT_ID="adept-ethos-483609-j4"

echo "=========================================="
echo "Gemini API Key Setup"
echo "=========================================="
echo ""

# Check if secret already exists
if gcloud secrets describe gemini-api-key 2>/dev/null; then
    echo "⚠️  Gemini API key secret already exists"
    echo ""
    echo "To update it, run:"
    echo "echo -n 'YOUR_NEW_API_KEY' | gcloud secrets versions add gemini-api-key --data-file=-"
else
    echo "🔐 Please enter your Gemini API key:"
    read -s API_KEY
    
    if [[ -z "$API_KEY" ]]; then
        echo "❌ API key cannot be empty"
        exit 1
    fi
    
    echo ""
    echo "📦 Creating Gemini API key secret..."
    echo -n "$API_KEY" | gcloud secrets create gemini-api-key \
        --data-file=- \
        --replication-policy="automatic"
    
    echo "✅ Gemini API key stored successfully"
fi

echo ""
echo "✅ Setup complete! You can now run:"
echo "   ./scripts/setup_infrastructure.sh"
echo "   ./scripts/init_cloud_db.sh"  
echo "   ./scripts/deploy_api.sh"
echo "   ./scripts/deploy_worker.sh"
echo ""