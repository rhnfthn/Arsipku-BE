import { CorrespondenceRoutingResolverService } from './correspondence-routing-resolver.service';
import { RoutingConfigCacheService } from './routing-config-cache.service';

const positions = [
  { position: 1, company: 10000, area: 'HQ', sub_area: 1, persnum_person: 101 },
  {
    position: 2,
    company: 10000,
    area: 'BRANCH_A',
    sub_area: 2,
    persnum_person: 102,
  },
  {
    position: 3,
    company: 10000,
    area: 'BRANCH_A',
    sub_area: 2,
    persnum_person: null,
  },
  {
    position: 4,
    company: 10000,
    area: 'BRANCH_B',
    sub_area: 3,
    persnum_person: 104,
  },
];

function buildResolver() {
  const roleRepo = { find: jest.fn() };
  const memberRepo = { find: jest.fn() };
  const ruleRepo = { find: jest.fn(), findOneBy: jest.fn() };
  const scopeRepo = { find: jest.fn() };
  const org = {
    findLatestOrg: jest.fn().mockResolvedValue({
      tgl: '2026-09-07',
      position_json: positions,
    }),
  };
  const resolver = new CorrespondenceRoutingResolverService(
    roleRepo as never,
    memberRepo as never,
    ruleRepo as never,
    scopeRepo as never,
    org as never,
    new RoutingConfigCacheService(),
  );
  return { resolver, roleRepo, memberRepo, ruleRepo, scopeRepo, org };
}

