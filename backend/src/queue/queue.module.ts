import { Global, Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { TaskProcessor } from './processors/task.processor';

@Global()
@Module({
  providers: [QueueService, TaskProcessor],
  exports: [QueueService],
})
export class QueueModule {}
