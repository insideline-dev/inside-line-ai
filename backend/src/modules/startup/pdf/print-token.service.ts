import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

export interface PrintTokenPayload {
  sub: string;
  startupId: string;
  scope: "print";
  kind: "memo" | "report";
}

@Injectable()
export class PrintTokenService {
  private readonly ttlSeconds = 120;

  constructor(
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  mint(
    userId: string,
    startupId: string,
    kind: "memo" | "report",
  ): { token: string; ttlSeconds: number } {
    const payload: PrintTokenPayload = {
      sub: userId,
      startupId,
      scope: "print",
      kind,
    };
    const token = this.jwt.sign(payload, {
      expiresIn: `${this.ttlSeconds}s`,
      secret: this.config.get<string>("JWT_SECRET"),
    });
    return { token, ttlSeconds: this.ttlSeconds };
  }

  verify(token: string): PrintTokenPayload {
    try {
      const decoded = this.jwt.verify<PrintTokenPayload>(token, {
        secret: this.config.get<string>("JWT_SECRET"),
      });
      if (decoded.scope !== "print") {
        throw new UnauthorizedException("Invalid print token scope");
      }
      return decoded;
    } catch {
      throw new UnauthorizedException("Invalid or expired print token");
    }
  }
}
