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

// Entities
import { NaskahEntity } from '../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../shared/entities/naskah_sirkulasi.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([NaskahEntity, NaskahSirkulasi]),
  ],
  controllers: [
    GlobalSearchController,        // /search (SQL-based)
    MeilisearchSearchController,   // /search/v2 (Meilisearch-based)
  ],
  providers: [
    // SQL-based search
    GlobalSearchService,
    // Meilisearch-based search
    MeilisearchService,
    MeilisearchSearchService,
    MeilisearchSyncService,
  ],
  exports: [
    GlobalSearchService,
    MeilisearchService,
    MeilisearchSyncService,
  ],
})
export class SearchModule { }

