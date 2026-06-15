import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FaqEntity } from './entities/faq.entity';
import { FaqVoteEntity } from './entities/faq-vote.entity';
import { FaqKategoriEntity } from './entities/faq-kategori.entity';
import { FaqController } from './controllers/faq.controller';
import { FaqKategoriController } from './controllers/faq-kategori.controller';
import { FaqService } from './services/faq.service';
import { FaqKategoriService } from './services/faq-kategori.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FaqEntity, FaqVoteEntity, FaqKategoriEntity]),
  ],
  controllers: [FaqController, FaqKategoriController],
  providers: [FaqService, FaqKategoriService],
  exports: [FaqService, FaqKategoriService],
})
export class FaqModule {}
