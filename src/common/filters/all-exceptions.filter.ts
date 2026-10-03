import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const { status, message } = this.resolveError(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} failed`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({ success: false, message });
  }

  private resolveError(exception: unknown): { status: number; message: string } {
    if (exception instanceof HttpException) {
      return { status: exception.getStatus(), message: this.extractMessage(exception) };
    }
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };
  }

  private extractMessage(exception: HttpException): string {
    const exceptionResponse = exception.getResponse();
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }
    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const message = (exceptionResponse as Record<string, unknown>).message;
      if (typeof message === 'string') {
        return message;
      }
      if (Array.isArray(message)) {
        return message.map((entry) => String(entry)).join('; ');
      }
    }
    return exception.message || 'Internal server error';
  }
}
