"""
Database initialization script.
Enables pgvector extension and creates all tables.
"""

import asyncio
import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text
from app.database import db, Base
from app.models import Company, User, Bill, AuditLog


async def init_database():
    """
    Initialize database with pgvector extension and create all tables.
    """
    print("🚀 Initializing database...")
    
    # Connect to database
    await db.connect()
    
    if not db.engine:
        raise RuntimeError("Database engine not initialized")
    
    # Create pgvector extension
    async with db.engine.begin() as conn:
        print("📦 Enabling pgvector extension...")
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        print("✅ pgvector extension enabled")
        
        # Create all tables
        print("📊 Creating tables...")
        await conn.run_sync(Base.metadata.create_all)
        print("✅ All tables created successfully")
    
    # Verify tables
    async with db.engine.connect() as conn:
        result = await conn.execute(
            text("""
                SELECT tablename 
                FROM pg_tables 
                WHERE schemaname = 'public'
                ORDER BY tablename;
            """)
        )
        tables = [row[0] for row in result]
        
        print(f"\n📋 Created tables: {', '.join(tables)}")
        
        # Verify indexes
        result = await conn.execute(
            text("""
                SELECT indexname, tablename
                FROM pg_indexes
                WHERE schemaname = 'public'
                ORDER BY tablename, indexname;
            """)
        )
        indexes = result.fetchall()
        
        print(f"\n🔍 Created {len(indexes)} indexes:")
        for idx_name, tbl_name in indexes:
            print(f"  - {tbl_name}.{idx_name}")
    
    # Disconnect
    await db.disconnect()
    
    print("\n✅ Database initialization complete!")


async def create_demo_company():
    """
    Create a demo company for testing.
    """
    print("\n🏢 Creating demo company...")
    
    await db.connect()
    
    async with db.get_session() as session:
        # Check if demo company exists
        from sqlalchemy import select
        result = await session.execute(
            select(Company).where(Company.tax_number == "81234567890")
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            print(f"✅ Demo company already exists: {existing.id}")
            return existing.id
        
        # Create demo company
        company = Company(
            name="Demo Company",
            tax_number="81234567890",
            email="demo@fatural.com",
            phone="+383 44 123 456",
            address="Prishtina, Kosovo",
            subscription_tier="pro",
            monthly_scan_limit=1000
        )
        
        session.add(company)
        await session.commit()
        
        print(f"✅ Demo company created: {company.id}")
        print(f"   Use this Company ID in X-Company-Id header: {company.id}")
        
        return company.id
    
    await db.disconnect()


async def main():
    """Main entry point."""
    try:
        # Initialize database
        await init_database()
        
        # Create demo company
        company_id = await create_demo_company()
        
        print("\n" + "="*60)
        print("🎉 Setup complete!")
        print("="*60)
        print(f"\n📌 Demo Company ID: {company_id}")
        print("\n💡 Usage example:")
        print(f'   curl -X POST http://localhost:8080/upload \\')
        print(f'        -H "X-Company-Id: {company_id}" \\')
        print(f'        -F "file=@bill.jpg"')
        print("="*60)
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())
