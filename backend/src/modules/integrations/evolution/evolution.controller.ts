import { Body, Controller, Headers, HttpCode, Post, UnauthorizedException } from "@nestjs/common";
import { Public } from "../../../auth/decorators/public.decorator";
import { EvolutionApiClientService } from "./evolution-api-client.service";
import { EvolutionWebhookQueueService } from "./evolution-webhook-queue.service";
import { EvolutionWebhookDto } from "./dto/evolution-webhook.dto";

@Controller("webhooks/evolution")
export class EvolutionController {
  constructor(
    private readonly apiClient: EvolutionApiClientService,
    private readonly webhookQueue: EvolutionWebhookQueueService,
  ) {}

  @Public()
  @Post("whatsapp")
  @HttpCode(200)
  async handleWhatsAppWebhook(
    @Body() payload: EvolutionWebhookDto,
    @Headers("apikey") apiKey?: string,
    @Headers("x-api-key") xApiKey?: string,
    @Headers("authorization") authorization?: string,
  ): Promise<{ queued: boolean; jobId: string }> {
    const bearer = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : authorization;
    const receivedKey = apiKey ?? xApiKey ?? payload.apikey ?? bearer;
    if (!this.apiClient.isValidWebhookKey(receivedKey)) {
      throw new UnauthorizedException("Invalid Evolution webhook key");
    }

    const jobId = await this.webhookQueue.enqueueWhatsAppWebhook(payload);
    return { queued: true, jobId };
  }
}
