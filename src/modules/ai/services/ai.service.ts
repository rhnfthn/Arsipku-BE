import { Injectable, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { GenerateDraftDto } from '../dto/generate-draft.dto';
import { buildPrompt, DraftInput } from './prompt.builder';
import { OllamaService } from './ollama.service';
import { AiLogService } from './ai-log.service';
import { UserAiConfigService } from './user-ai-config.service';

export interface DraftResult {
  draftHtml: string;
  draftPerihal: string;
  raw: boolean;
}

type StructuredContentBlock = {
  type?: unknown;
  text?: unknown;
  content?: unknown;
  value?: unknown;
  body?: unknown;
  items?: unknown;
};

@Injectable()
export class AiService {
  constructor(
    private readonly ollama: OllamaService,
    private readonly logService: AiLogService,
    private readonly config: ConfigService,
    private readonly userAiConfigService: UserAiConfigService,
  ) {}

  async generateDraft(
    dto: GenerateDraftDto,
    persnum: number,
  ): Promise<DraftResult> {
    const started = Date.now();
    const model = this.config.get<string>('AI_OLLAMA_MODEL') ?? 'unknown';
    const input: DraftInput = {
      brief: dto.brief,
      fields: dto.fields,
      referenceContent: dto.referenceContent,
    };
    const requestBody = JSON.stringify(input);

    try {
      const prompt = buildPrompt(dto.naskahType, input);
      const userKey = await this.userAiConfigService.getApiKey(persnum);
      const raw = await this.ollama.generate(prompt, userKey ?? undefined);
      if (!raw.trim()) {
        throw new Error('AI response kosong');
      }
      const result = this.parseResponse(raw, input);
      await this.logService.log({
        request_id: randomUUID(),
        persnum,
        naskah_type: dto.naskahType,
        status_code: 200,
        model,
        duration_ms: Date.now() - started,
        request_body_redacted: requestBody,
        response_size: raw.length,
        error_message: null,
      });
      return result;
    } catch (err) {
      await this.logService.log({
        request_id: randomUUID(),
        persnum,
        naskah_type: dto.naskahType,
        status_code: 502,
        model,
        duration_ms: Date.now() - started,
        request_body_redacted: requestBody,
        response_size: null,
        error_message: String((err as Error)?.message ?? err).slice(0, 500),
      });
      throw new HttpException('AI sedang tidak tersedia, coba lagi', 502);
    }
  }

  private parseResponse(raw: string, input?: DraftInput): DraftResult {
    if (!raw.trim()) {
      throw new Error('AI response kosong');
    }

    let obj: any;
    try {
      obj = this.parseJsonObject(raw);
    } catch {
      return {
        draftHtml: raw,
        draftPerihal: this.resolvePerihal(null, input),
        raw: true,
      };
    }

    const draftHtml = this.renderDraftHtml(obj);
    if (!draftHtml.trim()) {
      throw new Error('AI response tidak berisi draf');
    }

    return {
      draftHtml,
      draftPerihal: this.resolvePerihal(obj, input),
      raw: false,
    };
  }

  private parseJsonObject(raw: string): any {
    try {
      return JSON.parse(raw);
    } catch {
      const candidate = this.extractFirstJsonObject(raw);
      if (!candidate) throw new Error('AI response is not valid JSON');
      return JSON.parse(candidate);
    }
  }

  private extractFirstJsonObject(raw: string): string | null {
    const start = raw.indexOf('{');
    if (start < 0) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < raw.length; index += 1) {
      const char = raw[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\' && inString) {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '{') depth += 1;
      if (char === '}') depth -= 1;

      if (depth === 0) {
        return raw.slice(start, index + 1);
      }
    }

    return null;
  }

  private renderDraftHtml(obj: any): string {
    if (Array.isArray(obj?.content)) {
      const stringItems = obj.content
        .map((item: unknown) => this.normalizeText(item))
        .filter(Boolean);
      if (stringItems.length > 0 && stringItems.length === obj.content.length) {
        return stringItems
          .map((text) => `<p>${this.escapeHtml(text)}</p>`)
          .join('\n');
      }

      const html = obj.content
        .map((block: unknown) => this.renderContentBlock(block))
        .filter(Boolean)
        .join('');
      if (html) return html;
    }

    if (typeof obj?.content === 'string') {
      const text = this.normalizeText(obj.content);
      if (text) return `<p>${this.escapeHtml(text)}</p>`;
    }

    if (obj?.content && typeof obj.content === 'object') {
      const html = this.renderContentBlock(obj.content);
      if (html) return html;
    }

    if (Array.isArray(obj?.paragraphs)) {
      const html = obj.paragraphs
        .map((item) => this.normalizeListItem(item))
        .filter(Boolean)
        .map((item) => `<p>${this.escapeHtml(item)}</p>`)
        .join('');
      if (html) return html;
    }

    for (const value of [
      obj?.isi,
      obj?.body,
      obj?.draft,
      obj?.text,
      obj?.sections,
      obj?.points,
      obj?.butir,
      obj?.paragraf,
    ]) {
      const html = this.renderUnknownBody(value);
      if (html) return html;
    }

    if (Array.isArray(obj?.items)) {
      const renderedItems = obj.items
        .map((item) => this.normalizeText(item))
        .filter(Boolean)
        .map((item) => `<li>${this.escapeHtml(item)}</li>`)
        .join('');
      if (renderedItems) return `<ol>${renderedItems}</ol>`;
    }

    const textBody = this.firstString(
      obj?.isi,
      obj?.body,
      obj?.text,
      obj?.draft,
    );
    if (textBody) {
      return `<p>${this.escapeHtml(textBody)}</p>`;
    }

    // Backward compatibility for older prompt outputs.
    const legacyHtml = this.firstString(obj?.isi_html, obj?.draftHtml);
    if (legacyHtml) return legacyHtml;

    return this.renderTextCandidatesAsParagraphs(this.collectBodyText(obj));
  }

  private renderContentBlock(block: unknown): string {
    const stringBlock = this.normalizeText(block);
    if (stringBlock) return `<p>${this.escapeHtml(stringBlock)}</p>`;

    if (!block || typeof block !== 'object') return '';

    const contentBlock = block as StructuredContentBlock;

    const type = this.normalizeText(contentBlock.type).toLowerCase();

    if (
      type === 'list' ||
      type === 'ordered_list' ||
      type === 'ol' ||
      (!type && Array.isArray(contentBlock.items))
    ) {
      const items = Array.isArray(contentBlock.items)
        ? contentBlock.items
        : Array.isArray(contentBlock.content)
          ? contentBlock.content
          : [];
      const renderedItems = items
        .map((item) => this.normalizeListItem(item))
        .filter(Boolean);
      return renderedItems.length > 0 ? this.renderListHtml(renderedItems) : '';
    }

    if (!type || type === 'paragraph' || type === 'p') {
      const text = this.firstString(
        contentBlock.text,
        contentBlock.content,
        contentBlock.value,
        contentBlock.body,
      );
      return text ? `<p>${this.escapeHtml(text)}</p>` : '';
    }

    return '';
  }

  private normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private normalizeListItem(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (value && typeof value === 'object') {
      return this.firstString(
        (value as any).text,
        (value as any).content,
        (value as any).value,
        (value as any).body,
        (value as any).isi,
        (value as any).draft,
      );
    }
    return '';
  }

  private renderUnknownBody(value: unknown): string {
    const text = this.normalizeText(value);
    if (text) return `<p>${this.escapeHtml(text)}</p>`;

    if (Array.isArray(value)) {
      const items = value
        .map((item) => this.normalizeListItem(item))
        .filter(Boolean);
      return items.length > 0 ? this.renderListHtml(items) : '';
    }

    if (value && typeof value === 'object') {
      return this.renderContentBlock(value);
    }

    return '';
  }

  private renderListHtml(items: string): string;
  private renderListHtml(items: string[]): string;
  private renderListHtml(items: string | string[]): string {
    const normalizedItems = Array.isArray(items) ? items : [items];
    const renderedItems = normalizedItems
      .map((item) => this.normalizeText(item))
      .filter(Boolean)
      .map((item) => `<li>${this.escapeHtml(item)}</li>`)
      .join('');
    return renderedItems ? `<ol>${renderedItems}</ol>` : '';
  }

  private firstString(...values: unknown[]): string {
    for (const value of values) {
      const normalized = this.normalizeText(value);
      if (normalized) return normalized;
    }
    return '';
  }

  private resolvePerihal(obj: any, input?: DraftInput): string {
    const aiPerihal = this.firstString(
      obj?.perihal,
      obj?.draftPerihal,
      obj?.subject,
      obj?.judul,
      obj?.title,
    );
    if (aiPerihal && aiPerihal !== '[ISI DATA]') return aiPerihal;

    return this.firstString(input?.fields?.perihal, input?.brief);
  }

  private collectBodyText(value: unknown, path = '', depth = 0): string[] {
    if (depth > 4 || value === undefined || value === null) return [];

    if (typeof value === 'string') {
      const normalized = value.trim();
      if (
        !normalized ||
        this.isMetadataPath(path) ||
        this.looksLikeHtml(normalized)
      ) {
        return [];
      }
      return [normalized];
    }

    if (Array.isArray(value)) {
      return value.flatMap((item, index) =>
        this.collectBodyText(item, `${path}.${index}`, depth + 1),
      );
    }

    if (typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>).flatMap(
        ([key, child]) =>
          this.collectBodyText(child, path ? `${path}.${key}` : key, depth + 1),
      );
    }

    return [];
  }

  private renderTextCandidatesAsParagraphs(candidates: string[]): string {
    const uniqueCandidates = Array.from(new Set(candidates)).slice(0, 8);
    return uniqueCandidates
      .map((text) => `<p>${this.escapeHtml(text)}</p>`)
      .join('');
  }

  private isMetadataPath(path: string): boolean {
    const key = path.toLowerCase();
    return [
      'perihal',
      'draftperihal',
      'subject',
      'judul',
      'title',
      'type',
      'status',
      'message',
      'error',
    ].some((part) => key.endsWith(part) || key.includes(`.${part}.`));
  }

  private looksLikeHtml(value: string): boolean {
    return /<\/?[a-z][\s\S]*>/i.test(value);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
