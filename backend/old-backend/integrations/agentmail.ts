import { AgentMailClient } from 'agentmail';
import { db } from '../db';
import { attachmentDownloads } from '@shared/schema';
import { eq } from 'drizzle-orm';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=agentmail',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || !connectionSettings.settings.api_key) {
    throw new Error('AgentMail not connected');
  }
  return { apiKey: connectionSettings.settings.api_key };
}

export async function getUncachableAgentMailClient() {
  const { apiKey } = await getCredentials();
  return new AgentMailClient({
    apiKey: apiKey
  });
}

export async function createInbox(username: string) {
  const client = await getUncachableAgentMailClient();
  const inbox = await client.inboxes.create({
    username: username,
    displayName: `InsideLine AI - ${username}`
  });
  return inbox;
}

export async function listInboxes() {
  const client = await getUncachableAgentMailClient();
  return client.inboxes.list();
}

export async function getInbox(inboxId: string) {
  const client = await getUncachableAgentMailClient();
  return client.inboxes.get(inboxId);
}

export async function listThreads(inboxId: string, limit = 50) {
  const client = await getUncachableAgentMailClient();
  return client.threads.list(inboxId, { limit });
}

export async function getThread(threadId: string) {
  const client = await getUncachableAgentMailClient();
  return client.threads.get(threadId);
}

export async function listMessages(inboxId: string, limit = 50) {
  const client = await getUncachableAgentMailClient();
  return client.inboxes.messages.list(inboxId, { limit });
}

export async function getMessage(inboxId: string, messageId: string) {
  const client = await getUncachableAgentMailClient();
  return client.inboxes.messages.get(inboxId, messageId);
}

export async function getFullMessage(inboxId: string, messageId: string): Promise<{
  from: string;
  subject: string;
  text?: string;
  html?: string;
  preview?: string;
  attachments: Array<{
    attachmentId: string;
    filename: string;
    contentType: string;
    size: number;
  }>;
}> {
  const client = await getUncachableAgentMailClient();
  const message = await client.inboxes.messages.get(inboxId, messageId);
  
  return {
    from: (message as any).from_ || (message as any).from || '',
    subject: (message as any).subject || '',
    text: (message as any).text,
    html: (message as any).html,
    preview: (message as any).preview,
    attachments: ((message as any).attachments || []).map((a: any) => ({
      attachmentId: a.attachment_id,
      filename: a.filename,
      contentType: a.content_type,
      size: a.size,
    })),
  };
}

