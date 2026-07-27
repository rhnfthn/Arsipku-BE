import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PositionStatus } from '../../../common/enums/position-status.enum';

@Entity('delegasi')
export class DelegasiEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ type: 'date', nullable: true })
  start_date: Date;

  @Column({ type: 'date', nullable: true })
  end_date: Date;

  // Company info
  @Column({ type: 'varchar', length: 50, nullable: true })
  company: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  company_text: string;

  // "Sebagai" / As - The role being delegated to
  @Column({ type: 'varchar', length: 50, nullable: true })
  as_area: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  as_area_text: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  as_sub_area: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  as_sub_area_text: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  as_organization: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  as_organization_text: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  as_position: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  as_position_text: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  as_persnum: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  as_name: string;

  // Position status (role type: PT, PH, PS, VI, SE)
  @Column({
    type: 'enum',
    enum: PositionStatus,
    nullable: true,
  })
  position_status: PositionStatus;

  // Delegator info - The person who delegates
  @Column({ type: 'varchar', length: 50, nullable: true })
  area: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  area_text: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  sub_area: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  sub_area_text: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  organization: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  organization_text: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  position: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  position_text: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  persnum: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  name: string;

  @CreateDateColumn({ type: 'datetime', name: 'create_at' })
  create_at: Date;

  @UpdateDateColumn({ type: 'datetime', name: 'update_at' })
  update_at: Date;
}
