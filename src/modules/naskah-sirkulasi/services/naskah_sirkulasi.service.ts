import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { CreateNaskahSirkulasiDto } from '../dto/naskah_sirkulasi/create_naskah_sirkulasi.dto';
import { UpdateNaskahSirkulasiDto } from '../dto/naskah_sirkulasi/update_naskah_sirkulasi.dto';
import {
  UpdateReadStatusDto,
  UpdateReadStatusResponseDto,
} from '../dto/naskah_sirkulasi/update-read-status.dto';
import {
  InboxQueryDto,
  InboxResponseDto,
  InboxItemDto,
} from '../dto/naskah_sirkulasi/inbox.dto';
import {
  SentMessageQueryDto,
  SentMessageResponseDto,
  SentMessageItemDto,
  PenerimaWithStatusDto,
} from '../dto/naskah_sirkulasi/sent-message.dto';
import { ToggleFlagResponseDto, BulkArchiveSentResponseDto } from '../dto/naskah_sirkulasi/toggle-flag.dto';
import { NaskahSirkulasi } from '../entities/naskah_sirkulasi.entity';
import { NaskahEntity } from '../../naskah/entities/naskah.entity';
import { NaskahLampiranEntity } from '../../naskah-lampiran/entities/naskah_lampiran.entity';
import { NaskahReferensiEntity } from '../../naskah-referensi/entities/naskah_referensi.entity';
import { EksternalEntity } from '../../eksternal/entities/eksternal.entity';
// REMOVED: SdiSdeEntity - data now comes from naskah_sirkulasi
// import { SdiSdeEntity } from '../../surat-dinas-eksternal/entities/sdi_sde.entity';
import { LabelService } from '../../label/services/label.service';
import { NaskahLabelEntity } from '../../label/entities/naskah-label.entity';

// Label untuk jenis naskah
const JENIS_LABELS: Record<string, string> = {
  ND: 'Nota Dinas',
  SDI: 'Surat Dinas Internal',
  SDE: 'Surat Dinas Eksternal',
  DI: 'Disposisi',
  KA: 'Kajian',
};

