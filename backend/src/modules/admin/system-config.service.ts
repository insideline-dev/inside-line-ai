import { Injectable } from '@nestjs/common';

@Injectable()
export class SystemConfigService {
  async getConfig() {
    return {
      featureFlags: {
        aiAnalysis: false, // AI_PLACEHOLDER
        messaging: false, // AI_PLACEHOLDER
        webScraping: true,
      },
    };
  }
}
