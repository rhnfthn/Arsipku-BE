import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DisposisiService } from './disposisi.service';
import { correspondenceOrgFixture } from '../../../test-fixtures/correspondence-org.fixture';

describe('DI structural routing baseline (before configurable overlay)', () => {
  let service: DisposisiService;
  let org: ReturnType<typeof correspondenceOrgFixture>;
  let source: { findOrg: jest.Mock; findLatestOrg: jest.Mock };

  beforeEach(() => {
    org = correspondenceOrgFixture();
    source = {
      findOrg: jest.fn().mockResolvedValue({ position_json: org }),
      findLatestOrg: jest.fn().mockResolvedValue({ position_json: org }),
    };
    // Execute real service methods, without booting AppModule/migrations/jobs.
    service = Object.assign(Object.create(DisposisiService.prototype), {
      orgDataService: source,
    });
  });

  it.each([
    ['BOD', 1, [2, 3, 4, 5, 6, 7, 11]],
    ['EVP', 2, [3, 4, 5, 6]],
    ['VP', 3, [4, 5]],
    ['GM', 7, [8, 9, 10]],
    ['DGM', 8, [9, 10]],
    ['Manager Operasi', 9, [10]],
  ])(
    '%s retains ordered recipients and legacy response fields',
    async (_, senderId, ids) => {
      const byId = new Map(org.map((p) => [p.position, p]));
      const expected = ids.map((id) => byId.get(id)!);
      const sender = byId.get(senderId)!;
      expect(await service.getDisposisiRecipients(senderId)).toEqual({
        sender,
        recipients: { ATASAN: [], BAWAHAN: expected, REKAN: [] },
        hierarchy: {
          maxDepth: 3 - sender.level,
          totalOrganizations: new Set(expected.map((p) => p.organization_id))
            .size,
          totalRecipients: expected.length,
        },
      });
      expect(source.findOrg).toHaveBeenCalledTimes(1);
      expect(source.findLatestOrg).not.toHaveBeenCalled();
    },
  );

  it('rejects non-managerial and unknown senders', async () => {
    await expect(service.getDisposisiRecipients(5)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.getDisposisiRecipients(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('preserves the fallback to latest snapshot when date lookup throws', async () => {
    source.findOrg.mockRejectedValue(new NotFoundException());
    const warning = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    try {
      expect(
        (await service.getDisposisiRecipients(8)).recipients.BAWAHAN.map(
          (p) => p.position,
        ),
      ).toEqual([9, 10]);
      expect(source.findLatestOrg).toHaveBeenCalledTimes(1);
    } finally {
      warning.mockRestore();
    }
  });

  it('validates descendants and rejects cross-branch DGM before the overlay exists', async () => {
    const validate = (ids: number[]) =>
      service['validateRecipients'](org, 2, ids);
    await expect(validate([3, 4, 5])).resolves.toBeNull();
    await expect(validate([8])).rejects.toBeInstanceOf(ForbiddenException);
    await expect(validate([999])).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps vacancy behavior visible: EVP includes vacant descendant staff, VP excludes it', async () => {
    const evp = await service.getDisposisiRecipients(2);
    const vp = await service.getDisposisiRecipients(3);
    expect(evp.recipients.BAWAHAN.some((p) => p.position === 6)).toBe(true);
    expect(vp.recipients.BAWAHAN.some((p) => p.position === 6)).toBe(false);
  });
});
