import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Existing SQL-based search
import { GlobalSearchController } from './controllers/global-search.controller';
import { GlobalSearchService } from './services/global-search.service';

// Meilisearch-based search (v2)
import { MeilisearchSearchController } from './controllers/meilisearch-search.controller';
import { MeilisearchService } from './services/meilisearch.service';
import { MeilisearchSearchService } from './services/meilisearch-search.service';
import { MeilisearchSyncService } from './services/meilisearch-sync.service';

//Search V3
import { SearchV3Controller } from './controllers/search-v3.controller';
import { SearchV3Service } from './services/search-v3.service';

// Entities
import { NaskahEntity } from '../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../shared/entities/naskah_sirkulasi.entity';
import { LabelEntity, NaskahLabelEntity } from '../label/entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NaskahEntity,
      NaskahSirkulasi,
      LabelEntity,
      NaskahLabelEntity,
    ]),
  ],
  controllers: [
    GlobalSearchController, // /search (SQL-based)
    MeilisearchSearchController, // /search/v2 (Meilisearch-based)
    SearchV3Controller, // /search/v3 (SQL-based with advanced features)
  ],
  providers: [
    // SQL-based search
    GlobalSearchService,
    // Meilisearch-based search
    MeilisearchService,
    MeilisearchSearchService,
    MeilisearchSyncService,
    SearchV3Service,
  ],
  exports: [
    GlobalSearchService,
    MeilisearchService,
    MeilisearchSyncService,
    SearchV3Service,
  ],
})
export class SearchModule {}
