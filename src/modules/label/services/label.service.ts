import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { LabelEntity, NaskahLabelEntity } from '../entities';
import {
  CreateLabelDto,
  UpdateLabelDto,
  AddNaskahToLabelDto,
  QueryLabelNaskahDto,
} from '../dto';
import { RealtimeEmitService } from '../../realtime/services/realtime-emit.service';

type DatePreset = '7_hari' | '30_hari' | '60_hari' | '1_tahun' | 'semua';

// Label untuk jenis naskah
const JENIS_LABELS: Record<string, string> = {
  ND: 'Nota Dinas',
  SDI: 'Surat Dinas Internal',
  SDE: 'Surat Dinas Eksternal',
  DI: 'Disposisi',
  KA: 'Kajian',
  K: 'Konsep',
};

@Injectable()
export class LabelService {
  constructor(
    @InjectRepository(LabelEntity)
    private readonly labelRepository: Repository<LabelEntity>,
    @InjectRepository(NaskahLabelEntity)
    private readonly naskahLabelRepository: Repository<NaskahLabelEntity>,
    private readonly dataSource: DataSource,
    private readonly realtimeEmitService: RealtimeEmitService,
  ) {}

  /**
   * Helper: Convert preset/custom date range to start & end date strings
   */
  private getDateRangeFromQuery(
    startDate?: string,
    endDate?: string,
    preset?: DatePreset,
  ): { startDate: string | null; endDate: string | null } {
    if (preset === 'semua') {
      return { startDate: null, endDate: null };
    }

    if (startDate || endDate) {
      return {
        startDate: startDate || null,
        endDate: endDate || null,
      };
    }

    if (preset) {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      let daysBack: number;
      switch (preset) {
        case '7_hari':
          daysBack = 7;
          break;
        case '30_hari':
          daysBack = 30;
          break;
        case '60_hari':
          daysBack = 60;
          break;
        case '1_tahun':
          daysBack = 365;
          break;
        default:
          return { startDate: null, endDate: null };
      }

      const startDateCalc = new Date(today);
      startDateCalc.setDate(startDateCalc.getDate() - daysBack);
      const startDateStr = startDateCalc.toISOString().split('T')[0];

      return {
        startDate: startDateStr,
        endDate: todayStr,
      };
    }

    return { startDate: null, endDate: null };
  }

  /**
   * Membuat label baru
   */
  async create(
    createLabelDto: CreateLabelDto,
    positionId: string,
    userId: string,
  ): Promise<LabelEntity> {
    // Validasi parent label jika ada
    if (createLabelDto.idParent) {
      const parentLabel = await this.labelRepository.findOne({
        where: { 
          id: createLabelDto.idParent,
          positionId,
          isActive: true,
        },
      });

      if (!parentLabel) {
        throw new NotFoundException('Parent label tidak ditemukan');
      }
    }

    const label = this.labelRepository.create({
      id: uuidv4(),
      positionId,
      nama: createLabelDto.nama,
      deskripsi: createLabelDto.deskripsi,
      idParent: createLabelDto.idParent,
      warna: createLabelDto.warna || '#808080',
      urutan: createLabelDto.urutan || 0,
      createdBy: userId,
    });

    const saved = await this.labelRepository.save(label);

    // Emit label counts refresh ke position room
    try {
      const counts = await this.countNaskahPerLabel(positionId).catch(() => ({}));
      this.realtimeEmitService.emitLabelCounts(positionId, counts);
    } catch {}

    return saved;
  }

  /**
   * Mengambil semua label berdasarkan position
   * Mengembalikan struktur hierarki
   */
  async findAll(positionId: string): Promise<LabelEntity[]> {
    const labels = await this.labelRepository.find({
      where: { 
        positionId,
        isActive: true,
      },
      order: {
        urutan: 'ASC',
        nama: 'ASC',
      },
    });

    // Build tree structure
    return this.buildLabelTree(labels);
  }

