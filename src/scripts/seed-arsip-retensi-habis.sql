-- =====================================================================
-- Seed: Arsip (berkas) dengan retensi aktif habis
-- Fitur: Pemindahan Arsip Inaktif (Transfer Inactive File)
-- Target DB: arsipku_local_db (MySQL)
-- Tabel: berkas (schema navmail)
-- =====================================================================
-- Kondisi yang dipenuhi tiap baris:
--   - status = 'closed_retensi_aktif'  (status arsip "aktif" sudah ditutup)
--   - tanggal_retensi_aktif_berakhir <= CURDATE()  (retensi aktif sudah habis)
--   - created_by / pic_persnum = 10011066 (Staf Administrasi — test user paling aktif)
--   - unit_pencipta_id = 10002111 (Air Navigation Services Planning Division)
--   - belum pernah diajukan pindah inaktif (id tidak ada di transfer_inactive_file.arsip_id)
-- Catatan:
--   - Kolom NOT NULL wajib diisi: klasifikasi, judul_berkas, hitung_waktu_retensi_dari,
--     tindakan_penyusutan_akhir, lokasi, isi_ringkas.
--   - kode_berkas UNIQUE → pakai prefix DUMMY-RET- agar tidak bentrok.
--   - id pakai UUID() agar valid & unik.
-- =====================================================================

USE arsipku_local_db;

