import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DrizzleService } from '../database';
import { StorageService } from './storage.service';
import { asset, Asset } from './entities/asset.schema';
import { eq, and } from 'drizzle-orm';
import { AssetType } from './storage.config';

@Injectable()
export class AssetService {
  private readonly logger = new Logger(AssetService.name);

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Upload content and track it in the database
   * Note: This is an internal operation, RLS not needed as userId comes from trusted source
   */
  async uploadAndTrack(
    userId: string,
    assetType: AssetType,
    content: Buffer,
    contentType: string,
    projectId?: string,
    metadata?: Record<string, string>,
  ): Promise<Asset> {
    const { url, key } = await this.storage.uploadGeneratedContent(
      userId,
      assetType,
      content,
      contentType,
      projectId,
      metadata,
    );

    const [newAsset] = await this.drizzle.db
      .insert(asset)
      .values({
        userId,
        projectId,
        key,
        url,
        type: assetType,
        mimeType: contentType,
        size: content.length,
        metadata: metadata ?? {},
      })
      .returning();

    return newAsset;
  }

  /**
   * Upload from external URL and track it in the database
   * Note: This is an internal operation, RLS not needed as userId comes from trusted source
   */
  async uploadFromUrlAndTrack(
    userId: string,
    assetType: AssetType,
    sourceUrl: string,
    contentType: string,
    projectId?: string,
    metadata?: Record<string, string>,
  ): Promise<Asset> {
    const { url, key } = await this.storage.uploadFromExternalUrl(
      userId,
      assetType,
      sourceUrl,
      contentType,
      projectId,
      metadata,
    );

    const storageMeta = await this.storage.getMetadata(key);

    const [newAsset] = await this.drizzle.db
      .insert(asset)
      .values({
        userId,
        projectId,
        key,
        url,
        type: assetType,
        mimeType: contentType,
        size: storageMeta?.size ?? 0,
        provider: metadata?.provider,
        metadata: {
          ...metadata,
          sourceUrl,
        },
      })
      .returning();

    return newAsset;
  }

  /**
   * Delete an asset from both DB and R2 (with RLS protection)
   */
  async deleteAsset(id: string, userId: string): Promise<void> {
    const existingAsset = await this.drizzle.withRLS(userId, async (db) => {
      const [row] = await db
        .select()
        .from(asset)
        .where(and(eq(asset.id, id), eq(asset.userId, userId)));
      return row;
    });

    if (!existingAsset) {
      throw new NotFoundException(`Asset ${id} not found`);
    }

    this.logger.log(
      `Deleting asset ${id} (key: ${existingAsset.key}) from DB and R2`,
    );

    // 1. Delete from R2 first
    try {
      await this.storage.delete(existingAsset.key);
    } catch (error) {
      // We log but continue to delete from DB to keep them in sync
      this.logger.error(
        `Failed to delete file from R2 for asset ${id}: ${error}`,
      );
    }

    // 2. Delete from DB (with RLS)
    await this.drizzle.withRLS(userId, async (db) => {
      await db
        .delete(asset)
        .where(and(eq(asset.id, id), eq(asset.userId, userId)));
    });
  }

  /**
   * Get asset by ID (with RLS protection)
   */
  async getAsset(id: string, userId: string): Promise<Asset> {
    const existingAsset = await this.drizzle.withRLS(userId, async (db) => {
      const [row] = await db
        .select()
        .from(asset)
        .where(and(eq(asset.id, id), eq(asset.userId, userId)));
      return row;
    });

    if (!existingAsset) {
      throw new NotFoundException(`Asset ${id} not found`);
    }

    return existingAsset;
  }

  /**
   * List assets for a user (with RLS protection)
   */
  async listAssets(userId: string, projectId?: string): Promise<Asset[]> {
    return this.drizzle.withRLS(userId, async (db) => {
      if (projectId) {
        return db
          .select()
          .from(asset)
          .where(and(eq(asset.userId, userId), eq(asset.projectId, projectId)));
      }

      return db.select().from(asset).where(eq(asset.userId, userId));
    });
  }
}
