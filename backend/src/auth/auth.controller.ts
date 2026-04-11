import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBearerAuth,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Throttle, SkipThrottle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { UserAuthService, type DbUser } from "./user-auth.service";
import { ProfileService } from "./profile.service";
import { EmailService } from "../email";
import { EarlyAccessService } from "../modules/early-access";
import { GoogleAuthGuard } from "./guards";
import { Public, CurrentUser } from "./decorators";
import { JWT_COOKIE_NAME, REFRESH_COOKIE_NAME } from "./auth.constants";
import { UserRole } from "./entities/auth.schema";
import {
  LoginDto,
  RegisterDto,
  MagicLinkRequestDto,
  MagicLinkVerifyDto,
  AuthResponseDto,
  UserResponseDto,
  EmailVerifyDto,
  ResendVerificationDto,
  UpdateUserProfileDetailsDto,
  UserProfileDto,
  SelectRoleDto,
} from "./dto";
import {
  JoinWaitlistDto,
  RedeemEarlyAccessInviteDto,
} from "../modules/early-access";

// Rate limit configs (requests per TTL window in seconds)
const AUTH_RATE_LIMIT = { limit: 5, ttl: 60000 }; // 5 requests per minute
const MAGIC_LINK_RATE_LIMIT = { limit: 3, ttl: 300000 }; // 3 requests per 5 minutes

@ApiTags("auth")
@Controller("auth")
@ApiTooManyRequestsResponse({ description: "Rate limit exceeded" })
export class AuthController {
  private readonly isGoogleOAuthConfigured: boolean;

  constructor(
    private authService: AuthService,
    private userAuthService: UserAuthService,
    private profileService: ProfileService,
    private emailService: EmailService,
    private earlyAccess: EarlyAccessService,
    private config: ConfigService,
  ) {
    this.isGoogleOAuthConfigured = !!(
      config.get<string>("GOOGLE_CLIENT_ID") &&
      config.get<string>("GOOGLE_CLIENT_SECRET")
    );
  }

  // ============ EMAIL/PASSWORD ============

