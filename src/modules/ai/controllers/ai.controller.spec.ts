import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  HttpException,
  ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { AiController } from './ai.controller';
import { AiService } from '../services/ai.service';
import { AiRateLimitGuard } from '../guards/ai-rate-limit.guard';
import { JwtAuthGuard } from '../../../common/guards';
import { TransformResponseInterceptor } from '../../../common/interceptors';
import {
  AllExceptionsFilter,
  HttpExceptionFilter,
} from '../../../common/filters';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

describe('AiController', () => {
  let app: INestApplication;
  let aiService: { generateDraft: jest.Mock };
  let rateLimitGuard: { canActivate: jest.Mock };

  beforeEach(async () => {
    aiService = { generateDraft: jest.fn() };
    rateLimitGuard = { canActivate: jest.fn().mockResolvedValue(true) };

    const moduleRef = await Test.createTestingModule({
      controllers: [AiController],
      providers: [AiService],
    })
      .overrideProvider(AiService)
      .useValue(aiService)
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest<{ user?: JwtPayload }>();
          req.user = { persnum: 123 } as JwtPayload;
          return true;
        },
      })
      .overrideGuard(AiRateLimitGuard)
      .useValue(rateLimitGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.use((req: { user?: JwtPayload }, _res: unknown, next: () => void) => {
      req.user = { persnum: 123 } as JwtPayload;
      next();
    });
    const reflector = app.get(Reflector);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalInterceptors(new TransformResponseInterceptor(reflector));
    app.useGlobalFilters(new HttpExceptionFilter(), new AllExceptionsFilter());
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('POST /AI/draft → 200 wrapped envelope on success', async () => {
    aiService.generateDraft.mockResolvedValue({
      draftHtml: '<p>isi</p>',
      draftPerihal: 'P',
      raw: false,
    });
    const res = await request(app.getHttpServer())
      .post('/AI/draft')
      .send({ naskahType: 'kajian', brief: 'analisis ruang server' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({
      draftHtml: '<p>isi</p>',
      draftPerihal: 'P',
      raw: false,
    });
    expect(aiService.generateDraft).toHaveBeenCalledWith(
      expect.objectContaining({ naskahType: 'kajian' }),
      123,
    );
  });

  it('POST /AI/draft → 400 when brief missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/AI/draft')
      .send({ naskahType: 'kajian' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /AI/draft → 400 on unknown field (forbidNonWhitelisted)', async () => {
    const res = await request(app.getHttpServer())
      .post('/AI/draft')
      .send({ naskahType: 'kajian', brief: 'analisis x', hax: true });
    expect(res.status).toBe(400);
  });

  it('POST /AI/draft → 429 when rate limit guard throws', async () => {
    rateLimitGuard.canActivate.mockRejectedValue(
      new HttpException('Kuota harian generate draft AI habis', 429),
    );
    const res = await request(app.getHttpServer())
      .post('/AI/draft')
      .send({ naskahType: 'kajian', brief: 'analisis x' });
    expect(res.status).toBe(429);
  });

  it('POST /AI/draft → 502 when aiService throws 502', async () => {
    aiService.generateDraft.mockRejectedValue(
      new HttpException('AI sedang tidak tersedia, coba lagi', 502),
    );
    const res = await request(app.getHttpServer())
      .post('/AI/draft')
      .send({ naskahType: 'kajian', brief: 'analisis x' });
    expect(res.status).toBe(502);
  });
});
