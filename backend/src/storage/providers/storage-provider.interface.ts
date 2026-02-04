export interface UploadOptions {
  contentType: string;
  metadata?: Record<string, string>;
  cacheControl?: string;
}

export interface PresignedUrlOptions {
  expiresIn?: number;
  contentType?: string;
}

export interface StorageMetadata {
  size: number;
  contentType: string;
  lastModified: Date;
  metadata?: Record<string, string>;
}

export interface StorageProvider {
  /**
   * Upload a file from buffer
   */
  upload(
    key: string,
    body: Buffer | Uint8Array | ReadableStream,
    options: UploadOptions,
  ): Promise<{ url: string; key: string }>;

  /**
   * Upload a file from URL (download and re-upload)
   */
  uploadFromUrl(
    key: string,
    sourceUrl: string,
    options?: Partial<UploadOptions>,
  ): Promise<{ url: string; key: string }>;

  /**
   * Generate presigned URL for client-side upload
   */
  getPresignedUploadUrl(
    key: string,
    options: PresignedUrlOptions,
  ): Promise<{ url: string; fields?: Record<string, string> }>;

  /**
   * Generate presigned URL for download
   */
  getPresignedDownloadUrl(
    key: string,
    options?: PresignedUrlOptions,
  ): Promise<string>;

  /**
   * Get public URL (if bucket is public or using CDN)
   */
  getPublicUrl(key: string): string;

  /**
   * Delete a file
   */
  delete(key: string): Promise<void>;

  /**
   * Delete multiple files
   */
  deleteMany(keys: string[]): Promise<void>;

  /**
   * Check if file exists
   */
  exists(key: string): Promise<boolean>;

  /**
   * Get file metadata (size, content-type, etc.)
   */
  getMetadata(key: string): Promise<StorageMetadata | null>;
}
