import { OllamaService } from './ollama.service';
import { of } from 'rxjs';

describe('OllamaService', () => {
  const makeConfig = (overrides: Record<string, string> = {}) => ({
    get: (k: string) =>
      ({
        AI_OLLAMA_URL: 'http://ollama-host:11434',
        AI_OLLAMA_MODEL: 'qwen3:4b',
        AI_OLLAMA_NUM_PREDICT: '500',
        AI_OLLAMA_TEMPERATURE: '0.2',
        AI_OLLAMA_NUM_CTX: '2048',
        AI_REQUEST_TIMEOUT_MS: '60000',
        ...overrides,
      })[k],
  });

  it('posts to /api/generate and returns response text', async () => {
    const httpService: any = {
      post: jest.fn().mockReturnValue(of({ data: { response: 'hasil json' } })),
    };
    const service = new OllamaService(httpService, makeConfig() as any);
    const out = await service.generate('prompt-text');
    expect(httpService.post).toHaveBeenCalledWith(
      'http://ollama-host:11434/api/generate',
      expect.objectContaining({
        model: 'qwen3:4b',
        prompt: 'prompt-text',
        stream: false,
      }),
      expect.objectContaining({ timeout: 60000 }),
    );
    expect(httpService.post.mock.calls[0][1]).not.toHaveProperty('format');
    expect(out).toBe('hasil json');
  });

  it('sends response format only when AI_OLLAMA_FORMAT is configured', async () => {
    const httpService: any = {
      post: jest.fn().mockReturnValue(of({ data: { response: 'ok' } })),
    };
    const service = new OllamaService(
      httpService,
      makeConfig({ AI_OLLAMA_FORMAT: 'json' }) as any,
    );
    await service.generate('prompt-text');
    expect(httpService.post.mock.calls[0][1]).toEqual(
      expect.objectContaining({ format: 'json' }),
    );
  });

  it('throws when ollama returns an error payload', async () => {
    const httpService: any = {
      post: jest
        .fn()
        .mockReturnValue(of({ data: { error: 'model not found' } })),
    };
    const service = new OllamaService(httpService, makeConfig() as any);
    await expect(service.generate('p')).rejects.toThrow('model not found');
  });

  it('throws if AI_OLLAMA_URL is missing', async () => {
    const httpService: any = { post: jest.fn() };
    const service = new OllamaService(
      httpService,
      makeConfig({ AI_OLLAMA_URL: '' }) as any,
    );
    await expect(service.generate('p')).rejects.toThrow(/AI_OLLAMA_URL/);
  });

  it('throws if AI_OLLAMA_MODEL is missing', async () => {
    const httpService: any = { post: jest.fn() };
    const service = new OllamaService(
      httpService,
      makeConfig({ AI_OLLAMA_MODEL: '' }) as any,
    );
    await expect(service.generate('p')).rejects.toThrow(/AI_OLLAMA_MODEL/);
  });

  it('sends Authorization Bearer header when AI_OLLAMA_API_KEY is set', async () => {
    const httpService: any = {
      post: jest.fn().mockReturnValue(of({ data: { response: 'ok' } })),
    };
    const config = makeConfig({ AI_OLLAMA_API_KEY: 'sk-test-123' }) as any;
    const service = new OllamaService(httpService, config);
    await service.generate('p');
    const callArg = httpService.post.mock.calls[0];
    const reqConfig = callArg[2];
    expect(reqConfig.headers.Authorization).toBe('Bearer sk-test-123');
  });

  it('omits Authorization header when AI_OLLAMA_API_KEY is empty', async () => {
    const httpService: any = {
      post: jest.fn().mockReturnValue(of({ data: { response: 'ok' } })),
    };
    const service = new OllamaService(httpService, makeConfig() as any);
    await service.generate('p');
    const reqConfig = httpService.post.mock.calls[0][2];
    expect(reqConfig.headers?.Authorization).toBeUndefined();
  });
});
