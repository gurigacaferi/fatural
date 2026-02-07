# Fatural - AI Bill Scanner for Kosovo

Multi-tenant AI-powered bill scanning system built for the Kosovo market using Gemini 3.0 Flash and Google Cloud Platform.

## 🏗️ Architecture

- **AI Model**: Gemini 3.0 Flash with high thinking level
- **API**: FastAPI (Python 3.12)
- **Database**: PostgreSQL with pgvector for duplicate detection
- **Storage**: Google Cloud Storage
- **Async Processing**: Pub/Sub + Background Workers
- **Deployment**: Cloud Run (serverless)

## 🎯 Features

- ✅ **Multi-tenant architecture** - Complete data isolation via `company_id`
- ✅ **Kosovo-specific extraction** - NUI tax numbers, ATK 665 codes, VAT splits (8%/18%)
- ✅ **Duplicate detection** - Vector similarity search using 768-dim embeddings
- ✅ **Async processing** - Non-blocking uploads with Pub/Sub
- ✅ **Structured outputs** - Guaranteed valid JSON from Gemini
- ✅ **Thermal receipt support** - High-resolution processing

## 📁 Project Structure

```
fatural/
├── app/
│   ├── main.py          # FastAPI routes & endpoints
│   ├── models.py        # SQLAlchemy multi-tenant models
│   ├── schemas.py       # Pydantic validation schemas
│   ├── scanner.py       # Gemini 3.0 Flash extraction logic
│   ├── worker.py        # Pub/Sub background processor
│   └── database.py      # Cloud SQL connection manager
├── scripts/
│   └── init_db.py       # Database initialization script
├── Dockerfile           # Cloud Run optimized
├── requirements.txt     # Python dependencies
└── .env.example         # Environment variables template
```

## 🚀 Quick Start

### 1. Prerequisites

- Python 3.12+
- PostgreSQL 14+ with pgvector
- Google Cloud account with:
  - Cloud SQL instance
  - Cloud Storage bucket
  - Pub/Sub topic & subscription
  - Gemini API access

### 2. Setup

```bash
# Clone repository
git clone https://github.com/gurigacaferi/fatural.git
cd fatural

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Initialize database
python scripts/init_db.py
```

### 3. Run Locally

**API Server:**
```bash
uvicorn app.main:app --reload --port 8080
```

**Background Worker:**
```bash
python -m app.worker
```

### 4. Test Upload

```bash
curl -X POST http://localhost:8080/upload \
  -H "X-Company-Id: <your-company-id>" \
  -F "file=@sample_bill.jpg"
```

## 📊 Database Schema

### Tables

**Companies** - Multi-tenant root
- `id` (UUID, PK)
- `name`, `tax_number`, `email`
- `subscription_tier`, `monthly_scan_limit`

**Bills** - Scanned bills with AI extraction
- `id` (UUID, PK)
- `company_id` (UUID, FK) ← **Multi-tenant isolation**
- `vendor_name`, `vendor_tax_number`, `bill_number`, `bill_date`
- `total_amount`, `currency`, `line_items` (JSONB)
- `visual_fingerprint` (vector(768)) ← **Duplicate detection**
- `status`, `is_duplicate`, `duplicate_of_id`

**Users** - Company-scoped users
- `id` (UUID, PK)
- `company_id` (UUID, FK) ← **Multi-tenant isolation**
- `email`, `hashed_password`, `role`

**AuditLogs** - Compliance tracking
- `id` (UUID, PK)
- `company_id` (UUID, FK) ← **Multi-tenant isolation**
- `action`, `resource_type`, `resource_id`

### Indexes

- HNSW index on `visual_fingerprint` for fast cosine similarity search
- Compound indexes on `(company_id, status)` for multi-tenant queries
- Indexes on Kosovo-specific fields (NUI, bill_number)

## 🔧 API Endpoints

### Bills

- `POST /upload` - Upload bill for processing
- `GET /bills/{bill_id}` - Get bill details
- `GET /bills` - List bills (paginated)
- `DELETE /bills/{bill_id}` - Delete bill

### Analytics

- `GET /stats` - Company statistics

### Health

- `GET /health` - Health check

## 🎨 Kosovo Market Features

### ATK 665 Tax Codes

Automatically classifies expenses into Kosovo tax form 665 categories:
- `665-04` - Food and beverages
- `665-09` - Fuel and lubricants
- `665-11` - Professional services
- `665-12` - Office supplies
- `665-13` - Utilities
- `665-14` - Transportation
- `665-15` - Maintenance
- `665-99` - Other

### VAT Split Detection

Extracts Kosovo's dual VAT rates:
- **8%** - Reduced rate (essential goods)
- **18%** - Standard rate

### NUI Validation

Validates Kosovo business tax numbers (start with "81").

## 🔐 Multi-Tenant Security

**Every request is scoped by `company_id`:**
1. API requires `X-Company-Id` header
2. All database queries filter by `company_id`
3. Files stored in company-specific GCS folders
4. Complete data isolation between tenants

## 🚢 Deployment to Cloud Run

### Build & Deploy API

```bash
gcloud run deploy fatural-api \
  --source . \
  --region europe-west1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars="$(cat .env)"
```

### Deploy Worker

```bash
gcloud run deploy fatural-worker \
  --source . \
  --region europe-west1 \
  --platform managed \
  --command="python,-m,app.worker" \
  --set-env-vars="$(cat .env)"
```

## 📈 Processing Flow

```
1. Client uploads bill → POST /upload
2. API saves to GCS, creates pending record
3. API publishes message to Pub/Sub
4. API returns bill_id immediately ✅
5. Worker receives message
6. Worker downloads from GCS
7. Worker calls Gemini 3.0 Flash
8. Worker generates 768-dim embedding
9. Worker checks for duplicates (pgvector)
10. Worker saves results to DB
11. Client polls GET /bills/{id} for status
```

## 🧪 Testing

```bash
# Run tests
pytest

# Check duplicate detection
python scripts/test_duplicates.py
```

## 📝 License

MIT

## 🤝 Contributing

Contributions welcome! Please open an issue or PR.

---

Built with ❤️ for Kosovo's digital transformation
