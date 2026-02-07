"""
Pydantic validation schemas for API requests/responses and AI structured outputs.
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


# ============================================================================
# KOSOVO ATK 665 TAX CODES
# ============================================================================
class ATKCode:
    """Kosovo ATK form 665 category codes for expense classification."""
    FOOD = "665-04"  # Food and beverages
    FUEL = "665-09"  # Fuel and lubricants
    SERVICES = "665-11"  # Professional services
    OFFICE = "665-12"  # Office supplies
    UTILITIES = "665-13"  # Utilities (electricity, water, etc.)
    TRANSPORT = "665-14"  # Transportation
    MAINTENANCE = "665-15"  # Maintenance and repairs
    OTHER = "665-99"  # Other expenses


# ============================================================================
# AI EXTRACTION SCHEMAS (Structured Outputs from Gemini)
# ============================================================================
class ExtractedLineItem(BaseModel):
    """Individual line item from bill."""
    description: str = Field(..., description="Item/service description")
    quantity: float = Field(default=1.0, ge=0)
    unit_price: float = Field(..., ge=0)
    total_price: float = Field(..., ge=0)
    vat_rate: Optional[float] = Field(None, description="VAT rate (8% or 18%)")
    atk_code: str = Field(
        default=ATKCode.OTHER,
        description="Kosovo ATK 665 expense category code"
    )


class ExtractedBillData(BaseModel):
    """
    Structured output from Gemini 3.0 Flash extraction.
    Used for structured generation to ensure valid JSON.
    """
    # Merchant information
    vendor_name: str = Field(..., description="Merchant/vendor business name")
    vendor_tax_number: Optional[str] = Field(
        None,
        description="Kosovo NUI (business tax number, starts with 81)"
    )
    vendor_address: Optional[str] = None
    
    # Bill identification
    bill_number: Optional[str] = Field(None, description="Invoice/receipt number")
    bill_date: Optional[str] = Field(
        None,
        description="Bill date in ISO format (YYYY-MM-DD) or DD/MM/YYYY"
    )
    bill_time: Optional[str] = Field(None, description="Transaction time if available")
    
    # Financial details
    subtotal: Optional[float] = Field(None, ge=0, description="Amount before VAT")
    vat_8_percent: Optional[float] = Field(None, ge=0, description="VAT at 8%")
    vat_18_percent: Optional[float] = Field(None, ge=0, description="VAT at 18%")
    total_vat: Optional[float] = Field(None, ge=0, description="Total VAT amount")
    total_amount: float = Field(..., ge=0, description="Final total amount")
    currency: str = Field(default="EUR", description="Currency code")
    
    # Line items
    line_items: List[ExtractedLineItem] = Field(
        default_factory=list,
        description="Individual items/services on the bill"
    )
    
    # Additional metadata
    payment_method: Optional[str] = Field(
        None,
        description="Payment method (cash, card, etc.)"
    )
    confidence_score: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="AI confidence in extraction (0-1)"
    )

    @field_validator("vendor_tax_number")
    @classmethod
    def validate_nui(cls, v: Optional[str]) -> Optional[str]:
        """Validate Kosovo NUI format (starts with 81)."""
        if v and not v.startswith("81"):
            # Don't reject, just flag it
            return v
        return v


# ============================================================================
# API REQUEST/RESPONSE SCHEMAS
# ============================================================================
class BillUploadResponse(BaseModel):
    """Response after uploading a bill."""
    bill_id: UUID
    status: str
    message: str
    storage_path: str


class BillResponse(BaseModel):
    """Bill details response."""
    id: UUID
    company_id: UUID
    original_filename: str
    storage_path: str
    
    # Extraction results
    vendor_name: Optional[str]
    vendor_tax_number: Optional[str]
    bill_number: Optional[str]
    bill_date: Optional[datetime]
    total_amount: Optional[float]
    currency: str
    
    # Status
    status: str
    is_duplicate: bool
    duplicate_of_id: Optional[UUID]
    similarity_score: Optional[float]
    
    # Metadata
    created_at: datetime
    processed_at: Optional[datetime]

    class Config:
        from_attributes = True


class BillListResponse(BaseModel):
    """Paginated list of bills."""
    bills: List[BillResponse]
    total: int
    page: int
    page_size: int


class DuplicateCheckResult(BaseModel):
    """Result of duplicate detection."""
    is_duplicate: bool
    duplicate_bill_id: Optional[UUID]
    similarity_score: float
    message: str


# ============================================================================
# PUB/SUB MESSAGE SCHEMAS
# ============================================================================
class BillUploadMessage(BaseModel):
    """Message published to Pub/Sub after file upload."""
    bill_id: str
    company_id: str
    storage_path: str
    mime_type: str
    uploaded_at: str


# ============================================================================
# COMPANY & USER SCHEMAS
# ============================================================================
class CompanyCreate(BaseModel):
    """Create a new company (tenant)."""
    name: str = Field(..., min_length=1, max_length=255)
    tax_number: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., min_length=1, max_length=255)
    phone: Optional[str] = None
    address: Optional[str] = None


class CompanyResponse(BaseModel):
    """Company details."""
    id: UUID
    name: str
    tax_number: str
    email: str
    is_active: bool
    subscription_tier: str
    monthly_scan_limit: int
    monthly_scans_used: int
    created_at: datetime

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    """Create a new user."""
    email: str
    password: str
    full_name: Optional[str]
    role: str = "user"


class UserResponse(BaseModel):
    """User details."""
    id: UUID
    company_id: UUID
    email: str
    full_name: Optional[str]
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
