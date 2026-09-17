import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { TugasTaskEntity } from './tugas-task.entity';

@Entity('tugas_task_evidence')
@Index('idx_tugas_evidence_task', ['taskId', 'createdAt'])
export class TugasTaskEvidenceEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('char', { name: 'task_id', length: 36 })
  taskId: string;

  @Column('varchar', { name: 'storage_key', length: 500, unique: true })
  storageKey: string;

  @Column('varchar', { name: 'original_name', length: 255 })
  originalName: string;

  @Column('varchar', { name: 'mime_type', length: 50 })
  mimeType: string;

  @Column('int', { name: 'file_size', unsigned: true })
  fileSize: number;

  @Column('int', { name: 'uploaded_by_persnum' })
  uploadedByPersnum: number;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    precision: 0,
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @ManyToOne(() => TugasTaskEntity, (task) => task.evidences, {
    onUpdate: 'RESTRICT',
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'task_id',
    foreignKeyConstraintName: 'fk_tugas_evidence_task',
  })
  task: TugasTaskEntity;
}
