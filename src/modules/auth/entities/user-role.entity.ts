import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRoleEnum {
  ADMIN = 'admin',
  SUPERADMIN = 'superadmin',
}

@Entity('user_role')
export class UserRole {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column('char', { name: 'id_position', length: 36 })
  idPosition: string;

  @Column('int', { unique: true })
  persnum: number;

  @Column({
    type: 'enum',
    enum: UserRoleEnum,
  })
  role: UserRoleEnum;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
    nullable: true,
  })
  updatedAt: Date;
}
