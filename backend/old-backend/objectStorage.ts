import { Storage } from "@google-cloud/storage";

const storage = new Storage();

const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID || "";
const bucket = storage.bucket(bucketId);

export async function getUploadUrl(filename: string, contentType: string): Promise<{ uploadURL: string; objectPath: string }> {
  const objectPath = `uploads/${Date.now()}-${filename}`;
  
  const [signedUrl] = await bucket.file(objectPath).getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    contentType,
  });
  
  return {
    uploadURL: signedUrl,
    objectPath: `objects/${objectPath}`,
  };
}

export async function getDownloadUrl(objectPath: string): Promise<string> {
  // Remove 'objects/' prefix if present
  const cleanPath = objectPath.replace(/^objects\//, "");
  
  const [signedUrl] = await bucket.file(cleanPath).getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + 60 * 60 * 1000, // 1 hour
  });
  
  return signedUrl;
}

export async function getFileContents(objectPath: string): Promise<Buffer> {
  const cleanPath = objectPath.replace(/^objects\//, "");
  const [contents] = await bucket.file(cleanPath).download();
  return contents;
}
