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
