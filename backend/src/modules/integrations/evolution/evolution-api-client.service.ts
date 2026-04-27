import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../../config/env.schema";
import { toEvolutionNumber } from "./evolution-phone.util";
import type { EvolutionInboundMessage, EvolutionTextSendResult } from "./evolution.types";

@Injectable()
export class EvolutionApiClientService {
  private readonly logger = new Logger(EvolutionApiClientService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get("EVOLUTION_API_URL", { infer: true }) &&
        this.config.get("EVOLUTION_API_KEY", { infer: true }) &&
        this.config.get("EVOLUTION_INSTANCE_NAME", { infer: true }),
    );
  }

  getInstanceName(): string {
    const instanceName = this.config.get("EVOLUTION_INSTANCE_NAME", { infer: true });
    if (!instanceName) {
      throw new ServiceUnavailableException("Evolution instance name not configured");
    }
    return instanceName;
  }

  async sendText(params: { to: string; text: string }): Promise<EvolutionTextSendResult> {
    return this.request<EvolutionTextSendResult>(`/message/sendText/${encodeURIComponent(this.getInstanceName())}`, {
      number: toEvolutionNumber(params.to),
      text: params.text,
    });
  }

  async sendMedia(params: {
    to: string;
    media: string;
    fileName: string;
    mimeType: string;
    caption?: string;
  }): Promise<EvolutionTextSendResult> {
    return this.request<EvolutionTextSendResult>(`/message/sendMedia/${encodeURIComponent(this.getInstanceName())}`, {
      number: toEvolutionNumber(params.to),
      mediatype: this.toEvolutionMediaType(params.mimeType),
      mimetype: params.mimeType,
      caption: params.caption,
      media: params.media,
      fileName: params.fileName,
    });
  }

  async sendAudio(params: { to: string; audio: string }): Promise<EvolutionTextSendResult> {
    return this.request<EvolutionTextSendResult>(`/message/sendWhatsAppAudio/${encodeURIComponent(this.getInstanceName())}`, {
      number: toEvolutionNumber(params.to),
      audio: params.audio,
    });
  }

  async getMediaBase64(
    payload: EvolutionInboundMessage,
    options?: { convertToMp4?: boolean },
  ): Promise<{ base64: string | null; mimetype: string | null }> {
    const response = await this.request<{
      base64?: string;
      mimetype?: string;
      mediaType?: string;
    }>(`/chat/getBase64FromMediaMessage/${encodeURIComponent(this.getInstanceName())}`, {
      message: {
        key: {
          id: payload.data?.key?.id,
        },
      },
      convertToMp4: options?.convertToMp4 ?? false,
    });

    return {
      base64: response.base64 ?? null,
      mimetype: response.mimetype ?? null,
    };
  }

  isValidWebhookKey(receivedKey: string | undefined): boolean {
    if (!receivedKey) return false;
    const validKeys = [
      this.config.get("EVOLUTION_API_KEY", { infer: true }),
      this.config.get("EVOLUTION_INSTANCE_API_KEY", { infer: true }),
      this.config.get("EVOLUTION_WEBHOOK_SECRET", { infer: true }),
    ].filter((value): value is string => Boolean(value));
    return validKeys.includes(receivedKey);
  }

  private async request<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const apiUrl = this.config.get("EVOLUTION_API_URL", { infer: true });
    const apiKey = this.config.get("EVOLUTION_API_KEY", { infer: true });

    if (!apiUrl || !apiKey) {
      throw new ServiceUnavailableException("Evolution API not configured");
    }

    const response = await fetch(`${apiUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      this.logger.error(`Evolution request failed ${path}: ${response.status} ${text}`);
      throw new ServiceUnavailableException(`Evolution request failed: ${path}`);
    }

    return (await response.json()) as T;
  }

  private toEvolutionMediaType(mimeType: string): "image" | "document" | "video" {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    return "document";
  }
}
