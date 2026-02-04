import { Injectable, Logger } from '@nestjs/common';
import { StorageService } from '../../../storage/storage.service';
import { ASSET_TYPES } from '../../../storage/storage.config';

@Injectable()
export class AttachmentService {
  private readonly logger = new Logger(AttachmentService.name);

  constructor(private storage: StorageService) {}

  async downloadAttachment(
    userId: string,
    url: string,
    filename: string,
    contentType: string,
  ): Promise<string> {
    try {
      this.logger.log(`Downloading attachment: ${filename} from ${url}`);

      const result = await this.storage.uploadFromExternalUrl(
        userId,
        ASSET_TYPES.DOCUMENT,
        url,
        contentType,
        undefined,
        { originalFilename: filename, source: 'agentmail' },
      );

      return result.key;
    } catch (error) {
      this.logger.error(`Failed to download attachment ${filename}`, error);
      throw error;
    }
  }

  async downloadMultiple(
    userId: string,
    attachments: Array<{ url: string; filename: string; content_type: string }>,
  ): Promise<string[]> {
    const keys: string[] = [];

    for (const attachment of attachments) {
      try {
        const key = await this.downloadAttachment(
          userId,
          attachment.url,
          attachment.filename,
          attachment.content_type,
        );
        keys.push(key);
      } catch (error) {
        this.logger.error(`Failed to download ${attachment.filename}, skipping`, error);
      }
    }

    return keys;
  }

  async getPresignedUrl(key: string, expiresIn = 3600): Promise<{ url: string }> {
    const url = await this.storage.getDownloadUrl(key, expiresIn);
    return { url };
  }

  isPitchDeck(filename: string, contentType: string): boolean {
    const lowerFilename = filename.toLowerCase();
    return (
      (contentType === 'application/pdf' || lowerFilename.endsWith('.pdf')) &&
      (lowerFilename.includes('pitch') || lowerFilename.includes('deck'))
    );
  }
}