  /**
   * Mengambil semua label flat (tanpa hierarki)
   */
  async findAllFlat(positionId: string): Promise<LabelEntity[]> {
    return this.labelRepository.find({
      where: { 
        positionId,
        isActive: true,
      },
      order: {
        urutan: 'ASC',
        nama: 'ASC',
      },
    });
  }

  /**
   * Mengambil label berdasarkan ID
   */
  async findOne(id: string, positionId: string): Promise<LabelEntity> {
    const label = await this.labelRepository.findOne({
      where: { 
        id,
        positionId,
        isActive: true,
      },
      relations: ['parent', 'children'],
    });

    if (!label) {
      throw new NotFoundException('Label tidak ditemukan');
    }

    return label;
  }

  /**
   * Update label
   */
  async update(
    id: string,
    updateLabelDto: UpdateLabelDto,
    positionId: string,
  ): Promise<LabelEntity> {
    const label = await this.findOne(id, positionId);

    // Validasi parent label jika diubah
    if (updateLabelDto.idParent !== undefined) {
      if (updateLabelDto.idParent === id) {
        throw new BadRequestException('Label tidak bisa menjadi parent dari dirinya sendiri');
      }

      if (updateLabelDto.idParent) {
        const parentLabel = await this.labelRepository.findOne({
          where: { 
            id: updateLabelDto.idParent,
            positionId,
            isActive: true,
          },
        });

        if (!parentLabel) {
          throw new NotFoundException('Parent label tidak ditemukan');
        }

        // Check circular reference
        const isCircular = await this.checkCircularReference(
          updateLabelDto.idParent,
          id,
        );

        if (isCircular) {
          throw new BadRequestException('Tidak bisa membuat circular reference pada label');
        }
      }
    }

    Object.assign(label, updateLabelDto);
    const saved = await this.labelRepository.save(label);

    // Emit label counts refresh ke position room
    try {
      const counts = await this.countNaskahPerLabel(positionId).catch(() => ({}));
      this.realtimeEmitService.emitLabelCounts(positionId, counts);
    } catch {}

    return saved;
  }

  /**
   * Soft delete label
   */
  async remove(id: string, positionId: string): Promise<void> {
    const label = await this.findOne(id, positionId);

    // Check if label has children
    const childrenCount = await this.labelRepository.count({
      where: {
        idParent: id,
        isActive: true,
      },
    });

    if (childrenCount > 0) {
      throw new BadRequestException(
        'Tidak bisa menghapus label yang memiliki sub-label. Hapus sub-label terlebih dahulu.',
      );
    }

    label.isActive = false;
    await this.labelRepository.save(label);

    // Emit label counts refresh ke position room
    try {
      const counts = await this.countNaskahPerLabel(positionId).catch(() => ({}));
      this.realtimeEmitService.emitLabelCounts(positionId, counts);
    } catch {}
  }

  /**
   * Menambahkan naskah ke label
   */
  async addNaskahToLabels(
    naskahId: string,
    addNaskahToLabelDto: AddNaskahToLabelDto,
    positionId: string,
    userId: string,
  ): Promise<NaskahLabelEntity[]> {
    const results: NaskahLabelEntity[] = [];
    const source = addNaskahToLabelDto.source || 'inbox';

    // DEBUG: Log untuk cek nilai source
    console.log('=== DEBUG ADD NASKAH TO LABEL ===');
    console.log('DTO received:', JSON.stringify(addNaskahToLabelDto));
    console.log('DTO source:', addNaskahToLabelDto.source);
    console.log('Final source:', source);
    console.log('=================================');

    for (const labelId of addNaskahToLabelDto.labelIds) {
      // Validasi label exists
      const label = await this.labelRepository.findOne({
        where: {
          id: labelId,
          positionId,
          isActive: true,
        },
      });

      if (!label) {
        throw new NotFoundException(`Label dengan ID ${labelId} tidak ditemukan`);
      }

      // Check if already exists
      const existing = await this.naskahLabelRepository.findOne({
        where: {
          naskahId,
          labelId,
        },
      });

      if (existing) {
        results.push(existing);
        continue;
      }

      // Create new relation
      const naskahLabel = this.naskahLabelRepository.create({
        id: uuidv4(),
        naskahId,
        labelId,
        source,
        createdBy: userId,
      });

      const saved = await this.naskahLabelRepository.save(naskahLabel);
      results.push(saved);
    }

    // Emit label counts refresh ke position room
    try {
      const counts = await this.countNaskahPerLabel(positionId).catch(() => ({}));
      this.realtimeEmitService.emitLabelCounts(positionId, counts);
    } catch {}

    return results;
  }

