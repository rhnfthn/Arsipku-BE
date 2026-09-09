import { DisposisiController } from './disposisi.controller';
import { DisposisiService } from '../services/disposisi.service';
import { correspondenceOrgFixture } from '../../../test-fixtures/correspondence-org.fixture';

describe('DI recipient controller sender context baseline', () => {
  it.each([undefined, '8'])(
    'uses JWT position or explicit sender query %s',
    async (query) => {
      const service: DisposisiService = Object.assign(
        Object.create(DisposisiService.prototype),
        {
          orgDataService: {
            findOrg: jest
              .fn()
              .mockResolvedValue({ position_json: correspondenceOrgFixture() }),
          },
        },
      );
      const controller: DisposisiController = Object.assign(
        Object.create(DisposisiController.prototype),
        {
          disposisiService: service,
        },
      );
      const result = await controller.getDisposisiRecipients(
        { position: '2' },
        query,
      );
      expect(result.sender.position).toBe(query ? 8 : 2);
      expect(result.recipients.BAWAHAN.map((p) => p.position)).toEqual(
        query ? [9, 10] : [3, 4, 5, 6],
      );
    },
  );
});
