import { RoutingConfigCacheService } from './routing-config-cache.service';

describe('RoutingConfigCacheService', () => {
  it('clones values and invalidates all process-local entries', () => {
    const cache = new RoutingConfigCacheService();
    const generation = cache.state().generation;
    const original = { positions: [1] };
    cache.set('rule', original, generation);
    original.positions.push(2);
    expect(cache.get('rule')).toEqual({ positions: [1] });

    cache.invalidate();
    expect(cache.get('rule')).toBeUndefined();
    expect(cache.state()).toMatchObject({ generation: 1, entries: 0 });
  });

  it('rejects stale in-flight writes after invalidation', () => {
    const cache = new RoutingConfigCacheService();
    const staleGeneration = cache.state().generation;
    cache.invalidate();
    cache.set('stale', { value: true }, staleGeneration);
    expect(cache.get('stale')).toBeUndefined();
  });
});
