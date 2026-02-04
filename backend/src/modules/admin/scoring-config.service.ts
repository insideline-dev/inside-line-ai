import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from './cache.service';
import { UpdateDefaultWeights } from './dto';

const CACHE_KEY = 'admin:scoring:defaults';
const CACHE_TTL = 3600; // 1 hour

// Default scoring weights (all equal at 20%)
const DEFAULT_WEIGHTS: UpdateDefaultWeights = {
  marketWeight: 20,
  teamWeight: 20,
  productWeight: 20,
  tractionWeight: 20,
  financialsWeight: 20,
};

@Injectable()
export class ScoringConfigService {
  private readonly logger = new Logger(ScoringConfigService.name);

  constructor(private cache: CacheService) {}

  async getDefaults(): Promise<UpdateDefaultWeights> {
    const cached = await this.cache.get<UpdateDefaultWeights>(CACHE_KEY);
    return cached ?? DEFAULT_WEIGHTS;
  }

  async updateDefaults(weights: UpdateDefaultWeights): Promise<UpdateDefaultWeights> {
    await this.cache.set(CACHE_KEY, weights, CACHE_TTL);
    this.logger.log('Updated default scoring weights');
    return weights;
  }
}
