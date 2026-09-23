import { ConfigTheme } from '../entities/config-theme.entity';
import { ConfigThemeService } from './config-theme.service';

const makeTheme = (overrides: Partial<ConfigTheme> = {}): ConfigTheme =>
  Object.assign(new ConfigTheme(), {
    id: 'theme-id',
    name: 'Tema Hari Spesial',
    slug: 'tema_hari_spesial',
    imageKey: 'tema/tema_hari_spesial.png',
    description: null,
    startDate: '2026-05-01',
    endDate: '2026-05-01',
    repeatYearly: false,
    isEnabled: true,
    manualOverride: null,
    priority: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });

describe('ConfigThemeService', () => {
  const storage = {
    getPreviewUrl: jest.fn((key: string) =>
      Promise.resolve(`https://minio.test/${key}`),
    ),
  };
  const realtime = { emitSystemTheme: jest.fn() };
  const dataSource = { transaction: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it('memprioritaskan tema manual di atas tema terjadwal', async () => {
    const manual = makeTheme({
      id: 'manual-id',
      name: 'Manual',
      manualOverride: true,
      startDate: null,
      endDate: null,
    });
    const repository = {
      findOne: jest.fn().mockResolvedValue(manual),
      find: jest.fn(),
    };
    const service = new ConfigThemeService(
      repository as any,
      dataSource as any,
      storage as any,
      realtime as any,
    );

    const result = await service.getCurrent(new Date('2026-05-01T00:00:00Z'));

    expect(result).toMatchObject({ id: 'manual-id', source: 'manual' });
    expect(repository.find).not.toHaveBeenCalled();
  });

  it('menggunakan pergantian tanggal zona Asia/Jakarta untuk jadwal', async () => {
    const scheduled = makeTheme();
    const repository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([scheduled]),
    };
    const service = new ConfigThemeService(
      repository as any,
      dataSource as any,
      storage as any,
      realtime as any,
    );

    // 30 April 17:30 UTC sudah menjadi 1 Mei di Jakarta.
    const result = await service.getCurrent(new Date('2026-04-30T17:30:00Z'));

    expect(result).toMatchObject({ id: 'theme-id', source: 'scheduled' });
  });

  it('mendukung jadwal tahunan yang melewati pergantian tahun', async () => {
    const newYear = makeTheme({
      startDate: '2026-12-31',
      endDate: '2027-01-02',
      repeatYearly: true,
    });
    const repository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([newYear]),
    };
    const service = new ConfigThemeService(
      repository as any,
      dataSource as any,
      storage as any,
      realtime as any,
    );

    const result = await service.getCurrent(new Date('2027-01-01T05:00:00Z'));

    expect(result).toMatchObject({ id: 'theme-id', source: 'scheduled' });
  });
});
