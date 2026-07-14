import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class OllamaService {
  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {}

  async generate(prompt: string, apiKeyOverride?: string): Promise<string> {
    const url = this.config.get<string>('AI_OLLAMA_URL');
    const model = this.config.get<string>('AI_OLLAMA_MODEL');
    if (!url) throw new Error('AI_OLLAMA_URL tidak dikonfigurasi');
    if (!model) throw new Error('AI_OLLAMA_MODEL tidak dikonfigurasi');

    const num_predict = Number(this.config.get('AI_OLLAMA_NUM_PREDICT') ?? 500);
    const temperature = Number(this.config.get('AI_OLLAMA_TEMPERATURE') ?? 0.2);
    const num_ctx = Number(this.config.get('AI_OLLAMA_NUM_CTX') ?? 2048);
    const timeout = Number(this.config.get('AI_REQUEST_TIMEOUT_MS') ?? 60000);
    // Per-user key wins; empty/undefined falls back to server env key.
    const apiKey =
      (apiKeyOverride && apiKeyOverride.trim()) ||
      this.config.get<string>('AI_OLLAMA_API_KEY') ||
      '';
    const responseFormat = this.config.get<string>('AI_OLLAMA_FORMAT');

    const headers: Record<string, string> = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const requestBody: Record<string, unknown> = {
      model,
      prompt,
      stream: false,
      options: { num_predict, temperature, num_ctx },
    };

    if (responseFormat) {
      requestBody.format = responseFormat;
    }

    const res = await firstValueFrom(
      this.httpService.post(
        `${url.replace(/\/+$/, '')}/api/generate`,
        requestBody,
        { timeout, headers },
      ),
    );
    const data: any = res.data;
    if (data?.error) {
      throw new Error(
        typeof data.error === 'string'
          ? data.error
          : JSON.stringify(data.error),
      );
    }
    return data?.response ?? '';
  }
}
