/**
 * Google Cloud Pub/Sub – publish messages for async bill processing.
 */
import { PubSub } from "@google-cloud/pubsub";

const projectId = process.env.GCP_PROJECT_ID;
const topicName = process.env.PUBSUB_TOPIC || "bill-upload";

let pubsub: PubSub | null = null;

function getClient(): PubSub {
  if (!pubsub) {
    pubsub = new PubSub({ projectId });
  }
  return pubsub;
}

export interface BillUploadMessage {
  billId: string;
  companyId: string;
  userId: string;
  storagePath: string;
  mimeType: string;
  uploadedAt: string;
}

/**
 * Publish a bill-upload message so the worker picks it up.
 */
export async function publishBillUpload(msg: BillUploadMessage): Promise<string> {
  const client = getClient();
  const topic = client.topic(topicName);
  const dataBuffer = Buffer.from(JSON.stringify(msg));
  const messageId = await topic.publishMessage({ data: dataBuffer });
  console.log(`Published message ${messageId} for bill ${msg.billId}`);
  return messageId;
}
