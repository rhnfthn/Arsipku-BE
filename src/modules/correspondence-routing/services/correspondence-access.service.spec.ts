import { CorrespondenceAccessService } from './correspondence-access.service';

describe('CorrespondenceAccessService capability fallback', () => {
  const previousFlag = process.env.CORRESPONDENCE_ACCESS_ENABLED;

  afterEach(() => {
    if (previousFlag === undefined)
      delete process.env.CORRESPONDENCE_ACCESS_ENABLED;
    else process.env.CORRESPONDENCE_ACCESS_ENABLED = previousFlag;
  });

  function buildService() {
    const repo = {
      find: jest.fn().mockResolvedValue([
        {
          document_type: 'SDI',
          bod_tags: ['BOD-2'],
          chief_values: [1],
          area_mode: 'ALL',
          area_ids: null,
          is_active: 1,
        },
      ]),
    };
    const orgDataService = {
      findLatestOrg: jest.fn().mockResolvedValue({
        position_json: [
          {
            position: 70016583,
            company: 10000,
            bod_tag: 'BOD-2',
            chief: 1,
            area: 'HQ',
            area_text: 'Kantor Pusat',
          },
        ],
      }),
    };
    const service = new CorrespondenceAccessService(
      repo as never,
      orgDataService as never,
      { invalidate: jest.fn() } as never,
    );
    return { service, repo };
  }

  it('uses legacy BOD-tag access and skips saved policies while disabled', async () => {
    process.env.CORRESPONDENCE_ACCESS_ENABLED = 'false';
    const { service, repo } = buildService();

    await expect(service.capabilities(10000, 70016583)).resolves.toMatchObject({
      access_feature_enabled: false,
      configured_document_types: [],
      access: {
        ND: true,
        SDI: false,
        SDE: false,
        DI: true,
        KA: false,
      },
    });
    expect(repo.find).not.toHaveBeenCalled();
  });

  it('applies saved policies only when explicitly enabled', async () => {
    process.env.CORRESPONDENCE_ACCESS_ENABLED = 'true';
    const { service, repo } = buildService();

    await expect(service.capabilities(10000, 70016583)).resolves.toMatchObject({
      access_feature_enabled: true,
      configured_document_types: ['SDI'],
      access: { SDI: true },
    });
    expect(repo.find).toHaveBeenCalledWith({ where: { company: 10000 } });
  });
});
