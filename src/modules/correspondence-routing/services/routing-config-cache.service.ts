import { Injectable } from '@nestjs/common';

@Injectable()
export class RoutingConfigCacheService {
  readonly ttlMs = 30_000;
  private generation = 0;
  private entries = new Map<string, { value: unknown; expires: number }>();
  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry || entry.expires <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return structuredClone(entry.value) as T;
  }
  set(key: string, value: unknown, generation: number) {
    if (generation !== this.generation) return; // Reject a stale in-flight load.
    if (this.entries.size >= 100) {
      for (const oldestKey of this.entries.keys()) {
        this.entries.delete(oldestKey);
        break;
      }
    }
    this.entries.set(key, {
      value: structuredClone(value),
      expires: Date.now() + this.ttlMs,
    });
  }
  invalidate() {
    this.generation++;
    this.entries.clear();
  }
  state() {
    return {
      generation: this.generation,
      entries: this.entries.size,
      ttlMs: this.ttlMs,
      scope: 'process',
    };
  }
}
