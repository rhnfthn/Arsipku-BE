import { CorrespondenceRoutingResolverService } from './correspondence-routing-resolver.service';
import { RoutingConfigCacheService } from './routing-config-cache.service';

describe('configured correspondence business matrix a-f', () => {
  it('resolves EVP/DGM, VP/Manager, and SDI mandatory-CC paths', async () => {
    process.env.CORRESPONDENCE_ROUTING_ENABLED = 'true';
    const positions = [20, 21, 22, 30, 40, 50, 60].map((position) => ({
      position,
      company: 10000,
      area: 'A',
      sub_area: 1,
      organization_id: 1,
      persnum_person: position,
    }));
    const roles = [
      ['evp-anc', 20],
      ['evp-anim', 21],
      ['evp-ansp', 22],
      ['dgm', 30],
      ['vp', 40],
      ['manager', 50],
      ['gm', 60],
    ].map(([id]) => ({ id, company: 10000, is_active: 1 }));
    const members = [
      ['evp-anc', 20],
      ['evp-anim', 21],
      ['evp-ansp', 22],
      ['dgm', 30],
      ['vp', 40],
      ['manager', 50],
      ['gm', 60],
    ].map(([role_id, position_id]) => ({
      role_id,
      position_id,
      is_active: 1,
      valid_from: '2026-01-01',
      valid_to: null,
    }));
    const rule = (
      id: string,
      source_role_id: string,
      target_role_id: string,
      document_type: 'DI' | 'SDI',
      delivery_type: 'PENERIMA' | 'TEMBUSAN',
      effect: 'ALLOW_SELECT' | 'AUTO_INCLUDE',
      mandatory: number,
    ) => ({
      id,
      company: 10000,
      source_role_id,
      target_role_id,
      document_type,
      action_type: 'CREATE',
      valid_from: '2026-01-01',
      valid_to: null,
      scope_type: 'ALL',
      delivery_type,
      effect,
      mandatory,
    });
    const rules = [
      rule('a', 'evp-anc', 'dgm', 'DI', 'PENERIMA', 'ALLOW_SELECT', 0),
      rule('b', 'evp-anim', 'dgm', 'DI', 'PENERIMA', 'ALLOW_SELECT', 0),
      rule('c', 'evp-ansp', 'dgm', 'DI', 'PENERIMA', 'ALLOW_SELECT', 0),
      rule('d', 'vp', 'manager', 'DI', 'PENERIMA', 'ALLOW_SELECT', 0),
      rule('e', 'dgm', 'evp-anc', 'SDI', 'PENERIMA', 'ALLOW_SELECT', 0),
      rule('e-cc', 'dgm', 'gm', 'SDI', 'TEMBUSAN', 'AUTO_INCLUDE', 1),
      rule('f', 'manager', 'vp', 'SDI', 'PENERIMA', 'ALLOW_SELECT', 0),
      rule('f-cc-gm', 'manager', 'gm', 'SDI', 'TEMBUSAN', 'AUTO_INCLUDE', 1),
      rule('f-cc-dgm', 'manager', 'dgm', 'SDI', 'TEMBUSAN', 'AUTO_INCLUDE', 1),
    ];
    const repo = (value: unknown) => ({
      find: jest.fn().mockResolvedValue(value),
    });
    const resolver = new CorrespondenceRoutingResolverService(
      repo(roles) as never,
      repo(members) as never,
      repo(rules) as never,
      repo([]) as never,
      {
        findOrg: jest.fn().mockResolvedValue({ position_json: positions }),
      } as never,
      new RoutingConfigCacheService(),
    );
    const resolve = (senderPositionId: number, documentType: 'DI' | 'SDI') =>
      resolver.resolve({
        company: 10000,
        documentType,
        actionType: 'CREATE',
        senderPositionId,
        effectiveDate: '2026-09-08',
        structuralRecipients: [],
        structuralCc: [],
      });
    for (const sender of [20, 21, 22])
      await expect(resolve(sender, 'DI')).resolves.toMatchObject({
        configuredRecipients: [expect.objectContaining({ position: 30 })],
      });
    await expect(resolve(40, 'DI')).resolves.toMatchObject({
      configuredRecipients: [expect.objectContaining({ position: 50 })],
    });
    await expect(resolve(30, 'SDI')).resolves.toMatchObject({
      configuredRecipients: [expect.objectContaining({ position: 20 })],
      mandatoryCc: [expect.objectContaining({ position: 60 })],
    });
    await expect(resolve(50, 'SDI')).resolves.toMatchObject({
      configuredRecipients: [expect.objectContaining({ position: 40 })],
      mandatoryCc: expect.arrayContaining([
        expect.objectContaining({ position: 30 }),
        expect.objectContaining({ position: 60 }),
      ]),
    });
    delete process.env.CORRESPONDENCE_ROUTING_ENABLED;
  });
});
