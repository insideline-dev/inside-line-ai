import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../../config/env.schema";
import { toEvolutionNumber } from "./evolution-phone.util";
import type { EvolutionInboundMessage, EvolutionTextSendResult } from "./evolution.types";

type EvolutionMediaBase64Response = {
  base64?: unknown;
  media?: unknown;
  mimetype?: unknown;
  mimeType?: unknown;
  data?: unknown;
};

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
    const response = await this.request<EvolutionMediaBase64Response>(
      `/chat/getBase64FromMediaMessage/${encodeURIComponent(this.getInstanceName())}`,
      {
        message: {
          key: payload.data?.key,
          message: payload.data?.message,
        },
        convertToMp4: options?.convertToMp4 ?? false,
      },
    );

    return {
      base64: this.extractBase64(response),
      mimetype: this.extractMimetype(response),
    };
  }

  isValidWebhookKey(receivedKey: string | undefined): boolean {
    const webhookSecret = this.config.get("EVOLUTION_WEBHOOK_SECRET", { infer: true });
    if (!webhookSecret) return true;
    return receivedKey === webhookSecret;
  }

  private extractBase64(response: EvolutionMediaBase64Response): string | null {
    if (typeof response.base64 === "string") return response.base64;
    if (typeof response.media === "string") return response.media;
    if (response.data && typeof response.data === "object") {
      const data = response.data as Record<string, unknown>;
      if (typeof data.base64 === "string") return data.base64;
      if (typeof data.media === "string") return data.media;
    }
    return null;
  }

  private extractMimetype(response: EvolutionMediaBase64Response): string | null {
    if (typeof response.mimetype === "string") return response.mimetype;
    if (typeof response.mimeType === "string") return response.mimeType;
    if (response.data && typeof response.data === "object") {
      const data = response.data as Record<string, unknown>;
      if (typeof data.mimetype === "string") return data.mimetype;
      if (typeof data.mimeType === "string") return data.mimeType;
    }
    return null;
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
