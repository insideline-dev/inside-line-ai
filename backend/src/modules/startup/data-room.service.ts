import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq, desc, and } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { dataRoom } from './entities/data-room.schema';
import { startup } from './entities/startup.schema';
import { asset } from '../../storage/entities/asset.schema';
import { AssetService } from '../../storage/asset.service';
import { StorageService } from '../../storage/storage.service';
import { ASSET_TYPES } from '../../storage/storage.config';
import { DocumentClassificationService } from '../ai/services/document-classification.service';
import { DocumentCategory } from '../ai/interfaces/document-classification.interface';
import { NotificationGateway } from '../../notification/notification.gateway';

export type ClassificationStatus = 'pending' | 'classifying' | 'completed' | 'failed';

export interface ReclassifyFileEvent {
  dataRoomId: string;
  fileName: string;
}

export interface ReclassifyFileResult extends ReclassifyFileEvent {
  category: DocumentCategory;
  confidence: number;
  routedAgents: string[];
}

export interface ReclassifyFileError extends ReclassifyFileEvent {
  error: string;
}

export interface ReclassifyProgressCallbacks {
  onFileStart?: (event: ReclassifyFileEvent) => void;
  onFileSuccess?: (event: ReclassifyFileResult) => void;
  onFileFailure?: (event: ReclassifyFileError) => void;
}

export interface DataRoomRow {
  id: string;
  startupId: string;
  assetId: string;
  category: string;
  classificationStatus: ClassificationStatus;
  classificationConfidence: string | null;
  routedAgents: string[] | null;
  classificationError: string | null;
  classifiedAt: Date | null;
  visibleToInvestors: string[] | null;
  uploadedAt: Date;
}

@Injectable()
export class DataRoomService {
  private readonly logger = new Logger(DataRoomService.name);

  constructor(
    private drizzle: DrizzleService,
    private assetService: AssetService,
    private storage: StorageService,
    private classificationService: DocumentClassificationService,
    private notificationGateway: NotificationGateway,
  ) {}

