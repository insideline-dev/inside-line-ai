import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database";
import { EarlyAccessService } from "./early-access.service";

@Module({
  imports: [DatabaseModule],
  providers: [EarlyAccessService],
  exports: [EarlyAccessService],
})
export class EarlyAccessModule {}
