from fastapi import FastAPI, UploadFile, File
import os
from google.cloud import storage
from google.cloud import pubsub_v1
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Get environment variables
PROJECT_ID = os.getenv("PROJECT_ID", "adept-ethos-483609-j4")
BUCKET_NAME = os.getenv("BUCKET_NAME", "bill-scanner-receipts-adept-ethos-483609-j4")
TOPIC_ID = os.getenv("TOPIC_ID", "bill-scanner-ocr-topic")

# Initialize clients
storage_client = storage.Client()
publisher = pubsub_v1.PublisherClient()
topic_path = publisher.topic_path(PROJECT_ID, TOPIC_ID)

@app.post("/upload/")
async def upload_file(file: UploadFile = File(...)):
    """
    Uploads a file to Google Cloud Storage and publishes a message to a Pub/Sub topic.
    """
    try:
        # Upload file to GCS
        bucket = storage_client.bucket(BUCKET_NAME)
        blob = bucket.blob(file.filename)
        blob.upload_from_file(file.file)
        logger.info(f"File {file.filename} uploaded to {BUCKET_NAME}.")

        # Publish message to Pub/Sub
        message_data = {"bucket": BUCKET_NAME, "name": file.filename}
        message_bytes = str(message_data).encode("utf-8")
        future = publisher.publish(topic_path, data=message_bytes)
        future.result()
        logger.info(f"Message published to {TOPIC_ID}.")

        return {"filename": file.filename, "status": "success"}
    except Exception as e:
        logger.error(f"An error occurred: {e}")
        return {"filename": file.filename, "status": "error", "error_message": str(e)}