  private async resolveOwnerId(startupId: string): Promise<string | null> {
    const [row] = await this.drizzle.db
      .select({ userId: startup.userId })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);
    return row?.userId ?? null;
  }

  private emit<E extends 'document:classifying' | 'document:classified' | 'document:classification_failed'>(
    userId: string | null,
    event: E,
    payload: Parameters<NotificationGateway['sendPipelineEvent']>[2] & { startupId: string },
  ): void {
    if (!userId) return;
    this.notificationGateway.sendPipelineEvent(userId, event, payload as never);
  }

  async uploadDocument(startupId: string, assetId: string, category: string) {
    const [doc] = await this.drizzle.db
      .insert(dataRoom)
      .values({
        startupId,
        assetId,
        category,
        classificationStatus: 'pending',
      })
      .returning();
    return doc as DataRoomRow;
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

    return this.runClassification(doc, {
      path: assetRecord.key,
      name: file.originalname,
      type: file.mimetype,
    });
  }

  /**
   * Register a pre-uploaded R2 object (e.g. from a presigned URL flow) into
   * the data room. Creates an asset row referencing the existing key, creates
   * a dataRoom entry, and triggers LLM classification.
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

    const existingDoc = await this.drizzle.db
      .select()
      .from(dataRoom)
      .where(eq(dataRoom.assetId, assetRecord.id))
      .limit(1);

    const doc =
      (existingDoc[0] as DataRoomRow | undefined) ??
      (await this.uploadDocument(startupId, assetRecord.id, category));

    return this.runClassification(doc, { path, name, type });
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
    const results: DataRoomRow[] = [];
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

  /**
   * Re-classify every data-room file for a startup. Used by pipeline re-runs so
   * agent routing reflects any schema/prompt changes. Processes files in batches
   * of 5 to stay below rate limits while finishing quickly.
   *
   * Pass `options.onlyPending = true` to skip rows that are already
   * successfully classified. This lets the pipeline CLASSIFICATION phase no-op
   * when Clara's intake flow has already classified everything inline.
   *
   * Note: explicit pipeline re-runs from the CLASSIFICATION phase should call
   * this without `onlyPending` (the default) to get a fresh classification.
   */
  async reclassifyAll(
    startupId: string,
    callbacks?: ReclassifyProgressCallbacks,
    options: { onlyPending?: boolean } = {},
  ): Promise<DataRoomRow[]> {
    const allRows = await this.drizzle.db
      .select({
        id: dataRoom.id,
        startupId: dataRoom.startupId,
        assetId: dataRoom.assetId,
        category: dataRoom.category,
        classificationStatus: dataRoom.classificationStatus,
        classificationConfidence: dataRoom.classificationConfidence,
        routedAgents: dataRoom.routedAgents,
        classificationError: dataRoom.classificationError,
        classifiedAt: dataRoom.classifiedAt,
        visibleToInvestors: dataRoom.visibleToInvestors,
        uploadedAt: dataRoom.uploadedAt,
        assetKey: asset.key,
        assetName: asset.metadata,
        assetMimeType: asset.mimeType,
      })
      .from(dataRoom)
      .leftJoin(asset, eq(dataRoom.assetId, asset.id))
      .where(eq(dataRoom.startupId, startupId));

    if (allRows.length === 0) {
      const migrated = await this.migrateStartupFilesToDataRoom(startupId);
      if (migrated === 0) return [];
      return this.reclassifyAll(startupId, callbacks, options);
    }

    const toDataRoomRow = (row: (typeof allRows)[number]): DataRoomRow => ({
      id: row.id,
      startupId: row.startupId,
      assetId: row.assetId,
      category: row.category,
      classificationStatus: row.classificationStatus,
      classificationConfidence: row.classificationConfidence,
      routedAgents: row.routedAgents,
      classificationError: row.classificationError,
      classifiedAt: row.classifiedAt,
      visibleToInvestors: row.visibleToInvestors,
      uploadedAt: row.uploadedAt,
    });

    const rowsToClassify = options.onlyPending
      ? allRows.filter((row) => row.classificationStatus !== 'completed')
      : allRows;

    if (rowsToClassify.length === 0) {
      this.logger.log(
        `[DataRoom] Skipping classification for startup ${startupId} — all ${allRows.length} files already classified`,
      );
      return allRows.map(toDataRoomRow);
    }

    this.logger.log(
      `[DataRoom] Classifying ${rowsToClassify.length}/${allRows.length} files for startup ${startupId}${options.onlyPending ? ' (pending only)' : ''}`,
    );

    const freshResults: DataRoomRow[] = [];
    const batchSize = 5;

    for (let i = 0; i < rowsToClassify.length; i += batchSize) {
      const batch = rowsToClassify.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((row) => {
          const metadata = (row.assetName ?? {}) as { originalName?: string };
          const fileName = metadata.originalName ?? row.assetKey ?? 'unknown';
          return this.runClassification(
            toDataRoomRow(row),
            {
              path: row.assetKey ?? '',
              name: fileName,
              type: row.assetMimeType ?? 'application/octet-stream',
            },
            callbacks,
          );
        }),
      );
      freshResults.push(...batchResults);
    }

    const freshById = new Map(freshResults.map((row) => [row.id, row]));
    const mergedResults: DataRoomRow[] = allRows.map(
      (row) => freshById.get(row.id) ?? toDataRoomRow(row),
    );

    // When ≤2 docs total, override routing so every doc goes to all agents —
    // agents need whatever context is available when there's barely any data.
    // Applied based on the full merged set so re-classifying a subset still
    // keeps routing consistent.
    if (mergedResults.length > 0 && mergedResults.length <= 2) {
      const allAgents = this.classificationService.getAllAgentKeys();
      for (const row of mergedResults) {
        if (row.classificationStatus === 'completed') {
          await this.drizzle.db
            .update(dataRoom)
            .set({ routedAgents: allAgents })
            .where(eq(dataRoom.id, row.id));
          row.routedAgents = allAgents;
        }
      }
    }

    return mergedResults;
  }

  /**
   * Gracefully migrates legacy startup.files (JSONB) into the data_rooms table.
   * Called when reclassifyAll finds zero data_room rows for a startup that may
   * have files from pre-data-room submission paths (admin, Clara, investor).
   * Returns the count of files migrated.
   */
  private async migrateStartupFilesToDataRoom(startupId: string): Promise<number> {
    const [record] = await this.drizzle.db
      .select({ userId: startup.userId, files: startup.files })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    const files = (record?.files ?? []) as Array<{ path: string; name: string; type: string }>;
    if (files.length === 0) return 0;

    const userId = record?.userId ?? startupId;
    this.logger.log(
      `[DataRoom] Migrating ${files.length} legacy startup.files → data_rooms for startup ${startupId}`,
    );

    for (const file of files) {
      try {
        await this.registerFile({
          startupId,
          userId,
          path: file.path,
          name: file.name,
          type: file.type,
          size: 0,
        });
      } catch (error) {
        this.logger.warn(
          `[DataRoom] Failed to migrate file "${file.name}" for startup ${startupId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return files.length;
  }

  private async runClassification(
    doc: DataRoomRow,
    file: { path: string; name: string; type: string },
    callbacks?: ReclassifyProgressCallbacks,
  ): Promise<DataRoomRow> {
    const ownerId = await this.resolveOwnerId(doc.startupId);

    await this.drizzle.db
      .update(dataRoom)
      .set({ classificationStatus: 'classifying', classificationError: null })
      .where(eq(dataRoom.id, doc.id));

    this.emit(ownerId, 'document:classifying', {
      startupId: doc.startupId,
      dataRoomId: doc.id,
      fileName: file.name,
    });
    callbacks?.onFileStart?.({ dataRoomId: doc.id, fileName: file.name });

    try {
      const result = await this.classificationService.classifySingleFile(file);

      const [updated] = await this.drizzle.db
        .update(dataRoom)
        .set({
          category: result.category,
          classificationStatus: 'completed',
          classificationConfidence: result.confidence.toFixed(3),
          routedAgents: result.routedAgents,
          classificationError: null,
          classifiedAt: new Date(),
        })
        .where(eq(dataRoom.id, doc.id))
        .returning();

      this.emit(ownerId, 'document:classified', {
        startupId: doc.startupId,
        dataRoomId: doc.id,
        fileName: file.name,
        category: result.category,
        confidence: result.confidence,
        routedAgents: result.routedAgents,
      });
      callbacks?.onFileSuccess?.({
        dataRoomId: doc.id,
        fileName: file.name,
        category: result.category,
        confidence: result.confidence,
        routedAgents: result.routedAgents,
      });

      return (updated as DataRoomRow) ?? doc;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[DataRoom] Classification failed for "${file.name}": ${message}`);

      const [updated] = await this.drizzle.db
        .update(dataRoom)
        .set({
          classificationStatus: 'failed',
          classificationError: message,
          classifiedAt: new Date(),
        })
        .where(eq(dataRoom.id, doc.id))
        .returning();

      this.emit(ownerId, 'document:classification_failed', {
        startupId: doc.startupId,
        dataRoomId: doc.id,
        fileName: file.name,
        error: message,
      });
      callbacks?.onFileFailure?.({
        dataRoomId: doc.id,
        fileName: file.name,
        error: message,
      });

      return (updated as DataRoomRow) ?? doc;
    }
  }

  async syncCategoryByAssetKey(
    startupId: string,
    assetKey: string,
    category: string,
  ): Promise<void> {
    const rows = await this.drizzle.db
      .select({ id: dataRoom.id })
      .from(dataRoom)
      .leftJoin(asset, eq(dataRoom.assetId, asset.id))
      .where(and(eq(dataRoom.startupId, startupId), eq(asset.key, assetKey)))
      .limit(1);

    if (rows.length === 0) return;

    await this.drizzle.db
      .update(dataRoom)
      .set({
        category,
        routedAgents: this.classificationService.getRoutedAgents(category as DocumentCategory),
      })
      .where(eq(dataRoom.id, rows[0].id));
  }

  async updateCategory(docId: string, category: DocumentCategory) {
    const [doc] = await this.drizzle.db
      .update(dataRoom)
      .set({
        category,
        routedAgents: this.classificationService.getRoutedAgents(category),
      })
      .where(eq(dataRoom.id, docId))
      .returning();

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    return doc;
  }

  async getDocumentsWithMigration(startupId: string) {
    const docs = await this.getDocuments(startupId);
    if (docs.length === 0) {
      const migrated = await this.migrateStartupFilesToDataRoom(startupId);
      if (migrated > 0) {
        return this.getDocuments(startupId);
      }
    }
    return docs;
  }

  async getDocuments(startupId: string) {
    const docs = await this.drizzle.db
      .select({
        id: dataRoom.id,
        startupId: dataRoom.startupId,
        assetId: dataRoom.assetId,
        category: dataRoom.category,
        classificationStatus: dataRoom.classificationStatus,
        classificationConfidence: dataRoom.classificationConfidence,
        routedAgents: dataRoom.routedAgents,
        classificationError: dataRoom.classificationError,
        classifiedAt: dataRoom.classifiedAt,
        visibleToInvestors: dataRoom.visibleToInvestors,
        uploadedAt: dataRoom.uploadedAt,
        assetUrl: asset.url,
        assetKey: asset.key,
        assetMimeType: asset.mimeType,
        assetSize: asset.size,
        assetMetadata: asset.metadata,
      })
      .from(dataRoom)
      .leftJoin(asset, eq(dataRoom.assetId, asset.id))
      .where(eq(dataRoom.startupId, startupId))
      .orderBy(desc(dataRoom.uploadedAt));

    return docs.map((doc) => {
      const metadata = (doc.assetMetadata ?? {}) as { originalName?: string };
      return {
        ...doc,
        originalFileName: metadata.originalName ?? null,
      };
    });
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
