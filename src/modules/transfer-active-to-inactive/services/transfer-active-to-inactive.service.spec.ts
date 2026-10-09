import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TransferActiveToInactiveService } from './transfer-active-to-inactive.service';
import { TransferActiveToInactiveEntity } from '../entities/transfer-active-to-inactive.entity';
import { TransferApprovalLevelEntity } from '../entities/approval-level.entity';
import { Berkas } from '../../berkas/entities/berkas.entity';
import { AuditTrailService } from '../../audit/services/audit-trail.service';
import { NotificationService } from '../../notification/services';
import { ArsipDinamisService } from '../../arsip-dinamis/services/arsip-dinamis.service';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import { OrganizationTuService } from '../../organization-tu/organization-tu.service';
import { GeneratePdfService } from '../../generate_pdf/generate_pdf.service';
import { StorageService } from '../../storage/services/storage.service';

describe('TransferActiveToInactiveService - syncDraftUsulanOtomatis', () => {
  let service: TransferActiveToInactiveService;
  let repo: any;
  let levelRepo: any;
  let berkasRepo: any;
  let arsipDinamisService: any;
  let auditTrailService: any;
  let notificationService: any;

  beforeEach(async () => {
    repo = {
      createQueryBuilder: jest.fn(),
      manager: { query: jest.fn() },
      findOne: jest.fn(),
      save: jest.fn(),
    };
    levelRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    berkasRepo = { createQueryBuilder: jest.fn() };
    arsipDinamisService = { tutupBerkasRetensiHabis: jest.fn() };
    auditTrailService = { createAsync: jest.fn() };
    notificationService = { createNotification: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        TransferActiveToInactiveService,
        {
          provide: getRepositoryToken(TransferActiveToInactiveEntity),
          useValue: repo,
        },
        {
          provide: getRepositoryToken(TransferApprovalLevelEntity),
          useValue: levelRepo,
        },
        { provide: getRepositoryToken(Berkas), useValue: berkasRepo },
        { provide: AuditTrailService, useValue: auditTrailService },
        { provide: NotificationService, useValue: notificationService },
        { provide: ArsipDinamisService, useValue: arsipDinamisService },
        { provide: OrgDataService, useValue: {} },
        { provide: OrganizationTuService, useValue: {} },
        { provide: GeneratePdfService, useValue: {} },
        { provide: StorageService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(TransferActiveToInactiveService);
  });

  /** Chain mock: query biasa (select/where/orderBy → getMany/getOne).
   *  Mensimulasikan filter retensi: bila query memuat klausa
   *  `tanggal_retensi_aktif_berakhir <= :today`, hanya berkas yang tanggalnya
   *  sudah lewat (atau hari ini) yang lolos — berkas retensi masa depan tidak. */
  const chain = (getMany: any[], getOne: any = null) => {
    const andWheres: string[] = [];
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn((sql: string) => {
        andWheres.push(sql);
        return qb;
      }),
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockImplementation(() => {
        if (
          andWheres.some((s) =>
            s.includes('tanggal_retensi_aktif_berakhir <= :today'),
          )
        ) {
          const today = new Date().toISOString().split('T')[0];
          return getMany.filter(
            (b: any) =>
              b.tanggalRetensiAktifBerakhir &&
              b.tanggalRetensiAktifBerakhir <= today,
          );
        }
        return getMany;
      }),
      getOne: jest.fn().mockResolvedValue(getOne),
    };
    return qb;
  };

  it('getSigningList melengkapi metadata berkas untuk kolom tabel Penandatanganan', async () => {
    repo.createQueryBuilder.mockReturnValue(
      chain([
        {
          id: 'transfer-1',
          nomorUsulan: 'UPAI/001/2026',
          arsipId: 'berkas-1',
          arsipIds: [{ id: 'berkas-1' }],
          arsipPerihal: 'Nama arsip',
          arsipKode: 'ARK-001',
          tanggalRetensiAktifHabis: null,
          updatedAt: new Date('2026-10-09T00:00:00Z'),
          bacPihakPertamaPersnum: 777,
          bacSignedAt: null,
          status: 'USUL_PINDAH_DIKIRIM',
        },
      ]),
    );
    berkasRepo.createQueryBuilder.mockReturnValue(
      chain([
        {
          id: 'berkas-1',
          klasifikasi: 'TIK.01.01',
          klasifikasiTeks: 'Pengembangan Sistem Informasi',
          lokasi: 'Rak B',
          tanggalRetensiAktifBerakhir: '2026-10-08',
        },
      ]),
    );

    const rows = await service.getSigningList({
      persnum: 777,
      positionText: 'EVP Technology',
    });

    expect(rows[0]).toMatchObject({
      arsipKlasifikasi: 'Pengembangan Sistem Informasi',
      arsipKlasifikasiKode: 'TIK.01.01',
      arsipLokasiFisik: 'Rak B',
      tanggalRetensiAktifHabis: '2026-10-08',
      updatedAt: new Date('2026-10-09T00:00:00Z'),
    });
  });

  it('getSigningDetail hanya mengembalikan detail untuk penandatangan yang ditugaskan', async () => {
    const transfer = {
      id: 'transfer-signing-1',
      status: 'USUL_PINDAH_DIKIRIM',
      bacPihakPertamaPersnum: 777,
      bacPihakKeduaPersnum: 888,
      bacSignedAt: null,
      bacPihakKeduaSignedAt: null,
    };
    repo.findOne.mockResolvedValue(transfer);
    const findOneSpy = jest
      .spyOn(service, 'findOne')
      .mockResolvedValue(transfer as any);

    await expect(
      service.getSigningDetail(
        transfer.id,
        { persnum: 777, positionText: 'EVP Technology' },
        'pihak_pertama',
      ),
    ).resolves.toBe(transfer);
    expect(findOneSpy).toHaveBeenCalledWith(transfer.id, {
      persnum: 777,
      positionText: 'EVP Technology',
    });

    await expect(
      service.getSigningDetail(
        transfer.id,
        { persnum: 999, positionText: 'EVP Technology' },
        'pihak_pertama',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findOneSpy).toHaveBeenCalledTimes(1);
  });

  it('berkas closed_retensi_aktif tanpa usulan → dibuatkan usulan DRAFT otomatis', async () => {
    const berkas = {
      id: 'b1',
      judulBerkas: 'Berkas A',
      kodeBerkas: 'KD-1',
      tanggalRetensiAktifBerakhir: '2026-08-01',
      createdBy: 99,
      picPersnum: '99',
    };
    berkasRepo.createQueryBuilder.mockReturnValue(chain([berkas]));
    // usulan list kosong → generateNomorUsulan (getOne null → UPAI/001)
    repo.createQueryBuilder
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([], null));

    const count = await service.syncDraftUsulanOtomatis();

    expect(count).toBe(1);
    expect(repo.manager.query).toHaveBeenCalledTimes(1);
    const [sql, params] = repo.manager.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO transfer_active_to_inactive');
    expect(sql).not.toContain('lokasi_penataan'); // hanya kolom eksplisit
    expect(params).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^UPAI\/001\/\d{4}$/), // nomor usulan
        'Berkas A',
        'KD-1',
        99,
        0, // atasan sentinel, dilengkapi user saat kirim
        expect.stringContaining('"id":"b1"'),
        'DRAFT',
      ]),
    );
  });

  it('query berkas mensyaratkan status closed_retensi_aktif/retensi_inaktif DAN retensi aktif sudah habis', async () => {
    const berkasChain = chain([]);
    berkasRepo.createQueryBuilder.mockReturnValue(berkasChain);
    repo.createQueryBuilder.mockReturnValue(chain([]));

    await service.syncDraftUsulanOtomatis();

    expect(berkasChain.andWhere).toHaveBeenCalledWith(
      '(b.status = :closed OR b.status = :inaktif)',
      {
        closed: expect.any(String),
        inaktif: expect.any(String),
      },
    );
    expect(berkasChain.andWhere).toHaveBeenCalledWith(
      'b.tanggal_retensi_aktif_berakhir IS NOT NULL',
    );
    expect(berkasChain.andWhere).toHaveBeenCalledWith(
      'b.tanggal_retensi_aktif_berakhir <= :today',
      expect.any(Object),
    );
    expect(repo.manager.query).not.toHaveBeenCalled();
  });

  it('berkas closed_retensi_aktif tanpa tanggal retensi → TIDAK dibuatkan usulan DRAFT', async () => {
    const berkas = {
      id: 'b1',
      judulBerkas: 'Berkas A',
      kodeBerkas: 'KD-1',
      tanggalRetensiAktifBerakhir: null,
      createdBy: 99,
      picPersnum: '99',
    };
    berkasRepo.createQueryBuilder.mockReturnValue(chain([berkas]));
    repo.createQueryBuilder.mockReturnValue(chain([]));

    const count = await service.syncDraftUsulanOtomatis();

    expect(count).toBe(0);
    expect(repo.manager.query).not.toHaveBeenCalled();
  });

  it('berkas closed_retensi_aktif dengan retensi aktif MASIH BERJALAN (masa depan) → TIDAK dibuatkan usulan', async () => {
    // Regresi: berkas baru disetujui verifikator (retensi aktif baru mulai,
    // tanggal berakhir masih bertahun-tahun lagi) tidak boleh langsung masuk
    // ke pemindahan arsip.
    const berkas = {
      id: 'b1',
      judulBerkas: 'Berkas A',
      kodeBerkas: 'KD-1',
      tanggalRetensiAktifBerakhir: '2030-01-01',
      createdBy: 99,
      picPersnum: '99',
    };
    berkasRepo.createQueryBuilder.mockReturnValue(chain([berkas]));
    repo.createQueryBuilder.mockReturnValue(chain([]));

    const count = await service.syncDraftUsulanOtomatis();

    expect(count).toBe(0);
    expect(repo.manager.query).not.toHaveBeenCalled();
  });

  it('berkas yang sudah punya usulan (arsip_id) → dilewati', async () => {
    berkasRepo.createQueryBuilder.mockReturnValue(
      chain([
        {
          id: 'b1',
          judulBerkas: 'Berkas A',
          tanggalRetensiAktifBerakhir: '2026-01-01',
        },
      ]),
    );
    repo.createQueryBuilder.mockReturnValue(
      chain([{ arsipId: 'b1', arsipIds: null }]),
    );

    const count = await service.syncDraftUsulanOtomatis();

    expect(count).toBe(0);
    expect(repo.manager.query).not.toHaveBeenCalled();
  });

  it('berkas yang sudah diusulkan lewat arsip_ids JSON → dilewati', async () => {
    berkasRepo.createQueryBuilder.mockReturnValue(
      chain([
        {
          id: 'b2',
          judulBerkas: 'Berkas B',
          tanggalRetensiAktifBerakhir: '2026-01-01',
        },
      ]),
    );
    repo.createQueryBuilder.mockReturnValue(
      chain([
        {
          arsipId: 'other',
          arsipIds: [
            { id: 'b2', perihal: 'x', kode: null, tanggalRetensiHabis: null },
          ],
        },
      ]),
    );

    const count = await service.syncDraftUsulanOtomatis();

    expect(count).toBe(0);
    expect(repo.manager.query).not.toHaveBeenCalled();
  });

  it('tanpa berkas closed_retensi_aktif → 0, tanpa insert', async () => {
    berkasRepo.createQueryBuilder.mockReturnValue(chain([]));

    const count = await service.syncDraftUsulanOtomatis();

    expect(count).toBe(0);
    expect(repo.manager.query).not.toHaveBeenCalled();
  });

  it('memfilter daftar verifikasi berdasarkan level aktif, termasuk untuk SUPERADMIN', async () => {
    const qb: any = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    repo.createQueryBuilder.mockReturnValue(qb);

    await service.findAll({ page: 1, limit: 10 } as any, {
      persnum: 303,
      activeRole: { name: 'SUPERADMIN' },
    });

    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('EXISTS'),
      { currentPersnum: 303 },
    );
    expect(qb.andWhere.mock.calls[0][0]).toContain(
      'active_level.urutan = t.current_approval_level',
    );
    expect(qb.andWhere.mock.calls[0][0]).toContain(
      "approved_level.status = 'DISETUJUI'",
    );
    expect(levelRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  describe('alur verifikator berjenjang', () => {
    const level = (urutan: number, persnum: number) => ({
      id: `level-${urutan}`,
      tanggal: new Date('2026-01-01'),
      transferId: 'transfer-1',
      atasanPersnum: persnum,
      atasanName: `Atasan ${urutan}`,
      atasanPositionId: null,
      atasanPositionText: null,
      urutan,
      status: 'MENUNGGU',
      verifiedAt: null,
      catatan: null,
    });

    const setupQueryBuilder = () => {
      const qb: any = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      levelRepo.createQueryBuilder.mockReturnValue(qb);
      return qb;
    };

    it('mempertahankan level terakhir sebagai pemilik aksi lanjutan', async () => {
      const item: any = {
        id: 'transfer-1',
        status: 'DISETUJUI_ATASAN',
        currentApprovalLevel: 3,
        totalApprovalLevels: 3,
        sekretarisPersnum: 100,
        atasanPersnum: 303,
        atasanName: 'Atasan 3',
        atasanPositionId: null,
        verifyNote: null,
        approvedBy: null,
        approvedAt: null,
        finalVerifyNote: null,
        finalVerifiedBy: null,
        finalVerifiedAt: null,
      };
      const levels = [level(1, 101), level(2, 202), level(3, 303)];
      repo.findOne.mockResolvedValue(item);
      repo.save.mockImplementation(async (value: any) => value);
      levelRepo.findOne.mockImplementation(({ where }: any) =>
        Promise.resolve(
          levels.find((candidate) => candidate.urutan === where.urutan) ?? null,
        ),
      );
      setupQueryBuilder();

      const result = await service.approve(
        'transfer-1',
        { verifyNote: 'Disetujui' },
        { persnum: 303 },
      );

      expect(result.status).toBe('DISETUJUI_VERIFIKASI_TERAKHIR');
      expect(result.currentApprovalLevel).toBe(3);
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('hanya mengizinkan verifikator terakhir memindahkan usulan ke tahap TTD BAC', async () => {
      const item: any = {
        id: 'transfer-1',
        status: 'DISETUJUI_VERIFIKASI_TERAKHIR',
        tanggalDikirim: null,
        sekretarisPersnum: 100,
        arsipPerihal: 'Arsip A',
        nomorUsulan: 'UPAI/001/2026',
      };
      const levels = [level(1, 101), level(2, 202), level(3, 303)];
      repo.findOne.mockResolvedValue(item);
      repo.save.mockImplementation(async (value: any) => value);
      levelRepo.find.mockResolvedValue(levels);

      await expect(
        service.dispatch('transfer-1', { persnum: 101 }),
      ).rejects.toThrow('Hanya verifikator terakhir');

      await expect(
        service.dispatch('transfer-1', { persnum: 303 }),
      ).resolves.toMatchObject({ status: 'USUL_PINDAH_DIKIRIM' });
    });

    it('menggunakan verifikator terakhir sebagai pihak pertama berita acara', async () => {
      const item: any = {
        id: 'transfer-1',
        nomorUsulan: 'UPAI/001/2026',
        tanggalUsulan: new Date('2026-01-01'),
        keterangan: null,
        divisiName: 'Divisi A',
        atasanName: 'Atasan 1',
        atasanPersnum: 101,
        arsipId: 'arsip-1',
        arsipPerihal: 'Arsip A',
        arsipKode: 'KODE-1',
        arsipIds: null,
      };
      const levels = [level(1, 101), level(2, 202), level(3, 303)];
      repo.findOne.mockResolvedValue(item);
      levelRepo.find.mockResolvedValue(levels);

      const result = await service.getBeritaAcaraData('transfer-1');

      expect(result.atasan).toMatchObject({
        nama: 'Atasan 3',
        persnum: 303,
      });
    });
  });

  it('mengganti token {{ttd}} dengan QR tepat di antara Pihak Pertama dan jabatan', () => {
    const html = (service as any).buildBacHtml(
      {
        nomorUsulan: 'UPAI/001/2026',
        beritaAcaraNomor: 'BA/UPAI/001/2026',
        tanggalUsulan: new Date('2026-10-06'),
        divisiName: 'Divisi Teknologi',
        bacPihakPertamaName: 'MADE GEDE NUGRAHA DEWANTARA',
        bacPihakPertamaPersnum: 10010105,
        bacPihakPertamaJabatan: 'EVP of Technology Solution',
      },
      { daftarArsip: [], pengirim: { divisi: 'Divisi Teknologi' } },
      'data:image/png;base64,qr-test',
    );

    const pihakPertamaIndex = html.indexOf('Pihak Pertama');
    const qrIndex = html.indexOf('data:image/png;base64,qr-test');
    const jabatanIndex = html.indexOf('(EVP of Technology Solution)');
    const pihakKeduaIndex = html.indexOf('Pihak Kedua');
    const firstSignatureBlock = html.slice(
      pihakPertamaIndex,
      pihakKeduaIndex,
    );

    expect(pihakPertamaIndex).toBeGreaterThanOrEqual(0);
    expect(qrIndex).toBeGreaterThan(pihakPertamaIndex);
    expect(jabatanIndex).toBeGreaterThan(qrIndex);
    expect(firstSignatureBlock).not.toContain('{{ttd}}');
    expect(firstSignatureBlock).not.toContain('<b>');
    expect(html).not.toContain('<b>');
    expect(html.indexOf('Ttd', pihakKeduaIndex)).toBeGreaterThan(
      html.indexOf('Pihak Kedua', pihakKeduaIndex),
    );
  });

  it('otomatis meneruskan usulan ke TU setelah BAC ditandatangani', async () => {
    const item: any = {
      id: 'transfer-1',
      nomorUsulan: 'UPAI/001/2026',
      arsipPerihal: 'Berkas A',
      sekretarisPersnum: 111,
      status: 'USUL_PINDAH_DIKIRIM',
      bacSignedAt: new Date('2026-10-06T10:00:00Z'),
    };
    repo.findOne.mockResolvedValue(item);
    repo.save.mockImplementation(async (saved: any) => saved);

    const result = await service.dispatchToTuAfterBacSignature('transfer-1', {
      persnum: 10010105,
      nama: 'Pejabat Pihak Pertama',
    });

    expect(result.status).toBe('DIKIRIM');
    expect(result.tanggalDikirim).toBeInstanceOf(Date);
    expect(repo.save).toHaveBeenCalledWith(item);
    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Usulan pemindahan arsip menunggu penerimaan TU',
      }),
    );
  });
});
