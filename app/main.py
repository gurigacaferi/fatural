"""
FastAPI application - AI Bill Scanner API.
Multi-tenant architecture with Cloud Run deployment.
"""

import csv
import io
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import List, Optional

from fastapi import (
    Depends,
    FastAPI,
    File,
    Header,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from google.cloud import pubsub_v1, storage
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import db, get_db
from app.models import Bill, Company
from app.schemas import (
    BillListResponse,
    BillResponse,
    BillUploadMessage,
    BillUploadResponse,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager - handles startup and shutdown."""
    # Startup
    print("🚀 Starting Fatural Bill Scanner API...")
    try:
        await db.connect()
        print("✅ Database connected")
    except Exception as e:
        print(f"⚠️ Database connection failed (will retry on request): {e}")
    yield
    # Shutdown
    print("⏹️  Shutting down...")
    try:
        await db.disconnect()
        print("✅ Database disconnected")
    except Exception as e:
        print(f"⚠️ Error during shutdown: {e}")


# Initialize FastAPI app
app = FastAPI(
    title="Fatural - AI Bill Scanner",
    description="Multi-tenant AI-powered bill scanning for Kosovo market",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize GCP clients
publisher = pubsub_v1.PublisherClient()
storage_client = storage.Client()
bucket_name = os.getenv("GCS_BUCKET_NAME", "fatural-bills")
bucket = storage_client.bucket(bucket_name)
topic_path = publisher.topic_path(
    os.getenv("GCP_PROJECT_ID"),
    os.getenv("PUBSUB_TOPIC", "bill-upload")
)


# ============================================================================
# AUTHENTICATION & AUTHORIZATION
# ============================================================================

async def get_current_company(
    x_company_id: str = Header(..., description="Company UUID for multi-tenancy"),
    session: AsyncSession = Depends(get_db)
) -> Company:
    """
    Multi-tenant authentication dependency.
    
    In production, this should verify JWT tokens and extract company_id.
    For now, we use a simple header-based approach.
    """
    try:
        company_uuid = uuid.UUID(x_company_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid company ID format"
        )
    
    # Fetch company
    result = await session.execute(
        select(Company).where(Company.id == company_uuid)
    )
    company = result.scalar_one_or_none()
    
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found"
        )
    
    if not company.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Company account is inactive"
        )
    
    return company


async def check_scan_limit(
    company: Company,
    session: AsyncSession
) -> None:
    """Check if company has exceeded monthly scan limit."""
    if company.monthly_scans_used >= company.monthly_scan_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Monthly scan limit reached ({company.monthly_scan_limit})"
        )


# ============================================================================
# HEALTH CHECK
# ============================================================================

@app.get("/", tags=["Health"])
async def root():
    """Health check endpoint."""
    return {
        "service": "Fatural Bill Scanner",
        "status": "healthy",
        "version": "1.0.0"
    }


@app.get("/debug/env", tags=["Health"])
async def debug_env():
    """Debug endpoint to check environment configuration."""
    return {
        "environment": os.getenv("ENVIRONMENT", "unknown"),
        "gcp_project": os.getenv("GCP_PROJECT_ID", "not_set"),
        "db_name": os.getenv("DB_NAME", "not_set"),
        "db_user": os.getenv("DB_USER", "not_set"),
        "db_password_set": bool(os.getenv("DB_PASSWORD")),
        "instance_connection": os.getenv("INSTANCE_CONNECTION_NAME", "not_set"),
        "bucket_name": os.getenv("GCS_BUCKET_NAME", "not_set"),
        "pubsub_topic": os.getenv("PUBSUB_TOPIC", "not_set"),
    }


@app.get("/health", tags=["Health"])
async def health_check():
    """Detailed health check."""
    db_status = "unknown"
    try:
        # Check if database is initialized
        if not db.session_maker:
            db_status = "not_initialized"
        else:
            # Try a simple DB query
            async with db.get_session() as session:
                await session.execute(select(1))
                db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)[:100]}"
    
    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "database": db_status,
        "timestamp": datetime.utcnow().isoformat()
    }


# ============================================================================
# BILL UPLOAD & PROCESSING
# ============================================================================

@app.post(
    "/upload",
    response_model=BillUploadResponse,
    status_code=status.HTTP_202_ACCEPTED,
    tags=["Bills"]
)
async def upload_bill(
    file: UploadFile = File(..., description="Bill image or PDF"),
    company: Company = Depends(get_current_company),
    session: AsyncSession = Depends(get_db)
):
    """
    Upload a bill for AI extraction.
    
    Flow:
    1. Validate file type and size
    2. Check scan limits
    3. Upload to GCS
    4. Create pending database record
    5. Publish message to Pub/Sub
    6. Return bill ID immediately
    
    The actual processing happens asynchronously in the worker.
    """
    # Validate file type
    allowed_types = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "application/pdf"
    ]
    
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type {file.content_type} not supported. "
                   f"Allowed: {', '.join(allowed_types)}"
        )
    
    # Validate file size (max 10MB)
    file_content = await file.read()
    file_size = len(file_content)
    max_size = 10 * 1024 * 1024  # 10 MB
    
    if file_size > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size {file_size} exceeds maximum {max_size} bytes"
        )
    
    # Check scan limit
    await check_scan_limit(company, session)
    
    # Generate unique storage path
    bill_id = uuid.uuid4()
    file_extension = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    storage_path = f"bills/{company.id}/{bill_id}.{file_extension}"
    
    # Step 1: Upload to GCS
    blob = bucket.blob(storage_path)
    blob.upload_from_string(
        file_content,
        content_type=file.content_type
    )
    
    # Step 2: Create pending database record
    bill = Bill(
        id=bill_id,
        company_id=company.id,
        original_filename=file.filename,
        storage_path=storage_path,
        file_size_bytes=file_size,
        mime_type=file.content_type,
        status="pending",
        currency="EUR"
    )
    
    session.add(bill)
    
    # Update company scan counter
    company.monthly_scans_used += 1
    
    await session.commit()
    
    # Step 3: Publish message to Pub/Sub for async processing
    message = BillUploadMessage(
        bill_id=str(bill_id),
        company_id=str(company.id),
        storage_path=storage_path,
        mime_type=file.content_type,
        uploaded_at=datetime.utcnow().isoformat()
    )
    
    publisher.publish(
        topic_path,
        message.model_dump_json().encode("utf-8")
    )
    
    return BillUploadResponse(
        bill_id=bill_id,
        status="pending",
        message="Bill uploaded successfully. Processing will begin shortly.",
        storage_path=storage_path
    )


# ============================================================================
# BILL RETRIEVAL
# ============================================================================

@app.get(
    "/bills/{bill_id}",
    response_model=BillResponse,
    tags=["Bills"]
)
async def get_bill(
    bill_id: uuid.UUID,
    company: Company = Depends(get_current_company),
    session: AsyncSession = Depends(get_db)
):
    """Get bill details by ID (multi-tenant scoped)."""
    result = await session.execute(
        select(Bill).where(
            Bill.id == bill_id,
            Bill.company_id == company.id  # Multi-tenant isolation
        )
    )
    bill = result.scalar_one_or_none()
    
    if not bill:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bill not found"
        )
    
    return bill


@app.get(
    "/bills",
    response_model=BillListResponse,
    tags=["Bills"]
)
async def list_bills(
    page: int = 1,
    page_size: int = 20,
    status_filter: Optional[str] = None,
    company: Company = Depends(get_current_company),
    session: AsyncSession = Depends(get_db)
):
    """
    List bills for the company (paginated).
    
    Multi-tenant: Only returns bills for the authenticated company.
    """
    # Validate pagination
    if page < 1:
        page = 1
    if page_size < 1 or page_size > 100:
        page_size = 20
    
    # Build query with multi-tenant filter
    query = select(Bill).where(Bill.company_id == company.id)
    
    # Apply status filter if provided
    if status_filter:
        query = query.where(Bill.status == status_filter)
    
    # Order by created date (newest first)
    query = query.order_by(Bill.created_at.desc())
    
    # Get total count
    count_query = select(func.count()).select_from(Bill).where(
        Bill.company_id == company.id
    )
    if status_filter:
        count_query = count_query.where(Bill.status == status_filter)
    
    total_result = await session.execute(count_query)
    total = total_result.scalar()
    
    # Apply pagination
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    
    # Execute query
    result = await session.execute(query)
    bills = result.scalars().all()
    
    return BillListResponse(
        bills=bills,
        total=total,
        page=page,
        page_size=page_size
    )


@app.delete(
    "/bills/{bill_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Bills"]
)
async def delete_bill(
    bill_id: uuid.UUID,
    company: Company = Depends(get_current_company),
    session: AsyncSession = Depends(get_db)
):
    """
    Delete a bill (multi-tenant scoped).
    Also deletes the file from GCS.
    """
    result = await session.execute(
        select(Bill).where(
            Bill.id == bill_id,
            Bill.company_id == company.id  # Multi-tenant isolation
        )
    )
    bill = result.scalar_one_or_none()
    
    if not bill:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bill not found"
        )
    
    # Delete from GCS
    try:
        blob = bucket.blob(bill.storage_path)
        blob.delete()
    except Exception as e:
        print(f"Failed to delete from GCS: {e}")
        # Continue with DB deletion even if GCS fails
    
    # Delete from database
    await session.delete(bill)
    await session.commit()
    
    return None


# ============================================================================
# STATISTICS & ANALYTICS
# ============================================================================

@app.get("/stats", tags=["Analytics"])
async def get_stats(
    company: Company = Depends(get_current_company),
    session: AsyncSession = Depends(get_db)
):
    """Get company statistics."""
    # Count bills by status
    status_counts = {}
    for status_value in ["pending", "processing", "completed", "failed", "duplicate"]:
        count_result = await session.execute(
            select(func.count()).select_from(Bill).where(
                Bill.company_id == company.id,
                Bill.status == status_value
            )
        )
        status_counts[status_value] = count_result.scalar()
    
    # Calculate total amount
    total_result = await session.execute(
        select(func.sum(Bill.total_amount)).where(
            Bill.company_id == company.id,
            Bill.status == "completed",
            Bill.is_duplicate == False
        )
    )
    total_amount = total_result.scalar() or 0.0
    
    return {
        "company_id": company.id,
        "company_name": company.name,
        "subscription_tier": company.subscription_tier,
        "monthly_scans_used": company.monthly_scans_used,
        "monthly_scan_limit": company.monthly_scan_limit,
        "bills_by_status": status_counts,
        "total_amount_processed": total_amount,
        "currency": "EUR"
    }


@app.get("/bills/export/csv", tags=["Analytics"])
async def export_bills_csv(
    company: Company = Depends(get_current_company),
    session: AsyncSession = Depends(get_db)
):
    """
    Export all bills for the company as CSV.
    Downloads automatically with proper CSV formatting.
    """
    # Fetch all completed bills for the company
    result = await session.execute(
        select(Bill).where(
            Bill.company_id == company.id,
            Bill.status == "completed"
        ).order_by(Bill.bill_date.desc())
    )
    bills = result.scalars().all()
    
    # Create CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow([
        'Date',
        'Merchant',
        'Total',
        'VAT_8',
        'VAT_18',
        'ATK_Code',
        'NUI'
    ])
    
    # Write bill data
    for bill in bills:
        # Extract VAT and ATK codes from line items if available
        vat_8 = 0.0
        vat_18 = 0.0
        atk_codes = set()
        
        if bill.extracted_data:
            for item in bill.extracted_data.get('line_items', []):
                if item.get('vat_rate') == 0.08:
                    vat_8 += item.get('vat_amount', 0.0)
                elif item.get('vat_rate') == 0.18:
                    vat_18 += item.get('vat_amount', 0.0)
                
                atk_code = item.get('atk_code')
                if atk_code:
                    atk_codes.add(atk_code)
        
        writer.writerow([
            bill.bill_date.strftime('%Y-%m-%d') if bill.bill_date else '',
            bill.vendor_name or '',
            f"{bill.total_amount:.2f}",
            f"{vat_8:.2f}",
            f"{vat_18:.2f}",
            ','.join(sorted(atk_codes)) if atk_codes else '',
            bill.vendor_tax_number or ''
        ])
    
    # Reset buffer position
    output.seek(0)
    
    # Generate filename with timestamp
    filename = f"bills_export_{company.name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )
