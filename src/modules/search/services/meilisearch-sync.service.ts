import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { MeilisearchService, NaskahDocument } from './meilisearch.service';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../../shared/entities/naskah_sirkulasi.entity';

/**
 * MeilisearchSyncService
 * 
 * Handles syncing data between MySQL and Meilisearch.
 * Provides methods for:
 * - Initial full sync (bulk indexing)
 * - Real-time sync (on create/update/delete)
 * - Single document sync
 */
@Injectable()
export class MeilisearchSyncService {
    private readonly logger = new Logger(MeilisearchSyncService.name);

    constructor(
        private readonly meilisearchService: MeilisearchService,
        private readonly dataSource: DataSource,
        @InjectRepository(NaskahEntity)
        private readonly naskahRepository: Repository<NaskahEntity>,
        @InjectRepository(NaskahSirkulasi)
        private readonly naskahSirkulasiRepository: Repository<NaskahSirkulasi>,
    ) { }

    /**
     * Sync a single naskah document to Meilisearch
     * Call this on naskah create or update
     */
    async syncNaskah(naskahId: string): Promise<void> {
        if (!this.meilisearchService.isAvailable()) {
            return;
        }

        try {
            const doc = await this.buildDocument(naskahId);
            if (doc) {
                await this.meilisearchService.indexDocument(doc);
                this.logger.debug(`Synced naskah ${naskahId} to Meilisearch`);
            }
        } catch (error) {
            this.logger.error(`Failed to sync naskah ${naskahId}`, error);
        }
    }

    /**
     * Delete a naskah document from Meilisearch
     * Call this on naskah delete
     */
    async deleteNaskah(naskahId: string): Promise<void> {
        if (!this.meilisearchService.isAvailable()) {
            return;
        }

        try {
            await this.meilisearchService.deleteDocument(naskahId);
            this.logger.debug(`Deleted naskah ${naskahId} from Meilisearch`);
        } catch (error) {
            this.logger.error(`Failed to delete naskah ${naskahId}`, error);
        }
    }

    /**
     * Full sync - index all naskah documents
     * Use this for initial setup or reindexing
     */
    async fullSync(batchSize: number = 100): Promise<{ total: number; indexed: number }> {
        if (!this.meilisearchService.isAvailable()) {
            this.logger.warn('Meilisearch not available, skipping full sync');
            return { total: 0, indexed: 0 };
        }

        this.logger.log('Starting full sync to Meilisearch...');

        // Get total count
        const total = await this.naskahRepository.count();
        this.logger.log(`Total naskah to sync: ${total}`);

        let indexed = 0;
        let offset = 0;

        while (offset < total) {
            // Get batch of naskah
            const naskahBatch = await this.naskahRepository.find({
                skip: offset,
                take: batchSize,
                order: { createdAt: 'DESC' },
            });

            if (naskahBatch.length === 0) {
                break;
            }

            // Build documents for batch
            const docs: NaskahDocument[] = [];
            for (const naskah of naskahBatch) {
                const doc = await this.buildDocument(naskah.id);
                if (doc) {
                    docs.push(doc);
                }
            }

            // Index batch
            if (docs.length > 0) {
                await this.meilisearchService.indexDocuments(docs);
                indexed += docs.length;
                this.logger.log(`Indexed ${indexed}/${total} documents`);
            }

            offset += batchSize;
        }

        this.logger.log(`Full sync completed: ${indexed}/${total} documents indexed`);
        return { total, indexed };
    }

    /**
     * Build a NaskahDocument from database data
     */
    private async buildDocument(naskahId: string): Promise<NaskahDocument | null> {
        // Get naskah
        const naskah = await this.naskahRepository.findOne({
            where: { id: naskahId },
        });

        if (!naskah) {
            return null;
        }

        // Get sirkulasi data
        const sirkulasiList = await this.naskahSirkulasiRepository.find({
            where: { idNaskah: naskahId },
        });

        // Extract pengirim
        const pengirim = sirkulasiList.find((s) => s.sirkuler === 'pengirim');

        // Extract penerima
        const penerimaList = sirkulasiList.filter((s) => s.sirkuler === 'penerima');

        // Extract tembusan
        const tembusanList = sirkulasiList.filter((s) => s.sirkuler === 'tembusan');

        // Check if has attachment
        const hasAttachment = !!(naskah.lampiran && naskah.lampiran.trim() !== '');

        // Build searchable text (combine all text fields for full-text search)
        const searchableText = [
            naskah.perihal,
            naskah.nomor,
            naskah.klasifikasi,
            pengirim?.namaSirkuler,
            pengirim?.positionText,
            pengirim?.organizationText,
            ...penerimaList.map((p) => p.namaSirkuler),
            ...penerimaList.map((p) => p.positionText),
        ]
            .filter(Boolean)
            .join(' ');

        const doc: NaskahDocument = {
            id: naskah.id,
            perihal: naskah.perihal,
            nomor: naskah.nomor,
            jenis: naskah.jenis,
            sifat: naskah.sifat,
            status: naskah.status,
            tanggal: naskah.tanggal ? new Date(naskah.tanggal).getTime() : 0,
            tanggal_str: naskah.tanggal ? new Date(naskah.tanggal).toISOString() : '',
            klasifikasi: naskah.klasifikasi,
            lampiran: naskah.lampiran,
            hasAttachment,
            final_pdf: naskah.final_pdf,

            // Pengirim
            pengirim_position: pengirim?.position || null,
            pengirim_nama: pengirim?.namaSirkuler || null,
            pengirim_position_text: pengirim?.positionText || null,
            pengirim_organization_text: pengirim?.organizationText || null,
            pengirim_area_text: pengirim?.areaText || null,
            pengirim_sub_area_text: pengirim?.subAreaText || null,

            // Penerima arrays
            penerima_positions: penerimaList.map((p) => p.position).filter(Boolean) as string[],
            penerima_names: penerimaList.map((p) => p.namaSirkuler).filter(Boolean) as string[],
            penerima_organizations: penerimaList.map((p) => p.organizationText).filter(Boolean) as string[],

            // Tembusan
            tembusan_positions: tembusanList.map((t) => t.position).filter(Boolean) as string[],

            // Access control - unified list of all positions that can see this document
            access_positions: [
                ...(pengirim?.position ? [pengirim.position] : []),
                ...penerimaList.map((p) => p.position).filter(Boolean) as string[],
                ...tembusanList.map((t) => t.position).filter(Boolean) as string[],
            ].filter((v, i, a) => a.indexOf(v) === i), // Dedupe

            // Searchable text
            searchable_text: searchableText,

            // Timestamps
            createdAt: naskah.createdAt ? new Date(naskah.createdAt).getTime() : Date.now(),
            updatedAt: naskah.createdAt ? new Date(naskah.createdAt).getTime() : Date.now(), // NaskahEntity doesn't have updatedAt
        };

        return doc;
    }
}
