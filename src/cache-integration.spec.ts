/* eslint-disable */
import 'dotenv/config';
import { Test } from '@nestjs/testing';
import {
  INestApplication,
  Controller,
  Get,
  UseInterceptors,
} from '@nestjs/common';
import {
  CacheModule,
  CacheInterceptor,
  CacheTTL,
  CACHE_MANAGER,
} from '@nestjs/cache-manager';
import request from 'supertest';
import KeyvRedis from '@keyv/redis';

@Controller('test-cache')
class TestCacheController {
  callCount = 0;
  @Get()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(10_000)
  findAll() {
    this.callCount++;
    return { callCount: this.callCount };
  }
}

describe('Redis cache integration (CacheInterceptor + KeyvRedis namespace arsipku)', () => {
  let app: INestApplication;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cache: any;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        CacheModule.registerAsync({
          useFactory: () => ({
            stores: [
              new KeyvRedis(process.env.REDIS_URL, { throwOnConnectError: false }),
            ],
            namespace: 'arsipku',
            ttl: 10_000,
          }),
        }),
      ],
      controllers: [TestCacheController],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    cache = app.get(CACHE_MANAGER);
  });

  afterAll(async () => {
    try {
      await cache.del('/test-cache');
    } catch {}
    await app.close();
  });

  it('2nd request is served from cache (handler invoked once)', async () => {
    const r1 = await request(app.getHttpServer()).get('/test-cache');
    expect(r1.status).toBe(200);
    expect(r1.body).toEqual({ callCount: 1 });

    const r2 = await request(app.getHttpServer()).get('/test-cache');
    expect(r2.status).toBe(200);
    expect(r2.body).toEqual({ callCount: 1 }); // same value

    const ctrl = app.get(TestCacheController);
    expect(ctrl.callCount).toBe(1); // handler ran ONCE → 2nd was a cache hit
  });

  it('value is stored in Redis under the arsipku: prefix', async () => {
    const cached = await cache.get('/test-cache');
    expect(cached).toEqual({ callCount: 1 });
  });
});