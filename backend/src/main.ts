import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { ZodValidationPipe, cleanupOpenApiDoc } from "nestjs-zod";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters";
import { LoggingInterceptor } from "./common/interceptors";
import { AppFileLogger } from "./common/logging";
import { Env } from "./config";

async function bootstrap() {
  const appLogger = new AppFileLogger();
  const app = await NestFactory.create(AppModule, {
    // Enable raw body for webhook signature verification
    rawBody: true,
    bufferLogs: true,
    logger: appLogger,
  });
  app.useLogger(appLogger);

  // Register SIGTERM/SIGINT handlers so onModuleDestroy runs on shutdown.
  // Without this, prod deploys kill the process mid-job and BullMQ workers
  // leave orphaned locks that get marked stalled ~lockDuration later.
  app.enableShutdownHooks();

  const configService = app.get(ConfigService<Env, true>);
  const logger = new Logger("Bootstrap");

  process.on("unhandledRejection", (reason) => {
    const message =
      reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    appLogger.error(`Unhandled rejection: ${message}`, stack);
  });

  process.on("uncaughtException", (error) => {
    appLogger.error(`Uncaught exception: ${error.message}`, error.stack);
  });

  app.use(helmet());

  // Cookie parser for JWT in cookies
  app.use(cookieParser());

  // CORS
  const frontendUrl = configService.get("FRONTEND_URL", { infer: true });
  const isDev =
    configService.get("NODE_ENV", { infer: true }) === "development";
  app.enableCors({
    origin: isDev
      ? [frontendUrl, "http://localhost:3030", "http://127.0.0.1:3030"]
      : frontendUrl,
    credentials: true,
  });

  // Global Zod validation pipe
  app.useGlobalPipes(new ZodValidationPipe());

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global logging interceptor (optional, can be noisy)
  if (configService.get("NODE_ENV", { infer: true }) === "development") {
    app.useGlobalInterceptors(new LoggingInterceptor());
  }

  // Swagger setup (only in development or when enabled)
  if (configService.get("ENABLE_SWAGGER", { infer: true })) {
    setupSwagger(app);
    logger.log("Swagger documentation available at /docs");
  }

  const port = configService.get("PORT", { infer: true });
  // Hardcoded bind: must reach all interfaces so sibling containers (nginx)
  // can connect. HOST env name collides with platform-injected vars (Coolify
  // et al.) — do not read from env here.
  await app.listen(port, "0.0.0.0");

  logger.log(`Application running on http://0.0.0.0:${port}`);
  logger.log(`Environment: ${configService.get("NODE_ENV", { infer: true })}`);
}

function setupSwagger(
  app: ReturnType<typeof NestFactory.create> extends Promise<infer T>
    ? T
    : never,
) {
  const config = new DocumentBuilder()
    .setTitle("Inside Line API")
    .setDescription("Inside Line API Documentation")
    .setVersion("2.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Enter your JWT token",
      },
      "JWT",
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  const cleanedDocument = cleanupOpenApiDoc(document);

  SwaggerModule.setup("docs", app, cleanedDocument, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: "alpha",
      operationsSorter: "alpha",
    },
  });
}

void bootstrap();
