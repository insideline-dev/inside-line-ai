import { Injectable, NotFoundException } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { dataRoom } from './entities/data-room.schema';
import { asset } from '../../storage/entities/asset.schema';
import { AssetService } from '../../storage/asset.service';
import { ASSET_TYPES } from '../../storage/storage.config';

@Injectable()
export class DataRoomService {
  constructor(
    private drizzle: DrizzleService,
    private assetService: AssetService,
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

    return this.uploadDocument(startupId, assetRecord.id, category);
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
