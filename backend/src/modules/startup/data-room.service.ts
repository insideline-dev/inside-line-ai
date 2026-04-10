import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { dataRoom } from './entities/data-room.schema';
import { asset } from '../../storage/entities/asset.schema';
import { AssetService } from '../../storage/asset.service';
import { StorageService } from '../../storage/storage.service';
import { ASSET_TYPES } from '../../storage/storage.config';
import { DocumentClassificationService } from '../ai/services/document-classification.service';
import { DocumentCategory } from '../ai/interfaces/document-classification.interface';

@Injectable()
export class DataRoomService {
  private readonly logger = new Logger(DataRoomService.name);

  constructor(
    private drizzle: DrizzleService,
    private assetService: AssetService,
    private storage: StorageService,
    private classificationService: DocumentClassificationService,
  ) {}

  async uploadDocument(startupId: string, assetId: string, category: string) {
    const [doc] = await this.drizzle.db
      .insert(dataRoom)
      .values({ startupId, assetId, category })
      .returning();
    return doc;
  }

  async uploadFile(
    startupId: string,
    userId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
    category: string,
  ) {
    const assetRecord = await this.assetService.uploadAndTrack(
      userId,
      ASSET_TYPES.DOCUMENT,
      file.buffer,
      file.mimetype,
      startupId,
      { originalName: file.originalname },
    );

    const doc = await this.uploadDocument(startupId, assetRecord.id, category);

    try {
      const result = await this.classificationService.classifySingleFile({
        path: assetRecord.key,
        name: file.originalname,
        type: file.mimetype,
      });

      const [updated] = await this.drizzle.db
        .update(dataRoom)
        .set({ category: result.category })
        .where(eq(dataRoom.id, doc.id))
        .returning();

      return updated ?? doc;
    } catch (error) {
      this.logger.warn(
        `[DataRoom] Auto-classification failed for "${file.originalname}": ${error instanceof Error ? error.message : String(error)} — keeping user-provided category "${category}"`,
      );
      return doc;
    }
  }

  /**
   * Register a pre-uploaded R2 object (e.g. from a presigned URL flow) into
   * the data room. Creates an asset row referencing the existing key, creates
   * a dataRoom entry, and triggers auto-classification.
   */
  async registerFile(params: {
    startupId: string;
    userId: string;
    path: string;
    name: string;
    type: string;
    size: number;
    category?: DocumentCategory;
  }) {
    const {
      startupId,
      userId,
      path,
      name,
      type,
      size,
      category = DocumentCategory.MISCELLANEOUS,
    } = params;

    // Reuse existing asset by key if already tracked to keep idempotency.
    const existing = await this.drizzle.db
      .select()
      .from(asset)
      .where(eq(asset.key, path))
      .limit(1);

    const assetRecord =
      existing[0] ??
      (
        await this.drizzle.db
          .insert(asset)
          .values({
            userId,
            projectId: startupId,
            key: path,
            url: this.storage.getPublicUrl(path),
            type: ASSET_TYPES.DOCUMENT,
            mimeType: type,
            size,
            metadata: { originalName: name },
          })
          .returning()
      )[0];

    // Avoid duplicate data room entries for the same asset+startup pair.
    const existingDoc = await this.drizzle.db
      .select()
      .from(dataRoom)
      .where(eq(dataRoom.assetId, assetRecord.id))
      .limit(1);

    const doc =
      existingDoc[0] ??
      (await this.uploadDocument(startupId, assetRecord.id, category));

    try {
      const result = await this.classificationService.classifySingleFile({
        path,
        name,
        type,
      });

      const [updated] = await this.drizzle.db
        .update(dataRoom)
        .set({ category: result.category })
        .where(eq(dataRoom.id, doc.id))
        .returning();

      return updated ?? doc;
    } catch (error) {
      this.logger.warn(
        `[DataRoom] Auto-classification failed for "${name}": ${error instanceof Error ? error.message : String(error)} — keeping category "${category}"`,
      );
      return doc;
    }
  }

  async registerFiles(
    startupId: string,
    userId: string,
    files: Array<{
      path: string;
      name: string;
      type: string;
      size: number;
      category?: DocumentCategory;
    }>,
  ) {
    const results = [] as Array<Awaited<ReturnType<typeof this.registerFile>>>;
    for (const file of files) {
      results.push(
        await this.registerFile({
          startupId,
          userId,
          ...file,
        }),
      );
    }
    return results;
  }

  async updateCategory(docId: string, category: DocumentCategory) {
    const [doc] = await this.drizzle.db
      .update(dataRoom)
      .set({ category })
      .where(eq(dataRoom.id, docId))
      .returning();

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    return doc;
  }

  async getDocuments(startupId: string) {
    return this.drizzle.db
      .select({
        id: dataRoom.id,
        startupId: dataRoom.startupId,
        assetId: dataRoom.assetId,
        category: dataRoom.category,
        visibleToInvestors: dataRoom.visibleToInvestors,
        uploadedAt: dataRoom.uploadedAt,
        assetUrl: asset.url,
        assetKey: asset.key,
        assetMimeType: asset.mimeType,
        assetSize: asset.size,
      })
      .from(dataRoom)
      .leftJoin(asset, eq(dataRoom.assetId, asset.id))
      .where(eq(dataRoom.startupId, startupId))
      .orderBy(desc(dataRoom.uploadedAt));
  }

  async updatePermissions(docId: string, investorIds: string[]) {
    const [doc] = await this.drizzle.db
      .update(dataRoom)
      .set({ visibleToInvestors: investorIds })
      .where(eq(dataRoom.id, docId))
      .returning();

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    return doc;
  }

  async deleteDocument(docId: string) {
    const [doc] = await this.drizzle.db
      .delete(dataRoom)
      .where(eq(dataRoom.id, docId))
      .returning({ id: dataRoom.id });

    if (!doc) {
      throw new NotFoundException('Document not found');
    }
  }
}
