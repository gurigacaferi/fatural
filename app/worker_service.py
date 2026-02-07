"""
Cloud Run worker service - receives Pub/Sub push messages via HTTP.
Processes bill scanning requests asynchronously.
"""

import base64
import json
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException, status
from app.database import db
from app.worker import BillProcessor
from app.schemas import BillUploadMessage


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    print("🚀 Starting Fatural Worker Service...")
    try:
        await db.connect()
        print("✅ Database connected")
    except Exception as e:
        print(f"⚠️ Database connection failed: {e}")
    yield
    print("⏹️  Shutting down...")
    try:
        await db.disconnect()
        print("✅ Database disconnected")
    except Exception as e:
        print(f"⚠️ Error during shutdown: {e}")


# Initialize FastAPI app
app = FastAPI(
    title="Fatural Worker",
    description="Background worker for bill processing",
    version="1.0.0",
    lifespan=lifespan
)

# Initialize processor
processor = BillProcessor()


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "service": "Fatural Worker",
        "status": "running",
        "version": "1.0.0"
    }


@app.get("/health")
async def health():
    """Health check for Cloud Run."""
    return {"status": "healthy"}


@app.post("/")
async def pubsub_push(request: Request):
    """
    Endpoint for Pub/Sub push subscriptions.
    
    Pub/Sub sends messages in this format:
    {
        "message": {
            "data": "base64-encoded-data",
            "messageId": "...",
            "publishTime": "..."
        },
        "subscription": "..."
    }
    """
    try:
        # Parse Pub/Sub message
        envelope = await request.json()
        
        if "message" not in envelope:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid Pub/Sub message format"
            )
        
        # Decode message data
        pubsub_message = envelope["message"]
        data = base64.b64decode(pubsub_message["data"]).decode("utf-8")
        message_data = json.loads(data)
        
        print(f"📨 Received message: {message_data}")
        
        # Parse and process
        bill_message = BillUploadMessage(**message_data)
        await processor.process_bill_message(bill_message)
        
        print(f"✅ Processed bill {bill_message.bill_id}")
        
        # Return 200 to acknowledge message
        return {"status": "success", "bill_id": bill_message.bill_id}
        
    except Exception as e:
        print(f"❌ Error processing message: {e}")
        # Return 200 anyway to avoid redelivery of bad messages
        # In production, you might want to send to a dead-letter queue
        return {"status": "error", "error": str(e)}
