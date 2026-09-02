import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('eksternal')
export class EksternalEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;

  @Column({ type: 'varchar', length: 10, nullable: true, unique: true })
  kode: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  id_position_pembuat: string;

  @Column({ type: 'varchar', length: 50 })
  company: string;

  @Column({ type: 'varchar', length: 50 })
  area: string;

  @Column({ type: 'varchar', length: 150 })
  nama: string;

  @Column({ type: 'text', nullable: true })
  alamat: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  telepon: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  kontak: string;

  @Column({ type: 'boolean', default: true })
  aktif: boolean;
}
