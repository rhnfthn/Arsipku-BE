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
    berkasNaskahRepo.findOne.mockResolvedValue({ naskahId: 'n1' });
    naskahService.getDetailWithChainForBerkas.mockResolvedValue({ success: true, data: [{ id: 'n1' }] });
    const res = await service.getNaskahDetailInBerkas('b1', 'n1');
    expect(naskahService.getDetailWithChainForBerkas).toHaveBeenCalledWith('n1');
    expect(res.data[0].id).toBe('n1');
  });

  it('tolak (NotFound) bila naskah bukan milik berkas — anti enumerasi id', async () => {
    berkasNaskahRepo.findOne.mockResolvedValue(null);
    await expect(service.getNaskahDetailInBerkas('b1', 'n1')).rejects.toThrow(
      /tidak ditemukan di berkas/,
    );
    expect(naskahService.getDetailWithChainForBerkas).not.toHaveBeenCalled();
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
        { provide: OrgDataService, useValue: {} },
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
    await service.ajukanTutupBerkas('b1', dto as any, 99);
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
        { provide: getRepositoryToken(BerkasNaskah), useValue: {} },
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
