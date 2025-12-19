import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TemplateSuratEntity } from './entities/template-surat.entity';
import { TemplateSuratService } from './services/template-surat.service';
import { TemplateSuratController } from './controllers/template-surat.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TemplateSuratEntity])],
  providers: [TemplateSuratService],
  controllers: [TemplateSuratController],
  exports: [TemplateSuratService],
})
export class TemplateSuratModule {}
