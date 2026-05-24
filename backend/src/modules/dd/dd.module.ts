import { Module } from "@nestjs/common";
import { OpenQuestionService } from "./open-question.service";

@Module({
  providers: [OpenQuestionService],
  exports: [OpenQuestionService],
})
export class DdModule {}
