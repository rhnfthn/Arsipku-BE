import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Logger Middleware
 * Logs all incoming HTTP requests
 */
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, ip } = req;
    const userAgent = req.get('user-agent') || '';
    const startTime = Date.now();

    console.log(
      `[${new Date().toISOString()}] ${method} ${originalUrl} - ${ip} - ${userAgent}`,
    );

    res.on('finish', () => {
      const { statusCode } = res;
      const responseTime = Date.now() - startTime;

      console.log(
        `[${new Date().toISOString()}] ${method} ${originalUrl} - ${statusCode} - ${responseTime}ms`,
      );
    });

    next();
  }
}