describe('CorrespondenceRoutingResolverService', () => {
  const previousFlag = process.env.CORRESPONDENCE_ROUTING_ENABLED;

  afterEach(() => {
    if (previousFlag === undefined)
      delete process.env.CORRESPONDENCE_ROUTING_ENABLED;
    else process.env.CORRESPONDENCE_ROUTING_ENABLED = previousFlag;
  });

  it('returns structural baseline and skips routing table queries when disabled', async () => {
    delete process.env.CORRESPONDENCE_ROUTING_ENABLED;
    const { resolver, roleRepo, memberRepo, ruleRepo, scopeRepo } =
      buildResolver();
    const result = await resolver.resolve({
      company: 10000,
      documentType: 'DI',
      actionType: 'CREATE',
      senderPositionId: 1,
      structuralRecipients: [positions[1], positions[1], positions[0]],
    });
    expect(result.effectiveRecipients.map((item) => item.position)).toEqual([
      2,
    ]);
    expect(result.configuredRecipients).toEqual([]);
    expect(result.warnings[0].code).toBe('FEATURE_DISABLED');
    expect(roleRepo.find).not.toHaveBeenCalled();
    expect(memberRepo.find).not.toHaveBeenCalled();
    expect(ruleRepo.find).not.toHaveBeenCalled();
    expect(scopeRepo.find).not.toHaveBeenCalled();
  });

  it('keeps additional SDI capability disabled without querying routing tables', async () => {
    delete process.env.CORRESPONDENCE_ROUTING_ENABLED;
    const { resolver, roleRepo, memberRepo, ruleRepo } = buildResolver();

    await expect(resolver.getCapabilities(10000, 2)).resolves.toEqual({
      feature_enabled: false,
      can_create_sdi: false,
      matched_role_codes: [],
      matched_rule_ids: [],
    });
    expect(roleRepo.find).not.toHaveBeenCalled();
    expect(memberRepo.find).not.toHaveBeenCalled();
    expect(ruleRepo.find).not.toHaveBeenCalled();
  });

  it('grants SDI capability to any source role of an active primary rule, regardless of role code', async () => {
    process.env.CORRESPONDENCE_ROUTING_ENABLED = 'true';
    const { resolver, roleRepo, memberRepo, ruleRepo, scopeRepo } =
      buildResolver();
    roleRepo.find.mockResolvedValue([
      { id: 'manager', code: 'MANAGER_OPERASI', company: 10000, is_active: 1 },
      { id: 'dgm', code: 'DGM_PEO', company: 10000, is_active: 1 },
      { id: 'inmc', code: 'VP_INMC', company: 10000, is_active: 1 },
    ]);
    memberRepo.find.mockResolvedValue([
      {
        role_id: 'manager',
        position_id: 2,
        is_active: 1,
        valid_from: '2026-01-01',
        valid_to: null,
      },
      {
        role_id: 'dgm',
        position_id: 4,
        is_active: 1,
        valid_from: '2026-01-01',
        valid_to: null,
      },
    ]);
    ruleRepo.find.mockResolvedValue([
      {
        id: 'manager-to-inmc',
        source_role_id: 'manager',
        target_role_id: 'inmc',
        delivery_type: 'PENERIMA',
      },
      {
        id: 'dgm-to-inmc',
        source_role_id: 'dgm',
        target_role_id: 'inmc',
        delivery_type: 'PENERIMA',
      },
    ]);
    scopeRepo.find.mockResolvedValue([]);

    await expect(resolver.getCapabilities(10000, 2)).resolves.toEqual({
      feature_enabled: true,
      can_create_sdi: true,
      matched_role_codes: ['MANAGER_OPERASI'],
      matched_rule_ids: ['manager-to-inmc'],
    });
    // Regression (UAT-E): Deputy GM PEO must unlock SDI access the same way
    // as Manager Operasi instead of being blocked by a hardcoded role code.
    await expect(resolver.getCapabilities(10000, 4)).resolves.toEqual({
      feature_enabled: true,
      can_create_sdi: true,
      matched_role_codes: ['DGM_PEO'],
      matched_rule_ids: ['dgm-to-inmc'],
    });
    await expect(resolver.getCapabilities(10000, 3)).resolves.toMatchObject({
      can_create_sdi: false,
    });
  });

  it('uses the organization snapshot for the effective document date', async () => {
    const { resolver, org } = buildResolver();
    org.findOrg = jest.fn().mockResolvedValue({
      tgl: '2026-08-01',
      position_json: positions,
    });
    delete process.env.CORRESPONDENCE_ROUTING_ENABLED;
    await resolver.resolve({
      company: 10000,
      documentType: 'DI',
      actionType: 'CREATE',
      senderPositionId: 1,
      effectiveDate: '2026-08-01',
      structuralRecipients: [positions[1]],
    });
    expect(org.findOrg).toHaveBeenCalledWith('2026-08-01');
  });

  it('merges configured targets, preserves structural order, and reserves mandatory CC', async () => {
    process.env.CORRESPONDENCE_ROUTING_ENABLED = 'true';
    const { resolver, roleRepo, memberRepo, ruleRepo, scopeRepo } =
      buildResolver();
    const sourceRole = { id: 'source', company: 10000, is_active: 1 };
    const targetRole = { id: 'target', company: 10000, is_active: 1 };
    roleRepo.find.mockResolvedValue([sourceRole, targetRole]);
    memberRepo.find.mockResolvedValue([
      {
        role_id: 'source',
        position_id: 2,
        is_active: 1,
        valid_from: '2026-01-01',
      },
      {
        role_id: 'target',
        position_id: 3,
        is_active: 1,
        valid_from: '2026-01-01',
      },
      {
        role_id: 'target',
        position_id: 4,
        is_active: 1,
        valid_from: '2026-01-01',
      },
    ]);
    ruleRepo.find.mockResolvedValue([
      {
        id: 'rule-recipient',
        company: 10000,
        code: 'RECIPIENT',
        source_role_id: 'source',
        target_role_id: 'target',
        action_type: 'CREATE',
        valid_from: '2026-01-01',
        valid_to: null,
        scope_type: 'SAME_AREA',
        delivery_type: 'PENERIMA',
        effect: 'ALLOW_SELECT',
        mandatory: 0,
      },
      {
        id: 'rule-cc',
        company: 10000,
        code: 'CC',
        source_role_id: 'source',
        target_role_id: 'target',
        action_type: 'CREATE',
        valid_from: '2026-01-01',
        valid_to: null,
        scope_type: 'SAME_AREA',
        delivery_type: 'TEMBUSAN',
        effect: 'AUTO_INCLUDE',
        mandatory: 1,
      },
    ]);
    scopeRepo.find.mockResolvedValue([]);
    const result = await resolver.resolve({
      company: 10000,
      documentType: 'SDI',
      actionType: 'CREATE',
      senderPositionId: 2,
      effectiveDate: '2026-09-07',
      structuralRecipients: [positions[2]],
    });
    expect(result.configuredRecipients.map((item) => item.position)).toEqual([
      3,
    ]);
    expect(result.effectiveRecipients.map((item) => item.position)).toEqual([
      3,
    ]);
    expect(result.mandatoryCc).toEqual([]);
    expect(
      result.warnings.some((warning) => warning.code === 'VACANT_POSITION'),
    ).toBe(true);
    expect(result.matchedRuleIds).toEqual(['rule-cc', 'rule-recipient']);
    expect(result.metadataByPositionId[3].routingRuleIds).toEqual([
      'rule-cc',
      'rule-recipient',
    ]);
  });

  it('filters same-area and same-sender targets deterministically', async () => {
    process.env.CORRESPONDENCE_ROUTING_ENABLED = 'true';
    const { resolver, roleRepo, memberRepo, ruleRepo, scopeRepo } =
      buildResolver();
    roleRepo.find.mockResolvedValue([
      { id: 'source', company: 10000, is_active: 1 },
      { id: 'target', company: 10000, is_active: 1 },
    ]);
    memberRepo.find.mockResolvedValue([
      {
        role_id: 'source',
        position_id: 1,
        is_active: 1,
        valid_from: '2026-01-01',
      },
      {
        role_id: 'target',
        position_id: 1,
        is_active: 1,
        valid_from: '2026-01-01',
      },
      {
        role_id: 'target',
        position_id: 4,
        is_active: 1,
        valid_from: '2026-01-01',
      },
    ]);
    ruleRepo.find.mockResolvedValue([
      {
        id: 'same-area',
        company: 10000,
        code: 'SAME_AREA',
        source_role_id: 'source',
        target_role_id: 'target',
        action_type: 'CREATE',
        valid_from: '2026-01-01',
        valid_to: null,
        scope_type: 'SAME_AREA',
        delivery_type: 'PENERIMA',
        effect: 'ALLOW_SELECT',
        mandatory: 0,
      },
    ]);
    scopeRepo.find.mockResolvedValue([]);
    const result = await resolver.resolve({
      company: 10000,
      documentType: 'DI',
      actionType: 'CREATE',
      senderPositionId: 1,
      effectiveDate: '2026-09-07',
    });
    expect(result.configuredRecipients).toEqual([]);
    expect(
      result.warnings.some((warning) => warning.code === 'NO_TARGET'),
    ).toBe(true);
    expect(result.matchedRuleIds).toEqual([]);
  });
});
