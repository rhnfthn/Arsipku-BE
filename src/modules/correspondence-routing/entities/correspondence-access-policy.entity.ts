import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export const CORRESPONDENCE_DOCUMENT_TYPES = [
  'ND',
  'SDI',
  'SDE',
  'DI',
  'KA',
] as const;
export type CorrespondenceDocumentType =
  (typeof CORRESPONDENCE_DOCUMENT_TYPES)[number];

@Entity('correspondence_access_policy')
@Index(
  'uq_correspondence_access_company_document',
  ['company', 'document_type'],
  {
    unique: true,
  },
)
export class CorrespondenceAccessPolicy {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ type: 'int' })
  company: number;

  @Column({ type: 'varchar', length: 10 })
  document_type: CorrespondenceDocumentType;

  /** Nilai kosong berarti tidak membatasi bod_tag. Token NONE mewakili bod_tag kosong. */
  @Column({ type: 'json', nullable: true })
  bod_tags: string[] | null;

  /** Nilai kosong berarti tidak membatasi chief. */
  @Column({ type: 'json', nullable: true })
  chief_values: number[] | null;

  @Column({ type: 'varchar', length: 16, default: 'ALL' })
  area_mode: 'ALL' | 'SELECTED';

  @Column({ type: 'json', nullable: true })
  area_ids: string[] | null;

  @Column({ type: 'tinyint', width: 1, default: 1 })
  is_active: number;

  @CreateDateColumn({ type: 'timestamp', precision: 0 })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp', precision: 0 })
  updated_at: Date;
}
