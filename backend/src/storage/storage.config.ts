// Asset type constants for storage path organization
export const ASSET_TYPES = {
  AUDIO: 'audio',
  IMAGE: 'images',
  VIDEO: 'videos',
  TRANSCRIPT: 'transcripts',
  TEMP: 'temp',
} as const;

export type AssetType = (typeof ASSET_TYPES)[keyof typeof ASSET_TYPES];

// MIME type to file extension mapping
export const MIME_TYPES = {
  // Audio
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  // Images
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  // Video
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  // Data
  'application/json': 'json',
} as const;

// Presigned URL expiry times in seconds
export const PRESIGNED_URL_EXPIRY = {
  UPLOAD: 3600, // 1 hour for uploads
  DOWNLOAD: 86400, // 24 hours for downloads
} as const;

// Maximum file sizes in bytes
export const MAX_FILE_SIZES = {
  AUDIO: 100 * 1024 * 1024, // 100MB
  IMAGE: 20 * 1024 * 1024, // 20MB
  VIDEO: 500 * 1024 * 1024, // 500MB
  TRANSCRIPT: 10 * 1024 * 1024, // 10MB
} as const;
