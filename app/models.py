"""
SQLAlchemy models with multi-tenant architecture.
Every table includes company_id for data isolation.
"""

import uuid
from datetime import datetime
from typing import Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    UUID,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.database import Base


class Company(Base):
    """
    Multi-tenant company/organization table.
    Each company has isolated data across all tables.
    """

    __tablename__ = "companies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    tax_number = Column(String(100), unique=True, nullable=False)  # Kosovo NUI
    email = Column(String(255), nullable=False)
    phone = Column(String(50))
    address = Column(Text)
    
    # Subscription & limits
    is_active = Column(Boolean, default=True, nullable=False)
    subscription_tier = Column(String(50), default="free")  # free, pro, enterprise
    monthly_scan_limit = Column(Integer, default=100)
    monthly_scans_used = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    bills = relationship("Bill", back_populates="company", cascade="all, delete-orphan")
    users = relationship("User", back_populates="company", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_companies_tax_number", tax_number),
        Index("idx_companies_is_active", is_active),
    )


class User(Base):
    """
    User accounts scoped to a company.
    Multi-tenant: users belong to one company.
    """

    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    
    email = Column(String(255), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255))
    role = Column(String(50), default="user")  # admin, user, viewer
    
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_login = Column(DateTime)

    # Relationships
    company = relationship("Company", back_populates="users")

    __table_args__ = (
        Index("idx_users_company_id", company_id),
        Index("idx_users_email", email),
    )


class Bill(Base):
    """
    Scanned bill records with AI extraction results.
    
    Multi-tenant: scoped by company_id.
    Duplicate detection: uses vector(768) for visual fingerprinting.
    """

    __tablename__ = "bills"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    
    # File storage
    original_filename = Column(String(255), nullable=False)
    storage_path = Column(String(500), nullable=False)  # GCS path
    file_size_bytes = Column(Integer)
    mime_type = Column(String(100))
    
    # AI Extraction (from Gemini 3.0 Flash)
    vendor_name = Column(String(255))
    vendor_tax_number = Column(String(100))  # Kosovo NUI
    bill_number = Column(String(100))
    bill_date = Column(DateTime)
    total_amount = Column(Float)
    currency = Column(String(10), default="EUR")  # Kosovo uses EUR
    
    # Extracted line items (JSON array)
    line_items = Column(JSONB)  # [{"description": "...", "quantity": 1, "price": 10.0}]
    
    # Raw extraction result from Gemini
    raw_extraction = Column(JSONB)
    
    # Duplicate detection using pgvector (768-dimensional visual embedding)
    visual_fingerprint = Column(Vector(768))  # Image embedding for similarity search
    
    # Processing status
    status = Column(
        String(50), 
        default="pending", 
        nullable=False
    )  # pending, processing, completed, failed, duplicate
    
    error_message = Column(Text)
    
    # Duplicate tracking
    is_duplicate = Column(Boolean, default=False)
    duplicate_of_id = Column(UUID(as_uuid=True), ForeignKey("bills.id"))
    similarity_score = Column(Float)  # Cosine similarity (0-1)
    
    # Metadata
    processed_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    company = relationship("Company", back_populates="bills")
    duplicate_of = relationship("Bill", remote_side=[id], backref="duplicates")

    __table_args__ = (
        # Multi-tenant isolation
        Index("idx_bills_company_id", company_id),
        
        # Query performance
        Index("idx_bills_status", status),
        Index("idx_bills_bill_date", bill_date),
        Index("idx_bills_vendor_tax_number", vendor_tax_number),
        Index("idx_bills_bill_number", bill_number),
        
        # Duplicate detection: Vector similarity search (HNSW index for fast ANN)
        Index(
            "idx_bills_visual_fingerprint_hnsw",
            visual_fingerprint,
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"visual_fingerprint": "vector_cosine_ops"},
        ),
        
        # Compound index for multi-tenant queries
        Index("idx_bills_company_status", company_id, status),
    )


class AuditLog(Base):
    """
    Audit trail for all actions in the system.
    Multi-tenant: scoped by company_id.
    """

    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    action = Column(String(100), nullable=False)  # bill_scanned, bill_deleted, etc.
    resource_type = Column(String(50))  # bill, user, company
    resource_id = Column(UUID(as_uuid=True))
    
    details = Column(JSONB)  # Additional context
    ip_address = Column(String(50))
    user_agent = Column(String(500))
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_audit_logs_company_id", company_id),
        Index("idx_audit_logs_created_at", created_at),
        Index("idx_audit_logs_action", action),
    )
