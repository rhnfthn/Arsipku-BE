import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ArsipDinamisService } from './arsip-dinamis.service';
import { Berkas } from '../../berkas/entities/berkas.entity';
import { BerkasNaskah } from '../entities/berkas-naskah.entity';
import { BerkasVerifikasi } from '../entities/berkas-verifikasi.entity';
import { BerkasRiwayatRetensi } from '../entities/berkas-riwayat-retensi.entity';
import { KlasifikasiEntity } from '../../klasifikasi/entities/klasifikasi.entity';
import { StorageService } from '../../storage/services/storage.service';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import { NaskahService } from '../../naskah/services/naskah.service';
import { NotificationService } from '../../notification/services/notification.service';
import { RealtimeEmitService } from '../../realtime/services/realtime-emit.service';
import { NotificationType } from '../../notification/entities/notification.entity';

describe('ArsipDinamisService - getRiwayatPersetujuan', () => {
  let service: ArsipDinamisService;
  let query: jest.Mock;

  const sampleRow = {
    id: 'v1',
    berkas_id: 'b1',
    urutan: 1,
    verifikator_persnum: '12345',
    verifikator_position_id: 7,
    jabatan_verifikator: 'Manager Unit',
    status: 'approved',
    catatan: 'Lengkap',
    action_at: '2026-07-20 10:00:00',
    created_at: '2026-07-18 09:00:00',
    berkas_judul_berkas: 'Berkas A',
    berkas_kode_berkas: 'KD-001',
    berkas_klasifikasi: 'KL01',
    berkas_klasifikasi_teks: 'Klasifikasi A',
    berkas_kategori_berkas: 'Umum',
    berkas_lokasi: 'Rak 1',
    berkas_retensi_aktif_tahun: 2,
    berkas_retensi_inaktif_tahun: 3,
    berkas_status: 'closed_retensi_aktif',
  };

  beforeEach(async () => {
    query = jest.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ArsipDinamisService,
        { provide: DataSource, useValue: { query } },
        { provide: getRepositoryToken(Berkas), useValue: {} },
        { provide: getRepositoryToken(BerkasNaskah), useValue: {} },
        { provide: getRepositoryToken(BerkasVerifikasi), useValue: {} },
        { provide: getRepositoryToken(BerkasRiwayatRetensi), useValue: {} },
        { provide: getRepositoryToken(KlasifikasiEntity), useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: OrgDataService, useValue: {} },
        { provide: NaskahService, useValue: {} },
        { provide: NotificationService, useValue: {} },
        { provide: RealtimeEmitService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(ArsipDinamisService);
  });

  it('mengembalikan keputusan approved+rejected manager, mapping + pagination', async () => {
    query
      .mockResolvedValueOnce([{ total: 1 }]) // count query
      .mockResolvedValueOnce([sampleRow]); // data query
    const res = await service.getRiwayatPersetujuan('12345', { page: 1, limit: 10 });

    expect(res.meta.total).toBe(1);
    expect(res.meta.totalPages).toBe(1);
    expect(res.data[0].status).toBe('approved');
    expect(res.data[0].berkas.judulBerkas).toBe('Berkas A');
    expect(res.data[0].actionAt).toBe('2026-07-20 10:00:00');

    const countSql = query.mock.calls[0][0] as string;
    expect(countSql).toContain("bv.status IN ('approved','rejected')");
    expect(countSql).not.toContain("bv.status = 'pending'");
    expect(countSql).not.toContain('NOT EXISTS');
    expect(countSql).toContain('b.deleted_at IS NULL');
    expect(query.mock.calls[0][1]).toEqual(['12345']);
  });

  it('filter status=approved menambah klausa AND bv.status = ?', async () => {
    query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
    await service.getRiwayatPersetujuan('12345', { status: 'approved' });
    const countSql = query.mock.calls[0][0] as string;
    expect(countSql).toContain('AND bv.status = ?');
    expect(query.mock.calls[0][1]).toEqual(['12345', 'approved']);
  });

  it('status=all tidak menambah filter status tambahan', async () => {
    query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
    await service.getRiwayatPersetujuan('12345', { status: 'all' });
    expect(query.mock.calls[0][1]).toEqual(['12345']);
  });

  it('urut berdasarkan action_at DESC', async () => {
    query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
    await service.getRiwayatPersetujuan('12345', {});
    const dataSql = query.mock.calls[1][0] as string;
    expect(dataSql).toContain('ORDER BY bv.action_at DESC');
  });

  it('totalPages dihitung dari total/limit', async () => {
    query.mockResolvedValueOnce([{ total: 25 }]).mockResolvedValueOnce([]);
    const res = await service.getRiwayatPersetujuan('12345', { page: 2, limit: 10 });
    expect(res.meta.totalPages).toBe(3);
    expect(res.meta.page).toBe(2);
  });
});

describe('ArsipDinamisService - getPersetujuanSaya', () => {
  let service: ArsipDinamisService;
  let query: jest.Mock;

  const sampleRow = {
    id: 'v1',
    berkas_id: 'b1',
    urutan: 1,
    verifikator_persnum: '12345',
    verifikator_position_id: 7,
    jabatan_verifikator: 'Manager Unit',
    status: 'pending',
    catatan: null,
    action_at: null,
    created_at: '2026-07-18 09:00:00',
    berkas_judul_berkas: 'Berkas A',
    berkas_kode_berkas: 'KD-001',
    berkas_klasifikasi: 'KL01',
    berkas_klasifikasi_teks: 'Klasifikasi A',
    berkas_kategori_berkas: 'Umum',
    berkas_lokasi: 'Rak 1',
    berkas_retensi_aktif_tahun: 2,
    berkas_retensi_inaktif_tahun: 3,
    berkas_status: 'menunggu_verifikasi',
  };

  beforeEach(async () => {
    query = jest.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ArsipDinamisService,
        { provide: DataSource, useValue: { query } },
        { provide: getRepositoryToken(Berkas), useValue: {} },
        { provide: getRepositoryToken(BerkasNaskah), useValue: {} },
        { provide: getRepositoryToken(BerkasVerifikasi), useValue: {} },
        { provide: getRepositoryToken(BerkasRiwayatRetensi), useValue: {} },
        { provide: getRepositoryToken(KlasifikasiEntity), useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: OrgDataService, useValue: {} },
        { provide: NaskahService, useValue: {} },
        { provide: NotificationService, useValue: {} },
        { provide: RealtimeEmitService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(ArsipDinamisService);
  });

  it('status=menunggu (default) → pending + giliran Anda (NOT EXISTS earlier)', async () => {
    query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
    await service.getPersetujuanSaya('12345', {});
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("bv.status = 'pending'");
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain("b.status = 'menunggu_verifikasi'");
    expect(sql).not.toContain("bv.status IN ('approved','rejected')");
    expect(query.mock.calls[0][1]).toEqual(['12345']);
  });

  it('status=approved → AND bv.status = approved (tanpa NOT EXISTS)', async () => {
    query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
    await service.getPersetujuanSaya('12345', { status: 'approved' });
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("bv.status = 'approved'");
    expect(sql).not.toContain("bv.status = 'pending'");
    expect(sql).not.toContain('NOT EXISTS');
  });

  it('status=rejected → AND bv.status = rejected', async () => {
    query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
    await service.getPersetujuanSaya('12345', { status: 'rejected' });
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("bv.status = 'rejected'");
  });

  it('status=all → menunggu (NOT EXISTS) OR approved+rejected', async () => {
    query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
    await service.getPersetujuanSaya('12345', { status: 'all' });
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain("bv.status = 'pending'");
    expect(sql).toContain("bv.status IN ('approved','rejected')");
    expect(query.mock.calls[0][1]).toEqual(['12345']);
  });

  it('mapping + pagination totalPages', async () => {
    query.mockResolvedValueOnce([{ total: 1 }]).mockResolvedValueOnce([sampleRow]);
    const res = await service.getPersetujuanSaya('12345', { status: 'menunggu', page: 1, limit: 10 });
    expect(res.meta.totalPages).toBe(1);
    expect(res.data[0].status).toBe('pending');
    expect(res.data[0].berkas.judulBerkas).toBe('Berkas A');
    expect(query.mock.calls[0][1]).toEqual(['12345']);
  });

  it('search menambah 4 param LIKE', async () => {
    query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
    await service.getPersetujuanSaya('12345', { status: 'all', search: 'berkas' });
    expect(query.mock.calls[0][1]).toEqual(['12345', '%berkas%', '%berkas%', '%berkas%', '%berkas%']);
  });

  it('urut COALESCE(action_at, created_at) DESC', async () => {
    query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
    await service.getPersetujuanSaya('12345', { status: 'all' });
    const dataSql = query.mock.calls[1][0] as string;
    expect(dataSql).toContain('ORDER BY COALESCE(bv.action_at, bv.created_at) DESC');
  });

  it('sortBy=judulBerkas → ORDER BY b.judul_berkas DESC (default dir)', async () => {
    query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
    await service.getPersetujuanSaya('12345', { status: 'all', sortBy: 'judulBerkas' });
    const dataSql = query.mock.calls[1][0] as string;
    expect(dataSql).toContain('ORDER BY b.judul_berkas DESC');
  });

  it('sortBy=kodeBerkas sortDir=asc → ORDER BY b.kode_berkas ASC', async () => {
    query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
    await service.getPersetujuanSaya('12345', { status: 'all', sortBy: 'kodeBerkas', sortDir: 'asc' });
    const dataSql = query.mock.calls[1][0] as string;
    expect(dataSql).toContain('ORDER BY b.kode_berkas ASC');
  });

  it('sortBy tidak dikenal → default order (whitelist, no injection)', async () => {
    query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
    await service.getPersetujuanSaya('12345', { status: 'all', sortBy: 'b.malicious; DROP--' });
    const dataSql = query.mock.calls[1][0] as string;
    expect(dataSql).toContain('ORDER BY COALESCE(bv.action_at, bv.created_at) DESC');
    expect(dataSql).not.toContain('DROP');
  });
});

describe('ArsipDinamisService - softDeleteBerkas', () => {
  let service: ArsipDinamisService;
  let berkasRepo: any;
  let berkasNaskahRepo: any;

  beforeEach(async () => {
    berkasRepo = { createQueryBuilder: jest.fn(), save: jest.fn() };
    berkasNaskahRepo = { count: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ArsipDinamisService,
        { provide: DataSource, useValue: { query: jest.fn() } },
        { provide: getRepositoryToken(Berkas), useValue: berkasRepo },
        { provide: getRepositoryToken(BerkasNaskah), useValue: berkasNaskahRepo },
        { provide: getRepositoryToken(BerkasVerifikasi), useValue: {} },
        { provide: getRepositoryToken(BerkasRiwayatRetensi), useValue: {} },
        { provide: getRepositoryToken(KlasifikasiEntity), useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: OrgDataService, useValue: {} },
        { provide: NaskahService, useValue: {} },
        { provide: NotificationService, useValue: {} },
        { provide: RealtimeEmitService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(ArsipDinamisService);
  });

  // Mock findOneBerkas yang memakai createQueryBuilder('b').where().andWhere().getOne()
  // getMany dipakai tutupBerkasRetensiHabis (evaluasi retensi on-demand sebelum findOneBerkas).
  const stubBerkas = (status: string) => {
    const berkas: any = { id: 'b1', status, deletedAt: null };
    berkasRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(berkas),
    });
    return berkas;
  };

  it('menghapus berkas Terbuka (aktif) tanpa naskah → sukses', async () => {
    const berkas = stubBerkas('aktif');
    berkasNaskahRepo.count.mockResolvedValue(0);
    const res = await service.softDeleteBerkas('b1', 99);
    expect(res.message).toBe('Berkas berhasil dihapus');
    expect(berkas.deletedAt).toBeInstanceOf(Date);
    expect(berkasRepo.save).toHaveBeenCalledWith(berkas);
  });

  it('menolak hapus Terbuka yang masih punya naskah (cek naskah dipanggil)', async () => {
    stubBerkas('aktif');
    berkasNaskahRepo.count.mockResolvedValue(2);
    await expect(service.softDeleteBerkas('b1', 99)).rejects.toThrow(/naskah/);
    expect(berkasNaskahRepo.count).toHaveBeenCalled();
    expect(berkasRepo.save).not.toHaveBeenCalled();
  });

  it('menolak hapus berkas Menunggu Verifikasi / Tertutup (bukan Terbuka)', async () => {
    stubBerkas('menunggu_verifikasi');
    berkasNaskahRepo.count.mockResolvedValue(0);
    await expect(service.softDeleteBerkas('b1', 99)).rejects.toThrow();
    stubBerkas('closed_retensi_aktif');
    await expect(service.softDeleteBerkas('b1', 99)).rejects.toThrow();
    expect(berkasRepo.save).not.toHaveBeenCalled();
  });
});

describe('ArsipDinamisService - getNaskahDetailInBerkas', () => {
  let service: ArsipDinamisService;
  let berkasNaskahRepo: any;
  let naskahService: any;

  beforeEach(async () => {
    berkasNaskahRepo = { findOne: jest.fn() };
    naskahService = { getDetailWithChainForBerkas: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ArsipDinamisService,
        { provide: DataSource, useValue: { query: jest.fn() } },
        { provide: getRepositoryToken(Berkas), useValue: {} },
        { provide: getRepositoryToken(BerkasNaskah), useValue: berkasNaskahRepo },
        { provide: getRepositoryToken(BerkasVerifikasi), useValue: {} },
        { provide: getRepositoryToken(BerkasRiwayatRetensi), useValue: {} },
        { provide: getRepositoryToken(KlasifikasiEntity), useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: OrgDataService, useValue: {} },
        { provide: NaskahService, useValue: naskahService },
        { provide: NotificationService, useValue: {} },
        { provide: RealtimeEmitService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(ArsipDinamisService);
  });

  it('delegasi ke NaskahService bila naskah tercatat di berkas', async () => {
    berkasNaskahRepo.findOne.mockResolvedValue({ naskahId: 'n1', status: 'aktif' });
    naskahService.getDetailWithChainForBerkas.mockResolvedValue({ success: true, data: [{ id: 'n1' }] });
    const res = await service.getNaskahDetailInBerkas('b1', 'n1', false);
    expect(naskahService.getDetailWithChainForBerkas).toHaveBeenCalledWith('n1');
    expect(res.data[0].id).toBe('n1');
  });

  it('tolak (NotFound) bila naskah bukan milik berkas — anti enumerasi id', async () => {
    berkasNaskahRepo.findOne.mockResolvedValue(null);
    await expect(service.getNaskahDetailInBerkas('b1', 'n1', false)).rejects.toThrow(
      /tidak ditemukan di berkas/,
    );
    expect(naskahService.getDetailWithChainForBerkas).not.toHaveBeenCalled();
  });

  it('tolak (NotFound) naskah inaktif untuk user biasa, izinkan untuk TU', async () => {
    berkasNaskahRepo.findOne.mockResolvedValue({ naskahId: 'n1', status: 'inaktif' });
    naskahService.getDetailWithChainForBerkas.mockResolvedValue({ success: true, data: [] });
    await expect(service.getNaskahDetailInBerkas('b1', 'n1', false)).rejects.toThrow(
      /tidak ditemukan di berkas/,
    );
    expect(naskahService.getDetailWithChainForBerkas).not.toHaveBeenCalled();
    const res = await service.getNaskahDetailInBerkas('b1', 'n1', true);
    expect(naskahService.getDetailWithChainForBerkas).toHaveBeenCalledWith('n1');
    expect(res.data).toEqual([]);
  });
});
describe('ArsipDinamisService - realtime & notif (ajukan/approve/reject)', () => {
  let service: ArsipDinamisService;
  let berkasRepo: any;
  let berkasNaskahRepo: any;
  let berkasVerifikasiRepo: any;
  let berkasRiwayatRepo: any;
  let notifService: any;
  let realtimeEmit: any;
  let orgDataService: any;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn();
    berkasRepo = { createQueryBuilder: jest.fn(), save: jest.fn() };
    berkasNaskahRepo = { count: jest.fn() };
    berkasVerifikasiRepo = {
      delete: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((x: any) => x),
      save: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(),
    };
    berkasRiwayatRepo = {
      create: jest.fn((x: any) => x),
      save: jest.fn().mockResolvedValue(undefined),
    };
    notifService = { createNotification: jest.fn().mockResolvedValue({}) };
    realtimeEmit = { emitArsipPersetujuanCountUser: jest.fn() };
    orgDataService = { getAtasanManagerial: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ArsipDinamisService,
        { provide: DataSource, useValue: { query } },
        { provide: getRepositoryToken(Berkas), useValue: berkasRepo },
        { provide: getRepositoryToken(BerkasNaskah), useValue: berkasNaskahRepo },
        { provide: getRepositoryToken(BerkasVerifikasi), useValue: berkasVerifikasiRepo },
        { provide: getRepositoryToken(BerkasRiwayatRetensi), useValue: berkasRiwayatRepo },
        { provide: getRepositoryToken(KlasifikasiEntity), useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: OrgDataService, useValue: orgDataService },
        { provide: NaskahService, useValue: {} },
        { provide: NotificationService, useValue: notifService },
        { provide: RealtimeEmitService, useValue: realtimeEmit },
      ],
    }).compile();
    service = moduleRef.get(ArsipDinamisService);
  });

  const stubBerkas = (status: string) => {
    const berkas: any = {
      id: 'b1',
      status,
      judulBerkas: 'Berkas A',
      kodeBerkas: 'KD-1',
      retensiAktifTahun: null,
      tanggalDibuat: null,
    };
    berkasRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]), // tutupBerkasRetensiHabis (on-demand, sebelum findOneBerkas)
      getOne: jest.fn().mockResolvedValue(berkas),
    });
    return berkas;
  };

  it('ajukanTutupBerkas -> emit count + notif BERKAS_VERIFIKASI (sendPush=false) ke verifikator urutan-1', async () => {
    stubBerkas('aktif');
    berkasNaskahRepo.count.mockResolvedValue(3); // berkas punya naskah
    query.mockResolvedValueOnce([{ total: 2 }]); // countMenungguSaya
    const dto = {
      verifikator: [
        { verifikator_persnum: '111', verifikator_position_id: 7, jabatan_verifikator: 'M' },
        { verifikator_persnum: '222', verifikator_position_id: 8, jabatan_verifikator: 'N' },
      ],
      catatan: 'uji',
    };
    // Validasi verifikator: atasan managerial pengaju (position 7) = 111 & 222
    orgDataService.getAtasanManagerial.mockResolvedValue({
      data: [{ persnum_person: '111' }, { persnum_person: '222' }],
    });
    await service.ajukanTutupBerkas('b1', dto as any, { persnum: 99, position: 7 });
    expect(realtimeEmit.emitArsipPersetujuanCountUser).toHaveBeenCalledWith(111, 2);
    expect(notifService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        positionId: '7',
        userPersnum: 111,
        type: NotificationType.BERKAS_VERIFIKASI,
        title: 'Persetujuan penutupan berkas',
        body: 'Berkas "Berkas A" menunggu persetujuan Anda',
      }),
      false,
    );
  });

  it('ajukanTutupBerkas -> tolak jika berkas belum punya naskah (count = 0)', async () => {
    stubBerkas('aktif');
    berkasNaskahRepo.count.mockResolvedValue(0);
    const dto = {
      verifikator: [
        { verifikator_persnum: '111', verifikator_position_id: 7, jabatan_verifikator: 'M' },
      ],
      catatan: 'uji',
    };
    await expect(service.ajukanTutupBerkas('b1', dto as any, 99)).rejects.toThrow(
      BadRequestException,
    );
    expect(berkasVerifikasiRepo.save).not.toHaveBeenCalled();
    expect(berkasRepo.save).not.toHaveBeenCalled();
  });

  it('approveVerifikasi -> emit count ke approver & verifikator berikutnya', async () => {
    stubBerkas('menunggu_verifikasi');
    const current = { verifikatorPersnum: '111', status: 'pending', urutan: 1 };
    const next = { verifikatorPersnum: '222', status: 'pending', urutan: 2 };
    berkasVerifikasiRepo.findOne
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(next);
    query
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([{ total: 1 }]);
    await service.approveVerifikasi('b1', '111', { catatan: 'ok minimal' } as any);
    expect(realtimeEmit.emitArsipPersetujuanCountUser).toHaveBeenCalledWith(111, 0);
    expect(realtimeEmit.emitArsipPersetujuanCountUser).toHaveBeenCalledWith(222, 1);
    expect(berkasRepo.save).not.toHaveBeenCalled();
  });

  it('rejectVerifikasi -> emit count ke rejecter', async () => {
    stubBerkas('menunggu_verifikasi');
    const current = { verifikatorPersnum: '111', status: 'pending', urutan: 1 };
    berkasVerifikasiRepo.findOne.mockResolvedValueOnce(current);
    query.mockResolvedValueOnce([{ total: 0 }]);
    await service.rejectVerifikasi('b1', '111', { catatan: 'tolak' } as any);
    expect(realtimeEmit.emitArsipPersetujuanCountUser).toHaveBeenCalledWith(111, 0);
    expect(berkasRepo.save).toHaveBeenCalled();
  });
});

