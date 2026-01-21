import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { LabelEntity, NaskahLabelEntity } from '../entities';
import { CreateLabelDto, UpdateLabelDto, AddNaskahToLabelDto } from '../dto';

@Injectable()
export class LabelService {
  constructor(
    @InjectRepository(LabelEntity)
    private readonly labelRepository: Repository<LabelEntity>,
    @InjectRepository(NaskahLabelEntity)
    private readonly naskahLabelRepository: Repository<NaskahLabelEntity>,
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
   * Mengambil semua naskah dengan label tertentu
   */
  async getNaskahByLabel(
    labelId: string,
    positionId: string,
  ): Promise<{ namaLabel: string; naskah: Array<{ naskahId: string; source: 'inbox' | 'sent' | 'draft' }> }> {
    // Validasi label dan ambil data label
    const label = await this.findOne(labelId, positionId);

    const naskahLabels = await this.naskahLabelRepository.find({
      where: { labelId },
    });

    return {
      namaLabel: label.nama,
      naskah: naskahLabels.map((nl) => ({
        naskahId: nl.naskahId,
        source: nl.source || 'inbox',
      })),
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
