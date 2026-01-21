import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GlobalSearchController } from './controllers/global-search.controller';
import { GlobalSearchService } from './services/global-search.service';
import { NaskahEntity } from '../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../shared/entities/naskah_sirkulasi.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([NaskahEntity, NaskahSirkulasi]),
  ],
  controllers: [GlobalSearchController],
  providers: [GlobalSearchService],
  exports: [GlobalSearchService],
})
export class SearchModule {}
