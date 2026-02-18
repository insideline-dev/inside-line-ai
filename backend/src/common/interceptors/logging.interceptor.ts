import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse();
        const { statusCode } = response;
        const duration = Date.now() - now;

        this.logger.log(`${method} ${url} ${statusCode} - ${duration}ms`);
      }),
      catchError((error: unknown) => {
        const response = context.switchToHttp().getResponse();
        const statusCode =
          response?.statusCode && response.statusCode >= 400
            ? response.statusCode
            : (error as { status?: number })?.status ?? 500;
        const duration = Date.now() - now;
        const message =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : 'Request failed';

        this.logger.error(
          `${method} ${url} ${statusCode} - ${duration}ms - ${message}`,
        );
        return throwError(() => error);
      }),
    );
  }
}