export async function downloadAttachment(
  inboxId: string, 
  messageId: string, 
  attachmentId: string,
  knownFilename?: string,
  knownContentType?: string
): Promise<{
  content: Buffer;
  filename: string;
  contentType: string;
}> {
  console.log(`[AgentMail] ========== DOWNLOAD ATTACHMENT START ==========`);
  console.log(`[AgentMail] downloadAttachment called - inbox: ${inboxId}, message: ${messageId}, attachment: ${attachmentId}`);
  
  // Use SDK - it handles URL encoding internally
  let client;
  try {
    client = await getUncachableAgentMailClient();
    console.log(`[AgentMail] Got AgentMail client successfully`);
  } catch (err: any) {
    console.error(`[AgentMail] FAILED to get AgentMail client: ${err?.message}`);
    throw err;
  }
  
  console.log(`[AgentMail] Calling SDK getAttachment...`);
  
  let attachmentResponse: any;
  try {
    attachmentResponse = await client.inboxes.messages.getAttachment(inboxId, messageId, attachmentId);
    console.log(`[AgentMail] SDK getAttachment returned successfully`);
  } catch (err: any) {
    console.error(`[AgentMail] SDK getAttachment FAILED: ${err?.message}`);
    console.error(`[AgentMail] Error stack: ${err?.stack}`);
    throw err;
  }
  
  let content: Buffer;
  let filename = knownFilename || `attachment-${attachmentId}`;
  let contentType = knownContentType || 'application/octet-stream';
  
  // Log what the response looks like
  console.log(`[AgentMail] Response type: ${typeof attachmentResponse}`);
  console.log(`[AgentMail] Response constructor: ${attachmentResponse?.constructor?.name}`);
  console.log(`[AgentMail] Response keys: ${Object.keys(attachmentResponse || {}).join(', ')}`);
  
  // SDK may return either:
  // 1. A plain object with download_url, filename, content_type
  // 2. A Response-like stream object with arrayBuffer(), blob(), bytes() methods
  //    The stream contains JSON metadata with download_url (small ~700 bytes)
  
  let metadata: any = attachmentResponse;
  
  // Check if this is a Response-like stream object (has arrayBuffer() method but no download_url)
  let streamBinaryContent: Buffer | null = null;
  
  if (typeof attachmentResponse?.arrayBuffer === 'function' && !attachmentResponse?.download_url) {
    console.log(`[AgentMail] Response appears to be a stream/Response object with arrayBuffer(), reading content...`);
    try {
      const ab = await attachmentResponse.arrayBuffer();
      const bytes = Buffer.from(new Uint8Array(ab));
      console.log(`[AgentMail] Got ${bytes.length} bytes from arrayBuffer()`);
      
      // The SDK returns JSON metadata with download_url (typically ~700 bytes)
      // Try to parse as JSON first
      try {
        const textContent = bytes.toString('utf-8');
        console.log(`[AgentMail] Attempting to parse as JSON...`);
        metadata = JSON.parse(textContent);
        console.log(`[AgentMail] Successfully parsed JSON metadata`);
        console.log(`[AgentMail] Metadata keys: ${Object.keys(metadata || {}).join(', ')}`);
      } catch (parseErr: any) {
        // If JSON parsing fails, this might be actual binary content
        console.log(`[AgentMail] JSON parsing failed (${parseErr?.message}), treating as binary content`);
        streamBinaryContent = bytes;
      }
    } catch (abErr: any) {
      console.error(`[AgentMail] arrayBuffer() failed: ${abErr?.message}`);
      throw new Error('SDK returned stream that could not be read: ' + abErr?.message);
    }
  }
  
  // If we got binary content directly from stream, use it
  if (streamBinaryContent) {
    console.log(`[AgentMail] Using binary content read directly from stream (${streamBinaryContent.length} bytes)`);
    content = streamBinaryContent;
  } else {
    // Otherwise, extract download_url from metadata and fetch file
    const downloadUrl = metadata?.download_url || metadata?.downloadUrl || metadata?.url;
    
    if (!downloadUrl) {
      console.error(`[AgentMail] ERROR: No download_url found in SDK response!`);
      console.error(`[AgentMail] Metadata keys: ${Object.keys(metadata || {}).join(', ')}`);
      
      // Log full metadata to understand structure
      try {
        console.error(`[AgentMail] Full metadata:`, JSON.stringify(metadata, null, 2));
      } catch (e) {
        console.error(`[AgentMail] Could not stringify metadata`);
      }
      
      throw new Error('Cannot download attachment: SDK response missing download_url. Keys: ' + Object.keys(metadata || {}).join(', '));
    }
    
    // Extract filename/contentType from metadata
    if (metadata?.filename) {
      filename = metadata.filename;
    }
    if (metadata?.content_type || metadata?.contentType) {
      contentType = metadata.content_type || metadata.contentType;
    }
    
    // SAVE DOWNLOAD URL TO DATABASE BEFORE FETCHING
    console.log(`[AgentMail] Saving download URL to database before fetching...`);
    let downloadRecord: { id: number } | undefined;
    try {
      const [record] = await db.insert(attachmentDownloads).values({
        inboxId,
        messageId,
        attachmentId,
        filename,
        contentType,
        downloadUrl,
        status: 'pending',
      }).returning({ id: attachmentDownloads.id });
      downloadRecord = record;
      console.log(`[AgentMail] Saved download record ID: ${record.id}`);
    } catch (dbErr: any) {
      console.error(`[AgentMail] Failed to save download URL to database: ${dbErr?.message}`);
      // Continue anyway - don't block the download
    }
    
    // Update status to downloading
    if (downloadRecord) {
      try {
        await db.update(attachmentDownloads)
          .set({ status: 'downloading' })
          .where(eq(attachmentDownloads.id, downloadRecord.id));
      } catch (e) {}
    }
    
    // Fetch the actual file from download_url
    console.log(`[AgentMail] Found download_url, fetching actual file...`);
    console.log(`[AgentMail] URL: ${downloadUrl}`);
    
    let fileResponse: Response;
    try {
      fileResponse = await fetch(downloadUrl);
      
      if (!fileResponse.ok) {
        const errorMsg = `Failed to download file from URL: ${fileResponse.status} ${fileResponse.statusText}`;
        // Update DB with failure
        if (downloadRecord) {
          try {
            await db.update(attachmentDownloads)
              .set({ status: 'failed', errorMessage: errorMsg, completedAt: new Date() })
              .where(eq(attachmentDownloads.id, downloadRecord.id));
          } catch (e) {}
        }
        throw new Error(errorMsg);
      }
    } catch (fetchErr: any) {
      // Update DB with failure
      if (downloadRecord) {
        try {
          await db.update(attachmentDownloads)
            .set({ status: 'failed', errorMessage: fetchErr?.message, completedAt: new Date() })
            .where(eq(attachmentDownloads.id, downloadRecord.id));
        } catch (e) {}
      }
      throw fetchErr;
    }
    
    const arrayBuffer = await fileResponse.arrayBuffer();
    content = Buffer.from(new Uint8Array(arrayBuffer));
    console.log(`[AgentMail] Downloaded ${content.length} bytes from URL`);
    
    // Update DB with success
    if (downloadRecord) {
      try {
        await db.update(attachmentDownloads)
          .set({ status: 'completed', fileSize: content.length, completedAt: new Date() })
          .where(eq(attachmentDownloads.id, downloadRecord.id));
        console.log(`[AgentMail] Updated download record ${downloadRecord.id} as completed`);
      } catch (e) {}
    }
  }
  
  // Validate content
  if (!content || content.length === 0) {
    throw new Error('Downloaded attachment is empty (0 bytes)');
  }
  
  // Log first bytes to help diagnose content type issues
  const firstBytes = content.slice(0, 20);
  const firstBytesHex = firstBytes.toString('hex');
  const firstBytesStr = firstBytes.toString('utf8').replace(/[^\x20-\x7E]/g, '.');
  console.log(`[AgentMail] First 20 bytes (hex): ${firstBytesHex}`);
  console.log(`[AgentMail] First 20 bytes (ascii): ${firstBytesStr}`);
  
  // CRITICAL: Reject JSON content - this means we got metadata instead of the actual file!
  const firstChar = content.slice(0, 1).toString('utf8');
  if (firstChar === '{' || firstChar === '[') {
    const previewStr = content.slice(0, 200).toString('utf8');
    console.error(`[AgentMail] ERROR: Downloaded content is JSON, not binary file!`);
    console.error(`[AgentMail] Content preview: ${previewStr}`);
    throw new Error(`Downloaded content is JSON metadata, not the actual file. This usually means the download_url returned an error or the fetch failed. Preview: ${previewStr.slice(0, 100)}`);
  }
  
  // Check if it looks like a PDF (%PDF-) or other content
  const isPDF = content.slice(0, 5).toString('utf8') === '%PDF-';
  console.log(`[AgentMail] Looks like PDF: ${isPDF}`);
  
  if (isPDF) {
    console.log(`[AgentMail] Valid PDF magic bytes detected`);
  } else {
    console.warn(`[AgentMail] WARNING: Does not look like a PDF! Got: "${firstBytesStr.slice(0, 5)}"`);
  }
  
  console.log(`[AgentMail] ========== DOWNLOAD ATTACHMENT COMPLETE ==========`);
  console.log(`[AgentMail] SUMMARY:`);
  console.log(`[AgentMail]   - Filename: ${filename}`);
  console.log(`[AgentMail]   - Content-Type: ${contentType}`);
  console.log(`[AgentMail]   - Size: ${content.length} bytes`);
  console.log(`[AgentMail]   - Valid PDF: ${isPDF}`);
  console.log(`[AgentMail] ===================================================`);
  
  return { 
    content, 
    filename,
    contentType
  };
}

