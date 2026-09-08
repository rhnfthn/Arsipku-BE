import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SuratDinasInternalService } from './surat-dinas-internal.service';
import { correspondenceOrgFixture } from '../../../test-fixtures/correspondence-org.fixture';

describe('SDI structural routing baseline (before configurable overlay)', () => {
  let service: SuratDinasInternalService;
  let org: ReturnType<typeof correspondenceOrgFixture>;
  let source: { findOrg: jest.Mock };

  beforeEach(() => {
    org = correspondenceOrgFixture();
    source = { findOrg: jest.fn().mockResolvedValue({ position_json: org }) };
    service = Object.assign(
      Object.create(SuratDinasInternalService.prototype),
      {
        orgDataService: source,
      },
    );
  });

  it.each([
    ['BOD', 1, [7, 11]],
    ['EVP', 2, [7, 11]],
    ['VP', 3, [7, 11]],
    ['GM', 7, [2, 11]],
    ['DGM', 8, [2, 11]],
    ['Manager Operasi', 9, [2, 11]],
  ])(
    '%s retains REKAN and TEMBUSAN independently',
    async (_, senderId, ids) => {
      const byId = new Map(org.map((p) => [p.position, p]));
      expect(
        await service.getSdiRecipients(senderId as number, '2026-09-04'),
      ).toEqual({
        sender: byId.get(senderId as number),
        recipients: {
          REKAN: (ids as number[]).map((id) => byId.get(id)),
          TEMBUSAN: [byId.get(1)],
        },
      });
      expect(source.findOrg).toHaveBeenCalledWith('2026-09-04');
    },
  );

  it('rejects staff, unknown sender and missing snapshot', async () => {
    await expect(service.getSdiRecipients(5)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.getSdiRecipients(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    source.findOrg.mockResolvedValue(null);
    await expect(service.getSdiRecipients(8)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('preserves cross-company exclusion and vacant GM eligibility', async () => {
    const result = await service.getSdiRecipients(8);
    expect(result.recipients.REKAN.map((p) => p.position)).toEqual([2, 11]);
    // The runtime field is missing from the legacy DTO; assert its real shape.
    expect(result.recipients).toEqual(
      expect.objectContaining({ TEMBUSAN: [org[0]] }),
    );
    expect(
      result.recipients.REKAN.find((p) => p.position === 11)?.persnum_person,
    ).toBeNull();
  });
});