INSERT INTO berkas (
  id,
  klasifikasi,
  klasifikasi_text,
  judul_berkas,
  isi_ringkas,
  hitung_waktu_retensi_dari,
  tindakan_penyusutan_akhir,
  lokasi,
  is_aktif,
  kode_berkas,
  kategori_berkas,
  retensi_aktif_tahun,
  retensi_inaktif_tahun,
  unit_pencipta_id,
  pic_persnum,
  tanggal_dibuat,
  tanggal_ditutup,
  tanggal_retensi_aktif_berakhir,
  tanggal_retensi_inaktif_berakhir,
  status,
  created_by,
  updated_by,
  created_at,
  updated_at
) VALUES
  (UUID(), '100', 'Surat Dinas',          'Surat Dinas Eksternal Tahun 2024',   'Dummy arsip retensi aktif habis untuk uji Pemindahan Arsip Inaktif', 'Sejak Berkas Ditutup', 'Musnah',         'Gudang Inaktif A', 1, 'DUMMY-RET-001', 'Surat Dinas', 2, 3, 10002111, '10011066', '2024-01-15', '2024-07-20', '2026-07-20', '2029-07-20', 'closed_retensi_aktif', 10011066, 10011066, NOW(), NOW()),
  (UUID(), '100', 'Surat Dinas',          'Surat Dinas Internal Tahun 2024',   'Dummy arsip retensi aktif habis untuk uji Pemindahan Arsip Inaktif', 'Sejak Berkas Ditutup', 'Musnah',         'Gudang Inaktif A', 1, 'DUMMY-RET-002', 'Surat Dinas', 2, 3, 10002111, '10011066', '2024-01-16', '2024-07-21', '2026-07-21', '2029-07-21', 'closed_retensi_aktif', 10011066, 10011066, NOW(), NOW()),
  (UUID(), '110', 'Nota Dinas',           'Nota Dinas Kegiatan 2024',          'Dummy arsip retensi aktif habis untuk uji Pemindahan Arsip Inaktif', 'Sejak Berkas Ditutup', 'Dinilai Kembali','Gudang Inaktif A', 1, 'DUMMY-RET-003', 'Nota Dinas',  2, 3, 10002111, '10011066', '2024-01-17', '2024-07-22', '2026-07-22', '2029-07-22', 'closed_retensi_aktif', 10011066, 10011066, NOW(), NOW()),
  (UUID(), '120', 'Memo',                 'Memo Internal Tahun 2024',         'Dummy arsip retensi aktif habis untuk uji Pemindahan Arsip Inaktif', 'Sejak Berkas Ditutup', 'Musnah',         'Gudang Inaktif A', 1, 'DUMMY-RET-004', 'Memo',        2, 3, 10002111, '10011066', '2024-01-18', '2024-07-23', '2026-07-23', '2029-07-23', 'closed_retensi_aktif', 10011066, 10011066, NOW(), NOW()),
  (UUID(), '130', 'Surat Edaran',         'Surat Edaran 2024',                'Dummy arsip retensi aktif habis untuk uji Pemindahan Arsip Inaktif', 'Sejak Berkas Ditutup', 'Permanen',      'Gudang Inaktif A', 1, 'DUMMY-RET-005', 'Surat Edaran',2, 3, 10002111, '10011066', '2024-01-19', '2024-07-24', '2026-07-24', '2029-07-24', 'closed_retensi_aktif', 10011066, 10011066, NOW(), NOW()),
  (UUID(), '140', 'Surat Perjalanan Dinas','Surat Perjalanan Dinas 2024',      'Dummy arsip retensi aktif habis untuk uji Pemindahan Arsip Inaktif', 'Sejak Berkas Ditutup', 'Musnah',         'Gudang Inaktif A', 1, 'DUMMY-RET-006', 'SPD',         2, 3, 10002111, '10011066', '2024-01-20', '2024-07-25', '2026-07-25', '2029-07-25', 'closed_retensi_aktif', 10011066, 10011066, NOW(), NOW()),
  (UUID(), '150', 'Laporan',             'Laporan Bulanan 2024',              'Dummy arsip retensi aktif habis untuk uji Pemindahan Arsip Inaktif', 'Sejak Berkas Ditutup', 'Dinilai Kembali','Gudang Inaktif A', 1, 'DUMMY-RET-007', 'Laporan',     2, 3, 10002111, '10011066', '2024-01-21', '2024-07-26', '2026-07-26', '2029-07-26', 'closed_retensi_aktif', 10011066, 10011066, NOW(), NOW()),
  (UUID(), '160', 'Proposal',            'Proposal Kegiatan 2024',            'Dummy arsip retensi aktif habis untuk uji Pemindahan Arsip Inaktif', 'Sejak Berkas Ditutup', 'Musnah',         'Gudang Inaktif A', 1, 'DUMMY-RET-008', 'Proposal',    2, 3, 10002111, '10011066', '2024-01-22', '2024-07-27', '2026-07-27', '2029-07-27', 'closed_retensi_aktif', 10011066, 10011066, NOW(), NOW()),
  (UUID(), '170', 'Rekapitulasi',        'Rekapitulasi Data 2024',            'Dummy arsip retensi aktif habis untuk uji Pemindahan Arsip Inaktif', 'Sejak Berkas Ditutup', 'Permanen',      'Gudang Inaktif A', 1, 'DUMMY-RET-009', 'Rekapitulasi',2, 3, 10002111, '10011066', '2024-01-23', '2024-07-27', '2026-07-27', '2029-07-27', 'closed_retensi_aktif', 10011066, 10011066, NOW(), NOW()),
  (UUID(), '180', 'Kontrak',             'Kontrak Kerja 2024',                'Dummy arsip retensi aktif habis untuk uji Pemindahan Arsip Inaktif', 'Sejak Berkas Ditutup', 'Dinilai Kembali','Gudang Inaktif A', 1, 'DUMMY-RET-010', 'Kontrak',     2, 3, 10002111, '10011066', '2024-01-24', '2024-07-27', '2026-07-27', '2029-07-27', 'closed_retensi_aktif', 10011066, 10011066, NOW(), NOW());

-- =====================================================================
-- Verifikasi
-- =====================================================================
SELECT COUNT(*) AS arsip_retensi_aktif_habis
FROM berkas
WHERE status = 'closed_retensi_aktif'
  AND deleted_at IS NULL
  AND tanggal_retensi_aktif_berakhir <= CURDATE()
  AND created_by = 10011066
  AND kode_berkas LIKE 'DUMMY-RET-%';

SELECT id, kode_berkas, judul_berkas, status, tanggal_retensi_aktif_berakhir
FROM berkas
WHERE kode_berkas LIKE 'DUMMY-RET-%'
ORDER BY kode_berkas;