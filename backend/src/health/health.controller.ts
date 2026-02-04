import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Public } from '../auth/decorators';
import { QueueService } from '../queue';

const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.iso.datetime(),
  uptime: z.number().describe('Uptime in seconds'),
});

class HealthResponseDto extends createZodDto(HealthResponseSchema) {}

const RedisHealthResponseSchema = z.object({
  status: z.enum(['ok', 'error']),
  latency: z.number().optional().describe('Redis ping latency in ms'),
});

class RedisHealthResponseDto extends createZodDto(RedisHealthResponseSchema) {}

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  private readonly startTime = Date.now();

  constructor(private readonly queueService: QueueService) {}

  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({ status: 200, type: HealthResponseDto })
  check(): HealthResponseDto {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  @Get('redis')
  @ApiOperation({ summary: 'Redis health check endpoint' })
  @ApiResponse({ status: 200, type: RedisHealthResponseDto })
  async checkRedis(): Promise<RedisHealthResponseDto> {
    return this.queueService.checkHealth();
  }
}