describe('ArsipDinamisService - tutupBerkasRetensiHabis (on-demand retensi)', () => {
  let service: ArsipDinamisService;
  let berkasRepo: any;
  let riwayatRepo: any;

  beforeEach(async () => {
    berkasRepo = { createQueryBuilder: jest.fn(), update: jest.fn() };
    riwayatRepo = { insert: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ArsipDinamisService,
        { provide: DataSource, useValue: { query: jest.fn() } },
        { provide: getRepositoryToken(Berkas), useValue: berkasRepo },
        { provide: getRepositoryToken(BerkasNaskah), useValue: { update: jest.fn() } },
        { provide: getRepositoryToken(BerkasVerifikasi), useValue: {} },
        { provide: getRepositoryToken(BerkasRiwayatRetensi), useValue: riwayatRepo },
        { provide: getRepositoryToken(KlasifikasiEntity), useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: OrgDataService, useValue: {} },
        { provide: NaskahService, useValue: {} },
        { provide: NotificationService, useValue: {} },
        { provide: RealtimeEmitService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(ArsipDinamisService);
  });

  const stubExpired = (list: any[]) => {
    berkasRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(list),
    });
  };

  it('flip aktif → closed_retensi_aktif + insert riwayat untuk berkas yang retensinya habis', async () => {
    stubExpired([{ id: 'b1' }, { id: 'b2' }]);
    const count = await service.tutupBerkasRetensiHabis();
    expect(count).toBe(2);
    expect(berkasRepo.update).toHaveBeenCalledWith(
      { id: 'b1' },
      { status: 'closed_retensi_aktif' },
    );
    expect(berkasRepo.update).toHaveBeenCalledWith(
      { id: 'b2' },
      { status: 'closed_retensi_aktif' },
    );
    expect(riwayatRepo.insert).toHaveBeenCalledTimes(2);
    expect(riwayatRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ berkasId: 'b1', statusBaru: 'closed_retensi_aktif' }),
    );
  });

  it('tanpa berkas expired → 0, tidak ada update/insert', async () => {
    stubExpired([]);
    const count = await service.tutupBerkasRetensiHabis();
    expect(count).toBe(0);
    expect(berkasRepo.update).not.toHaveBeenCalled();
    expect(riwayatRepo.insert).not.toHaveBeenCalled();
  });
});

