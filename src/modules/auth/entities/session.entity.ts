import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('sessions')
export class Session {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('int', { name: 'user_persnum' })
  userPersnum: number;

  @Column('int', { name: 'id_position', nullable: true })
  idPosition: number;

  @Column('text', { name: 'airnavAccessToken' })
  airnavAccessToken: string;

  @Column('text', { name: 'airnavRefreshToken' })
  airnavRefreshToken: string;

  @Column('datetime', {
    name: 'airnav_expired_at',
    precision: 3,
  })
  airnavExpiredAt: Date;

  @Column('varchar', { name: 'userAgent', length: 255, nullable: true })
  userAgent: string;

  @Column('varchar', { name: 'ipAddress', length: 45, nullable: true })
  ipAddress: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
    nullable: true,
  })
  updatedAt: Date;
}
