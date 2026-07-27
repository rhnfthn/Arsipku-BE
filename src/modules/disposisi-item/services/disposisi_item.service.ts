import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DisposisiItemEntity } from '../entities/disposisi_item.entity';
import { CreateDisposisiItemDto } from '../dto/disposisi_item/create_disposisi_item.dto';
import { UpdateDisposisiItemDto } from '../dto/disposisi_item/update_disposisi_item.dto';

@Injectable()
export class DisposisiItemService {
  constructor(
    @InjectRepository(DisposisiItemEntity)
    private disposisiItemRepository: Repository<DisposisiItemEntity>,
  ) {}

  async create(
    createDisposisiItemDto: CreateDisposisiItemDto,
  ): Promise<DisposisiItemEntity> {
    const disposisiItem = this.disposisiItemRepository.create({
      id: uuidv4(),
      ...createDisposisiItemDto,
    });

    return await this.disposisiItemRepository.save(disposisiItem);
  }

  async findAll(company?: string): Promise<DisposisiItemEntity[]> {
    const query =
      this.disposisiItemRepository.createQueryBuilder('disposisi_item');

    if (company) {
      query.where('disposisi_item.company = :company', { company });
    }

    return await query
      .where('disposisi_item.aktif = :aktif', { aktif: true })
      .orderBy('disposisi_item.urutan', 'ASC')
      .getMany();
  }

  async findOne(id: string): Promise<DisposisiItemEntity> {
    const disposisiItem = await this.disposisiItemRepository.findOne({
      where: { id },
    });

    if (!disposisiItem) {
      throw new NotFoundException('Disposisi item tidak ditemukan');
    }

    return disposisiItem;
  }

  async update(
    id: string,
    updateDisposisiItemDto: UpdateDisposisiItemDto,
  ): Promise<DisposisiItemEntity> {
    const disposisiItem = await this.findOne(id);

    Object.assign(disposisiItem, updateDisposisiItemDto);
    return await this.disposisiItemRepository.save(disposisiItem);
  }

  async remove(id: string): Promise<void> {
    const disposisiItem = await this.findOne(id);
    await this.disposisiItemRepository.remove(disposisiItem);
  }

  async toggleAktif(id: string): Promise<DisposisiItemEntity> {
    const disposisiItem = await this.findOne(id);
    disposisiItem.aktif = !disposisiItem.aktif;
    return await this.disposisiItemRepository.save(disposisiItem);
  }
}