export async function sendEmail(params: {
  inboxId: string;
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  replyToMessageId?: string;
  attachments?: Array<{
    filename: string;
    content: string;
    contentType: string;
  }>;
}) {
  const client = await getUncachableAgentMailClient();
  
  const messageParams: any = {
    to: params.to.map(email => ({ email })),
    subject: params.subject,
  };
  
  if (params.text) messageParams.text = params.text;
  if (params.html) messageParams.html = params.html;
  if (params.replyToMessageId) messageParams.replyToMessageId = params.replyToMessageId;
  if (params.attachments) {
    messageParams.attachments = params.attachments.map(a => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    }));
  }
  
  return client.inboxes.messages.send(params.inboxId, messageParams);
}

export async function replyToEmail(params: {
  inboxId: string;
  messageId: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: string;
    contentType: string;
  }>;
}) {
  const client = await getUncachableAgentMailClient();
  
  const replyParams: any = {};
  if (params.text) replyParams.text = params.text;
  if (params.html) replyParams.html = params.html;
  if (params.attachments) {
    replyParams.attachments = params.attachments.map(a => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    }));
  }
  
  return client.inboxes.messages.reply(params.inboxId, params.messageId, replyParams);
}

export async function listWebhooks() {
  const client = await getUncachableAgentMailClient();
  return client.webhooks.list();
}

export async function createWebhook(url: string, eventTypes: string[] = ['message.received']) {
  const client = await getUncachableAgentMailClient();
  return client.webhooks.create({
    url,
    eventTypes: eventTypes as any
  });
}

export async function deleteWebhook(webhookId: string) {
  const client = await getUncachableAgentMailClient();
  return client.webhooks.delete(webhookId);
}

export async function configureWebhook(webhookUrl: string) {
  const client = await getUncachableAgentMailClient();
  
  try {
    // List existing webhooks
    const existingWebhooks = await client.webhooks.list();
    const webhooksList = existingWebhooks.data || [];
    
    // Check if webhook already exists with same URL
    const existingWebhook = webhooksList.find((w: any) => w.url === webhookUrl);
    if (existingWebhook) {
      console.log(`[AgentMail] Webhook already configured: ${webhookUrl}`);
      return { success: true, webhook: existingWebhook, action: 'existing' };
    }
    
    // Create new webhook for message.received events
    const webhook = await client.webhooks.create({
      url: webhookUrl,
      eventTypes: ['message.received'] as any
    });
    
    console.log(`[AgentMail] Webhook created: ${webhookUrl}`);
    return { success: true, webhook, action: 'created' };
  } catch (error) {
    console.error(`[AgentMail] Failed to configure webhook:`, error);
    return { success: false, error, action: 'failed' };
  }
}
