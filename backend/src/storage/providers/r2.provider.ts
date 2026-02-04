import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import {
  StorageProvider,
  UploadOptions,
  PresignedUrlOptions,
  StorageMetadata,
} from './storage-provider.interface';
import { PRESIGNED_URL_EXPIRY } from '../storage.config';

@Injectable()
export class R2Provider implements StorageProvider {
  private client: S3Client;
  private bucket: string;
  private publicUrl?: string;

  constructor(private config: ConfigService) {
    this.client = new S3Client({
      region: config.get('STORAGE_REGION'),
      endpoint: config.get('STORAGE_ENDPOINT'),
      credentials: {
        accessKeyId: config.get('STORAGE_ACCESS_KEY_ID')!,
        secretAccessKey: config.get('STORAGE_SECRET_ACCESS_KEY')!,
      },
    });
    this.bucket = config.get('STORAGE_BUCKET')!;
    this.publicUrl = config.get('STORAGE_PUBLIC_URL');
  }

  async upload(
    key: string,
    body: Buffer | Uint8Array | ReadableStream,
    options: UploadOptions,
  ) {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: options.contentType,
        Metadata: options.metadata,
        CacheControl: options.cacheControl ?? 'public, max-age=31536000',
      },
    });

    await upload.done();

    return {
      url: this.getPublicUrl(key),
      key,
    };
  }

  async uploadFromUrl(
    key: string,
    sourceUrl: string,
    options?: Partial<UploadOptions>,
  ) {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch source: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType =
      options?.contentType ??
      response.headers.get('content-type') ??
      'application/octet-stream';

    return this.upload(key, buffer, {
      contentType,
      ...options,
    });
  }

  async getPresignedUploadUrl(key: string, options: PresignedUrlOptions) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: options.contentType,
    });

    const url = await getSignedUrl(this.client, command, {
      expiresIn: options.expiresIn ?? PRESIGNED_URL_EXPIRY.UPLOAD,
    });

    return { url };
  }

  async getPresignedDownloadUrl(key: string, options?: PresignedUrlOptions) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: options?.expiresIn ?? PRESIGNED_URL_EXPIRY.DOWNLOAD,
    });
  }

  getPublicUrl(key: string): string {
    if (this.publicUrl) {
      return `${this.publicUrl}/${key}`;
    }
    // Fallback to endpoint URL
    const endpoint = this.config.get('STORAGE_ENDPOINT');
    return `${endpoint}/${this.bucket}/${key}`;
  }

  async delete(key: string) {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async deleteMany(keys: string[]) {
    if (keys.length === 0) return;

    // R2/S3 allows max 1000 keys per request
    const chunks = this.chunkArray(keys, 1000);

    for (const chunk of chunks) {
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: chunk.map((key) => ({ Key: key })),
          },
        }),
      );
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async getMetadata(key: string): Promise<StorageMetadata | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      return {
        size: response.ContentLength ?? 0,
        contentType: response.ContentType ?? 'application/octet-stream',
        lastModified: response.LastModified ?? new Date(),
        metadata: response.Metadata,
      };
    } catch {
      return null;
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
