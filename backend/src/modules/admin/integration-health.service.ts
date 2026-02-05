import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnipileService } from '../integrations/unipile/unipile.service';

export type HealthStatus = 'healthy' | 'not_configured';

export interface IntegrationHealth {
  status: HealthStatus;
  lastChecked: string;
}

@Injectable()
export class IntegrationHealthService {
  constructor(
    private config: ConfigService,
    private unipile: UnipileService,
  ) {}

  async getHealth(): Promise<Record<string, IntegrationHealth>> {
    return {
      unipile: this.checkUnipile(),
      twilio: this.checkTwilio(),
      storage: this.checkStorage(),
      redis: this.checkRedis(),
    };
  }

  private checkUnipile(): IntegrationHealth {
    return {
      status: this.unipile.isConfigured() ? 'healthy' : 'not_configured',
      lastChecked: new Date().toISOString(),
    };
  }

  private checkTwilio(): IntegrationHealth {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    return {
      status: accountSid && authToken ? 'healthy' : 'not_configured',
      lastChecked: new Date().toISOString(),
    };
  }

  private checkStorage(): IntegrationHealth {
    const bucket = this.config.get<string>('STORAGE_BUCKET');
    const accessKey = this.config.get<string>('STORAGE_ACCESS_KEY_ID');
    const secretKey = this.config.get<string>('STORAGE_SECRET_ACCESS_KEY');
    return {
      status: bucket && accessKey && secretKey ? 'healthy' : 'not_configured',
      lastChecked: new Date().toISOString(),
    };
  }

  private checkRedis(): IntegrationHealth {
    const redisUrl = this.config.get<string>('REDIS_URL');
    const redisHost = this.config.get<string>('REDIS_HOST');
    const redisPort = this.config.get<string>('REDIS_PORT');
    return {
      status: redisUrl || (redisHost && redisPort) ? 'healthy' : 'not_configured',
      lastChecked: new Date().toISOString(),
    };
  }
}
