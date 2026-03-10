import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Delete,
  UseGuards,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { StorageService } from './storage.service';
import { AssetService } from './asset.service';
import {
  GetUploadUrlDto,
  UploadUrlResponseDto,
  DownloadUrlResponseDto,
} from './dto/presigned-url.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { User } from '../auth/dto/user.dto';

@ApiTags('Storage')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('storage')
export class StorageController {
  constructor(
    private readonly storage: StorageService,
    private readonly assetService: AssetService,
  ) {}

  @Post('presigned-url')
  @ApiOperation({ summary: 'Get presigned URL for client-side upload' })
  @ApiResponse({ status: 201, type: UploadUrlResponseDto })
  async getUploadUrl(
    @CurrentUser() user: User,
    @Body() dto: GetUploadUrlDto,
  ): Promise<UploadUrlResponseDto> {
    return this.storage.getUploadUrl(
      user.id,
      dto.assetType,
      dto.contentType,
      dto.projectId,
    );
  }

  @Get('assets')
  @ApiOperation({ summary: 'List user assets' })
  async listAssets(
    @CurrentUser() user: User,
    @Query('projectId') projectId?: string,
  ) {
    return this.assetService.listAssets(user.id, projectId);
  }

  @Get('assets/:id')
  @ApiOperation({ summary: 'Get asset details' })
  async getAsset(@CurrentUser() user: User, @Param('id') id: string) {
    return this.assetService.getAsset(id, user.id);
  }

  @Get(':key/download-url')
  @ApiOperation({ summary: 'Get presigned download URL' })
  @ApiResponse({ status: 200, type: DownloadUrlResponseDto })
  async getDownloadUrl(
    @CurrentUser() user: User,
    @Param('key') key: string,
  ): Promise<DownloadUrlResponseDto> {
    // Keys are namespaced as {userId}/... — verify the requesting user owns this key.
    if (!key.startsWith(`${user.id}/`)) {
      throw new ForbiddenException('Access denied');
    }
    const url = await this.storage.getDownloadUrl(key);
    return { url };
  }

  @Delete('assets/:id')
  @ApiOperation({ summary: 'Delete an asset from DB and R2' })
  @ApiResponse({
    status: 200,
    schema: { properties: { success: { type: 'boolean' } } },
  })
  async deleteAsset(@CurrentUser() user: User, @Param('id') id: string) {
    await this.assetService.deleteAsset(id, user.id);
    return { success: true };
  }
}
