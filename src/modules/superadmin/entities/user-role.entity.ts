import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum UserRole {
  ADMIN = 'admin',
  SUPERADMIN = 'superadmin',
}

@Entity('user_role')
@Index('idx_persnum', ['persnum'], { unique: true })
@Index('idx_role', ['role'])
export class UserRoleEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('char', { name: 'id_position', length: 36 })
  idPosition: string;

  @Column({ type: 'int', nullable: false, unique: true })
  persnum: number;

  @Column({
    type: 'enum',
    enum: UserRole,
    nullable: false,
  })
  role: UserRole;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
