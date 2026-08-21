import { Injectable } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, In } from 'typeorm';
import { ArsipBerkasEntity } from '../entities/arsip-berkas.archive-entity';
import { ArsipBerkasNaskahEntity } from '../entities/arsip-berkas-naskah.archive-entity';
import { ArsipNaskahEntity } from '../entities/arsip-naskah.archive-entity';
import { ArsipNaskahLampiranEntity } from '../entities/arsip-naskah-lampiran.archive-entity';
import { ArsipPenyusutanLogEntity } from '../entities/arsip-penyusutan-log.archive-entity';
import { Berkas } from '../../berkas/entities/berkas.entity';
import { BerkasNaskah } from '../../arsip-dinamis/entities/berkas-naskah.entity';
import { NaskahEntity } from '../../naskah/entities/naskah.entity';
import { NaskahLampiranEntity } from '../../naskah-lampiran/entities/naskah_lampiran.entity';
import { StorageService } from '../../storage/services/storage.service';

/**
 * DTO input untuk arsipkan berkas.
 */
export interface ArsipkanBerkasInput {
  user: {
    persnum: number;
    nama: string;
  };
  penyusutanId: string;
  sourceBerkasId?: string;
  jenisPenyusutan: 'musnah' | 'permanen';
  statusSebelumnya: string;
  statusBaru: string;
  beritaAcaraUrl?: string;
  fotoDokumentasiUrl?: string;
  catatan?: string;
}

@Injectable()
export class ArsipService {
  constructor(
    @InjectRepository(ArsipBerkasEntity, 'archiveConnection')
    private readonly berkasRepo: Repository<ArsipBerkasEntity>,
    @InjectRepository(ArsipBerkasNaskahEntity, 'archiveConnection')
    private readonly berkasNaskahRepo: Repository<ArsipBerkasNaskahEntity>,
    @InjectRepository(ArsipNaskahEntity, 'archiveConnection')
    private readonly naskahRepo: Repository<ArsipNaskahEntity>,
    @InjectRepository(ArsipNaskahLampiranEntity, 'archiveConnection')
    private readonly lampiranRepo: Repository<ArsipNaskahLampiranEntity>,
    @InjectRepository(ArsipPenyusutanLogEntity, 'archiveConnection')
    private readonly logRepo: Repository<ArsipPenyusutanLogEntity>,
    @InjectRepository(Berkas)
    private readonly sourceBerkasRepo: Repository<Berkas>,
    @InjectRepository(BerkasNaskah)
    private readonly sourceBerkasNaskahRepo: Repository<BerkasNaskah>,
    @InjectRepository(NaskahEntity)
    private readonly sourceNaskahRepo: Repository<NaskahEntity>,
    @InjectRepository(NaskahLampiranEntity)
    private readonly sourceLampiranRepo: Repository<NaskahLampiranEntity>,
    private readonly dataSource: DataSource,
    @InjectDataSource('archiveConnection')
    private readonly archiveDataSource: DataSource,
    private readonly storageService: StorageService,
  ) {}

