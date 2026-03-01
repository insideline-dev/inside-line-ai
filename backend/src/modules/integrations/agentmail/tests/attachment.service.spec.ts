import { Test, TestingModule } from '@nestjs/testing';
import { AttachmentService } from '../attachment.service';
import { StorageService } from '../../../../storage/storage.service';
import { ASSET_TYPES } from '../../../../storage/storage.config';

describe('AttachmentService', () => {
  let service: AttachmentService;
  let storageService: Record<string, jest.Mock>;

  beforeEach(async () => {
    storageService = {
      uploadFromExternalUrl: jest.fn().mockResolvedValue({
        key: 'user-1/documents/abc123.pdf',
        publicUrl: 'https://cdn.example.com/user-1/documents/abc123.pdf',
      }),
      getDownloadUrl: jest.fn().mockResolvedValue('https://presigned.example.com/abc123.pdf'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentService,
        { provide: StorageService, useValue: storageService },
      ],
    }).compile();

    service = module.get<AttachmentService>(AttachmentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============ DOWNLOAD TESTS ============

  describe('downloadAttachment', () => {
    it('should download attachment from external URL', async () => {
      const result = await service.downloadAttachment(
        'user-1',
        'https://agentmail.com/attachments/123',
        'pitch_deck.pdf',
        'application/pdf',
      );

      expect(result).toBe('user-1/documents/abc123.pdf');
      expect(storageService.uploadFromExternalUrl).toHaveBeenCalledWith(
        'user-1',
        ASSET_TYPES.DOCUMENT,
        'https://agentmail.com/attachments/123',
        'application/pdf',
        undefined,
        { originalFilename: 'pitch_deck.pdf', source: 'agentmail' },
      );
    });

    it('should handle download errors', async () => {
      storageService.uploadFromExternalUrl.mockRejectedValueOnce(new Error('Download failed'));

      await expect(
        service.downloadAttachment(
          'user-1',
          'https://agentmail.com/attachments/123',
          'pitch_deck.pdf',
          'application/pdf',
        ),
      ).rejects.toThrow('Download failed');
    });
  });

  describe('downloadMultiple', () => {
    it('should download multiple attachments', async () => {
      const attachments = [
        { url: 'https://agentmail.com/attachments/1', filename: 'deck.pdf', content_type: 'application/pdf' },
        { url: 'https://agentmail.com/attachments/2', filename: 'financials.xlsx', content_type: 'application/vnd.ms-excel' },
      ];

      storageService.uploadFromExternalUrl
        .mockResolvedValueOnce({ key: 'key-1' })
        .mockResolvedValueOnce({ key: 'key-2' });

      const result = await service.downloadMultiple('user-1', attachments);

      expect(result).toEqual(['key-1', 'key-2']);
      expect(storageService.uploadFromExternalUrl).toHaveBeenCalledTimes(2);
    });

    it('should continue on individual download failures', async () => {
      const attachments = [
        { url: 'https://agentmail.com/attachments/1', filename: 'deck.pdf', content_type: 'application/pdf' },
        { url: 'https://agentmail.com/attachments/2', filename: 'financials.xlsx', content_type: 'application/vnd.ms-excel' },
      ];

      storageService.uploadFromExternalUrl
        .mockRejectedValueOnce(new Error('Download failed'))
        .mockResolvedValueOnce({ key: 'key-2' });

      const result = await service.downloadMultiple('user-1', attachments);

      expect(result).toEqual(['key-2']);
    });

    it('should handle empty attachments array', async () => {
      const result = await service.downloadMultiple('user-1', []);
      expect(result).toEqual([]);
      expect(storageService.uploadFromExternalUrl).not.toHaveBeenCalled();
    });
  });

  // ============ SDK DOWNLOAD TESTS ============

  describe('downloadFromSdk', () => {
    it('should download attachments via SDK', async () => {
      const mockClient = {
        getMessageAttachment: jest.fn().mockResolvedValue({ downloadUrl: 'https://example.com/att' }),
      };

      storageService.uploadFromExternalUrl.mockResolvedValueOnce({ key: 'key-1' });

      const attachments = [
        {
          attachmentId: 'att-1',
          filename: 'doc.pdf',
          content_type: 'application/pdf',
          inboxId: 'inbox-1',
          messageId: 'msg-1',
        },
      ];

      const result = await service.downloadFromSdk(
        'user-1',
        'inbox-1',
        'msg-1',
        attachments,
        mockClient as unknown,
      );

      expect(result).toEqual(['key-1']);
      expect(mockClient.getMessageAttachment).toHaveBeenCalledWith('inbox-1', 'msg-1', 'att-1');
    });

    it('should skip attachments without download URL', async () => {
      const mockClient = {
        getMessageAttachment: jest.fn().mockResolvedValue({}),
      };

      const attachments = [
        {
          attachmentId: 'att-1',
          filename: 'doc.pdf',
          content_type: 'application/pdf',
          inboxId: 'inbox-1',
          messageId: 'msg-1',
        },
      ];

      const result = await service.downloadFromSdk(
        'user-1',
        'inbox-1',
        'msg-1',
        attachments,
        mockClient as unknown,
      );

      expect(result).toEqual([]);
    });

    it('should work when downloadFromSdk interface does not have url field', async () => {
      const mockClient = {
        getMessageAttachment: jest.fn().mockResolvedValue({ downloadUrl: 'https://example.com/att' }),
      };

      storageService.uploadFromExternalUrl.mockResolvedValueOnce({ key: 'key-1' });

      const attachments = [
        {
          attachmentId: 'att-1',
          filename: 'doc.pdf',
          content_type: 'application/pdf',
          inboxId: 'inbox-1',
          messageId: 'msg-1',
        },
      ];

      const result = await service.downloadFromSdk(
        'user-1',
        'inbox-1',
        'msg-1',
        attachments,
        mockClient as unknown,
      );

      expect(result).toEqual(['key-1']);
      expect(storageService.uploadFromExternalUrl).toHaveBeenCalledWith(
        'user-1',
        expect.any(String),
        'https://example.com/att',
        'application/pdf',
        undefined,
        expect.objectContaining({ originalFilename: 'doc.pdf' }),
      );
    });

    it('should return empty keys array when all downloads fail', async () => {
      const mockClient = {
        getMessageAttachment: jest.fn().mockResolvedValue({ downloadUrl: 'https://example.com/att' }),
      };

      storageService.uploadFromExternalUrl.mockRejectedValue(new Error('Storage service unavailable'));

      const attachments = [
        {
          attachmentId: 'att-1',
          filename: 'doc.pdf',
          content_type: 'application/pdf',
          inboxId: 'inbox-1',
          messageId: 'msg-1',
        },
        {
          attachmentId: 'att-2',
          filename: 'doc2.pdf',
          content_type: 'application/pdf',
          inboxId: 'inbox-1',
          messageId: 'msg-1',
        },
      ];

      const result = await service.downloadFromSdk(
        'user-1',
        'inbox-1',
        'msg-1',
        attachments,
        mockClient as unknown,
      );

      expect(result).toEqual([]);
    });
  });

  // ============ PRESIGNED URL TESTS ============

  describe('getPresignedUrl', () => {
    it('should return presigned URL', async () => {
      const result = await service.getPresignedUrl('key-123');
      expect(result.url).toBe('https://presigned.example.com/abc123.pdf');
      expect(storageService.getDownloadUrl).toHaveBeenCalledWith('key-123', 3600);
    });

    it('should use custom expiry time', async () => {
      await service.getPresignedUrl('key-123', 7200);
      expect(storageService.getDownloadUrl).toHaveBeenCalledWith('key-123', 7200);
    });
  });

  // ============ PITCH DECK DETECTION ============

  describe('isPitchDeck', () => {
    it('should detect pitch deck PDF by filename', () => {
      expect(service.isPitchDeck('pitch_deck.pdf', 'application/pdf')).toBe(true);
      expect(service.isPitchDeck('Pitch Deck.pdf', 'application/pdf')).toBe(true);
      expect(service.isPitchDeck('investor_deck.pdf', 'application/pdf')).toBe(true);
    });

    it('should not detect non-pitch PDFs', () => {
      expect(service.isPitchDeck('invoice.pdf', 'application/pdf')).toBe(false);
    });

    it('should not detect non-PDF files', () => {
      expect(service.isPitchDeck('pitch_deck.docx', 'application/msword')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(service.isPitchDeck('PITCH_DECK.PDF', 'application/pdf')).toBe(true);
    });
  });
});