  /**
   * Menghapus naskah dari label
   */
  async removeNaskahFromLabel(
    naskahId: string,
    labelId: string,
  ): Promise<void> {
    const result = await this.naskahLabelRepository.delete({
      naskahId,
      labelId,
    });

    if (result.affected === 0) {
      throw new NotFoundException('Relasi naskah-label tidak ditemukan');
    }

    // Note: Tidak emit label counts di sini karena method ini tidak
    // menerima positionId. Caller (controller) bertanggung jawab
    // memanggil realtimeEmitService.emitLabelCounts jika diperlukan.
  }

  /**
   * Mengambil semua label dari naskah
   */
  async getLabelsForNaskah(naskahId: string): Promise<LabelEntity[]> {
    const naskahLabels = await this.naskahLabelRepository.find({
      where: { naskahId },
      relations: ['label'],
    });

    return naskahLabels.map((nl) => nl.label).filter((label) => label.isActive);
  }

  /**
   * Mengambil semua naskah dengan label tertentu beserta detail lengkap
   */
  async getNaskahByLabel(
    labelId: string,
    positionId: string,
    query: QueryLabelNaskahDto,
  ): Promise<any> {
    const pageNum = Math.max(query.page || 1, 1);
    const limitNum = Math.max(query.limit || 10, 1);
    const offset = (pageNum - 1) * limitNum;
    const sortDirection = query.sort === 'terlama' ? 'ASC' : 'DESC';
    const searchKeyword = query.search?.trim().toLowerCase();
    const dateRange = this.getDateRangeFromQuery(
      query.start_date,
      query.end_date,
      query.preset,
    );

    // Validasi label dan ambil data label
    const label = await this.findOne(labelId, positionId);

    // Get all naskah_label entries for this label
    const naskahLabels = await this.naskahLabelRepository.find({
      where: { labelId },
    });

    if (naskahLabels.length === 0) {
      return {
        success: true,
        message: `Berhasil mengambil naskah dengan label ${label.nama}`,
        data: {
          namaLabel: label.nama,
          summary: {
            total_semua: 0,
            total_belum_dibaca: 0,
            total_per_jenis: {
              ND: 0,
              SDI: 0,
              SDE: 0,
              DI: 0,
              KA: 0,
              K: 0,
            },
          },
          items: [],
        },
        pagination: {
          total: 0,
          page: pageNum,
          limit: limitNum,
          totalPages: 0,
        },
      };
    }

    const naskahIds = Array.from(new Set(naskahLabels.map((nl) => nl.naskahId)));

    // Get naskah details with pengirim info
    const selectQuery = `
      SELECT 
        n.id as id_naskah,
        n.jenis,
        n.nomor,
        n.tanggal,
        n.perihal,
        n.sifat,
        n.status,
        n.lampiran,
        pengirim.position as pengirim_position_id,
        pengirim.position_text as pengirim_position_text,
        pengirim.organization_text as pengirim_organization_text,
        pengirim.nama_sirkuler as pengirim_nama,
        CAST(pengirim.created_at AS DATETIME) as pengirim_created_at,
        CAST(n.created_at AS DATETIME) as created_at,
        di.is_priority,
        nl.source as naskah_source
      FROM naskah n
      INNER JOIN naskah_label nl ON nl.naskah_id = n.id AND nl.label_id = ?
      LEFT JOIN naskah_sirkulasi pengirim ON pengirim.id_naskah = n.id AND pengirim.sirkuler = 'pengirim'
      LEFT JOIN di ON di.id_naskah = n.id
      WHERE n.id IN (${naskahIds.map(() => '?').join(',')})
      ORDER BY n.tanggal ${sortDirection}, n.id ${sortDirection}
    `;
    const rows = await this.dataSource.query(selectQuery, [labelId, ...naskahIds]);

    // Get penerima for each naskah
    const penerimaMap = new Map<string, any[]>();
    const tembusanMap = new Map<string, any[]>();
    const penerimaDanTembusanQuery = `
      SELECT 
        id_naskah,
        sirkuler,
        position as position_id,
        position_text,
        organization_text,
        nama_sirkuler as nama,
        send_read_time
      FROM naskah_sirkulasi
      WHERE id_naskah IN (${naskahIds.map(() => '?').join(',')})
      AND sirkuler IN ('penerima', 'tembusan')
      ORDER BY id
    `;
    const penerimaRows = await this.dataSource.query(penerimaDanTembusanQuery, naskahIds);

    // Group by id_naskah
    penerimaRows.forEach((row: any) => {
      const targetMap = row.sirkuler === 'tembusan' ? tembusanMap : penerimaMap;
      if (!targetMap.has(row.id_naskah)) {
        targetMap.set(row.id_naskah, []);
      }
      targetMap.get(row.id_naskah)?.push({
        position_id: row.position_id || '',
        position_text: row.position_text || '',
        organization_text: row.organization_text || '',
        nama: row.nama || '',
        status_baca: row.send_read_time ? 'terbaca' : 'belum_terbaca',
        read_time: row.send_read_time || null,
      });
    });

    // Get labels for each naskah
    const labelsMap = new Map<string, string[]>();
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

    labelsRows.forEach((row: any) => {
      if (!labelsMap.has(row.naskah_id)) {
        labelsMap.set(row.naskah_id, []);
      }
      const labelName = row.parent_nama
        ? `${row.parent_nama} > ${row.nama}`
        : row.nama;
      labelsMap.get(row.naskah_id)?.push(labelName);
    });

    // Get current position context from sirkulasi (for filters like inbox/sent)
    const positionSirkulasiMap = new Map<
      string,
      {
        inbox?: any;
        pengirim?: any;
      }
    >();
    const positionSirkulasiQuery = `
      SELECT 
        id_naskah,
        sirkuler,
        flag_favorit,
        flag_note,
        flag_arsip,
        tindak_lanjut,
        is_locked,
        send_read_time,
        created_at
      FROM naskah_sirkulasi
      WHERE id_naskah IN (${naskahIds.map(() => '?').join(',')})
      AND position = ?
      AND sirkuler IN ('pengirim', 'penerima', 'tembusan')
    `;
    const flagsRows = await this.dataSource.query(positionSirkulasiQuery, [...naskahIds, positionId]);

    flagsRows.forEach((row: any) => {
      if (!positionSirkulasiMap.has(row.id_naskah)) {
        positionSirkulasiMap.set(row.id_naskah, {});
      }
      const record = positionSirkulasiMap.get(row.id_naskah)!;

      if (row.sirkuler === 'pengirim') {
        record.pengirim = row;
      } else if (!record.inbox || row.sirkuler === 'penerima') {
        record.inbox = row;
      }
    });

    const detailedItems = rows.map((row: any) => {
      const penerima = penerimaMap.get(row.id_naskah) || [];
      const tembusan = tembusanMap.get(row.id_naskah) || [];
      const allSirkulasi = [...penerima, ...tembusan];
      const source = row.naskah_source || 'inbox';
      const positionContext = positionSirkulasiMap.get(row.id_naskah) || {};
      const sourceContext = source === 'sent' ? positionContext.pengirim : positionContext.inbox;

      const favorit = sourceContext?.flag_favorit === 1;
      const note = sourceContext?.flag_note === 1;
      const arsip = sourceContext?.flag_arsip === 1;
      const isTindakLanjut = sourceContext?.tindak_lanjut === 1;
      const isLocked = sourceContext?.is_locked === 1;

      const inboxStatusBaca = positionContext.inbox?.send_read_time ? 'terbaca' : 'belum_terbaca';
      const sentHasTerbaca = row.jenis === 'SDE'
        ? true
        : allSirkulasi.some((p: any) => p.status_baca === 'terbaca');
      const sentHasBelumTerbaca = row.jenis === 'SDE'
        ? true
        : allSirkulasi.some((p: any) => p.status_baca === 'belum_terbaca');

      // Calculate summary_baca
      const terbaca = penerima.filter((p: any) => p.status_baca === 'terbaca').length;
      const belumTerbaca = penerima.filter((p: any) => p.status_baca === 'belum_terbaca').length;

      // Get lampiran count (use existing value or 0)
      const lampiranCount = typeof row.lampiran === 'number' ? row.lampiran : 0;
      const isDraftKonsep =
        source === 'draft' &&
        ['ND', 'SDI', 'SDE'].includes(row.jenis) &&
        row.nomor === '-';
      const asalDraft = isDraftKonsep ? 'konsep' : 'naskah';

      return {
        jenis: row.jenis,
        source,
        favorit,
        note,
        arsip,
        isTindakLanjut,
        isLocked,
        isPriority: row.jenis === 'DI' ? !!row.is_priority : false,
        matchesStatusBaca:
          !query.status_baca ||
          (source === 'sent'
            ? (query.status_baca === 'terbaca' ? sentHasTerbaca : sentHasBelumTerbaca)
            : inboxStatusBaca === query.status_baca),
        unreadForSummary:
          source === 'sent'
            ? sentHasBelumTerbaca
            : inboxStatusBaca === 'belum_terbaca',
        sortDate: row.pengirim_created_at || sourceContext?.created_at || row.created_at || row.tanggal,
        localDate: (() => {
          const baseDate = new Date(row.pengirim_created_at || sourceContext?.created_at || row.created_at || row.tanggal);
          if (Number.isNaN(baseDate.getTime())) return null;
          const localDate = new Date(baseDate.getTime() + 7 * 60 * 60 * 1000);
          return localDate.toISOString().split('T')[0];
        })(),
        response: {
        id_naskah: row.id_naskah,
        jenis: row.jenis,
        jenis_label: JENIS_LABELS[row.jenis] || row.jenis,
        asal_draft: asalDraft,
        is_draft_konsep: isDraftKonsep,
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
          nama: row.pengirim_nama || '',
        },
        penerima,
        tembusan,
        summary_baca: {
          total: allSirkulasi.length,
          terbaca,
          belum_terbaca: belumTerbaca,
        },
        favorit,
        note,
        arsip,
        is_tindak_lanjut: isTindakLanjut,
        is_locked: isLocked,
        is_priority: row.jenis === 'DI' ? !!row.is_priority : undefined,
        labels: labelsMap.get(row.id_naskah) || [],
        source,
        created_at: row.created_at,
        updated_at: null,
        },
      };
    });

