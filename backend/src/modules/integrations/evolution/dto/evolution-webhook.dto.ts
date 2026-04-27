import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const keySchema = z.object({
  id: z.string().optional(),
  remoteJid: z.string().optional(),
  fromMe: z.boolean().optional(),
});

const messageDataSchema = z.object({
  key: keySchema.optional(),
  pushName: z.string().optional(),
  message: z.record(z.string(), z.unknown()).optional(),
  messageType: z.string().optional(),
  messageTimestamp: z.number().optional(),
});

export const evolutionWebhookSchema = z.object({
  event: z.string(),
  instance: z.string(),
  data: messageDataSchema.optional(),
  apikey: z.string().optional(),
  server_url: z.string().optional(),
  date_time: z.string().optional(),
  sender: z.string().optional(),
});

export class EvolutionWebhookDto extends createZodDto(evolutionWebhookSchema) {}