  private getCurrentDateStr(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  private getArchivedYear(): number {
    return new Date().getFullYear();
  }

  /**
   * Arsipkan berkas beserta naskah-naskahnya ke database arsipku_arsip_local.
   * Dipanggil setelah penyusutan diterima (permanen/musnah).
   * Semua insert ke DB arsip dibungkus transaction — jika gagal, di-rollback.
   */
  async arsipkanBerkas(
    sourceBerkasId: string,
    input: ArsipkanBerkasInput,
  ): Promise<ArsipBerkasEntity> {
    // Cegah duplikat arsip untuk berkas yang sama
    const existing = await this.berkasRepo.findOne({
      where: { source_berkas_id: sourceBerkasId },
    });
    if (existing) {
      throw new Error('Berkas sudah pernah diarsipkan');
    }

    const berkas = await this.sourceBerkasRepo.findOne({
      where: { id: sourceBerkasId },
    });
    if (!berkas) {
      throw new Error('Berkas tidak ditemukan di database inti');
    }

    const archivedYear = this.getArchivedYear();
    const tanggalMasuk = this.getCurrentDateStr();

    // Ambil naskah-naskah dalam berkas (baca dari DB inti, di luar transaction)
    const berkasNaskahList = await this.sourceBerkasNaskahRepo.find({
      where: { berkasId: sourceBerkasId },
    });

    const sourceNaskahIds = berkasNaskahList.map((bn) => bn.naskahId);
    const sourceNaskahMap = new Map<string, NaskahEntity>();
    if (sourceNaskahIds.length > 0) {
      // NaskahEntity punya composite PK (id + tanggal), jadi pakai In(id)
      // bukan findByIds (yang butuh object {id, tanggal}).
      const naskahList = await this.sourceNaskahRepo.find({
        where: { id: In(sourceNaskahIds) },
      });
      for (const n of naskahList) {
        sourceNaskahMap.set(n.id, n);
      }
    }

    // Semua insert ke DB arsip dalam satu transaction
    return this.archiveDataSource.transaction(
      async (manager: EntityManager) => {
        const berkasRepo = manager.getRepository(ArsipBerkasEntity);
        const berkasNaskahRepo = manager.getRepository(ArsipBerkasNaskahEntity);
        const naskahRepo = manager.getRepository(ArsipNaskahEntity);
        const lampiranRepo = manager.getRepository(ArsipNaskahLampiranEntity);
        const logRepo = manager.getRepository(ArsipPenyusutanLogEntity);

        // 1. Simpan snapshot master berkas
        const arsipBerkas = berkasRepo.create({
          archived_year: archivedYear,
          source_berkas_id: berkas.id,
          klasifikasi: berkas.klasifikasi,
          klasifikasi_text: berkas.klasifikasiTeks ?? null,
          judul_berkas: berkas.judulBerkas,
          isi_ringkas: berkas.isiRingkas,
          kode_berkas: berkas.kodeBerkas ?? null,
          kategori_berkas: berkas.kategoriBerkas ?? null,
          hitung_waktu_retensi_dari: berkas.hitungWaktuRetensiDari,
          retensi_aktif_tahun: berkas.retensiAktifTahun ?? null,
          retensi_inaktif_tahun: berkas.retensiInaktifTahun ?? null,
          tindakan_penyusutan_akhir:
            input.jenisPenyusutan === 'musnah' ? 'Musnah' : 'Permanen',
          lokasi_fisik: berkas.lokasi,
          foto_lokasi_fisik: berkas.fotoLokasiFisik ?? null,
          dokumen_pendukung: berkas.dokumenPendukung ?? null,
          catatan_penutupan: berkas.catatanPenutupan ?? null,
          unit_pencipta_id: berkas.unitPenciptaId ?? null,
          pic_persnum: berkas.picPersnum ?? null,
          tanggal_dibuat: berkas.tanggalDibuat,
          tanggal_ditutup: berkas.tanggalDitutup ?? null,
          tanggal_retensi_aktif_berakhir:
            berkas.tanggalRetensiAktifBerakhir ?? null,
          tanggal_retensi_inaktif_berakhir:
            berkas.tanggalRetensiInaktifBerakhir ?? null,
          tanggal_masuk_arsip: tanggalMasuk,
          status_akhir:
            input.jenisPenyusutan === 'musnah' ? 'musnah' : 'permanen',
          is_musnah: input.jenisPenyusutan === 'musnah',
          tanggal_pemusnahan:
            input.jenisPenyusutan === 'musnah' ? tanggalMasuk : null,
          musnah_by_persnum:
            input.jenisPenyusutan === 'musnah' ? input.user.persnum : null,
          musnah_by_name:
            input.jenisPenyusutan === 'musnah' ? input.user.nama : null,
          berita_acara_pemusnahan_url: input.beritaAcaraUrl ?? null,
          foto_dokumentasi_pemusnahan: input.fotoDokumentasiUrl ?? null,
          catatan_pemusnahan: input.catatan ?? null,
        });

        const savedBerkas = await berkasRepo.save(arsipBerkas);

        // 2. Simpan relasi berkas-naskah + snapshot detail naskah + lampiran
        for (const bn of berkasNaskahList) {
          const naskah = sourceNaskahMap.get(bn.naskahId);

          await berkasNaskahRepo.save(
            berkasNaskahRepo.create({
              archived_year: archivedYear,
              arsip_berkas_id: savedBerkas.id,
              source_berkas_id: sourceBerkasId,
              source_naskah_id: bn.naskahId,
              jenis_naskah: bn.naskahTipe,
              sifat: naskah?.sifat ?? 'biasa',
              nomor_surat: bn.nomorSurat ?? naskah?.nomor ?? null,
              perihal: bn.perihal ?? naskah?.perihal ?? null,
              konten: naskah?.konten ?? null,
              tanggal_naskah: bn.tanggalNaskah ?? naskah?.tanggal ?? null,
              sirkuler: bn.sirkuler ?? null,
              id_sirkuler: bn.idSirkuler ?? null,
              sumber: bn.sumber,
              urutan: bn.urutan,
              final_pdf: naskah?.final_pdf ?? null,
              status_naskah: bn.status,
            }),
          );

          if (naskah) {
            // Cek apakah naskah sudah pernah di-arsipkan (bisa muncul di
            // berkas lain yang sudah di-arsipkan sebelumnya). Jika sudah,
            // lewati insert arsip_naskah & lampiran untuk hindari duplicate
            // key uk_source_naskah (source_naskah_id, archived_year).
            const existingNaskah = await naskahRepo.findOne({
              where: {
                source_naskah_id: naskah.id,
                archived_year: archivedYear,
              },
            });
            if (!existingNaskah) {
              await naskahRepo.save(
                naskahRepo.create({
                  archived_year: archivedYear,
                  source_naskah_id: naskah.id,
                  jenis: naskah.jenis,
                  klasifikasi: naskah.klasifikasi ?? null,
                  klasifikasi_text: naskah.klasifikasi_text ?? null,
                  sifat: naskah.sifat,
                  nomor: naskah.nomor ?? null,
                  tanggal: naskah.tanggal as unknown as string,
                  lampiran: naskah.lampiran ?? null,
                  perihal: naskah.perihal ?? null,
                  konten: naskah.konten ?? null,
                  tempat: naskah.tempat ?? null,
                  status: naskah.status,
                  final_pdf: naskah.final_pdf ?? null,
                  english: naskah.english ?? false,
                  tanda_tangan: naskah.tandaTangan ?? null,
                  sign_option: naskah.signOption ?? null,
                  dikirim_oleh: naskah.dikirimOleh
                    ? JSON.stringify(naskah.dikirimOleh)
                    : null,
                  created_by_position: naskah.createdByPosition ?? null,
                  atas_nama: naskah.atasNama ?? null,
                  atas_nama_position_id: naskah.atasNamaPositionId ?? null,
                  tanggal_masuk_arsip: tanggalMasuk,
                }),
              );

              // Snapshot lampiran naskah
              const lampiranList = await this.sourceLampiranRepo.find({
                where: { id_naskah: naskah.id },
              });
              for (const lam of lampiranList) {
                await lampiranRepo.save(
                  lampiranRepo.create({
                    archived_year: archivedYear,
                    source_lampiran_id: String(lam.id),
                    source_naskah_id: naskah.id,
                    nama_file: lam.file_name ?? 'unknown',
                    path_file: lam.file_pdf ?? '',
                    tipe_file: lam.jenis ?? null,
                    ukuran_bytes: null,
                  }),
                );
              }
            }
          }
        }

        // 3. Catat log penyusutan
        await logRepo.save(
          logRepo.create({
            archived_year: archivedYear,
            source_penyusutan_id: input.penyusutanId,
            source_berkas_id: sourceBerkasId,
            jenis_penyusutan: input.jenisPenyusutan,
            status_sebelumnya: input.statusSebelumnya,
            status_baru: input.statusBaru,
            diproses_oleh_persnum: input.user.persnum,
            diproses_oleh_name: input.user.nama,
            catatan: input.catatan ?? null,
            berita_acara_url: input.beritaAcaraUrl ?? null,
            foto_dokumentasi: input.fotoDokumentasiUrl ?? null,
          }),
        );

        return savedBerkas;
      },
    );
  }

  /**
   * Soft delete master berkas di database inti (set deleted_at).
   * Juga hapus relasi berkas_naskah agar naskah tidak bisa dibuka lagi
   * (arsip sudah dimusnahkan / dibackup ke DB arsip).
   */
  async softDeleteBerkas(sourceBerkasId: string): Promise<void> {
    const berkas = await this.sourceBerkasRepo.findOne({
      where: { id: sourceBerkasId },
    });
    if (!berkas) {
      throw new Error('Berkas tidak ditemukan di database inti');
    }
    berkas.deletedAt = new Date();
    await this.sourceBerkasRepo.save(berkas);

    // Hapus relasi berkas_naskah agar naskah tidak bisa diakses lagi
    // (naskah sudah di-backup ke DB arsip, DB inti tidak perlu lagi)
    await this.sourceBerkasNaskahRepo.delete({ berkasId: sourceBerkasId });
  }

  /**
   * Cek apakah berkas sudah pernah diarsipkan ke DB arsip.
   */
  async isBerkasArchived(sourceBerkasId: string): Promise<boolean> {
    const existing = await this.berkasRepo.findOne({
      where: { source_berkas_id: sourceBerkasId },
    });
    return !!existing;
  }

  /**
   * Cek apakah sebuah penyusutan sudah dibackup ke DB arsip (berdasarkan
   * log per penyusutan, bukan per berkas). Berkas bisa diarsipkan oleh
   * penyusutan lain untuk berkas yang sama.
   */
  async isPenyusutanArchived(penyusutanId: string): Promise<boolean> {
    const logRepo = this.archiveDataSource.getRepository(
      ArsipPenyusutanLogEntity,
    );
    const existing = await logRepo.findOne({
      where: { source_penyusutan_id: penyusutanId },
    });
    return !!existing;
  }

  /**
   * Catat log backup penyusutan tanpa insert ulang berkas (untuk kasus
   * berkas sudah diarsipkan oleh penyusutan lain). Dipakai oleh backupData
   * dan simpanPenataan/pemusnahan saat alreadyArchived.
   */
  async logPenyusutanArchived(input: ArsipkanBerkasInput): Promise<void> {
    const archivedYear = this.getArchivedYear();
    const tanggalMasuk = this.getCurrentDateStr();
    const logRepo = this.archiveDataSource.getRepository(
      ArsipPenyusutanLogEntity,
    );
    await logRepo.save(
      logRepo.create({
        archived_year: archivedYear,
        source_penyusutan_id: input.penyusutanId,
        source_berkas_id: input.sourceBerkasId,
        jenis_penyusutan: input.jenisPenyusutan,
        status_sebelumnya: input.statusSebelumnya,
        status_baru: input.statusBaru,
        diproses_oleh_persnum: input.user.persnum,
        diproses_oleh_name: input.user.nama,
        catatan: input.catatan ?? null,
        berita_acara_url: input.beritaAcaraUrl ?? null,
        foto_dokumentasi: input.fotoDokumentasiUrl ?? null,
      }),
    );
  }

  /**
   * Ambil detail berkas + naskah dari DB arsip (fallback saat berkas sudah
   * soft-deleted di DB inti, mis. jenis musnah). Dipakai preview-berkas.
   */
  async getArchivedBerkasDetail(sourceBerkasId: string): Promise<{
    berkas: ArsipBerkasEntity | null;
    naskah: Array<{
      id: string;
      naskahId: string;
      naskahTipe: string;
      nomorSurat: string | null;
      perihal: string | null;
      tanggalNaskah: string | null;
      sumber: string;
      urutan: number;
      finalPdf: string | null;
      status: string;
    }>;
  }> {
    const berkas = await this.berkasRepo.findOne({
      where: { source_berkas_id: sourceBerkasId },
    });
    if (!berkas) {
      return { berkas: null, naskah: [] };
    }
    const relasiList = await this.berkasNaskahRepo.find({
      where: { source_berkas_id: sourceBerkasId },
      order: { urutan: 'ASC' },
    });

    // Ambil final_pdf dari tabel arsip_naskah sebagai fallback jika
    // arsip_berkas_naskah.final_pdf null.
    const sourceNaskahIds = relasiList.map((r) => r.source_naskah_id);
    const arsipNaskahMap = new Map<string, string | null>();
    if (sourceNaskahIds.length > 0) {
      const arsipNaskahList = await this.naskahRepo.find({
        where: { source_naskah_id: In(sourceNaskahIds) },
      });
      for (const an of arsipNaskahList) {
        arsipNaskahMap.set(an.source_naskah_id, an.final_pdf ?? null);
      }
    }

    const naskah = relasiList.map((r) => ({
      id: String(r.id),
      naskahId: r.source_naskah_id,
      naskahTipe: r.jenis_naskah,
      nomorSurat: r.nomor_surat,
      perihal: r.perihal,
      tanggalNaskah: r.tanggal_naskah,
      sumber: r.sumber,
      urutan: r.urutan,
      finalPdf: r.final_pdf ?? arsipNaskahMap.get(r.source_naskah_id) ?? null,
      status: r.status_naskah,
    }));
    return { berkas, naskah };
  }

  /**
   * Ambil presigned URL untuk final_pdf naskah dari snapshot DB arsip.
   * Dipakai preview-berkas untuk berkas permanen yang sudah di-arsipkan.
   */
  async getNaskahPdfUrl(key: string): Promise<string | null> {
    if (!key) return null;
    return await this.storageService.getFileUrl(key);
  }

  /**
   * Daftar arsip yang sudah dibackup (untuk halaman tracking backup).
   * Menggabungkan snapshot arsip_berkas dengan log penyusutan.
   */
  async getBackupStatus(): Promise<
    Array<{
      arsipBerkasId: number;
      sourceBerkasId: string;
      sourcePenyusutanId: string | null;
      jenisPenyusutan: string;
      status: string;
      tanggalBackup: string | null;
      kodeBerkas: string | null;
      judulBerkas: string;
      klasifikasi: string | null;
      klasifikasiText: string | null;
      isMusnah: boolean;
      diprosesOlehName: string | null;
      catatan: string | null;
      beritaAcaraUrl: string | null;
    }>
  > {
    const logs = await this.logRepo.find({
      order: { created_at: 'DESC' },
    });
    const berkasList = await this.berkasRepo.find({
      order: { created_at: 'DESC' },
    });
    const berkasBySource = new Map<string, ArsipBerkasEntity>();
    for (const b of berkasList) berkasBySource.set(b.source_berkas_id, b);

    return logs.map((log) => {
      const berkas = berkasBySource.get(log.source_berkas_id);
      return {
        arsipBerkasId: berkas?.id ?? 0,
        sourceBerkasId: log.source_berkas_id,
        sourcePenyusutanId: log.source_penyusutan_id,
        jenisPenyusutan: log.jenis_penyusutan,
        status: 'sukses',
        tanggalBackup: log.created_at ? log.created_at.toISOString() : null,
        kodeBerkas: berkas?.kode_berkas ?? null,
        judulBerkas: berkas?.judul_berkas ?? '-',
        klasifikasi: berkas?.klasifikasi ?? null,
        klasifikasiText: berkas?.klasifikasi_text ?? null,
        isMusnah: log.jenis_penyusutan === 'musnah',
        diprosesOlehName: log.diproses_oleh_name,
        catatan: log.catatan,
        beritaAcaraUrl: log.berita_acara_url,
      };
    });
  }
}
