/**
 * Meilisearch Sync Script
 * 
 * Run this script to sync all naskah data from MySQL to Meilisearch.
 * 
 * Usage:
 *   npx ts-node src/scripts/sync-meilisearch.script.ts
 * 
 * Make sure to set these environment variables:
 *   MEILISEARCH_HOST=http://localhost:7700
 *   MEILISEARCH_API_KEY=your_master_key
 *   MEILISEARCH_INDEX_NASKAH=naskah
 *   MEILISEARCH_ENABLED=true
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MeilisearchSyncService } from '../modules/search/services/meilisearch-sync.service';
import { MeilisearchService } from '../modules/search/services/meilisearch.service';

async function bootstrap() {
    console.log('🚀 Starting Meilisearch sync...\n');

    // Create NestJS application context
    const app = await NestFactory.createApplicationContext(AppModule);

    try {
        // Get services
        const meilisearchService = app.get(MeilisearchService);
        const syncService = app.get(MeilisearchSyncService);

        // Check Meilisearch availability
        if (!meilisearchService.isAvailable()) {
            console.error('❌ Meilisearch is not available.');
            console.error('   Make sure MEILISEARCH_ENABLED=true and Meilisearch is running.');
            process.exit(1);
        }

        console.log('✅ Meilisearch is available\n');

        // Get current stats
        const beforeStats = await meilisearchService.getStats();
        console.log('📊 Before sync:');
        console.log(`   - Documents: ${beforeStats?.numberOfDocuments || 0}`);
        console.log(`   - Index size: ${beforeStats?.isIndexing ? 'Indexing...' : 'Ready'}\n`);

        // Run full sync
        console.log('🔄 Starting full sync...\n');
        const result = await syncService.fullSync(100);

        // Get stats after sync
        const afterStats = await meilisearchService.getStats();
        console.log('\n📊 After sync:');
        console.log(`   - Documents: ${afterStats?.numberOfDocuments || 0}`);
        console.log(`   - Indexed: ${result.indexed}/${result.total}`);

        console.log('\n✅ Sync completed successfully!');
    } catch (error) {
        console.error('❌ Sync failed:', error);
        process.exit(1);
    } finally {
        await app.close();
    }
}

bootstrap();
