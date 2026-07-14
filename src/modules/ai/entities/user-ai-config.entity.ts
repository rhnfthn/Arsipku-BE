import {
  Entity,
  Column,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('user_ai_config')
export class UserAiConfig {
  @PrimaryColumn({ type: 'int' })
  persnum: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  ai_api_key: string | null;

  @UpdateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;
}