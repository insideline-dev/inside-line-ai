import { Body, Controller, Headers, HttpCode, Post, UnauthorizedException } from "@nestjs/common";
import { Public } from "../../../auth/decorators/public.decorator";
import { EvolutionApiClientService } from "./evolution-api-client.service";
import { EvolutionService } from "./evolution.service";
import { EvolutionWebhookDto } from "./dto/evolution-webhook.dto";

@Controller("webhooks/evolution")
export class EvolutionController {
  constructor(
    private readonly apiClient: EvolutionApiClientService,
    private readonly evolution: EvolutionService,
  ) {}

  @Public()
  @Post("whatsapp")
  @HttpCode(200)
  async handleWhatsAppWebhook(
    @Body() payload: EvolutionWebhookDto,
    @Headers("apikey") apiKey?: string,
    @Headers("x-api-key") xApiKey?: string,
    @Headers("authorization") authorization?: string,
  ): Promise<{ processed: boolean; reason?: string }> {
    const bearer = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : authorization;
    const receivedKey = apiKey ?? xApiKey ?? payload.apikey ?? bearer;
    if (!this.apiClient.isValidWebhookKey(receivedKey)) {
      throw new UnauthorizedException("Invalid Evolution webhook key");
    }

    return this.evolution.handleWebhook(payload);
  }
}
