import { NotaDinasService } from '../../modules/nota-dinas/services/nota-dinas.service';
import { DisposisiService } from '../../modules/disposisi/services/disposisi.service';
import { SuratDinasInternalService } from '../../modules/surat-dinas-internal/services/surat-dinas-internal.service';
import { SuratDinasEksternalService } from '../../modules/surat-dinas-eksternal/services/surat-dinas-eksternal.service';
import { KonsepService } from '../../modules/konsep/services/konsep.service';
import { NomorService } from '../../modules/nomor/services/nomor.service';

const formats = {
  ND: '{NO_URUT}/{JABATAN}/{KLASIFIKASI}/{BULAN}/{TAHUN}',
  DI: '{JABATAN}.{NO_URUT}',
  SDI: '{NO_URUT}/{JABATAN}/{LOKASI}/{KLASIFIKASI}/{BULAN}/{TAHUN}',
  SDE: '{NO_URUT}/{JABATAN}/{LOKASI}/{INSTANSI}/{KLASIFIKASI}/{BULAN}/{TAHUN}',
};

function setup(prototype: object, format: string) {
  const service: any = Object.create(prototype);
  const repository = { create: (data: any) => ({ ...data }) };
  service.nomorRequestRepository = repository;
  service.nomorRequestDetailRepository = repository;
  service.nomorRepository = repository;
  const counter = { nomor: 41, area: '1000' };
  const query: any = {};
  for (const method of ['where', 'andWhere', 'setLock']) {
    query[method] = jest.fn().mockReturnValue(query);
  }
  query.getOne = jest.fn().mockResolvedValue(counter);
  const manager = {
    findOne: jest.fn().mockResolvedValue({ formatPenomoran: format }),
    createQueryBuilder: jest.fn().mockReturnValue(query),
    save: jest.fn(async (data: any) => data),
  };
  return { service, counter, runner: { manager }, query };
}

const sender = {
  company: '10000',
  area: '1000',
  sub_area: '1',
  organization_id: '1',
  position: 123,
  position_abbreviation: 'UL',
  persnum_person_text: 'Pengirim',
};
const date = new Date(2026, 9, 7);

describe('penomoran lintas layanan setelah perubahan kode pusat', () => {
  it.each([
    ['ND', NotaDinasService.prototype, '042/UL/DS.00.02/X/2026'],
    ['SDI', SuratDinasInternalService.prototype, '042/UL/TNG/DS.00.02/X/2026'],
    [
      'SDE',
      SuratDinasEksternalService.prototype,
      '042/UL/TNG/LPPNPI/DS.00.02/X/2026',
    ],
  ] as const)(
    '%s melanjutkan counter, klasifikasi dan area organisasi tetap',
    async (jenis, prototype, expected) => {
      const { service, counter, runner, query } = setup(
        prototype,
        formats[jenis],
      );
      const number = await service.generateNomorWithIntegration(
        sender,
        'DS.00.02',
        'Perihal',
        date,
        runner,
      );
      expect(number).toBe(expected);
      expect(counter.nomor).toBe(42);
      expect(counter.area).toBe('1000');
      expect(query.andWhere).toHaveBeenCalledWith(
        jenis === 'ND' ? 'n.position = :position' : 'n.area = :area',
        jenis === 'ND' ? { position: '123' } : { area: '1000' },
      );
    },
  );

  it('DI tetap mengikuti format master tanpa menambahkan lokasi', async () => {
    const { service, runner, counter } = setup(
      DisposisiService.prototype,
      formats.DI,
    );
    expect(
      await service.generateNomorWithIntegration(
        sender,
        'Perihal',
        date,
        runner,
      ),
    ).toBe('UL.042');
    expect(counter.nomor).toBe(42);
  });

  it.each(['ND', 'SDI', 'SDE'] as const)(
    'finalisasi K ke %s menggunakan format master dan counter yang sama',
    async (jenis) => {
      const { service, runner, counter } = setup(
        KonsepService.prototype,
        formats[jenis],
      );
      const number = await service.generateNomorWithIntegration(
        jenis,
        sender,
        'DS.00.02',
        'Perihal',
        date,
        runner,
      );
      expect(number).not.toContain('/00/');
      expect(number).toContain('/DS.00.02/');
      expect(number.includes('/TNG/')).toBe(jenis !== 'ND');
      expect(counter.nomor).toBe(42);
      expect(counter.area).toBe('1000');
    },
  );

  const full =
    '{TIPE}.{NO_URUT}/{JABATAN}/{LOKASI}/{INSTANSI}/{KLASIFIKASI}/{BULAN}/{TAHUN}';
  it.each([
    ['SDI', formats.SDI],
    ['SDE', formats.SDE],
    ['INS', full],
    ['ND', formats.ND],
  ])(
    'preview usulan %s menggunakan lokasi baru sesuai format',
    async (jenis, format) => {
      const service: any = Object.create(NomorService.prototype);
      service.jenisRepository = {
        findOne: jest.fn().mockResolvedValue({ formatPenomoran: format }),
      };
      const preview = await service.generateNomorTemplate({
        jenis,
        tanggal: date,
        klasifikasi: 'DS.00.02',
        area: '1000',
      });
      expect(preview).not.toContain('/00/');
      expect(preview.includes('/TNG/')).toBe(format.includes('{LOKASI}'));
      expect(preview).toContain('.....');
    },
  );

  it.each([
    ['PER', '{TIPE}.{NO_URUT}/{INSTANSI}/{BULAN}/{TAHUN}'],
    [
      'KEP',
      '{TIPE}.{NO_URUT}/{JABATAN}/{INSTANSI}/{KLASIFIKASI}/{BULAN}/{TAHUN}',
    ],
    ...[
      'INS',
      'SPR',
      'EDR',
      'SOP',
      'MOU',
      'PKS',
      'PROC',
      'PJJ',
      'LOA',
      'LOCA',
      'SKU',
      'BAC',
      'KET',
      'SPE',
      'RPT',
      'PEN',
      'PGM',
      'LAP',
      'SPK',
      'UND',
      'ADD-PJJ',
      'ADD-PROC',
      'ADD-SPK',
    ].map((jenis) => [jenis, full]),
  ])(
    'Naskah Lainnya / usulan %s mengikuti segmen lokasi di format',
    async (jenis, format) => {
      const service: any = Object.create(NomorService.prototype);
      const request = { jenis, tanggal: date, klasifikasi: 'DS.00.02' };
      const number = await service.generateNomorFromFormat(
        format,
        42,
        request,
        2026,
        'UL',
        '1000',
      );
      expect(number).not.toContain('/00/');
      expect(number.startsWith(`${jenis}.042/`)).toBe(true);
      expect(number.includes('/TNG/')).toBe(format.includes('{LOKASI}'));
      const branchNumber = await service.generateNomorFromFormat(
        format,
        42,
        request,
        2026,
        'UL',
        '1001',
      );
      expect(branchNumber.includes('/01/')).toBe(format.includes('{LOKASI}'));
    },
  );
});
