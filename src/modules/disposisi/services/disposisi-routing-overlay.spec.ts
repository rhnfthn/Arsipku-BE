import { DisposisiService } from './disposisi.service';
import { correspondenceOrgFixture } from '../../../test-fixtures/correspondence-org.fixture';

describe('DI configurable routing overlay', () => {
  const previousFlag = process.env.CORRESPONDENCE_ROUTING_ENABLED;

  afterEach(() => {
    if (previousFlag === undefined)
      delete process.env.CORRESPONDENCE_ROUTING_ENABLED;
    else process.env.CORRESPONDENCE_ROUTING_ENABLED = previousFlag;
  });

  it('adds configured recipient to the existing BAWAHAN group when enabled', async () => {
    process.env.CORRESPONDENCE_ROUTING_ENABLED = 'true';
    const org = correspondenceOrgFixture();
    const resolver = {
      resolve: jest.fn().mockImplementation(({ structuralRecipients }) =>
        Promise.resolve({
          effectiveRecipients: [...structuralRecipients, org[10]],
        }),
      ),
    };
    const service: DisposisiService = Object.assign(
      Object.create(DisposisiService.prototype),
      {
        orgDataService: {
          findOrg: jest.fn().mockResolvedValue({ position_json: org }),
        },
        correspondenceRoutingResolver: resolver,
      },
    );

    const result = await service.getDisposisiRecipients(2);
    expect(result.recipients.BAWAHAN.map((item) => item.position)).toEqual([
      3, 4, 5, 6, 11,
    ]);
    expect(resolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        company: 10000,
        documentType: 'DI',
        actionType: 'CREATE',
        senderPositionId: 2,
      }),
    );
  });

  it('keeps direct validation unchanged and does not call overlay while disabled', async () => {
    delete process.env.CORRESPONDENCE_ROUTING_ENABLED;
    const org = correspondenceOrgFixture();
    const resolver = { resolve: jest.fn() };
    const service: DisposisiService = Object.assign(
      Object.create(DisposisiService.prototype),
      {
        correspondenceRoutingResolver: resolver,
      },
    );
    await expect(
      service['validateRecipients'](org, 2, [3, 4]),
    ).resolves.toBeNull();
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it('uses FORWARD action context for overlay validation', async () => {
    process.env.CORRESPONDENCE_ROUTING_ENABLED = 'true';
    const org = correspondenceOrgFixture();
    const resolver = {
      resolve: jest.fn().mockResolvedValue({
        effectiveRecipients: [org[10]],
      }),
    };
    const service: DisposisiService = Object.assign(
      Object.create(DisposisiService.prototype),
      { correspondenceRoutingResolver: resolver },
    );
    await expect(
      service['validateRecipients'](org, 2, [11], 'FORWARD'),
    ).resolves.toEqual(
      expect.objectContaining({
        effectiveRecipients: [org[10]],
      }),
    );
    expect(resolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'FORWARD' }),
    );
  });
});
