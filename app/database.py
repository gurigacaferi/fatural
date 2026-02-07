"""
Cloud SQL connection logic with async SQLAlchemy.
Handles connection pooling and session management for multi-tenant architecture.
"""

import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import declarative_base
from sqlalchemy.pool import NullPool

# Base class for all models
Base = declarative_base()


class DatabaseConfig:
    """Database configuration from environment variables."""

    def __init__(self):
        self.db_user = os.getenv("DB_USER", "postgres")
        self.db_password = os.getenv("DB_PASSWORD", "")
        self.db_name = os.getenv("DB_NAME", "fatural")
        self.db_host = os.getenv("DB_HOST", "localhost")
        self.db_port = os.getenv("DB_PORT", "5432")
        self.instance_connection_name = os.getenv("INSTANCE_CONNECTION_NAME")
        self.environment = os.getenv("ENVIRONMENT", "development")

    def get_database_url(self) -> str:
        """
        Returns the appropriate database URL based on environment.
        For Cloud Run: uses Cloud SQL Connector
        For local dev: uses direct TCP connection
        """
        if self.environment == "production" and self.instance_connection_name:
            # Cloud SQL connection using Unix socket
            return f"postgresql+asyncpg://{self.db_user}:{self.db_password}@/{self.db_name}?host=/cloudsql/{self.instance_connection_name}"
        else:
            # Local or development connection
            return f"postgresql+asyncpg://{self.db_user}:{self.db_password}@{self.db_host}:{self.db_port}/{self.db_name}"


class Database:
    """Database connection manager with async support."""

    def __init__(self):
        self.config = DatabaseConfig()
        self.engine: AsyncEngine | None = None
        self.session_maker: async_sessionmaker[AsyncSession] | None = None

    async def connect(self):
        """Initialize database connection and create session factory."""
        database_url = self.config.get_database_url()

        # Create async engine with optimized settings
        engine_args = {
            "echo": self.config.environment == "development",
            "pool_pre_ping": True,
        }
        
        # For production with Cloud Run, use NullPool (no connection pooling)
        if self.config.environment == "production":
            engine_args["poolclass"] = NullPool
        else:
            # For development, use connection pooling
            engine_args.update({
                "pool_size": 5,
                "max_overflow": 10,
                "pool_timeout": 30,
                "pool_recycle": 3600,
            })

        self.engine = create_async_engine(database_url, **engine_args)

        # Create session factory
        self.session_maker = async_sessionmaker(
            self.engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )

    async def disconnect(self):
        """Close database connection."""
        if self.engine:
            await self.engine.dispose()

    @asynccontextmanager
    async def get_session(self) -> AsyncGenerator[AsyncSession, None]:
        """
        Provides a transactional scope for database operations.
        
        Usage:
            async with db.get_session() as session:
                # perform database operations
                await session.execute(...)
        """
        if not self.session_maker:
            raise RuntimeError("Database not connected. Call connect() first.")

        async with self.session_maker() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise


# Global database instance
db = Database()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency for FastAPI route injection.
    
    Usage:
        @app.get("/bills")
        async def get_bills(session: AsyncSession = Depends(get_db)):
            ...
    """
    async with db.get_session() as session:
        yield session
