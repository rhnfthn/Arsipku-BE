import { SuratDinasInternalController } from './surat-dinas-internal.controller';
import { SuratDinasInternalService } from '../services/surat-dinas-internal.service';
import { correspondenceOrgFixture } from '../../../test-fixtures/correspondence-org.fixture';

describe('SDI recipient controller sender context baseline', () => {
  it.each([undefined, '8'])(
    'uses JWT position or explicit sender query %s',
    async (pengirim) => {
      const findOrg = jest
        .fn()
        .mockResolvedValue({ position_json: correspondenceOrgFixture() });
      const service: SuratDinasInternalService = Object.assign(
        Object.create(SuratDinasInternalService.prototype),
        {
          orgDataService: { findOrg },
        },
      );
      const controller: SuratDinasInternalController = Object.assign(
        Object.create(SuratDinasInternalController.prototype),
        {
          suratDinasInternalService: service,
        },
      );
      const result = await controller.getSdiRecipients(
        { position: '2' },
        { pengirim, tgl: '2026-09-04' },
      );
      expect(result.sender.position).toBe(pengirim ? 8 : 2);
      expect(result.recipients.REKAN.map((p) => p.position)).toEqual(
        pengirim ? [2, 11] : [7, 11],
      );
      expect(findOrg).toHaveBeenCalledWith('2026-09-04');
    },
  );
});
