import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const InboxSubmissionResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  threadId: z.string(),
  messageId: z.string(),
  inboxId: z.string(),
  subject: z.string().nullable(),
  fromEmail: z.string(),
  suggestedCompanyName: z.string().nullable(),
  startupId: z.string().uuid().nullable(),
  status: z.string(),
  attachmentKeys: z.array(z.string()),
  createdAt: z.date(),
});

export class InboxSubmissionResponseDto extends createZodDto(InboxSubmissionResponseSchema) {}
