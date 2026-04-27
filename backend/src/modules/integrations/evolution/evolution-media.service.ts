import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { AssetService } from "../../../storage/asset.service";
import { ASSET_TYPES } from "../../../storage/storage.config";
import type { AttachmentMeta } from "../../clara/interfaces/clara.interface";
import { EvolutionApiClientService } from "./evolution-api-client.service";
import type { EvolutionInboundMessage } from "./evolution.types";

@Injectable()
export class EvolutionMediaService {
  private readonly logger = new Logger(EvolutionMediaService.name);
  private readonly openai: OpenAI | null;

  constructor(
    private readonly apiClient: EvolutionApiClientService,
    private readonly assetService: AssetService,
    private readonly config: ConfigService,
  ) {
    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async extractInboundMedia(
    payload: EvolutionInboundMessage,
    ownerUserId: string,
  ): Promise<{
    attachments: AttachmentMeta[];
    transcriptText: string | null;
  }> {
    const message = payload.data?.message;
    const messageKeyId = payload.data?.key?.id;
    if (!message || !messageKeyId) {
      return { attachments: [], transcriptText: null };
    }

    const attachments: AttachmentMeta[] = [];
    let transcriptText: string | null = null;

    const candidates = [
      this.readMediaCandidate(message.imageMessage, "image"),
      this.readMediaCandidate(message.documentMessage, "document"),
      this.readMediaCandidate(message.audioMessage, "audio"),
    ].filter((value): value is MediaCandidate => Boolean(value));

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]!;
      try {
        const media = await this.apiClient.getMediaBase64(payload, {
          convertToMp4: candidate.kind === "audio",
        });
        if (!media.base64) continue;

        const buffer = Buffer.from(media.base64, "base64");
        const contentType = candidate.mimeType ?? media.mimetype ?? this.defaultMimeType(candidate.kind);
        const assetType = this.toAssetType(candidate.kind);
        const filename = candidate.fileName ?? `${candidate.kind}-${messageKeyId}-${index}.${this.extensionFromMime(contentType)}`;

        const asset = await this.assetService.uploadAndTrack(
          ownerUserId,
          assetType,
          buffer,
          contentType,
          undefined,
          {
            source: "evolution",
            originalName: filename,
            providerMessageId: messageKeyId,
          },
        );

        attachments.push({
          filename,
          contentType,
          attachmentId: `${messageKeyId}:${candidate.kind}:${index}`,
          storagePath: asset.key,
          assetId: asset.id,
          isPitchDeck: /deck|pitch|presentation|slides?|teaser/i.test(filename),
          status: "uploaded",
        });

        if (candidate.kind === "audio" && !transcriptText) {
          transcriptText = await this.transcribeAudio(buffer, filename, contentType);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to process Evolution ${candidate.kind} attachment for ${messageKeyId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return { attachments, transcriptText };
  }

  private readMediaCandidate(value: unknown, kind: MediaKind): MediaCandidate | null {
    if (!value || typeof value !== "object") return null;
    const entry = value as Record<string, unknown>;
    return {
      kind,
      mimeType: typeof entry.mimetype === "string" ? entry.mimetype : null,
      fileName:
        typeof entry.fileName === "string"
          ? entry.fileName
          : typeof entry.caption === "string" && kind !== "audio"
            ? `${kind}-${Date.now()}.${this.extensionFromMime(typeof entry.mimetype === "string" ? entry.mimetype : this.defaultMimeType(kind))}`
            : null,
    };
  }

  private async transcribeAudio(
    buffer: Buffer,
    filename: string,
    contentType: string,
  ): Promise<string | null> {
    if (!this.openai) return null;
    try {
      const file = new File([new Uint8Array(buffer)], filename, { type: contentType });
      const result = await this.openai.audio.transcriptions.create({
        file,
        model: "gpt-4o-mini-transcribe",
      });
      return result.text?.trim() || null;
    } catch (error) {
      this.logger.warn(
        `Audio transcription failed for ${filename}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private toAssetType(kind: MediaKind) {
    if (kind === "image") return ASSET_TYPES.IMAGE;
    if (kind === "audio") return ASSET_TYPES.AUDIO;
    return ASSET_TYPES.DOCUMENT;
  }

  private defaultMimeType(kind: MediaKind): string {
    if (kind === "image") return "image/jpeg";
    if (kind === "audio") return "audio/ogg";
    return "application/octet-stream";
  }

  private extensionFromMime(mimeType: string): string {
    if (mimeType === "application/pdf") return "pdf";
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
    if (mimeType.includes("ogg")) return "ogg";
    if (mimeType.includes("mpeg")) return "mp3";
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("word")) return "docx";
    return "bin";
  }
}

type MediaKind = "image" | "audio" | "document";

type MediaCandidate = {
  kind: MediaKind;
  mimeType: string | null;
  fileName: string | null;
};