describe('ArsipDinamisService - resolveScopePositions', () => {
  let service: ArsipDinamisService;
  let findLatestOrg: jest.Mock;

  // organization_json: tree org bersarang. Delegator duduk di:
  //  - 100 (EVP, chief) di divisi 20 → staf 101 + anaknya unit 201 (102, 103)
  //  - 104 (Manager, chief) di direktorat 10 → anaknya divisi 20 & 21
  //  - 105 (Manager, chief) di divisi 21 → 106 (chief) — tanpa anak
  const tree = [
    {
      id: 10,
      level: 'direktorat',
      name: 'Direktorat A',
      positions: [{ position: 104, chief: 1 }],
      children: [
        {
          id: 20,
          level: 'divisi',
          name: 'Divisi 20',
          positions: [
            { position: 100, chief: 1 },
            { position: 101, chief: 0 },
          ],
          children: [
            {
              id: 201,
              level: 'unit',
              name: 'Unit A',
              positions: [
                { position: 102, chief: 1 },
                { position: 103, chief: 0 },
              ],
            },
          ],
        },
        {
          id: 21,
          level: 'divisi',
          name: 'Divisi 21',
          positions: [
            { position: 105, chief: 1 },
            { position: 106, chief: 1 },
          ],
        },
      ],
    },
  ];

  // position_json: dipakai branch sekretaris role biasa (scope divisi).
  const rows = [
    { position: 100, position_text: 'EVP PMO', direktorat_id: 10, divisi_id: 20, organization_id: 20 },
    { position: 101, position_text: 'VP PMO', direktorat_id: 10, divisi_id: 20, organization_id: 20 },
    { position: 102, position_text: 'Manager Unit A', direktorat_id: 10, divisi_id: 20, organization_id: 201 },
    { position: 103, position_text: 'Staff Unit A', direktorat_id: 10, divisi_id: 20, organization_id: 201 },
    { position: 104, position_text: 'Manager Direktorat A', direktorat_id: 10, divisi_id: null, organization_id: 10 },
    { position: 105, position_text: 'Manager Divisi 21', direktorat_id: 10, divisi_id: 21, organization_id: 21 },
    { position: 106, position_text: 'Staff Divisi 21', direktorat_id: 10, divisi_id: 21, organization_id: 21 },
  ];

  beforeEach(async () => {
    findLatestOrg = jest.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ArsipDinamisService,
        { provide: DataSource, useValue: { query: jest.fn() } },
        { provide: getRepositoryToken(Berkas), useValue: {} },
        { provide: getRepositoryToken(BerkasNaskah), useValue: {} },
        { provide: getRepositoryToken(BerkasVerifikasi), useValue: {} },
        { provide: getRepositoryToken(BerkasRiwayatRetensi), useValue: {} },
        { provide: getRepositoryToken(KlasifikasiEntity), useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: OrgDataService, useValue: { findLatestOrg } },
        { provide: NaskahService, useValue: {} },
        { provide: NotificationService, useValue: {} },
        { provide: RealtimeEmitService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(ArsipDinamisService);
  });

  it('delegasi SE (EVP di divisi 20) → seluruh divisi sendiri + unit di bawah, termasuk EVP', async () => {
    findLatestOrg.mockResolvedValue({ organization_json: tree, position_json: rows });
    const scope = await service.resolveScopePositions({
      position: 100, // EVP delegator (chief)
      position_status: 'SE',
      tuRoles: ['sekretaris'],
    });
    // Semua posisi divisi 20 (100 EVP, 101 staf) + anak unit 201 (102, 103).
    // Divisi lain (105, 106) TIDAK termasuk.
    expect(scope).toEqual([100, 101, 102, 103]);
  });

  it('delegasi SE (Manager direktorat 10) → seluruh divisi/unit di bawahnya + posisinya sendiri', async () => {
    findLatestOrg.mockResolvedValue({ organization_json: tree, position_json: rows });
    const scope = await service.resolveScopePositions({
      position: 104,
      position_status: 'SE',
    });
    expect(scope).toEqual([104, 100, 101, 102, 103, 105, 106]);
  });

  it('delegasi SE tanpa anak (Manager divisi 21) → scope divisi sendiri (semua posisi)', async () => {
    findLatestOrg.mockResolvedValue({ organization_json: tree, position_json: rows });
    const scope = await service.resolveScopePositions({
      position: 105,
      position_status: 'SE',
    });
    expect(scope).toEqual([105, 106]);
  });

  it('sekretaris role biasa (non-delegasi) → scope divisi sendiri, bukan direktorat', async () => {
    findLatestOrg.mockResolvedValue({ organization_json: tree, position_json: rows });
    const scope = await service.resolveScopePositions({
      position: 102,
      position_status: null,
      tuRoles: ['sekretaris'],
    });
    expect(scope).toEqual([100, 101, 102, 103]); // divisi 20 saja
  });

  it('user biasa (bukan sekretaris) → undefined (scope pribadi)', async () => {
    findLatestOrg.mockResolvedValue({ organization_json: tree, position_json: rows });
    const scope = await service.resolveScopePositions({
      position: 102,
      position_status: null,
      tuRoles: [],
    });
    expect(scope).toBeUndefined();
  });

  it('posisi tidak ditemukan di tree/position_json → undefined', async () => {
    findLatestOrg.mockResolvedValue({ organization_json: tree, position_json: rows });
    const scope = await service.resolveScopePositions({
      position: 999,
      position_status: 'SE',
    });
    expect(scope).toBeUndefined();
  });

  it('getScopeDivisi (SE) → divisi sendiri + org keturunan', async () => {
    findLatestOrg.mockResolvedValue({ organization_json: tree, position_json: rows });
    const divisi = await service.getScopeDivisi({
      position: 100,
      position_status: 'SE',
    });
    expect(divisi).toEqual(['Divisi 20', 'Unit A']);
  });

  it('getScopeDivisi non-SE → [] (filter tetap dari daftar kandidat)', async () => {
    const divisi = await service.getScopeDivisi({
      position: 100,
      position_status: null,
      tuRoles: ['sekretaris'],
    });
    expect(divisi).toEqual([]);
  });
});

describe('ArsipDinamisService - findAllBerkas (visibilitas berkas Tertutup)', () => {
  let service: ArsipDinamisService;
  let berkasRepo: any;

  beforeEach(async () => {
    berkasRepo = { createQueryBuilder: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ArsipDinamisService,
        { provide: DataSource, useValue: { query: jest.fn() } },
        { provide: getRepositoryToken(Berkas), useValue: berkasRepo },
        { provide: getRepositoryToken(BerkasNaskah), useValue: {} },
        { provide: getRepositoryToken(BerkasVerifikasi), useValue: {} },
        { provide: getRepositoryToken(BerkasRiwayatRetensi), useValue: {} },
        { provide: getRepositoryToken(KlasifikasiEntity), useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: OrgDataService, useValue: {} },
        { provide: NaskahService, useValue: {} },
        { provide: NotificationService, useValue: {} },
        { provide: RealtimeEmitService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(ArsipDinamisService);
  });

  // Chain untuk tutupBerkasRetensiHabis() yang dipanggil di awal findAllBerkas
  const expiredChain = () => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  });

  const listChain = (rows: any[]) => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([rows, rows.length]),
  });

  it('user biasa (non-TU): berkas Tertutup retensi masih berjalan tetap tampil — pengecualian hanya yang retensinya habis', async () => {
    const chain = listChain([{ id: 'b1', status: 'closed_retensi_aktif' }]);
    berkasRepo.createQueryBuilder
      .mockReturnValueOnce(expiredChain())
      .mockReturnValueOnce(chain);

    const res = await service.findAllBerkas(99, false, {});

    expect(res.data).toHaveLength(1);
    // Tidak lagi menyembunyikan SEMUA berkas tertutup dari user biasa
    expect(chain.andWhere).not.toHaveBeenCalledWith(
      'b.status != :closed',
      expect.any(Object),
    );
    // Pengecualian berbasis tanggal retensi aktif (hanya yang sudah habis)
    expect(chain.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('b.tanggal_retensi_aktif_berakhir'),
      expect.any(Object),
    );
  });

  it('user biasa (non-TU): berkas Tertutup retensi aktif sudah habis → disembunyikan', async () => {
    const chain = listChain([]);
    berkasRepo.createQueryBuilder
      .mockReturnValueOnce(expiredChain())
      .mockReturnValueOnce(chain);

    const res = await service.findAllBerkas(99, false, {});

    expect(res.data).toHaveLength(0);
    expect(chain.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('b.tanggal_retensi_aktif_berakhir'),
      expect.any(Object),
    );
  });

  it('TU: berkas Tertutup tetap tampil (semua)', async () => {
    const chain = listChain([{ id: 'b1', status: 'closed_retensi_aktif' }]);
    berkasRepo.createQueryBuilder
      .mockReturnValueOnce(expiredChain())
      .mockReturnValueOnce(chain);

    const res = await service.findAllBerkas(99, true, {});

    expect(res.data).toHaveLength(1);
    expect(chain.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('b.status = :closed'),
      expect.any(Object),
    );
  });

  it('user biasa (non-TU): berkas Retensi Inaktif retensi inaktif masih berjalan → tetap tampil', async () => {
    const chain = listChain([{ id: 'b1', status: 'retensi_inaktif' }]);
    berkasRepo.createQueryBuilder
      .mockReturnValueOnce(expiredChain())
      .mockReturnValueOnce(chain);

    const res = await service.findAllBerkas(99, false, {});

    expect(res.data).toHaveLength(1);
    // Pengecualian berbasis tanggal retensi inaktif (hanya yang sudah habis)
    expect(chain.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('b.tanggal_retensi_inaktif_berakhir'),
      expect.any(Object),
    );
  });

  it('user biasa (non-TU): berkas Retensi Inaktif retensi inaktif sudah habis → disembunyikan', async () => {
    const chain = listChain([]);
    berkasRepo.createQueryBuilder
      .mockReturnValueOnce(expiredChain())
      .mockReturnValueOnce(chain);

    const res = await service.findAllBerkas(99, false, {});

    expect(res.data).toHaveLength(0);
    expect(chain.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('b.tanggal_retensi_inaktif_berakhir'),
      expect.any(Object),
    );
  });

  it('TU: berkas Retensi Inaktif tetap tampil (semua, termasuk yang retensi inaktifnya habis)', async () => {
    const chain = listChain([{ id: 'b1', status: 'retensi_inaktif' }]);
    berkasRepo.createQueryBuilder
      .mockReturnValueOnce(expiredChain())
      .mockReturnValueOnce(chain);

    const res = await service.findAllBerkas(99, true, {});

    expect(res.data).toHaveLength(1);
    expect(chain.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('b.status = :inaktif'),
      expect.any(Object),
    );
  });
});

