import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { UserAuthService } from "./user-auth.service";
import { ProfileService } from "./profile.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy, GoogleStrategy } from "./strategies";
import { JwtAuthGuard } from "./guards";
import { EarlyAccessModule } from "../modules/early-access";

@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: config.get("JWT_ACCESS_EXPIRES", "15m"),
        },
      }),
      inject: [ConfigService],
    }),
    // Rate limiting: 100 requests per minute by default
    ThrottlerModule.forRoot([
      {
        name: "default",
        ttl: 60000,
        limit: 100,
      },
    ]),
    EarlyAccessModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    UserAuthService,
    ProfileService,
    JwtStrategy,
    GoogleStrategy,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [
    AuthService,
    UserAuthService,
    ProfileService,
    JwtModule,
  ],
})
export class AuthModule {}
