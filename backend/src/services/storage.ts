/**
 * Google Cloud Storage helpers – upload / download / signed URLs.
 */
import { Storage } from "@google-cloud/storage";

const bucketName = process.env.GCS_BUCKET_NAME || "fatural-bills";
let storage: Storage | null = null;

function getStorage(): Storage {
  if (!storage) {
    storage = new Storage({ projectId: process.env.GCP_PROJECT_ID });
  }
  return storage;
}

export async function uploadToGcs(
  path: string,
  data: Buffer,
  contentType: string
): Promise<void> {
  const bucket = getStorage().bucket(bucketName);
  const blob = bucket.file(path);
  await blob.save(data, { contentType, resumable: false });
}

export async function downloadFromGcs(path: string): Promise<Buffer> {
  const bucket = getStorage().bucket(bucketName);
  const [data] = await bucket.file(path).download();
  return data;
}

export async function getSignedUrl(path: string, expiresInSec = 900): Promise<string> {
  const bucket = getStorage().bucket(bucketName);
  const [url] = await bucket.file(path).getSignedUrl({
    action: "read",
    expires: Date.now() + expiresInSec * 1000,
  });
  return url;
}