describe('ArsipDinamisService - removeNaskahFromBerkas (multi id_sirkuler)', () => {
  let service: ArsipDinamisService;
  let berkasRepo: any;
  let berkasNaskahRepo: any;

  beforeEach(async () => {
    berkasRepo = { createQueryBuilder: jest.fn() };
    berkasNaskahRepo = { find: jest.fn(), remove: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ArsipDinamisService,
        { provide: DataSource, useValue: { query: jest.fn() } },
        { provide: getRepositoryToken(Berkas), useValue: berkasRepo },
        { provide: getRepositoryToken(BerkasNaskah), useValue: berkasNaskahRepo },
        { provide: getRepositoryToken(BerkasVerifikasi), useValue: {} },
        { provide: getRepositoryToken(BerkasRiwayatRetensi), useValue: {} },
        { provide: getRepositoryToken(KlasifikasiEntity), useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: OrgDataService, useValue: {} },
        { provide: NaskahService, useValue: {} },
        { provide: NotificationService, useValue: {} },
        { provide: RealtimeEmitService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(ArsipDinamisService);
  });

  // Chain untuk tutupBerkasRetensiHabis() yang dipanggil di awal findOneBerkas
  const expiredChain = () => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  });

  const berkasChain = (berkas: any) => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(berkas),
  });

  it('menghapus SEMUA baris naskah yang sama (multi id_sirkuler) dari berkas', async () => {
    berkasRepo.createQueryBuilder
      .mockReturnValueOnce(expiredChain()) // tutupBerkasRetensiHabis
      .mockReturnValueOnce(berkasChain({ id: 'b1', status: 'aktif' })); // findOneBerkas
    const rows = [
      { id: 'r1', berkasId: 'b1', naskahId: 'n1', idSirkuler: 's1' },
      { id: 'r2', berkasId: 'b1', naskahId: 'n1', idSirkuler: 's2' },
    ];
    berkasNaskahRepo.find.mockResolvedValue(rows);
    berkasNaskahRepo.remove.mockResolvedValue(undefined);

    const res = await service.removeNaskahFromBerkas('b1', 'n1', 99);

    expect(res.message).toContain('berhasil dihapus');
    expect(berkasNaskahRepo.find).toHaveBeenCalledWith({
      where: { berkasId: 'b1', naskahId: 'n1' },
    });
    expect(berkasNaskahRepo.remove).toHaveBeenCalledWith(rows);
  });

  it('tolak (NotFound) bila naskah tidak ada di berkas', async () => {
    berkasRepo.createQueryBuilder
      .mockReturnValueOnce(expiredChain())
      .mockReturnValueOnce(berkasChain({ id: 'b1', status: 'aktif' }));
    berkasNaskahRepo.find.mockResolvedValue([]);

    await expect(service.removeNaskahFromBerkas('b1', 'n1', 99)).rejects.toThrow(
      /tidak ditemukan di berkas/,
    );
    expect(berkasNaskahRepo.remove).not.toHaveBeenCalled();
  });

  it('tolak (BadRequest) bila berkas bukan Aktif/Ditolak', async () => {
    berkasRepo.createQueryBuilder
      .mockReturnValueOnce(expiredChain())
      .mockReturnValueOnce(berkasChain({ id: 'b1', status: 'closed_retensi_aktif' }));

    await expect(service.removeNaskahFromBerkas('b1', 'n1', 99)).rejects.toThrow(
      BadRequestException,
    );
    expect(berkasNaskahRepo.find).not.toHaveBeenCalled();
  });
});
