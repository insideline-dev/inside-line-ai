import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "../../../database";
import { StorageModule } from "../../../storage/storage.module";
import { ClaraModule } from "../../clara/clara.module";
import { EvolutionApiClientService } from "./evolution-api-client.service";
import { EvolutionContactResolverService } from "./evolution-contact-resolver.service";
import { EvolutionController } from "./evolution.controller";
import { EvolutionLinkingService } from "./evolution-linking.service";
import { EvolutionMediaService } from "./evolution-media.service";
import { EvolutionService } from "./evolution.service";

@Module({
  imports: [ConfigModule, DatabaseModule, StorageModule, forwardRef(() => ClaraModule)],
  controllers: [EvolutionController],
  providers: [
    EvolutionApiClientService,
    EvolutionContactResolverService,
    EvolutionLinkingService,
    EvolutionMediaService,
    EvolutionService,
  ],
  exports: [EvolutionApiClientService, EvolutionContactResolverService],
})
export class EvolutionModule {}
