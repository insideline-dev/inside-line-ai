import {
  Controller,
  Get,
  Query,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UnipileService } from './unipile.service';
import { CurrentUser } from '../../../auth/decorators';
import type { DbUser } from '../../../auth/user-auth.service';
import type { GetLinkedInProfileQueryDto, SearchLinkedInQueryDto } from './dto';

@ApiTags('integrations/linkedin')
@Controller('integrations/linkedin')
@ApiBearerAuth('JWT')
@ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
export class UnipileController {
  constructor(private unipileService: UnipileService) {}

  // ============================================================================
  // LINKEDIN PROFILE (Authenticated)
  // ============================================================================

  @Get('profile')
  @Throttle({ default: { limit: 30, ttl: 60000 } }) // 30/min
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fetch LinkedIn profile by URL' })
  @ApiResponse({ status: 200, description: 'Profile retrieved' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  @ApiResponse({ status: 503, description: 'LinkedIn integration not configured' })
  async getProfile(@CurrentUser() user: DbUser, @Query() query: GetLinkedInProfileQueryDto) {
    if (!this.unipileService.isConfigured()) {
      throw new ServiceUnavailableException('LinkedIn integration not configured');
    }

    const profile = await this.unipileService.getProfile(user.id, query.url);

    if (!profile) {
      return { profile: null, message: 'Profile not found' };
    }

    return { profile };
  }

  @Get('search')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10/min
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Search LinkedIn profiles by name and optional company' })
  @ApiResponse({ status: 200, description: 'Search results' })
  @ApiResponse({ status: 503, description: 'LinkedIn integration not configured' })
  async searchProfiles(@Query() query: SearchLinkedInQueryDto) {
    if (!this.unipileService.isConfigured()) {
      throw new ServiceUnavailableException('LinkedIn integration not configured');
    }

    const profiles = await this.unipileService.searchProfiles(query.name, query.company);
    return { profiles, count: profiles.length };
  }
}
