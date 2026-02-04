import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';

interface ValidationError {
  field: string;
  message: string;
}

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
  retryAfter?: number;
  errors?: ValidationError[];
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  private inferStatusFromError(error: Error): {
    status: number;
    errorType: string;
  } {
    const msg = error.message.toLowerCase();

    if (msg.includes('timeout') || msg.includes('timed out')) {
      return {
        status: HttpStatus.GATEWAY_TIMEOUT,
        errorType: 'Gateway Timeout',
      };
    }
    if (msg.includes('rate limit') || msg.includes('too many requests')) {
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        errorType: 'Too Many Requests',
      };
    }
    if (msg.includes('not found')) {
      return { status: HttpStatus.NOT_FOUND, errorType: 'Not Found' };
    }
    if (msg.includes('unauthorized') || msg.includes('auth')) {
      return { status: HttpStatus.UNAUTHORIZED, errorType: 'Unauthorized' };
    }
    if (msg.includes('forbidden')) {
      return { status: HttpStatus.FORBIDDEN, errorType: 'Forbidden' };
    }
    if (
      msg.includes('invalid') ||
      msg.includes('does not support') ||
      msg.includes('must be')
    ) {
      return { status: HttpStatus.BAD_REQUEST, errorType: 'Bad Request' };
    }
    if (
      msg.includes('failed') &&
      (msg.includes('generation') || msg.includes('service'))
    ) {
      return { status: HttpStatus.BAD_GATEWAY, errorType: 'Bad Gateway' };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      errorType: 'Internal Server Error',
    };
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const isDevelopment = process.env.NODE_ENV === 'development';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';
    let retryAfter: number | undefined;
    let validationErrors: ValidationError[] | undefined;

    // Handle Zod validation errors specifically
    if (exception instanceof ZodValidationException) {
      status = HttpStatus.BAD_REQUEST;
      error = 'Validation Error';
      const zodError = exception.getZodError() as ZodError;
      validationErrors = zodError.issues.map((issue) => ({
        field: issue.path.join('.') || 'root',
        message: issue.message,
      }));
      message = validationErrors.map((e) => `${e.field}: ${e.message}`);
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const res = exceptionResponse as Record<string, unknown>;
        message = (res.message as string | string[]) || exception.message;
        error = (res.error as string) || exception.name;
        retryAfter = res.retryAfter as number | undefined;
      } else {
        message = String(exceptionResponse);
      }
    } else if (exception instanceof Error) {
      const inferred = this.inferStatusFromError(exception);
      status = inferred.status;
      error = inferred.errorType;
      // Only expose detailed error message in development
      message = isDevelopment ? exception.message : 'An error occurred';
    }

    // Log error for debugging (sanitized - no full stack for 500+ errors)
    if (status >= 500) {
      let sanitizedError = '';
      if (exception instanceof Error) {
        sanitizedError = `[${exception.name}] ${exception.message}`;
      } else if (typeof exception === 'object' && exception !== null) {
        sanitizedError = String(
          (exception as Record<string, unknown>).message || exception,
        );
      } else {
        sanitizedError = String(exception);
      }
      this.logger.error(`${request.method} ${request.url}: ${sanitizedError}`);
    }

    // Set Retry-After header for 503 responses
    if (retryAfter && status === HttpStatus.SERVICE_UNAVAILABLE) {
      response.setHeader('Retry-After', retryAfter);
    }

    // In production, use generic message for unhandled errors
    const finalMessage = isDevelopment
      ? message
      : status >= 500 &&
          !(exception instanceof HttpException) &&
          !(exception instanceof ZodValidationException)
        ? 'An error occurred'
        : message;

    const errorResponse: ErrorResponse = {
      statusCode: status,
      message: finalMessage,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(retryAfter && { retryAfter }),
      ...(isDevelopment && validationErrors && { errors: validationErrors }),
    };

    response.status(status).json(errorResponse);
  }
}
