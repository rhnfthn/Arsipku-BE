import { HttpException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  const createHost = () => {
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ method: 'GET', url: '/test' }),
      }),
    } as unknown as ArgumentsHost;

    return { host, response };
  };

  it('preserves the status code of an HTTP exception', () => {
    const { host, response } = createHost();

    new AllExceptionsFilter().catch(
      new HttpException('Unauthorized', 401),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 401,
        message: 'Unauthorized',
      }),
    );
  });

  it('returns 500 for an unhandled error', () => {
    const { host, response } = createHost();

    new AllExceptionsFilter().catch(new Error('database unavailable'), host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 500,
        message: 'database unavailable',
      }),
    );
  });
});