    const baseFilteredItems = detailedItems
      .filter((item: any) => {
        if (searchKeyword) {
          const searchableText = [
            item.response.perihal,
            item.response.nomor,
            item.response.jenis,
            item.response.jenis_label,
            item.response.pengirim?.nama,
            item.response.pengirim?.position_text,
            item.response.pengirim?.organization_text,
            ...(item.response.penerima || []).map((p: any) => `${p.nama || ''} ${p.position_text || ''}`),
            ...(item.response.tembusan || []).map((p: any) => `${p.nama || ''} ${p.position_text || ''}`),
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          if (!searchableText.includes(searchKeyword)) {
            return false;
          }
        }

        if (query.source && item.source !== query.source) {
          return false;
        }

        if (query.priority === true && !item.isPriority) {
          return false;
        }

        if (query.favorite === true && !item.favorit) {
          return false;
        }

        if (query.tinjut === 'sudah_tinjut' && !item.isTindakLanjut) {
          return false;
        }
        if (query.tinjut === 'belum_tinjut' && item.isTindakLanjut) {
          return false;
        }

        if (query.lock === true && !item.isLocked) {
          return false;
        }

        if (query.note === true && !item.note) {
          return false;
        }

        if (query.arsip === true) {
          if (!item.arsip) {
            return false;
          }
        } else if (item.arsip) {
          // Default behavior mengikuti inbox/sent: exclude archived items.
          return false;
        }

        if (!item.matchesStatusBaca) {
          return false;
        }

        if (dateRange.startDate && (!item.localDate || item.localDate < dateRange.startDate)) {
          return false;
        }
        if (dateRange.endDate && (!item.localDate || item.localDate > dateRange.endDate)) {
          return false;
        }

        return true;
      })
      .sort((a: any, b: any) => {
        const aTime = new Date(a.sortDate).getTime();
        const bTime = new Date(b.sortDate).getTime();

        if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
          return 0;
        }

        return sortDirection === 'ASC' ? aTime - bTime : bTime - aTime;
      });

