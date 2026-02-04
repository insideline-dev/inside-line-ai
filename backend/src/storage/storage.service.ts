import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { R2Provider } from './providers/r2.provider';
import { StorageProvider } from './providers/storage-provider.interface';
import { MIME_TYPES, AssetType } from './storage.config';
import { nanoid } from 'nanoid';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private provider: StorageProvider;

  constructor(private config: ConfigService) {
    // Can be extended to support multiple providers
    const providerType = config.get('STORAGE_PROVIDER');
    this.logger.log(`Initializing storage with provider: ${providerType}`);

    switch (providerType) {
      case 'r2':
      case 's3':
      case 'backblaze':
      default:
        this.provider = new R2Provider(config);
    }
  }

  /**
   * Generate a storage key following convention:
   * {userId}/{projectId}/{assetType}/{id}.{ext}
   */
  generateKey(
    userId: string,
    assetType: AssetType,
    extension: string,
    projectId?: string,
  ): string {
    const id = nanoid(12);
    const basePath = projectId
      ? `${userId}/${projectId}/${assetType}`
      : `${userId}/${assetType}`;
    return `${basePath}/${id}.${extension}`;
  }

  /**
   * Get extension from mime type
   */
  getExtension(mimeType: string): string {
    return MIME_TYPES[mimeType as keyof typeof MIME_TYPES] ?? 'bin';
  }

  /**
   * Upload generated content (from AI providers)
   */
  async uploadGeneratedContent(
    userId: string,
    assetType: AssetType,
    content: Buffer,
    contentType: string,
    projectId?: string,
    metadata?: Record<string, string>,
  ) {
    const extension = this.getExtension(contentType);
    const key = this.generateKey(userId, assetType, extension, projectId);

    return this.provider.upload(key, content, {
      contentType,
      metadata: {
        ...metadata,
        userId,
        projectId: projectId ?? '',
        assetType,
      },
    });
  }

  /**
   * Upload from external URL (e.g., from Fal.ai result)
   */
  async uploadFromExternalUrl(
    userId: string,
    assetType: AssetType,
    sourceUrl: string,
    contentType: string,
    projectId?: string,
    metadata?: Record<string, string>,
  ) {
    const extension = this.getExtension(contentType);
    const key = this.generateKey(userId, assetType, extension, projectId);

    return this.provider.uploadFromUrl(key, sourceUrl, {
      contentType,
      metadata: {
        ...metadata,
        userId,
        projectId: projectId ?? '',
        assetType,
        sourceUrl,
      },
    });
  }

  /**
   * Get presigned URL for client upload
   */
  async getUploadUrl(
    userId: string,
    assetType: AssetType,
    contentType: string,
    projectId?: string,
  ) {
    const extension = this.getExtension(contentType);
    const key = this.generateKey(userId, assetType, extension, projectId);

    const { url } = await this.provider.getPresignedUploadUrl(key, {
      contentType,
    });

    return {
      uploadUrl: url,
      key,
      publicUrl: this.provider.getPublicUrl(key),
    };
  }

  /**
   * Get presigned download URL
   */
  async getDownloadUrl(key: string, expiresIn?: number) {
    return this.provider.getPresignedDownloadUrl(key, { expiresIn });
  }

  /**
   * Get public URL
   */
  getPublicUrl(key: string) {
    return this.provider.getPublicUrl(key);
  }

  /**
   * Delete asset
   */
  async delete(key: string) {
    return this.provider.delete(key);
  }

  /**
   * Delete multiple assets
   */
  async deleteMany(keys: string[]) {
    return this.provider.deleteMany(keys);
  }

  /**
   * Check if asset exists
   */
  async exists(key: string) {
    return this.provider.exists(key);
  }

  /**
   * Get asset metadata
   */
  async getMetadata(key: string) {
    return this.provider.getMetadata(key);
  }
}
