import { PermissionCacheService } from './permission-cache.service';

describe('PermissionCacheService', () => {
  let service: PermissionCacheService;

  beforeEach(() => {
    service = new PermissionCacheService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('get / set', () => {
    it('should return null for cache miss', () => {
      expect(service.get(123)).toBeNull();
    });

    it('should return cached permissions after set', () => {
      const perms = [{ resource: 'naskah-dinas', actions: ['read'] }];
      service.set(123, perms);
      expect(service.get(123)).toEqual(perms);
    });

    it('should return null for expired entry', () => {
      const perms = [{ resource: 'naskah-dinas', actions: ['read'] }];
      service.set(123, perms);

      service.invalidate(123);
      expect(service.get(123)).toBeNull();
    });
  });

  describe('invalidate', () => {
    it('should remove entry for specific persnum', () => {
      service.set(1, [{ resource: 'a', actions: ['x'] }]);
      service.set(2, [{ resource: 'b', actions: ['y'] }]);

      service.invalidate(1);

      expect(service.get(1)).toBeNull();
      expect(service.get(2)).not.toBeNull();
    });
  });

  describe('invalidateAll', () => {
    it('should remove all entries', () => {
      service.set(1, [{ resource: 'a', actions: ['x'] }]);
      service.set(2, [{ resource: 'b', actions: ['y'] }]);
      service.set(3, [{ resource: 'c', actions: ['z'] }]);

      service.invalidateAll();

      expect(service.get(1)).toBeNull();
      expect(service.get(2)).toBeNull();
      expect(service.get(3)).toBeNull();
    });
  });

  describe('cleanupExpired', () => {
    it('should not throw when cache is empty', () => {
      expect(() => service.cleanupExpired()).not.toThrow();
    });

    it('should not remove valid entries', () => {
      service.set(1, [{ resource: 'a', actions: ['x'] }]);
      service.cleanupExpired();
      expect(service.get(1)).not.toBeNull();
    });
  });

  describe('getTtlMs', () => {
    it('should return 1000 ms', () => {
      expect(service.getTtlMs()).toBe(1_000);
    });
  });
});
