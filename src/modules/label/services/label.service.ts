import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { LabelEntity, NaskahLabelEntity } from '../entities';
import { CreateLabelDto, UpdateLabelDto, AddNaskahToLabelDto } from '../dto';

// Label untuk jenis naskah
const JENIS_LABELS: Record<string, string> = {
  ND: 'Nota Dinas',
  SDI: 'Surat Dinas Internal',
  SDE: 'Surat Dinas Eksternal',
  DI: 'Disposisi',
  KA: 'Kajian',
};

@Injectable()
export class LabelService {
  constructor(
    @InjectRepository(LabelEntity)
    private readonly labelRepository: Repository<LabelEntity>,
    @InjectRepository(NaskahLabelEntity)
    private readonly naskahLabelRepository: Repository<NaskahLabelEntity>,
    private readonly dataSource: DataSource,
  ) {}

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

    return this.labelRepository.save(label);
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
    return this.labelRepository.save(label);
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
  ): Promise<any> {
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
          items: [],
        },
      };
    }

    const naskahIds = naskahLabels.map((nl) => nl.naskahId);

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
        CAST(n.created_at AS DATETIME) as created_at,
        nl.source as naskah_source
      FROM naskah n
      INNER JOIN naskah_label nl ON nl.naskah_id = n.id AND nl.label_id = ?
      LEFT JOIN naskah_sirkulasi pengirim ON pengirim.id_naskah = n.id AND pengirim.sirkuler = 'pengirim'
      WHERE n.id IN (${naskahIds.map(() => '?').join(',')})
      ORDER BY n.tanggal DESC, n.id DESC
    `;
    const rows = await this.dataSource.query(selectQuery, [labelId, ...naskahIds]);

    // Get penerima for each naskah
    const penerimaMap = new Map<string, any[]>();
    const penerimaQuery = `
      SELECT 
        id_naskah,
        position as position_id,
        position_text,
        organization_text,
        nama_sirkuler as nama,
        send_read_time
      FROM naskah_sirkulasi
      WHERE id_naskah IN (${naskahIds.map(() => '?').join(',')})
      AND sirkuler = 'penerima'
      ORDER BY id
    `;
    const penerimaRows = await this.dataSource.query(penerimaQuery, naskahIds);

    // Group by id_naskah
    penerimaRows.forEach((row: any) => {
      if (!penerimaMap.has(row.id_naskah)) {
        penerimaMap.set(row.id_naskah, []);
      }
      penerimaMap.get(row.id_naskah)?.push({
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

    // Get favorit, note, arsip status from sirkulasi for this position
    const flagsMap = new Map<string, { favorit: boolean; note: boolean; arsip: boolean }>();
    const flagsQuery = `
      SELECT 
        id_naskah,
        flag_favorit,
        flag_note,
        flag_arsip
      FROM naskah_sirkulasi
      WHERE id_naskah IN (${naskahIds.map(() => '?').join(',')})
      AND position = ?
      LIMIT ${naskahIds.length}
    `;
    const flagsRows = await this.dataSource.query(flagsQuery, [...naskahIds, positionId]);

    flagsRows.forEach((row: any) => {
      flagsMap.set(row.id_naskah, {
        favorit: row.flag_favorit === 1,
        note: row.flag_note === 1,
        arsip: row.flag_arsip === 1,
      });
    });

    // Map to response items
    const items = rows.map((row: any) => {
      const penerima = penerimaMap.get(row.id_naskah) || [];
      const flags = flagsMap.get(row.id_naskah) || { favorit: false, note: false, arsip: false };

      // Calculate summary_baca
      const terbaca = penerima.filter((p: any) => p.status_baca === 'terbaca').length;
      const belumTerbaca = penerima.filter((p: any) => p.status_baca === 'belum_terbaca').length;

      // Get lampiran count (use existing value or 0)
      const lampiranCount = typeof row.lampiran === 'number' ? row.lampiran : 0;

      return {
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
          nama: row.pengirim_nama || '',
        },
        penerima,
        summary_baca: {
          total: penerima.length,
          terbaca,
          belum_terbaca: belumTerbaca,
        },
        favorit: flags.favorit,
        note: flags.note,
        arsip: flags.arsip,
        labels: labelsMap.get(row.id_naskah) || [],
        source: row.naskah_source || 'inbox',
        created_at: row.created_at,
        updated_at: null,
      };
    });

    return {
      success: true,
      message: `Berhasil mengambil naskah dengan label ${label.nama}`,
      data: {
        namaLabel: label.nama,
        items,
      },
    };
  }

  /**
   * Menghitung jumlah naskah per label
   */
  async countNaskahPerLabel(positionId: string): Promise<Record<string, number>> {
    const labels = await this.findAllFlat(positionId);
    const counts: Record<string, number> = {};

    for (const label of labels) {
      const count = await this.naskahLabelRepository.count({
        where: { labelId: label.id },
      });
      counts[label.id] = count;
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
