import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { FaqEntity } from './faq.entity';

@Entity('faq_kategori')
export class FaqKategoriEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  nama: string;

  @Column({ type: 'text', nullable: true })
  deskripsi: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => FaqEntity, (faq) => faq.kategoriEntity)
  faqs: FaqEntity[];
}
