import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ZodValidationPipe, cleanupOpenApiDoc } from 'nestjs-zod';
import cookieParser from 'cookie-parser';
// TODO: Install helmet for security headers - npm install helmet @types/helmet
// import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters';
import { LoggingInterceptor } from './common/interceptors';
import { Env } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Enable raw body for webhook signature verification
    rawBody: true,
  });

  const configService = app.get(ConfigService<Env, true>);
  const logger = new Logger('Bootstrap');

  // Security middleware: Helmet for HTTP headers
  // TODO: Uncomment once helmet is installed
  // app.use(helmet());

  // Cookie parser for JWT in cookies
  app.use(cookieParser());

  // CORS
  const frontendUrl = configService.get('FRONTEND_URL', { infer: true });
  const isDev = configService.get('NODE_ENV', { infer: true }) === 'development';
  app.enableCors({
    origin: isDev
      ? [frontendUrl, 'http://localhost:3030', 'http://127.0.0.1:3030']
      : frontendUrl,
    credentials: true,
  });

  // Global Zod validation pipe
  app.useGlobalPipes(new ZodValidationPipe());

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global logging interceptor (optional, can be noisy)
  if (configService.get('NODE_ENV', { infer: true }) === 'development') {
    app.useGlobalInterceptors(new LoggingInterceptor());
  }

  // Swagger setup (only in development or when enabled)
  if (configService.get('ENABLE_SWAGGER', { infer: true })) {
    setupSwagger(app);
    logger.log('Swagger documentation available at /docs');
  }

  const port = configService.get('PORT', { infer: true });
  await app.listen(port);

  logger.log(`Application running on http://localhost:${port}`);
  logger.log(`Environment: ${configService.get('NODE_ENV', { infer: true })}`);
}

function setupSwagger(
  app: ReturnType<typeof NestFactory.create> extends Promise<infer T>
    ? T
    : never,
) {
  const config = new DocumentBuilder()
    .setTitle('NestJS Boilerplate API')
    .setDescription(
      'Production-ready NestJS boilerplate with auth, queues, storage, and email',
    )
    .setVersion('2.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT token',
      },
      'JWT',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  const cleanedDocument = cleanupOpenApiDoc(document);

  SwaggerModule.setup('docs', app, cleanedDocument, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });
}

void bootstrap();