  @Public()
  @Post("register")
  @Throttle({ default: AUTH_RATE_LIMIT })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Register with email and password" })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const newUser = await this.authService.registerWithPassword(
      dto.email,
      dto.password,
      dto.name,
    );

    // Send verification email
    const token = await this.userAuthService.createEmailVerificationToken(
      dto.email,
    );
    await this.emailService.sendVerificationEmail(dto.email, token, dto.name);

    return this.setTokensAndRespond(res, newUser);
  }

  @Public()
  @Post("login")
  @Throttle({ default: AUTH_RATE_LIMIT })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Login with email and password" })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: "Invalid credentials" })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const foundUser = await this.authService.validatePassword(
      dto.email,
      dto.password,
    );
    if (!foundUser) {
      throw new UnauthorizedException("Invalid credentials");
    }
    return this.setTokensAndRespond(res, foundUser);
  }

  // ============ EMAIL VERIFICATION ============

  @Public()
  @Post("verify-email")
  @Throttle({ default: AUTH_RATE_LIMIT })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Verify email address" })
  @ApiBody({ type: EmailVerifyDto })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: "Invalid or expired token" })
  async verifyEmail(
    @Body() dto: EmailVerifyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const foundUser = await this.userAuthService.verifyEmail(dto.token);
    if (!foundUser) {
      throw new UnauthorizedException("Invalid or expired verification token");
    }

    // Send welcome email after verification
    await this.emailService.sendWelcomeEmail(foundUser.email, foundUser.name);

    return this.setTokensAndRespond(res, foundUser);
  }

  @Public()
  @Post("resend-verification")
  @Throttle({ default: MAGIC_LINK_RATE_LIMIT })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Resend verification email" })
  @ApiBody({ type: ResendVerificationDto })
  @ApiResponse({ status: 200, description: "Verification email sent" })
  async resendVerification(@Body() dto: ResendVerificationDto) {
    const token = await this.userAuthService.resendVerificationEmail(dto.email);

    if (token) {
      await this.emailService.sendVerificationEmail(dto.email, token);
    }

    // Always return success to prevent email enumeration
    return {
      message:
        "If the email exists and is unverified, a new link has been sent",
    };
  }

  // ============ EARLY ACCESS ============

  @Public()
  @Post("waitlist")
  @Throttle({ default: MAGIC_LINK_RATE_LIMIT })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Join early-access waitlist" })
  @ApiResponse({ status: 200, description: "Waitlist request accepted" })
  async joinWaitlist(@Body() dto: JoinWaitlistDto) {
    await this.earlyAccess.joinWaitlist(dto);
    return {
      message: "You're on the waitlist. We'll reach out when access opens.",
    };
  }

  @Public()
  @Post("invite/redeem")
  @Throttle({ default: AUTH_RATE_LIMIT })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Redeem an early-access invitation link" })
  @ApiResponse({ status: 200, description: "Invitation redeemed" })
  @ApiUnauthorizedResponse({ description: "Invalid invite token" })
  async redeemInvite(@Body() dto: RedeemEarlyAccessInviteDto) {
    return this.earlyAccess.redeemInviteToken(dto.token);
  }

  // ============ MAGIC LINK ============

  @Public()
  @Post("magic-link/request")
  @Throttle({ default: MAGIC_LINK_RATE_LIMIT })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Request magic link (sends email)" })
  @ApiBody({ type: MagicLinkRequestDto })
  @ApiResponse({ status: 200, description: "Magic link sent" })
  async requestMagicLink(@Body() dto: MagicLinkRequestDto) {
    await this.earlyAccess.assertEmailAllowed(dto.email);

    const token = await this.authService.createMagicLink(dto.email);

    // Send magic link email
    await this.emailService.sendMagicLinkEmail(dto.email, token);

    return {
      message: "Magic link sent to your email",
      _devToken:
        process.env.NODE_ENV === "development" &&
        process.env.DEV_EXPOSE_TOKENS === "true"
          ? token
          : undefined,
    };
  }

  @Public()
  @Post("magic-link/verify")
  @Throttle({ default: AUTH_RATE_LIMIT })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Verify magic link token" })
  @ApiBody({ type: MagicLinkVerifyDto })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: "Invalid or expired magic link" })
  async verifyMagicLink(
    @Body() dto: MagicLinkVerifyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const foundUser = await this.authService.validateMagicLink(dto.token);
    if (!foundUser) {
      throw new UnauthorizedException("Invalid or expired magic link");
    }
    await this.earlyAccess.bindRedeemedInviteToUser(
      foundUser.id,
      foundUser.email,
    );
    const refreshedUser = await this.userAuthService.findUserById(foundUser.id);
    if (!refreshedUser) {
      throw new UnauthorizedException("User not found");
    }
    return this.setTokensAndRespond(res, refreshedUser);
  }

  // ============ GOOGLE OAUTH ============

  @Public()
  @Get("google")
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: "Initiate Google OAuth flow" })
  googleAuth() {
    if (!this.isGoogleOAuthConfigured) {
      throw new ServiceUnavailableException(
        "Google OAuth is not configured on this server",
      );
    }
    // Guard redirects to Google
  }

  @Public()
  @Get("google/callback")
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: "Google OAuth callback" })
  async googleCallback(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!this.isGoogleOAuthConfigured) {
      throw new ServiceUnavailableException(
        "Google OAuth is not configured on this server",
      );
    }
    const authResult = req.user as
      | DbUser
      | { __earlyAccessRejected: true; error: string };

    if (
      typeof authResult === "object" &&
      authResult !== null &&
      "__earlyAccessRejected" in authResult
    ) {
      const error = encodeURIComponent(authResult.error);
      return res.redirect(`${this.getSafeFrontendUrl()}/auth/callback?error=${error}`);
    }

    const foundUser = authResult as DbUser;
    await this.earlyAccess.bindRedeemedInviteToUser(
      foundUser.id,
      foundUser.email,
    );
    const refreshedUser = await this.userAuthService.findUserById(foundUser.id);
    if (!refreshedUser) {
      throw new UnauthorizedException("User not found");
    }
    const tokens = await this.authService.generateTokens(refreshedUser);
    this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

    return res.redirect(`${this.getSafeFrontendUrl()}/auth/callback?success=true`);
  }

  // ============ ONBOARDING ============

  @Post("select-role")
  @Throttle({ default: AUTH_RATE_LIMIT })
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth("JWT")
  @ApiOperation({ summary: "Select role during onboarding" })
  @ApiBody({ type: SelectRoleDto })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  async selectRole(
    @CurrentUser() currentUser: DbUser,
    @Body() dto: SelectRoleDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (currentUser.onboardingCompleted) {
      throw new BadRequestException("Onboarding already completed");
    }
    const updated = await this.userAuthService.updateUserRole(
      currentUser.id,
      dto.role,
    );
    return this.setTokensAndRespond(res, updated);
  }

  // ============ TOKEN MANAGEMENT ============

  @Public()
  @Post("refresh")
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 refreshes per minute
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Refresh access token" })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: "No refresh token or invalid token" })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = (req.cookies as Record<string, string> | undefined)?.[
      REFRESH_COOKIE_NAME
    ];
    if (!refreshToken) {
      this.clearTokenCookies(res);
      throw new UnauthorizedException("No refresh token");
    }

    try {
      const result = await this.authService.refreshTokens(refreshToken);

      this.setTokenCookies(res, result.accessToken, result.refreshToken);

      return {
        user: this.sanitizeUser(result.user),
        accessToken: result.accessToken,
      };
    } catch (error) {
      this.clearTokenCookies(res);
      throw error;
    }
  }

  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Logout and clear tokens" })
  @ApiResponse({ status: 200, description: "Logged out successfully" })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = (req.cookies as Record<string, string> | undefined)?.[
      REFRESH_COOKIE_NAME
    ];

    if (refreshToken) {
      try {
        const result = await this.authService.refreshTokens(refreshToken);
        await this.authService.revokeAllUserTokens(result.user.id);
      } catch {
        // Best effort: cookies should still be cleared even if token is invalid/expired.
      }
    }

    this.clearTokenCookies(res);
    return { message: "Logged out successfully" };
  }

  @Post("logout-all")
  @ApiBearerAuth("JWT")
  @ApiOperation({ summary: "Logout from all devices" })
  @ApiResponse({ status: 200, description: "Logged out from all devices" })
  async logoutAll(
    @CurrentUser() currentUser: DbUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.revokeAllUserTokens(currentUser.id);

    this.clearTokenCookies(res);
    return { message: "Logged out from all devices" };
  }

  // ============ CURRENT USER ============

  @Get("me")
  @SkipThrottle()
  @ApiBearerAuth("JWT")
  @ApiOperation({ summary: "Get current authenticated user" })
  @ApiResponse({ status: 200, type: UserResponseDto })
  getMe(@CurrentUser() currentUser: DbUser): UserResponseDto {
    return this.sanitizeUser(currentUser);
  }

  // ============ PROFILE MANAGEMENT ============

  @Get("profile")
  @SkipThrottle()
  @ApiBearerAuth("JWT")
  @ApiOperation({ summary: "Get current user profile" })
  @ApiResponse({ status: 200, type: UserProfileDto })
  async getProfile(@CurrentUser() currentUser: DbUser) {
    const profile = await this.profileService.getProfile(currentUser.id);
    return {
      id: profile.id,
      userId: profile.userId,
      companyName: profile.companyName,
      title: profile.title,
      linkedinUrl: profile.linkedinUrl,
      bio: profile.bio,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  @Patch("profile")
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 updates per minute
  @ApiBearerAuth("JWT")
  @ApiOperation({ summary: "Update user profile" })
  @ApiBody({ type: UpdateUserProfileDetailsDto })
  @ApiResponse({ status: 200, type: UserProfileDto })
  async updateProfile(
    @CurrentUser() currentUser: DbUser,
    @Body() dto: UpdateUserProfileDetailsDto,
  ) {
    const profile = await this.profileService.updateProfile(
      currentUser.id,
      dto,
    );
    return {
      id: profile.id,
      userId: profile.userId,
      companyName: profile.companyName,
      title: profile.title,
      linkedinUrl: profile.linkedinUrl,
      bio: profile.bio,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  // ============ HELPERS ============

  private getSafeFrontendUrl(): string {
    const configured = this.config.get<string>("FRONTEND_URL") || "http://localhost:3030";
    try {
      const url = new URL(configured);
      if (!["http:", "https:"].includes(url.protocol)) {
        return "http://localhost:3030";
      }
      return configured;
    } catch {
      return "http://localhost:3030";
    }
  }

  private setTokenCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    const isDev = process.env.NODE_ENV === "development";

    const sameSite: "lax" | "strict" = isDev ? "lax" : "strict";
    const secure = !isDev;

    res.cookie(JWT_COOKIE_NAME, accessToken, {
      httpOnly: true,
      secure,
      sameSite,
      path: "/",
      maxAge: 15 * 60 * 1000,
    });

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure,
      sameSite,
      path: "/",
      maxAge: this.authService.getRefreshTokenTtlMs(),
    });
  }

  private clearTokenCookies(res: Response) {
    const isDev = process.env.NODE_ENV === "development";
    const opts = {
      httpOnly: true,
      secure: !isDev,
      sameSite: (isDev ? "lax" : "strict") as "lax" | "strict",
      path: "/",
    };
    res.clearCookie(JWT_COOKIE_NAME, opts);
    res.clearCookie(REFRESH_COOKIE_NAME, opts);
  }

  private sanitizeUser(u: DbUser): UserResponseDto {
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: u.emailVerified,
      image: u.image,
      role: u.role as UserRole,
      onboardingCompleted: u.onboardingCompleted,
      createdAt: u.createdAt.toISOString(),
    };
  }

  private async setTokensAndRespond(res: Response, u: DbUser) {
    const tokens = await this.authService.generateTokens(u);
    this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

    return {
      user: this.sanitizeUser(u),
      accessToken: tokens.accessToken,
    };
  }
}
