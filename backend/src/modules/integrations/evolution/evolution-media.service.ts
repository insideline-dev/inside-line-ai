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

    const candidates = this.readMediaCandidates(message);

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]!;
      try {
        const media = await this.apiClient.getMediaBase64(payload, {
          convertToMp4: candidate.kind === "audio",
        });
        if (!media.base64) {
          this.logger.warn(`Evolution returned no media bytes for ${candidate.kind} attachment ${messageKeyId}`);
          continue;
        }

        const normalizedBase64 = this.normalizeBase64(media.base64);
        if (!normalizedBase64) {
          this.logger.warn(`Evolution returned empty media bytes for ${candidate.kind} attachment ${messageKeyId}`);
          continue;
        }

        const contentType = media.mimetype ?? candidate.mimeType ?? this.defaultMimeType(candidate.kind);
        const buffer = Buffer.from(normalizedBase64, "base64");
        const assetType = this.toAssetType(candidate.kind);
        const filename = this.buildFilename(candidate, messageKeyId, index, contentType);

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

  private readMediaCandidates(message: Record<string, unknown>): MediaCandidate[] {
    const candidates = [
      this.readMediaCandidate(message.imageMessage, "image"),
      this.readMediaCandidate(message.documentMessage, "document"),
      this.readMediaCandidate(message.audioMessage, "audio"),
      this.readMediaCandidate(message.videoMessage, "document"),
      this.readMediaCandidate(this.readNestedMessage(message), this.kindFromMessageType(message.messageType)),
    ].filter((value): value is MediaCandidate => Boolean(value));

    return candidates.filter(
      (candidate, index, array) =>
        array.findIndex(
          (other) => other.kind === candidate.kind && other.mimeType === candidate.mimeType && other.fileName === candidate.fileName,
        ) === index,
    );
  }

  private readMediaCandidate(value: unknown, kind: MediaKind | null): MediaCandidate | null {
    if (!kind || !value || typeof value !== "object") return null;
    const entry = value as Record<string, unknown>;
    const mimeType = this.readString(entry, "mimetype") ?? this.readString(entry, "mimeType");
    const fileName =
      this.readString(entry, "fileName") ??
      this.readString(entry, "filename") ??
      this.readString(entry, "title") ??
      this.captionFilename(entry, kind, mimeType);

    return {
      kind,
      mimeType,
      fileName,
    };
  }

  private readNestedMessage(message: Record<string, unknown>): unknown {
    const nested = message.message;
    if (!nested || typeof nested !== "object") return null;
    const nestedRecord = nested as Record<string, unknown>;
    return (
      nestedRecord.imageMessage ??
      nestedRecord.documentMessage ??
      nestedRecord.audioMessage ??
      nestedRecord.videoMessage ??
      null
    );
  }

  private kindFromMessageType(value: unknown): MediaKind | null {
    if (typeof value !== "string") return null;
    if (value === "imageMessage") return "image";
    if (value === "audioMessage") return "audio";
    if (value === "documentMessage" || value === "videoMessage") return "document";
    return null;
  }

  private readString(entry: Record<string, unknown>, key: string): string | null {
    const value = entry[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private captionFilename(
    entry: Record<string, unknown>,
    kind: MediaKind,
    mimeType: string | null,
  ): string | null {
    const caption = this.readString(entry, "caption");
    if (!caption || kind === "audio") return null;
    return `${kind}-${Date.now()}.${this.extensionFromMime(mimeType ?? this.defaultMimeType(kind))}`;
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

  private normalizeBase64(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const marker = ";base64,";
    const markerIndex = trimmed.indexOf(marker);
    const base64 = markerIndex >= 0 ? trimmed.slice(markerIndex + marker.length) : trimmed;
    return base64.replace(/\s/g, "");
  }

  private buildFilename(
    candidate: MediaCandidate,
    messageKeyId: string,
    index: number,
    contentType: string,
  ): string {
    const extension = this.extensionFromMime(contentType);
    if (!candidate.fileName) {
      return `${candidate.kind}-${messageKeyId}-${index}.${extension}`;
    }

    const withoutQuery = candidate.fileName.split("?", 1)[0] ?? candidate.fileName;
    if (/\.[a-z0-9]{2,5}$/i.test(withoutQuery)) {
      return withoutQuery;
    }

    return `${withoutQuery}.${extension}`;
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
    if (mimeType.includes("mp4")) return "mp4";
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
