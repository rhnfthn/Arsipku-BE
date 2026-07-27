import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MeiliSearch, Index, SearchResponse, SearchParams } from 'meilisearch';

/**
 * Document structure for Naskah in Meilisearch
 */
export interface NaskahDocument {
  id: string;
  perihal: string | null;
  nomor: string | null;
  jenis: string;
  sifat: string;
  status: string;
  tanggal: number; // Unix timestamp for filtering
  tanggal_str: string; // ISO string for display
  klasifikasi: string | null;
  lampiran: string | null;
  hasAttachment: boolean;
  final_pdf: string | null;

  // Pengirim info (flattened for search)
  pengirim_position: string | null;
  pengirim_nama: string | null;
  pengirim_position_text: string | null;
  pengirim_organization_text: string | null;
  pengirim_area_text: string | null;
  pengirim_sub_area_text: string | null;

  // Penerima info (arrays for filtering)
  penerima_positions: string[];
  penerima_names: string[];
  penerima_organizations: string[];

  // Tembusan info
  tembusan_positions: string[];

  // Combined searchable text for full-text search
  searchable_text: string;

  // Timestamps
  createdAt: number;
  updatedAt: number;

  // Access control - all positions that can see this document
  access_positions: string[];
}

/**
 * MeilisearchService
 *
 * Low-level service for interacting with Meilisearch.
 * Handles client initialization, index management, and document operations.
 */
@Injectable()
export class MeilisearchService implements OnModuleInit {
  private readonly logger = new Logger(MeilisearchService.name);
  private client: MeiliSearch;
  private naskahIndex: Index<NaskahDocument>;

  private readonly indexName: string;
  private readonly isEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>(
      'MEILISEARCH_HOST',
      'http://localhost:7700',
    );
    const apiKey = this.configService.get<string>('MEILISEARCH_API_KEY', '');
    this.indexName = this.configService.get<string>(
      'MEILISEARCH_INDEX_NASKAH',
      'naskah',
    );
    this.isEnabled =
      this.configService.get<string>('MEILISEARCH_ENABLED', 'false') === 'true';

    this.client = new MeiliSearch({
      host,
      apiKey,
    });
  }

  async onModuleInit() {
    if (!this.isEnabled) {
      this.logger.warn(
        'Meilisearch is disabled. Set MEILISEARCH_ENABLED=true to enable.',
      );
      return;
    }

    try {
      // Check health
      const health = await this.client.health();
      this.logger.log(`Meilisearch is ${health.status}`);

      // Get or create index
      await this.ensureIndex();
      this.naskahIndex = this.client.index<NaskahDocument>(this.indexName);

      this.logger.log(`Meilisearch initialized with index: ${this.indexName}`);
    } catch (error) {
      this.logger.error('Failed to initialize Meilisearch', error);
    }
  }

  /**
   * Check if Meilisearch is enabled
   */
  isAvailable(): boolean {
    return this.isEnabled && !!this.naskahIndex;
  }

  /**
   * Ensure the index exists with proper settings
   */
  private async ensureIndex(): Promise<void> {
    try {
      await this.client.getIndex(this.indexName);
      this.logger.log(`Index ${this.indexName} already exists`);
    } catch {
      // Index doesn't exist, create it
      this.logger.log(`Creating index ${this.indexName}...`);
      await this.client.createIndex(this.indexName, { primaryKey: 'id' });
    }

    // Configure index settings
    await this.configureIndex();
  }

  /**
   * Configure index settings for optimal search
   */
  private async configureIndex(): Promise<void> {
    const index = this.client.index(this.indexName);

    // Searchable attributes - order matters for relevance
    await index.updateSearchableAttributes([
      'perihal',
      'searchable_text',
      'nomor',
      'pengirim_nama',
      'pengirim_position_text',
      'pengirim_organization_text',
      'klasifikasi',
    ]);

    // Filterable attributes
    await index.updateFilterableAttributes([
      'id',
      'jenis',
      'sifat',
      'status',
      'tanggal',
      'hasAttachment',
      'pengirim_position',
      'pengirim_area_text',
      'pengirim_sub_area_text',
      'pengirim_organization_text',
      'penerima_positions',
      'tembusan_positions',
      'klasifikasi',
      'createdAt',
      'access_positions', // Unified access control field
    ]);

    // Sortable attributes
    await index.updateSortableAttributes([
      'tanggal',
      'nomor',
      'createdAt',
      'updatedAt',
    ]);

    // Typo tolerance settings
    await index.updateTypoTolerance({
      enabled: true,
      minWordSizeForTypos: {
        oneTypo: 4,
        twoTypos: 8,
      },
    });

    this.logger.log('Index settings configured');
  }

  /**
   * Add or update a single document
   */
  async indexDocument(doc: NaskahDocument): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    try {
      await this.naskahIndex.addDocuments([doc]);
      this.logger.debug(`Indexed document: ${doc.id}`);
    } catch (error) {
      this.logger.error(`Failed to index document ${doc.id}`, error);
    }
  }

  /**
   * Add or update multiple documents
   */
  async indexDocuments(docs: NaskahDocument[]): Promise<void> {
    if (!this.isAvailable() || docs.length === 0) {
      return;
    }

    try {
      const task = await this.naskahIndex.addDocuments(docs);
      this.logger.log(
        `Indexing ${docs.length} documents, task: ${task.taskUid}`,
      );
    } catch (error) {
      this.logger.error('Failed to index documents', error);
    }
  }

  /**
   * Delete a document by ID
   */
  async deleteDocument(id: string): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    try {
      await this.naskahIndex.deleteDocument(id);
      this.logger.debug(`Deleted document: ${id}`);
    } catch (error) {
      this.logger.error(`Failed to delete document ${id}`, error);
    }
  }

  /**
   * Search documents
   */
  async search(
    query: string,
    options?: SearchParams,
  ): Promise<SearchResponse<NaskahDocument>> {
    if (!this.isAvailable()) {
      throw new Error('Meilisearch is not available');
    }

    return this.naskahIndex.search(query, options);
  }

  /**
   * Get index stats
   */
  async getStats() {
    if (!this.isAvailable()) {
      return null;
    }

    return this.naskahIndex.getStats();
  }

  /**
   * Get Meilisearch client (for advanced operations)
   */
  getClient(): MeiliSearch {
    return this.client;
  }

  /**
   * Get the naskah index
   */
  getIndex(): Index<NaskahDocument> {
    return this.naskahIndex;
  }
}
