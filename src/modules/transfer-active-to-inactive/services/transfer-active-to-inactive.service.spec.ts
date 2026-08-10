import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TransferActiveToInactiveService } from './transfer-active-to-inactive.service';
import { TransferActiveToInactiveEntity } from '../entities/transfer-active-to-inactive.entity';
import { TransferApprovalLevelEntity } from '../entities/approval-level.entity';
import { Berkas } from '../../berkas/entities/berkas.entity';
import { AuditTrailService } from '../../audit/services/audit-trail.service';
import { NotificationService } from '../../notification/services';
import { ArsipDinamisService } from '../../arsip-dinamis/services/arsip-dinamis.service';
import { OrgDataService } from '../../master-data/org_data/org_data.service';

describe('TransferActiveToInactiveService - syncDraftUsulanOtomatis', () => {
  let service: TransferActiveToInactiveService;
  let repo: any;
  let berkasRepo: any;
  let arsipDinamisService: any;

  beforeEach(async () => {
    repo = { createQueryBuilder: jest.fn(), manager: { query: jest.fn() } };
    berkasRepo = { createQueryBuilder: jest.fn() };
    arsipDinamisService = { tutupBerkasRetensiHabis: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        TransferActiveToInactiveService,
        {
          provide: getRepositoryToken(TransferActiveToInactiveEntity),
          useValue: repo,
        },
        {
          provide: getRepositoryToken(TransferApprovalLevelEntity),
          useValue: {},
        },
        { provide: getRepositoryToken(Berkas), useValue: berkasRepo },
        { provide: AuditTrailService, useValue: {} },
        { provide: NotificationService, useValue: {} },
        { provide: ArsipDinamisService, useValue: arsipDinamisService },
        { provide: OrgDataService, useValue: {} },
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
          andWheres.some((s) => s.includes('tanggal_retensi_aktif_berakhir <= :today'))
        ) {
          const today = new Date().toISOString().split('T')[0];
          return getMany.filter(
            (b: any) =>
              b.tanggalRetensiAktifBerakhir && b.tanggalRetensiAktifBerakhir <= today,
          );
        }
        return getMany;
      }),
      getOne: jest.fn().mockResolvedValue(getOne),
    };
    return qb;
  };

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

  it('query berkas mensyaratkan status closed_retensi_aktif DAN retensi aktif sudah habis', async () => {
    const berkasChain = chain([]);
    berkasRepo.createQueryBuilder.mockReturnValue(berkasChain);
    repo.createQueryBuilder.mockReturnValue(chain([]));

    await service.syncDraftUsulanOtomatis();

    expect(berkasChain.andWhere).toHaveBeenCalledWith('b.status = :status', {
      status: expect.any(String),
    });
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
});
