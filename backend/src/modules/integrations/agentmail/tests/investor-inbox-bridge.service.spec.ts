import { Test, TestingModule } from '@nestjs/testing';
import { DrizzleService } from '../../../../database';
import { NotificationService } from '../../../../notification/notification.service';
import { StartupIntakeService } from '../../../startup/startup-intake.service';
import { AttachmentService } from '../attachment.service';
import { InvestorInboxBridgeService } from '../investor-inbox-bridge.service';

describe('InvestorInboxBridgeService', () => {
  const createMockDrizzle = () => ({
    db: {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
    },
  });

  let service: InvestorInboxBridgeService;
  let drizzleService: ReturnType<typeof createMockDrizzle>;
  let notificationService: { create: jest.Mock };
  let startupIntake: { createStartup: jest.Mock; extractCompanyFromBody: jest.Mock; extractCompanyFromFilename: jest.Mock };
  let attachmentService: { isPitchDeck: jest.Mock; downloadFromSdk: jest.Mock };

  beforeEach(async () => {
    drizzleService = createMockDrizzle();
    notificationService = { create: jest.fn().mockResolvedValue({}) };
    startupIntake = {
      createStartup: jest.fn().mockResolvedValue({
        startupId: 'startup-1',
        startupName: 'Acme Ventures',
        isDuplicate: false,
        status: 'submitted',
      }),
      extractCompanyFromBody: jest.fn().mockReturnValue(null),
      extractCompanyFromFilename: jest.fn().mockReturnValue('Acme Ventures'),
    };
    attachmentService = {
      isPitchDeck: jest.fn((filename: string, contentType: string) =>
        contentType === 'application/pdf' && /pitch deck/i.test(filename),
      ),
      downloadFromSdk: jest.fn().mockResolvedValue(['storage/decks/acme-pitch-deck.pdf']),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvestorInboxBridgeService,
        { provide: DrizzleService, useValue: drizzleService },
        { provide: NotificationService, useValue: notificationService },
        { provide: StartupIntakeService, useValue: startupIntake },
        { provide: AttachmentService, useValue: attachmentService },
      ],
    }).compile();

    service = module.get<InvestorInboxBridgeService>(InvestorInboxBridgeService);
  });

  it('skips duplicate submissions for the same message', async () => {
    drizzleService.db.limit.mockResolvedValueOnce([
      {
        id: 'submission-1',
        status: 'pending',
      },
    ]);

    await service.evaluate({
      userId: 'user-1',
      threadId: 'thread-1',
      messageId: 'message-1',
      inboxId: 'inbox-1',
      subject: 'Intro + deck',
      bodyText: 'Please review the attached deck.',
      fromEmail: 'founder@acme.com',
      attachments: [
        {
          filename: 'Acme Pitch Deck.pdf',
          contentType: 'application/pdf',
          storageKey: 'storage/decks/acme-pitch-deck.pdf',
        },
      ],
    });

    expect(drizzleService.db.values).not.toHaveBeenCalled();
    expect(notificationService.create).not.toHaveBeenCalled();
  });

  it('puts the pitch deck storage key first so confirmation uses the correct file', async () => {
    await service.evaluate({
      userId: 'user-1',
      threadId: 'thread-1',
      messageId: 'message-1',
      inboxId: 'inbox-1',
      subject: 'Intro + deck',
      bodyText: 'Please review the attached deck.',
      fromEmail: 'founder@acme.com',
      attachments: [
        {
          filename: 'logo.png',
          contentType: 'image/png',
          storageKey: 'storage/logo.png',
        },
        {
          filename: 'Acme Pitch Deck.pdf',
          contentType: 'application/pdf',
          storageKey: 'storage/decks/acme-pitch-deck.pdf',
        },
      ],
    });

    expect(drizzleService.db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentKeys: ['storage/decks/acme-pitch-deck.pdf', 'storage/logo.png'],
      }),
    );
    expect(notificationService.create).toHaveBeenCalledWith(
      'user-1',
      'Potential startup submission detected',
      expect.stringContaining('Acme Ventures'),
      'info',
      '/integrations/agentmail/inbox-submissions',
    );
  });
});
