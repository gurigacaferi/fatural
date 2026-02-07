"""
Pub/Sub background worker for async bill processing.
Handles extraction, duplicate detection, and database updates.
"""

import asyncio
import json
import os
from datetime import datetime
from typing import Optional
from uuid import UUID

from google.cloud import pubsub_v1, storage
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from pgvector.sqlalchemy import Vector

from app.database import db
from app.models import Bill
from app.scanner import scanner
from app.schemas import BillUploadMessage


class BillProcessor:
    """
    Background processor for bill scanning and duplicate detection.
    Subscribes to Pub/Sub messages and processes bills asynchronously.
    """

    def __init__(self):
        self.project_id = os.getenv("GCP_PROJECT_ID")
        self.subscription_name = os.getenv(
            "PUBSUB_SUBSCRIPTION", 
            "bill-upload-subscription"
        )
        self.bucket_name = os.getenv("GCS_BUCKET_NAME", "fatural-bills")
        
        # Initialize GCP clients
        self.subscriber = pubsub_v1.SubscriberClient()
        self.storage_client = storage.Client()
        self.bucket = self.storage_client.bucket(self.bucket_name)
        
        # Duplicate detection threshold (cosine similarity)
        self.duplicate_threshold = 0.95  # 95% similarity = duplicate

    async def process_bill_message(self, message_data: BillUploadMessage) -> None:
        """
        Main processing pipeline for a bill upload message.
        
        Steps:
        1. Download image from GCS
        2. Extract data using Gemini 3.0 Flash
        3. Generate embedding for duplicate detection
        4. Check for duplicates using pgvector
        5. Save to database or mark as duplicate
        
        Args:
            message_data: Parsed Pub/Sub message
        """
        bill_id = UUID(message_data.bill_id)
        company_id = UUID(message_data.company_id)
        
        async with db.get_session() as session:
            try:
                # Get the bill record
                bill = await self._get_bill(session, bill_id, company_id)
                if not bill:
                    print(f"Bill {bill_id} not found")
                    return
                
                # Update status to processing
                bill.status = "processing"
                await session.commit()
                
                # Step 1: Download image from GCS
                image_data = self._download_from_gcs(message_data.storage_path)
                
                # Step 2: Extract data using Gemini
                print(f"Extracting bill {bill_id}...")
                extracted_data = await scanner.extract_from_image(
                    image_data,
                    mime_type=message_data.mime_type
                )
                
                # Step 3: Generate embedding for duplicate detection
                text_for_embedding = scanner.generate_text_for_embedding(extracted_data)
                embedding = await scanner.generate_embedding(text_for_embedding)
                
                # Step 4: Check for duplicates using pgvector
                duplicate_info = await self._check_duplicate(
                    session,
                    company_id,
                    embedding
                )
                
                # Step 5: Update bill record
                if duplicate_info["is_duplicate"]:
                    # Mark as duplicate
                    bill.status = "duplicate"
                    bill.is_duplicate = True
                    bill.duplicate_of_id = duplicate_info["duplicate_id"]
                    bill.similarity_score = duplicate_info["similarity"]
                    print(
                        f"Bill {bill_id} is a duplicate of {duplicate_info['duplicate_id']} "
                        f"(similarity: {duplicate_info['similarity']:.3f})"
                    )
                else:
                    # Save extracted data
                    bill.status = "completed"
                    bill.vendor_name = extracted_data.vendor_name
                    bill.vendor_tax_number = extracted_data.vendor_tax_number
                    bill.bill_number = extracted_data.bill_number
                    
                    # Parse date
                    if extracted_data.bill_date:
                        bill.bill_date = self._parse_date(extracted_data.bill_date)
                    
                    bill.total_amount = extracted_data.total_amount
                    bill.currency = extracted_data.currency
                    
                    # Store line items as JSONB
                    bill.line_items = [item.model_dump() for item in extracted_data.line_items]
                    
                    # Store raw extraction
                    bill.raw_extraction = extracted_data.model_dump()
                    
                    # Store embedding for future duplicate checks
                    # Convert embedding list to proper format for pgvector
                    if isinstance(embedding, list):
                        bill.visual_fingerprint = embedding
                    else:
                        bill.visual_fingerprint = list(embedding)
                    
                    print(f"Bill {bill_id} processed successfully")
                
                bill.processed_at = datetime.utcnow()
                await session.commit()
                
            except Exception as e:
                # Mark as failed
                bill.status = "failed"
                bill.error_message = str(e)
                await session.commit()
                print(f"Error processing bill {bill_id}: {e}")
                raise

    async def _get_bill(
        self,
        session: AsyncSession,
        bill_id: UUID,
        company_id: UUID
    ) -> Optional[Bill]:
        """Fetch bill record with multi-tenant filtering."""
        result = await session.execute(
            select(Bill).where(
                Bill.id == bill_id,
                Bill.company_id == company_id  # Multi-tenant isolation
            )
        )
        return result.scalar_one_or_none()

    async def _check_duplicate(
        self,
        session: AsyncSession,
        company_id: UUID,
        embedding: list[float]
    ) -> dict:
        """
        Check for duplicate bills using pgvector cosine similarity.
        
        Multi-tenant: Only checks within the same company.
        
        Args:
            session: Database session
            company_id: Company UUID for tenant isolation
            embedding: 768-dim vector to compare
            
        Returns:
            Dictionary with duplicate detection results
        """
        # Use embedding directly as a list for pgvector
        # pgvector will handle the conversion
        
        # Find most similar bill using cosine similarity
        # Note: Lower cosine distance = higher similarity
        # Distance of 0 = identical, distance of 1 = orthogonal
        query = select(
            Bill.id,
            Bill.visual_fingerprint.cosine_distance(embedding).label("distance")
        ).where(
            Bill.company_id == company_id,  # Multi-tenant isolation
            Bill.status == "completed",  # Only compare to completed bills
            Bill.is_duplicate == False,  # Don't compare to duplicates
            Bill.visual_fingerprint.isnot(None)  # Must have embedding
        ).order_by(
            "distance"
        ).limit(1)
        
        result = await session.execute(query)
        row = result.first()
        
        if row:
            distance = row.distance
            similarity = 1.0 - distance  # Convert distance to similarity (0-1)
            
            if similarity >= self.duplicate_threshold:
                return {
                    "is_duplicate": True,
                    "duplicate_id": row.id,
                    "similarity": similarity
                }
        
        return {
            "is_duplicate": False,
            "duplicate_id": None,
            "similarity": 0.0
        }

    def _download_from_gcs(self, storage_path: str) -> bytes:
        """Download file from Google Cloud Storage."""
        blob = self.bucket.blob(storage_path)
        return blob.download_as_bytes()

    def _parse_date(self, date_str: str) -> Optional[datetime]:
        """Parse date from various formats."""
        formats = [
            "%Y-%m-%d",
            "%d/%m/%Y",
            "%d.%m.%Y",
            "%Y/%m/%d"
        ]
        
        for fmt in formats:
            try:
                return datetime.strptime(date_str, fmt)
            except ValueError:
                continue
        
        return None

    def message_callback(self, message: pubsub_v1.subscriber.message.Message) -> None:
        """
        Callback for Pub/Sub message processing.
        Runs async processing in a new event loop.
        """
        try:
            # Parse message
            data = json.loads(message.data.decode("utf-8"))
            message_data = BillUploadMessage(**data)
            
            print(f"Processing message for bill {message_data.bill_id}")
            
            # Run async processing
            asyncio.run(self.process_bill_message(message_data))
            
            # Acknowledge message
            message.ack()
            print(f"Message acknowledged for bill {message_data.bill_id}")
            
        except Exception as e:
            print(f"Error in message callback: {e}")
            # Don't ack - message will be redelivered
            message.nack()

    def start_listening(self) -> None:
        """
        Start listening to Pub/Sub subscription.
        Blocks until interrupted.
        """
        subscription_path = self.subscriber.subscription_path(
            self.project_id,
            self.subscription_name
        )
        
        print(f"Listening for messages on {subscription_path}...")
        
        # Configure flow control
        flow_control = pubsub_v1.types.FlowControl(
            max_messages=10,  # Process up to 10 bills concurrently
            max_bytes=10 * 1024 * 1024,  # 10 MB
        )
        
        streaming_pull_future = self.subscriber.subscribe(
            subscription_path,
            callback=self.message_callback,
            flow_control=flow_control
        )
        
        try:
            # Block until interrupted
            streaming_pull_future.result()
        except KeyboardInterrupt:
            streaming_pull_future.cancel()
            print("Worker stopped")


# Entry point for Cloud Run worker deployment
async def main():
    """Initialize database and start worker."""
    # Connect to database
    await db.connect()
    
    # Start processor
    processor = BillProcessor()
    processor.start_listening()


if __name__ == "__main__":
    asyncio.run(main())
