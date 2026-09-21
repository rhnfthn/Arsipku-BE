import { ForbiddenException } from '@nestjs/common';
import { SuratDinasInternalService } from './surat-dinas-internal.service';
import { correspondenceOrgFixture } from '../../../test-fixtures/correspondence-org.fixture';

describe('SDI configurable routing overlay', () => {
  afterEach(() => delete process.env.CORRESPONDENCE_ROUTING_ENABLED);

  it('keeps baseline IDs and does not call resolver while disabled', async () => {
    const resolver = { resolve: jest.fn() };
    const service: SuratDinasInternalService = Object.assign(
      Object.create(SuratDinasInternalService.prototype),
      { correspondenceRoutingResolver: resolver },
    );
    await expect(
      service['resolveSdiRouting']([], 2, [3], [1], '2026-09-04'),
    ).resolves.toEqual({ penerimaIds: [3], tembusanIds: [1], plan: null });
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it('adds configured recipient and mandatory CC while removing recipient/CC conflict', async () => {
    process.env.CORRESPONDENCE_ROUTING_ENABLED = 'true';
    const org = correspondenceOrgFixture();
    const resolver = {
      resolve: jest.fn().mockResolvedValue({
        effectiveRecipients: [org[6], org[10]],
        mandatoryCc: [org[0], org[6]],
        matchedRuleIds: ['rule-sdi'],
        metadataByPositionId: {},
      }),
    };
    const service: SuratDinasInternalService = Object.assign(
      Object.create(SuratDinasInternalService.prototype),
      { correspondenceRoutingResolver: resolver },
    );
    const result = await service['resolveSdiRouting'](
      org,
      2,
      [11],
      [6],
      '2026-09-04',
    );
    expect(result.penerimaIds).toEqual([11]);
    expect(result.tembusanIds).toEqual([6, 1, 7]);
    expect(resolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ documentType: 'SDI', actionType: 'CREATE' }),
    );
  });

  it('merges configured recipients into the REKAN dropdown list (UAT-F)', async () => {
    process.env.CORRESPONDENCE_ROUTING_ENABLED = 'true';
    const org = correspondenceOrgFixture();
    const plan = {
      // Structural REKAN (2, 11) UNION configured recipient (3, e.g. VP INMC).
      effectiveRecipients: [
        org[1],
        org[10],
        { ...org[2], routing_source: 'configured' },
      ],
      mandatoryCc: [org[3]],
      matchedRuleIds: ['rule-sdi', 'rule-cc'],
      metadataByPositionId: {
        3: {
          routingSource: 'configured',
          routingRuleIds: ['rule-sdi'],
          effect: 'ALLOW_SELECT',
          mandatory: false,
        },
        4: {
          routingSource: 'configured',
          routingRuleIds: ['rule-cc'],
          effect: 'AUTO_INCLUDE',
          mandatory: true,
        },
      },
    };
    const service: SuratDinasInternalService = Object.assign(
      Object.create(SuratDinasInternalService.prototype),
      {
        orgDataService: {
          findOrg: jest.fn().mockResolvedValue({ position_json: org }),
        },
        correspondenceRoutingResolver: {
          resolve: jest.fn().mockResolvedValue(plan),
        },
      },
    );
    const result = await service.getSdiRecipients(8, '2026-09-04');
    expect(result.recipients.REKAN.map((p) => p.position)).toEqual([2, 11, 3]);
    expect(result.recipients.TEMBUSAN.map((p) => p.position)).toEqual([1, 4]);
    expect(
      result.recipients.REKAN.find((p) => p.position === 3)?.routing_source,
    ).toBe('configured');
    expect(
      result.recipients.TEMBUSAN.find((p) => p.position === 4)
        ?.routing_mandatory,
    ).toBe(true);
  });

  it('rejects a recipient outside the effective overlay', async () => {
    process.env.CORRESPONDENCE_ROUTING_ENABLED = 'true';
    const org = correspondenceOrgFixture();
    const service: SuratDinasInternalService = Object.assign(
      Object.create(SuratDinasInternalService.prototype),
      {
        correspondenceRoutingResolver: {
          resolve: jest.fn().mockResolvedValue({
            effectiveRecipients: [org[10]],
            mandatoryCc: [],
          }),
        },
      },
    );
    await expect(
      service['resolveSdiRouting'](org, 2, [3], [], '2026-09-04'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('audits only selected configured recipients and applied mandatory CC', async () => {
    const insert = jest.fn().mockResolvedValue(undefined);
    const service: SuratDinasInternalService = Object.assign(
      Object.create(SuratDinasInternalService.prototype),
      {},
    );
    const manager = { getRepository: jest.fn().mockReturnValue({ insert }) };
    const position = (id: number) => ({
      position: id,
      routing_source: 'configured',
    });
    const metadata = (ruleId: string, mandatory = false) => ({
      routingRuleIds: [ruleId],
      effect: mandatory ? 'AUTO_INCLUDE' : 'ALLOW_SELECT',
      mandatory,
    });

    await service['persistSdiRoutingApplied'](
      manager as never,
      'naskah-id',
      '2026-09-08',
      2,
      [10],
      [12],
      {
        matchedRuleIds: ['rule-selected', 'rule-unselected', 'rule-cc'],
        effectiveRecipients: [position(10), position(11)],
        mandatoryCc: [position(12)],
        metadataByPositionId: {
          10: metadata('rule-selected'),
          11: metadata('rule-unselected'),
          12: metadata('rule-cc', true),
        },
      } as never,
    );

    expect(insert).toHaveBeenCalledTimes(1);
    const rows = insert.mock.calls[0][0];
    expect(rows.map((row: any) => row.target_position_id)).toEqual([10, 12]);
    expect(rows.map((row: any) => row.rule_id)).toEqual([
      'rule-selected',
      'rule-cc',
    ]);
  });
});
