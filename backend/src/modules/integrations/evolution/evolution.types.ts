export type EvolutionMessageType =
  | "conversation"
  | "extendedTextMessage"
  | "imageMessage"
  | "documentMessage"
  | "audioMessage"
  | "videoMessage"
  | "stickerMessage"
  | "locationMessage"
  | "contactMessage"
  | "reactionMessage";

export interface EvolutionInboundMessage {
  event: string;
  instance: string;
  data?: {
    key?: {
      id?: string;
      remoteJid?: string;
      fromMe?: boolean;
    };
    pushName?: string;
    message?: Record<string, unknown>;
    messageType?: EvolutionMessageType | string;
    messageTimestamp?: number;
  };
  apikey?: string;
  server_url?: string;
  date_time?: string;
  sender?: string;
}

export interface EvolutionTextSendResult {
  key?: {
    id?: string;
    remoteJid?: string;
    fromMe?: boolean;
  };
  message?: unknown;
  status?: string;
}
