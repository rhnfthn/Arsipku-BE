import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

export type Platform = 'android' | 'ios' | 'web';

@Entity('fcm_token')
export class FcmTokenEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('int', { name: 'user_persnum' })
  userPersnum: number;

  /**
   * Active position (jabatan) at the time this FCM token was registered.
   * Re-set on every switchRole / re-login so that push delivery for
   * persuratan-type notifications can be filtered to tokens whose
   * position_id matches the notification's positionId.
   * NULL for tokens registered before this column was added (safe fallback).
   */
  @Column('varchar', { name: 'position_id', length: 100, nullable: true, default: null })
  positionId: string | null;

  @Column('varchar', { length: 500 })
  token: string;

  @Column('varchar', { name: 'device_id', length: 255 })
  deviceId: string;

  @Column('enum', { enum: ['android', 'ios', 'web'] })
  platform: Platform;

  @Column('tinyint', { name: 'is_active', default: 1 })
  isActive: boolean;

  @Column('timestamp', {
    name: 'last_used_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  lastUsedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
