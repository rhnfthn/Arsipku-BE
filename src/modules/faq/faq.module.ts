import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FaqEntity } from './entities/faq.entity';
import { FaqVoteEntity } from './entities/faq-vote.entity';
import { FaqController } from './controllers/faq.controller';
import { FaqService } from './services/faq.service';

@Module({
  imports: [TypeOrmModule.forFeature([FaqEntity, FaqVoteEntity])],
  controllers: [FaqController],
  providers: [FaqService],
  exports: [FaqService],
})
export class FaqModule {}
