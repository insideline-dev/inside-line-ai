# AgentMail Integration Module

Email inbox management integration for Inside Line platform. Investors can connect their email inbox to receive startup pitches via email.

## Features

- Webhook handler for incoming email events
- Thread management (list, view, archive, delete)
- Attachment processing and storage
- Email notifications for new messages
- Priority detection for urgent emails
- HMAC-SHA256 signature validation for webhooks

## Endpoints

### Webhook (Public, signature-validated)
- `POST /integrations/agentmail/webhook` - Receive email events from AgentMail

### Email Management (Authenticated)
- `GET /integrations/agentmail/threads` - List email threads (paginated)
- `GET /integrations/agentmail/threads/:id` - Get thread details
- `POST /integrations/agentmail/threads/:id/archive` - Archive thread
- `DELETE /integrations/agentmail/threads/:id` - Delete thread

### Configuration (Authenticated)
- `GET /integrations/agentmail/config` - Get inbox config
- `POST /integrations/agentmail/config` - Save inbox config

## Environment Variables

```bash
AGENTMAIL_WEBHOOK_SECRET=your-secret-key
AGENTMAIL_API_KEY=your-api-key
```

## Webhook Flow

1. AgentMail sends POST to `/integrations/agentmail/webhook`
2. Validate webhook signature (reject if invalid)
3. Log event to `integration_webhooks` table
4. Parse email data (subject, body, attachments)
5. Create/update `email_threads` record
6. Download attachments to storage
7. Create notification for inbox owner
8. Return 200 OK

## Security

- Webhook requests validated with HMAC-SHA256 signature
- RLS policies: Users see only their own threads
- Rate limiting: 1000 webhooks/hour, 100 requests/min for authenticated endpoints

## Database Schema

### email_thread
- `id` - UUID primary key
- `userId` - Owner (investor)
- `threadId` - External AgentMail thread ID
- `subject` - Email subject
- `participants` - Array of email addresses
- `lastMessageAt` - Timestamp of last message
- `unreadCount` - Number of unread messages
- `createdAt` - Timestamp

### integration_webhook
- `id` - UUID primary key
- `source` - 'agentmail' | 'twilio'
- `eventType` - Event type (e.g., 'email.received')
- `payload` - Full webhook payload (JSONB)
- `processed` - Boolean flag
- `errorMessage` - Error message if processing failed
- `createdAt` - Timestamp

## Testing

Run tests:
```bash
bun test src/modules/integrations/agentmail/tests/
```

Coverage:
- AgentMailService: Webhook handling, thread management, config
- AttachmentService: Download, presigned URLs, pitch deck detection
- AgentMailController: All endpoints
- AgentMailSignatureGuard: Signature validation

## TODO (Future Enhancements)

- Implement config storage (agentmail_config table)
- AI analysis of pitch emails
- Auto-create startup from email
- Email templates for responses
- Spam detection
