import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "../../../database";
import { StorageModule } from "../../../storage/storage.module";
import { QueueModule } from "../../../queue";
import { ClaraModule } from "../../clara/clara.module";
import { EvolutionApiClientService } from "./evolution-api-client.service";
import { EvolutionContactResolverService } from "./evolution-contact-resolver.service";
import { EvolutionController } from "./evolution.controller";
import { EvolutionLinkingService } from "./evolution-linking.service";
import { EvolutionMediaService } from "./evolution-media.service";
import { EvolutionWebhookQueueService } from "./evolution-webhook-queue.service";
import { EvolutionService } from "./evolution.service";
import { EvolutionWhatsAppWebhookProcessor } from "./processors/evolution-whatsapp-webhook.processor";

@Module({
  imports: [ConfigModule, DatabaseModule, StorageModule, QueueModule, forwardRef(() => ClaraModule)],
  controllers: [EvolutionController],
  providers: [
    EvolutionApiClientService,
    EvolutionContactResolverService,
    EvolutionLinkingService,
    EvolutionMediaService,
    EvolutionWebhookQueueService,
    EvolutionService,
    EvolutionWhatsAppWebhookProcessor,
  ],
  exports: [EvolutionApiClientService, EvolutionContactResolverService],
})
export class EvolutionModule {}
