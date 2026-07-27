import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type FaqVoteType = 'puas' | 'tidak_puas';

@Entity('faq_vote')
@Index(['faqId', 'userId'], { unique: true })
export class FaqVoteEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 36, name: 'faq_id' })
  faqId: string;

  @Column({ type: 'varchar', length: 100, name: 'user_id' })
  userId: string;

  @Column({ type: 'enum', enum: ['puas', 'tidak_puas'], name: 'vote_type' })
  voteType: FaqVoteType;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
