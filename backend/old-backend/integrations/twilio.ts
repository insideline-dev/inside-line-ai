import twilio from 'twilio';

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
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=twilio',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.account_sid || !connectionSettings.settings.api_key || !connectionSettings.settings.api_key_secret)) {
    throw new Error('Twilio not connected');
  }
  return {
    accountSid: connectionSettings.settings.account_sid,
    apiKey: connectionSettings.settings.api_key,
    apiKeySecret: connectionSettings.settings.api_key_secret,
    phoneNumber: connectionSettings.settings.phone_number
  };
}

export async function getTwilioClient() {
  const { accountSid, apiKey, apiKeySecret } = await getCredentials();
  return twilio(apiKey, apiKeySecret, {
    accountSid: accountSid
  });
}

export async function getTwilioFromPhoneNumber() {
  const { phoneNumber } = await getCredentials();
  return phoneNumber;
}

export async function sendWhatsAppMessage(params: {
  to: string;
  body: string;
  mediaUrl?: string[];
}) {
  const client = await getTwilioClient();
  const fromNumber = await getTwilioFromPhoneNumber();
  
  const messageParams: any = {
    from: `whatsapp:${fromNumber}`,
    to: `whatsapp:${params.to}`,
    body: params.body,
  };
  
  if (params.mediaUrl && params.mediaUrl.length > 0) {
    messageParams.mediaUrl = params.mediaUrl;
  }
  
  return client.messages.create(messageParams);
}

export async function validateTwilioWebhook(
  signature: string,
  url: string,
  params: Record<string, string>
): Promise<boolean> {
  // Note: Twilio webhook validation requires the Auth Token, not the API Key Secret.
  // The Replit Twilio connector provides API Key authentication, not Auth Token.
  // For full webhook security in production, you would need to:
  // 1. Store the Twilio Auth Token as a secret (TWILIO_AUTH_TOKEN)
  // 2. Use that token for validation
  
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.warn("TWILIO_AUTH_TOKEN not set - webhook validation skipped. Set this secret for production security.");
    return true; // Allow in development, but warn
  }
  
  try {
    return twilio.validateRequest(authToken, signature, url, params);
  } catch (error) {
    console.error("Error validating Twilio webhook:", error);
    return false;
  }
}

export async function getAccountSid(): Promise<string> {
  const { accountSid } = await getCredentials();
  return accountSid;
}