@Injectable()
export class NaskahSirkulasiService {
  constructor(
    @InjectRepository(NaskahSirkulasi)
    private readonly naskahSirkulasiRepo: Repository<NaskahSirkulasi>,
    @InjectRepository(NaskahEntity)
    private readonly naskahRepo: Repository<NaskahEntity>,
    @InjectRepository(EksternalEntity)
    private readonly eksternalRepo: Repository<EksternalEntity>,
    // REMOVED: SdiSdeEntity repository
    // @InjectRepository(SdiSdeEntity)
    // private readonly sdiSdeRepo: Repository<SdiSdeEntity>,
    @InjectRepository(NaskahLabelEntity)
    private readonly naskahLabelRepo: Repository<NaskahLabelEntity>,
    private readonly labelService: LabelService,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<NaskahSirkulasi[]> {
    return this.naskahSirkulasiRepo.find();
  }

  async findOne(id: string): Promise<NaskahSirkulasi> {
    const naskahSirkulasi = await this.naskahSirkulasiRepo.findOne({
      where: { id },
    });
    if (!naskahSirkulasi) {
      throw new NotFoundException(`Naskah Sirkulasi with ID ${id} not found`);
    }
    return naskahSirkulasi;
  }

  async create(dto: CreateNaskahSirkulasiDto): Promise<NaskahSirkulasi> {
    const newNaskahSirkulasi = this.naskahSirkulasiRepo.create(dto);
    return this.naskahSirkulasiRepo.save(newNaskahSirkulasi);
  }

  async update(
    id: string,
    dto: UpdateNaskahSirkulasiDto,
  ): Promise<NaskahSirkulasi> {
    const naskahSirkulasi = await this.findOne(id);
    const updated = Object.assign(naskahSirkulasi, dto);
    return this.naskahSirkulasiRepo.save(updated);
  }

  async remove(id: string): Promise<{ message: string }> {
    const naskahSirkulasi = await this.findOne(id);
    await this.naskahSirkulasiRepo.remove(naskahSirkulasi);
    return { message: `Naskah Sirkulasi ${id} deleted successfully` };
  }

  // ============================================================
  // UPDATE READ STATUS - Global untuk semua jenis naskah
  // ============================================================

  /**
   * Update status baca pesan (global untuk semua jenis naskah: ND, DI, SDI, SDE, dll)
   *
   * Logic:
   * - Cari sirkulasi berdasarkan id_naskah + position_id (penerima)
   * - Jika sudah terbaca, return info sebelumnya
   * - Jika belum, update send_read_time dan send_read_user
   *
   * @param dto - UpdateReadStatusDto
   * @returns UpdateReadStatusResponseDto
   */
  async updateReadStatus(
    dto: UpdateReadStatusDto,
  ): Promise<UpdateReadStatusResponseDto> {
    // Get naskah untuk info jenis
    const naskah = await this.naskahRepo.findOne({
      where: { id: dto.id_naskah },
    });

    if (!naskah) {
      throw new NotFoundException(`Naskah dengan ID ${dto.id_naskah} tidak ditemukan`);
    }

    // Find sirkulasi record for this naskah + position (penerima)
    const sirkulasi = await this.naskahSirkulasiRepo.findOne({
      where: {
        idNaskah: dto.id_naskah,
        position: dto.position_id,
        sirkuler: 'penerima',
      },
    });

    if (!sirkulasi) {
      throw new NotFoundException(
        `Pesan dengan id_naskah ${dto.id_naskah} untuk position ${dto.position_id} tidak ditemukan`,
      );
    }

    // Check if already read
    if (sirkulasi.sendReadTime) {
      return {
        success: true,
        message: 'Pesan sudah terbaca sebelumnya',
        data: {
          id_naskah: dto.id_naskah,
          position_id: dto.position_id,
          jenis_naskah: naskah.jenis,
          status_baca: 'terbaca',
          read_time: sirkulasi.sendReadTime,
          read_user: sirkulasi.sendReadUser,
        },
      };
    }

    // Update status to read
    const now = new Date();
    sirkulasi.sendReadTime = now;
    sirkulasi.sendReadUser = dto.user_id || dto.position_id;

    await this.naskahSirkulasiRepo.save(sirkulasi);

    return {
      success: true,
      message: 'Status pesan berhasil diupdate menjadi terbaca',
      data: {
        id_naskah: dto.id_naskah,
        position_id: dto.position_id,
        jenis_naskah: naskah.jenis,
        status_baca: 'terbaca',
        read_time: now,
        read_user: sirkulasi.sendReadUser,
      },
    };
  }

  // ============================================================
  // INBOX - Kotak Masuk
  // ============================================================

  /**
   * Get inbox (kotak masuk) untuk position tertentu
   *
   * Logic:
   * - Ambil semua sirkulasi dimana position = position_id dan sirkuler = 'penerima'
   * - Join dengan tabel naskah untuk mendapatkan jenis, perihal, dll
   * - Filter berdasarkan jenis naskah dan status baca (optional)
   * - Hanya tampilkan naskah dengan status 'final' atau 'final_tte' (bukan draft)
   * - Hanya tampilkan sirkulasi dengan is_draft = false
   *
   * @param positionId - Position ID penerima
   * @param query - Filter options (jenis, status_baca)
   * @returns InboxResponseDto
   */
  async getInbox(
    positionId: string,
    query: InboxQueryDto,
  ): Promise<InboxResponseDto> {
    // Build query dengan raw SQL untuk performa dan fleksibilitas
    let whereClause = `
      WHERE s.position = ?
      AND s.sirkuler = 'penerima'
      AND s.is_draft = 0
      AND s.is_konsep = 0
      AND n.status IN ('final', 'final_tte')
    `;
    const params: any[] = [positionId];

    // Filter by jenis naskah
    if (query.jenis) {
      whereClause += ` AND n.jenis = ?`;
      params.push(query.jenis);
    }

    // Filter by status baca
    if (query.status_baca === 'terbaca') {
      whereClause += ` AND s.send_read_time IS NOT NULL`;
    } else if (query.status_baca === 'belum_terbaca') {
      whereClause += ` AND s.send_read_time IS NULL`;
    }

    // Get inbox items with pengirim info
    const selectQuery = `
      SELECT 
        s.id as id_sirkulasi,
        s.id_naskah,
        n.jenis,
        n.nomor,
        n.tanggal,
        n.perihal,
        n.sifat,
        n.status,
        n.lampiran,
        s.send_read_time,
        s.flag_favorit,
        s.flag_arsip,
        s.flag_note,
        s.tindak_lanjut,
        s.is_locked,
        pengirim.position as pengirim_position_id,
        pengirim.position_text as pengirim_position_text,
        pengirim.organization_text as pengirim_organization_text,
        pengirim.nama_sirkuler as pengirim_nama,
        s.position as penerima_position_id,
        s.id_sirkuler as penerima_persnum,
        s.nama_sirkuler as penerima_nama,
        s.position_text as penerima_position_text,
        s.organization_text as penerima_organization_text,
        CAST(s.created_at AS DATETIME) as created_at,
        CAST(s.updated_at AS DATETIME) as updated_at
      FROM naskah_sirkulasi s
      INNER JOIN naskah n ON s.id_naskah = n.id
      LEFT JOIN naskah_sirkulasi pengirim ON pengirim.id_naskah = s.id_naskah AND pengirim.sirkuler = 'pengirim'
      ${whereClause}
      ORDER BY n.tanggal DESC, s.id DESC
    `;
    const rows = await this.dataSource.query(selectQuery, params);

    // Get all recipients (kepada) for each naskah
    const naskahIds = [...new Set(rows.map((r: any) => r.id_naskah))];
    const kepadaMap = new Map<string, any[]>();
    const labelsMap = new Map<string, any[]>();
    
    if (naskahIds.length > 0) {
      const kepadaQuery = `
        SELECT 
          id_naskah,
          position as position_id,
          nama_sirkuler as nama,
          position_text,
          organization_text
        FROM naskah_sirkulasi
        WHERE id_naskah IN (${naskahIds.map(() => '?').join(',')})
        AND sirkuler = 'penerima'
        ORDER BY id
      `;
      const kepadaRows = await this.dataSource.query(kepadaQuery, naskahIds);
      
      // Group by id_naskah
      kepadaRows.forEach((row: any) => {
        if (!kepadaMap.has(row.id_naskah)) {
          kepadaMap.set(row.id_naskah, []);
        }
        kepadaMap.get(row.id_naskah)?.push({
          position_id: row.position_id || '',
          nama: row.nama || '',
          position_text: row.position_text || '',
          organization_text: row.organization_text || '',
        });
      });

      // Get labels for each naskah (include parent name untuk nested label)
      const labelsQuery = `
        SELECT 
          nl.naskah_id,
          l.nama,
          parent.nama as parent_nama
        FROM naskah_label nl
        INNER JOIN label l ON nl.label_id = l.id
        LEFT JOIN label parent ON l.id_parent = parent.id AND parent.is_active = 1
        WHERE nl.naskah_id IN (${naskahIds.map(() => '?').join(',')})
        AND l.is_active = 1
        ORDER BY l.urutan ASC, l.nama ASC
      `;
      const labelsRows = await this.dataSource.query(labelsQuery, naskahIds);
      
      // Group labels by naskah_id (with parent hierarchy)
      labelsRows.forEach((row: any) => {
        if (!labelsMap.has(row.naskah_id)) {
          labelsMap.set(row.naskah_id, []);
        }
        // Format: "Parent > Child" jika ada parent, atau hanya "Label" jika tidak ada parent
        const labelName = row.parent_nama 
          ? `${row.parent_nama} > ${row.nama}` 
          : row.nama;
        labelsMap.get(row.naskah_id)?.push(labelName);
      });
    }

    // Map to InboxItemDto
    const items: InboxItemDto[] = rows.map((row: any) => ({
      id_sirkulasi: row.id_sirkulasi,
      id_naskah: row.id_naskah,
      jenis: row.jenis,
      jenis_label: JENIS_LABELS[row.jenis] || row.jenis,
      nomor: row.nomor,
      tanggal: row.tanggal,
      perihal: row.perihal,
      sifat: row.sifat,
      status: row.status,
      lampiran: row.lampiran,
      pengirim: {
        position_id: row.pengirim_position_id || '',
        position_text: row.pengirim_position_text || '',
        organization_text: row.pengirim_organization_text || '',
        nama: row.pengirim_nama || '',
      },
      penerima: {
        position_id: row.penerima_position_id || '',
        persnum: parseInt(row.penerima_persnum || '0', 10),
        nama: row.penerima_nama || '',
        position_text: row.penerima_position_text || '',
        organization_text: row.penerima_organization_text || '',
      },
      kepada: kepadaMap.get(row.id_naskah) || [], // Semua penerima yang dituju
      status_baca: row.send_read_time ? 'terbaca' : 'belum_terbaca',
      read_time: row.send_read_time,
      is_favorit: row.flag_favorit === 1,
      is_arsip: row.flag_arsip === 1,
      is_note: row.flag_note === 1,
      is_tindak_lanjut: row.tindak_lanjut === 1,
      is_locked: row.is_locked === 1,
      labels: labelsMap.get(row.id_naskah) || [], // Labels yang di-assign ke naskah
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    // Get summary counts
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_semua,
        SUM(CASE WHEN s.send_read_time IS NULL THEN 1 ELSE 0 END) as total_belum_dibaca,
        SUM(CASE WHEN n.jenis = 'ND' THEN 1 ELSE 0 END) as total_nd,
        SUM(CASE WHEN n.jenis = 'SDI' THEN 1 ELSE 0 END) as total_sdi,
        SUM(CASE WHEN n.jenis = 'SDE' THEN 1 ELSE 0 END) as total_sde,
        SUM(CASE WHEN n.jenis = 'DI' THEN 1 ELSE 0 END) as total_di,
        SUM(CASE WHEN n.jenis = 'KA' THEN 1 ELSE 0 END) as total_ka
      FROM naskah_sirkulasi s
      INNER JOIN naskah n ON s.id_naskah = n.id
      WHERE s.position = ?
      AND s.sirkuler = 'penerima'
      AND s.is_draft = 0
      AND s.is_konsep = 0
      AND n.status IN ('final', 'final_tte')
    `;
    const summaryResult = await this.dataSource.query(summaryQuery, [positionId]);
    const summary = summaryResult[0] || {};

    return {
      success: true,
      message: 'Berhasil mengambil kotak masuk',
      data: {
        items,
        summary: {
          total_semua: parseInt(summary.total_semua || '0', 10),
          total_belum_dibaca: parseInt(summary.total_belum_dibaca || '0', 10),
          total_per_jenis: {
            ND: parseInt(summary.total_nd || '0', 10),
            SDI: parseInt(summary.total_sdi || '0', 10),
            SDE: parseInt(summary.total_sde || '0', 10),
            DI: parseInt(summary.total_di || '0', 10),
            KA: parseInt(summary.total_ka || '0', 10),
          },
        },
      },
    };
  }

  // ============================================================
  // SENT MESSAGE - Kotak Keluar (Global untuk semua jenis naskah)
  // ============================================================

  /**
   * Get sent messages (kotak keluar) untuk position tertentu
   *
   * Logic:
   * - Ambil semua sirkulasi dimana position = position_id dan sirkuler = 'pengirim'
   * - Join dengan tabel naskah untuk mendapatkan jenis, perihal, dll
   * - Hanya tampilkan naskah dengan status 'final' atau 'final_tte' (bukan draft)
   * - Hanya tampilkan sirkulasi dengan is_draft = false
   * - Untuk setiap naskah, ambil daftar penerima dan status baca mereka
   *
   * @param positionId - Position ID pengirim
   * @param query - Filter options (jenis, status_baca)
   * @returns SentMessageResponseDto
   */
  async getSentMessage(
    positionId: string,
    query: SentMessageQueryDto,
  ): Promise<SentMessageResponseDto> {
    // Build base query untuk mendapat naskah yang dikirim oleh position ini
    let whereClause = `
      WHERE s.position = ?
      AND s.sirkuler = 'pengirim'
      AND s.is_draft = 0
      AND n.status IN ('final', 'final_tte')
    `;
    const params: any[] = [positionId];

    // Filter by jenis naskah
    if (query.jenis) {
      whereClause += ` AND n.jenis = ?`;
      params.push(query.jenis);
    }

    // Get naskah yang dikirim beserta info pengirim
    const selectQuery = `
      SELECT 
        s.id as id_sirkulasi,
        s.id_naskah,
        n.jenis,
        n.nomor,
        n.tanggal,
        n.perihal,
        n.sifat,
        n.status,
        n.lampiran,
        s.position as pengirim_position_id,
        s.position_text as pengirim_position_text,
        s.organization_text as pengirim_organization_text,
        s.nama_sirkuler as pengirim_nama,
        s.flag_favorit,
        s.flag_note,
        s.flag_arsip,
        CAST(s.created_at AS DATETIME) as created_at,
        CAST(s.updated_at AS DATETIME) as updated_at
      FROM naskah_sirkulasi s
      INNER JOIN naskah n ON s.id_naskah = n.id
      ${whereClause}
      ORDER BY n.tanggal DESC, s.id DESC
    `;
    const rows = await this.dataSource.query(selectQuery, params);

    if (rows.length === 0) {
      return {
        success: true,
        message: 'Tidak ada pesan yang dikirim',
        data: {
          items: [],
          summary: {
            total_semua: 0,
            total_per_jenis: { ND: 0, SDI: 0, SDE: 0, DI: 0, KA: 0 },
          },
        },
      };
    }

    // Get all naskah IDs untuk query labels
    const naskahIds = rows.map((r: any) => r.id_naskah);
    const labelsMap = new Map<string, string[]>();

    // Get labels for all naskah
    if (naskahIds.length > 0) {
      const labelsQuery = `
        SELECT 
          nl.naskah_id,
          l.nama,
          parent.nama as parent_nama
        FROM naskah_label nl
        INNER JOIN label l ON nl.label_id = l.id
        LEFT JOIN label parent ON l.id_parent = parent.id AND parent.is_active = 1
        WHERE nl.naskah_id IN (${naskahIds.map(() => '?').join(',')})
        AND l.is_active = 1
        ORDER BY l.urutan ASC, l.nama ASC
      `;
      const labelsRows = await this.dataSource.query(labelsQuery, naskahIds);
      
      // Group labels by naskah_id
      labelsRows.forEach((row: any) => {
        if (!labelsMap.has(row.naskah_id)) {
          labelsMap.set(row.naskah_id, []);
        }
        const labelName = row.parent_nama 
          ? `${row.parent_nama} > ${row.nama}` 
          : row.nama;
        labelsMap.get(row.naskah_id)?.push(labelName);
      });
    }

    // Untuk setiap naskah, ambil daftar penerima
    const items: SentMessageItemDto[] = [];
    
    for (const row of rows) {
      let penerima: any[] = [];

      // Untuk SDE, ambil data penerima dari naskah_sirkulasi (penerima eksternal)
      if (row.jenis === 'SDE') {
        // Get penerima from naskah_sirkulasi (penerima eksternal stored with sirkuler='penerima')
        const penerimaQuery = `
          SELECT 
            id_sirkuler as id,
            nama_sirkuler as nama,
            alamat,
            telepon,
            email,
            company_text as company,
            area_text as area
          FROM naskah_sirkulasi
          WHERE id_naskah = ?
          AND sirkuler = 'penerima'
          ORDER BY urutan ASC
        `;
        const penerimaRows = await this.dataSource.query(penerimaQuery, [row.id_naskah]);

        console.log('🔍 SDE Debug - Naskah ID:', row.id_naskah);
        console.log('🔍 SDE Debug - Penerima count:', penerimaRows?.length || 0);

        if (penerimaRows && penerimaRows.length > 0) {
          // For each penerima, try to enrich with data from eksternal table
          for (const p of penerimaRows) {
            // Try to find in eksternal table by id
            if (p.id) {
              const eksternalData = await this.eksternalRepo.findOne({
                where: { id: p.id },
              });

              if (eksternalData) {
                penerima.push({
                  id: eksternalData.id,
                  nama: eksternalData.nama,
                  alamat: eksternalData.alamat || null,
                  telepon: eksternalData.telepon || null,
                  email: eksternalData.email || null,
                  kontak: eksternalData.kontak || null,
                  company: eksternalData.company,
                  area: eksternalData.area,
                });
              } else {
                // Fallback to sirkulasi data
                penerima.push({
                  id: p.id,
                  nama: p.nama || '',
                  alamat: p.alamat || null,
                  telepon: p.telepon || null,
                  email: p.email || null,
                  kontak: null,
                  company: p.company || null,
                  area: p.area || null,
                });
              }
            }
          }
        } else {
          console.log('⚠️ SDE Warning - No penerima found in sirkulasi for naskah:', row.id_naskah);
        }
      } else {
        // Untuk jenis lain (ND, SDI, DI, KA), ambil dari naskah_sirkulasi
        const penerimaQuery = `
          SELECT 
            position as position_id,
            position_text,
            organization_text,
            nama_sirkuler as nama,
            send_read_time
          FROM naskah_sirkulasi
          WHERE id_naskah = ?
          AND sirkuler = 'penerima'
        `;
        const penerimaRows = await this.dataSource.query(penerimaQuery, [row.id_naskah]);

        // Map penerima dengan status baca
        penerima = penerimaRows.map((p: any) => ({
          position_id: p.position_id || '',
          position_text: p.position_text || '',
          organization_text: p.organization_text || '',
          nama: p.nama || null,
          status_baca: p.send_read_time ? 'terbaca' : 'belum_terbaca',
          read_time: p.send_read_time || null,
        }));
      }

      // Filter by status_baca jika diperlukan (hanya untuk non-SDE)
      if (query.status_baca && row.jenis !== 'SDE') {
        const hasMatchingPenerima = penerima.some(
          (p) => p.status_baca === query.status_baca,
        );
        if (!hasMatchingPenerima) {
          continue; // Skip naskah ini jika tidak ada penerima yang match
        }
      }

      // Hitung summary baca (hanya untuk non-SDE)
      let terbaca = 0;
      let belumTerbaca = 0;
      
      if (row.jenis !== 'SDE') {
        terbaca = penerima.filter((p) => p.status_baca === 'terbaca').length;
        belumTerbaca = penerima.filter((p) => p.status_baca === 'belum_terbaca').length;
      }

      // Get lampiran count
      const lampiranCountResult = await this.dataSource.query(
        `SELECT COUNT(*) as total FROM naskah_lampiran WHERE id_naskah = ?`,
        [row.id_naskah],
      );
      const lampiranCount = parseInt(lampiranCountResult[0]?.total || '0', 10);

      items.push({
        id_naskah: row.id_naskah,
        jenis: row.jenis,
        jenis_label: JENIS_LABELS[row.jenis] || row.jenis,
        nomor: row.nomor,
        tanggal: row.tanggal,
        perihal: row.perihal,
        sifat: row.sifat,
        status: row.status,
        lampiran: lampiranCount,
        pengirim: {
          position_id: row.pengirim_position_id || '',
          position_text: row.pengirim_position_text || '',
          organization_text: row.pengirim_organization_text || '',
          nama: row.pengirim_nama || null,
        },
        penerima,
        summary_baca: {
          total: penerima.length,
          terbaca,
          belum_terbaca: belumTerbaca,
        },
        favorit: !!row.flag_favorit,
        note: !!row.flag_note,
        arsip: !!row.flag_arsip,
        labels: labelsMap.get(row.id_naskah) || [],
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    }

    // Get summary counts (untuk semua, tanpa filter status_baca)
    const summaryQuery = `
      SELECT 
        COUNT(DISTINCT s.id_naskah) as total_semua,
        SUM(CASE WHEN n.jenis = 'ND' THEN 1 ELSE 0 END) as total_nd,
        SUM(CASE WHEN n.jenis = 'SDI' THEN 1 ELSE 0 END) as total_sdi,
        SUM(CASE WHEN n.jenis = 'SDE' THEN 1 ELSE 0 END) as total_sde,
        SUM(CASE WHEN n.jenis = 'DI' THEN 1 ELSE 0 END) as total_di,
        SUM(CASE WHEN n.jenis = 'KA' THEN 1 ELSE 0 END) as total_ka
      FROM naskah_sirkulasi s
      INNER JOIN naskah n ON s.id_naskah = n.id
      WHERE s.position = ?
      AND s.sirkuler = 'pengirim'
      AND s.is_draft = 0
      AND n.status IN ('final', 'final_tte')
    `;
    const summaryResult = await this.dataSource.query(summaryQuery, [positionId]);
    const summary = summaryResult[0] || {};

    return {
      success: true,
      message: 'Berhasil mengambil kotak keluar',
      data: {
        items,
        summary: {
          total_semua: parseInt(summary.total_semua || '0', 10),
          total_per_jenis: {
            ND: parseInt(summary.total_nd || '0', 10),
            SDI: parseInt(summary.total_sdi || '0', 10),
            SDE: parseInt(summary.total_sde || '0', 10),
            DI: parseInt(summary.total_di || '0', 10),
            KA: parseInt(summary.total_ka || '0', 10),
          },
        },
      },
    };
  }

  // ============================================================
  // TOGGLE FLAG - Favorit, Note, Arsip
  // ============================================================

  /**
   * Toggle flag (favorit, note, arsip) pada naskah_sirkulasi
   *
   * @param idSirkulasi - ID sirkulasi
   * @param flagType - Jenis flag: 'favorit' | 'note' | 'arsip'
   * @returns ToggleFlagResponseDto
   */
  async toggleFlag(
    idSirkulasi: string,
    flagType: 'favorit' | 'note' | 'arsip' | 'tindak_lanjut' | 'lock',
  ): Promise<ToggleFlagResponseDto> {
    // Cari record
    const sirkulasi = await this.naskahSirkulasiRepo.findOne({
      where: { id: idSirkulasi },
    });

    if (!sirkulasi) {
      return {
        success: false,
        message: 'Data sirkulasi tidak ditemukan',
        data: null,
      };
    }

    // Tentukan field yang akan di-toggle
    let currentValue: number;
    let fieldName: string;

    switch (flagType) {
      case 'favorit':
        currentValue = sirkulasi.flagFavorit || 0;
        fieldName = 'flagFavorit';
        break;
      case 'note':
        currentValue = sirkulasi.flagNote || 0;
        fieldName = 'flagNote';
        break;
      case 'arsip':
        currentValue = sirkulasi.flagArsip || 0;
        fieldName = 'flagArsip';
        break;
      case 'tindak_lanjut':
        currentValue = sirkulasi.tindakLanjut || 0;
        fieldName = 'tindakLanjut';
        break;
      case 'lock':
        currentValue = sirkulasi.isLocked || 0;
        fieldName = 'isLocked';
        break;
    }

    // Toggle value
    const newValue = currentValue === 1 ? 0 : 1;

    // Update database
    await this.naskahSirkulasiRepo.update(idSirkulasi, {
      [fieldName]: newValue,
    });

    return {
      success: true,
      message: `Flag ${flagType} berhasil diubah`,
      data: {
        id_sirkulasi: idSirkulasi,
        flag_type: flagType,
        new_value: newValue === 1,
      },
    };
  }

  // ============================================================
  // BULK ARCHIVE/DELETE SENT - Bulk archive atau delete pesan terkirim
  // ============================================================

  /**
   * Bulk archive atau delete pesan terkirim
   * 
   * Archive: Set flag_arsip = 1 pada sirkulasi pengirim untuk setiap naskah
   * Delete: Hapus naskah beserta semua data terkait (sirkulasi, lampiran, referensi)
   *
   * @param naskahIds - Array of naskah IDs
   * @param positionId - Position ID pengirim (untuk validasi ownership)
   * @param action - 'archive' atau 'delete'
   */
  async bulkArchiveOrDeleteSent(
    naskahIds: string[],
    positionId: number,
    action: 'archive' | 'delete',
  ): Promise<BulkArchiveSentResponseDto> {
    const failedIds: string[] = [];
    let totalProcessed = 0;

    for (const naskahId of naskahIds) {
      try {
        // Verify ownership - cari sirkulasi pengirim untuk naskah ini
        const pengirimSirkulasi = await this.naskahSirkulasiRepo.findOne({
          where: {
            idNaskah: naskahId,
            sirkuler: 'pengirim',
            position: String(positionId),
          },
        });

        if (!pengirimSirkulasi) {
          failedIds.push(naskahId);
          continue;
        }

        if (action === 'archive') {
          // Archive: Set flag_arsip = 1 pada sirkulasi pengirim
          await this.naskahSirkulasiRepo.update(pengirimSirkulasi.id, {
            flagArsip: 1,
          });
          totalProcessed++;
        } else if (action === 'delete') {
          // Delete: Hapus naskah beserta semua data terkait
          const queryRunner = this.dataSource.createQueryRunner();
          await queryRunner.connect();
          await queryRunner.startTransaction();

          try {
            // Delete lampiran
            await queryRunner.manager.delete(NaskahLampiranEntity, {
              id_naskah: naskahId,
            });

            // Delete referensi
            await queryRunner.manager.delete(NaskahReferensiEntity, {
              id_naskah: naskahId,
            });

            // Delete semua sirkulasi
            await queryRunner.manager.delete(NaskahSirkulasi, {
              idNaskah: naskahId,
            });

            // Delete naskah
            await queryRunner.manager.delete(NaskahEntity, {
              id: naskahId,
            });

            await queryRunner.commitTransaction();
            totalProcessed++;
          } catch (error) {
            await queryRunner.rollbackTransaction();
            failedIds.push(naskahId);
          } finally {
            await queryRunner.release();
          }
        }
      } catch (error) {
        failedIds.push(naskahId);
      }
    }

    const actionText = action === 'archive' ? 'diarsipkan' : 'dihapus';

    return {
      success: true,
      message: totalProcessed > 0
        ? `Berhasil ${actionText} ${totalProcessed} pesan terkirim`
        : `Tidak ada pesan terkirim yang berhasil ${actionText}`,
      data: {
        total_requested: naskahIds.length,
        total_processed: totalProcessed,
        failed_ids: failedIds,
      },
    };
  }

  // ============================================================
  // COUNT UNREAD INBOX - Count kotak masuk yg belum dibaca
  // ============================================================

  /**
   * Menghitung jumlah kotak masuk yang belum dibaca untuk position tertentu
   *
   * @param positionId - Position ID penerima
   * @returns { position_id: number, count: number }
   */
  async countUnreadInbox(positionId: string): Promise<any> {
    const query = `
      SELECT COUNT(*) as count
      FROM naskah_sirkulasi s
      INNER JOIN naskah n ON s.id_naskah = n.id
      WHERE s.position = ?
      AND s.sirkuler = 'penerima'
      AND s.is_draft = 0
      AND s.is_konsep = 0
      AND s.send_read_time IS NULL
      AND n.status IN ('final', 'final_tte')
    `;

    const result = await this.dataSource.query(query, [positionId]);
    const count = parseInt(result[0]?.count || '0', 10);

    return {
      success: true,
      message: 'Berhasil mengambil jumlah kotak masuk belum dibaca',
      data: {
        position_id: parseInt(positionId),
        count: count,
      },
    };
  }
}