    const summary = {
      total_semua: baseFilteredItems.length,
      total_belum_dibaca: baseFilteredItems.filter((item: any) => item.unreadForSummary).length,
      total_per_jenis: {
        ND: 0,
        SDI: 0,
        SDE: 0,
        DI: 0,
        KA: 0,
        K: 0,
      } as Record<string, number>,
    };

    baseFilteredItems.forEach((item: any) => {
      if (summary.total_per_jenis[item.jenis] !== undefined) {
        summary.total_per_jenis[item.jenis] += 1;
      }
    });

    const listFilteredItems = query.jenis
      ? baseFilteredItems.filter((item: any) => item.jenis === query.jenis)
      : baseFilteredItems;

    const total = listFilteredItems.length;
    const totalPages = Math.ceil(total / limitNum);
    const paginatedItems = listFilteredItems
      .slice(offset, offset + limitNum)
      .map((item: any) => item.response);

    return {
      success: true,
      message: `Berhasil mengambil naskah dengan label ${label.nama}`,
      data: {
        namaLabel: label.nama,
        summary,
        items: paginatedItems,
      },
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
      },
    };
  }

  /**
   * Menghitung jumlah naskah per label
   * Only counts naskah that actually exist in the naskah table
   */
  async countNaskahPerLabel(positionId: string): Promise<Record<string, number>> {
    const labels = await this.findAllFlat(positionId);
    const counts: Record<string, number> = {};

    if (labels.length === 0) {
      return counts;
    }

    const labelIds = labels.map((l) => l.id);

    // Count naskah per label, only counting naskah that exist in naskah table
    const countQuery = `
      SELECT 
        nl.label_id,
        COUNT(DISTINCT nl.naskah_id) as count
      FROM naskah_label nl
      INNER JOIN naskah n ON n.id = nl.naskah_id
      WHERE nl.label_id IN (${labelIds.map(() => '?').join(',')})
      GROUP BY nl.label_id
    `;
    const countRows = await this.dataSource.query(countQuery, labelIds);

    // Initialize all labels with 0
    for (const label of labels) {
      counts[label.id] = 0;
    }

    // Update counts from query results
    for (const row of countRows) {
      counts[row.label_id] = parseInt(row.count, 10);
    }

    return counts;
  }

  /**
   * Build tree structure dari flat list
   */
  private buildLabelTree(labels: LabelEntity[]): LabelEntity[] {
    const labelMap = new Map<string, LabelEntity>();
    const rootLabels: LabelEntity[] = [];

    // Create map
    labels.forEach((label) => {
      labelMap.set(label.id, { ...label, children: [] });
    });

    // Build tree
    labels.forEach((label) => {
      const node = labelMap.get(label.id);
      if (!node) return;
      
      if (label.idParent) {
        const parent = labelMap.get(label.idParent);
        if (parent) {
          parent.children.push(node);
        }
      } else {
        rootLabels.push(node);
      }
    });

    return rootLabels;
  }

  /**
   * Check circular reference
   */
  private async checkCircularReference(
    parentId: string,
    childId: string,
  ): Promise<boolean> {
    let currentId = parentId;

    while (currentId) {
      if (currentId === childId) {
        return true;
      }

      const label = await this.labelRepository.findOne({
        where: { id: currentId },
      });

      if (!label || !label.idParent) {
        break;
      }

      currentId = label.idParent;
    }

    return false;
  }
}
