/**
 * Meilisearch Sync Script (Standalone)
 *
 * Run this script to sync all naskah data from MySQL to Meilisearch.
 * This version uses direct database connection instead of importing AppModule
 * to avoid absolute import path issues.
 *
 * Usage:
 *   npx ts-node src/scripts/sync-meilisearch.script.ts
 *
 * Environment variables required (same as app.module.ts):
 *   DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME
 *   MEILISEARCH_HOST, MEILISEARCH_API_KEY, MEILISEARCH_INDEX_NASKAH, MEILISEARCH_ENABLED
 */

import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { MeiliSearch } from 'meilisearch';

// Load environment variables
config();

// Define the entity structures we need
interface NaskahRow {
  id: string;
  jenis: string;
  sifat: string;
  status: string;
  nomor: string | null;
  tanggal: Date;
  perihal: string | null;
  konten: string | null;
  klasifikasi: string | null;
  lampiran: string | null;
  final_pdf: string | null;
  created_at: Date;
}

interface SirkulasiRow {
  id: string;
  id_naskah: string;
  sirkuler: string;
  position: string | null;
  nama_sirkuler: string | null;
  position_text: string | null;
  organization_text: string | null;
  area_text: string | null;
  sub_area_text: string | null;
}

interface NaskahDocument {
  id: string;
  perihal: string | null;
  konten: string | null;
  nomor: string | null;
  jenis: string;
  sifat: string;
  status: string;
  tanggal: number;
  tanggal_str: string;
  klasifikasi: string | null;
  lampiran: string | null;
  hasAttachment: boolean;
  final_pdf: string | null;
  pengirim_position: string | null;
  pengirim_nama: string | null;
  pengirim_position_text: string | null;
  pengirim_organization_text: string | null;
  pengirim_area_text: string | null;
  pengirim_sub_area_text: string | null;
  penerima_positions: string[];
  penerima_names: string[];
  penerima_organizations: string[];
  tembusan_positions: string[];
  access_positions: string[]; // Unified access control
  searchable_text: string;
  createdAt: number;
  updatedAt: number;
}

async function bootstrap() {
  console.log('🚀 Starting Meilisearch sync (standalone mode)...\n');

  // Check required environment variables
  const meilisearchHost =
    process.env.MEILISEARCH_HOST || 'http://localhost:7700';
  const meilisearchApiKey = process.env.MEILISEARCH_API_KEY || '';
  const indexName = process.env.MEILISEARCH_INDEX_NASKAH || 'naskah';
  const meilisearchEnabled = process.env.MEILISEARCH_ENABLED === 'true';

  if (!meilisearchEnabled) {
    console.error(
      '❌ Meilisearch is disabled. Set MEILISEARCH_ENABLED=true in .env',
    );
    process.exit(1);
  }

  // Create direct database connection (matching app.module.ts config)
  const dataSource = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'navmail',
    synchronize: false,
    logging: false,
    extra: {
      maxAllowedPacket: 268435456, // 256MB - matching app.module.ts
    },
  });

  try {
    // Connect to database
    console.log('📡 Connecting to database...');
    await dataSource.initialize();
    console.log('✅ Database connected\n');

    // Connect to Meilisearch
    console.log('📡 Connecting to Meilisearch...');
    const meilisearch = new MeiliSearch({
      host: meilisearchHost,
      apiKey: meilisearchApiKey,
    });

    const health = await meilisearch.health();
    console.log(`✅ Meilisearch is ${health.status}\n`);

    // Ensure index exists
    try {
      await meilisearch.getIndex(indexName);
      console.log(`📁 Index '${indexName}' already exists`);
    } catch {
      console.log(`📁 Creating index '${indexName}'...`);
      await meilisearch.createIndex(indexName, { primaryKey: 'id' });
    }

    const index = meilisearch.index<NaskahDocument>(indexName);

    // Configure index settings
    console.log('⚙️  Configuring index settings...');
    await index.updateSearchableAttributes([
      'perihal',
      'konten',
      'searchable_text',
      'nomor',
      'pengirim_nama',
      'pengirim_position_text',
      'pengirim_organization_text',
      'klasifikasi',
    ]);

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
      'access_positions', // Unified access control
      'klasifikasi',
      'createdAt',
    ]);

    await index.updateSortableAttributes([
      'tanggal',
      'nomor',
      'createdAt',
      'updatedAt',
    ]);

    // Get current stats
    const beforeStats = await index.getStats();
    console.log(`📊 Before sync: ${beforeStats.numberOfDocuments} documents\n`);

    // Delete all existing documents first to ensure clean sync
    console.log('🗑️  Deleting all existing documents...');
    const deleteTask = await index.deleteAllDocuments();

    // Wait for delete task to complete
    await meilisearch.tasks.waitForTask(deleteTask.taskUid);
    console.log('✅ All existing documents deleted\n');

    // Fetch all naskah
    console.log('📥 Fetching naskah data...');
    const naskahRows = await dataSource.query<NaskahRow[]>(
      'SELECT * FROM naskah ORDER BY created_at DESC',
    );
    console.log(`   Found ${naskahRows.length} naskah`);

    // Fetch all sirkulasi
    console.log('📥 Fetching sirkulasi data...');
    const sirkulasiRows = await dataSource.query<SirkulasiRow[]>(
      'SELECT * FROM naskah_sirkulasi',
    );
    console.log(`   Found ${sirkulasiRows.length} sirkulasi records\n`);

    // Group sirkulasi by naskah
    const sirkulasiByNaskah = new Map<string, SirkulasiRow[]>();
    for (const s of sirkulasiRows) {
      if (s.id_naskah) {
        const list = sirkulasiByNaskah.get(s.id_naskah) || [];
        list.push(s);
        sirkulasiByNaskah.set(s.id_naskah, list);
      }
    }

    // Build documents
    console.log('🔄 Building documents...');
    const documents: NaskahDocument[] = [];

    for (const naskah of naskahRows) {
      const sirkulasiList = sirkulasiByNaskah.get(naskah.id) || [];
      const pengirim = sirkulasiList.find((s) => s.sirkuler === 'pengirim');
      const penerimaList = sirkulasiList.filter(
        (s) => s.sirkuler === 'penerima',
      );
      const tembusanList = sirkulasiList.filter(
        (s) => s.sirkuler === 'tembusan',
      );

      const hasAttachment = !!(
        naskah.lampiran && naskah.lampiran.trim() !== ''
      );

      const searchableText = [
        naskah.perihal,
        naskah.konten,
        naskah.nomor,
        naskah.klasifikasi,
        pengirim?.nama_sirkuler,
        pengirim?.position_text,
        pengirim?.organization_text,
        ...penerimaList.map((p) => p.nama_sirkuler),
        ...penerimaList.map((p) => p.position_text),
      ]
        .filter(Boolean)
        .join(' ');

      const doc: NaskahDocument = {
        id: naskah.id,
        perihal: naskah.perihal,
        konten: naskah.konten,
        nomor: naskah.nomor,
        jenis: naskah.jenis,
        sifat: naskah.sifat,
        status: naskah.status,
        tanggal: naskah.tanggal ? new Date(naskah.tanggal).getTime() : 0,
        tanggal_str: naskah.tanggal
          ? new Date(naskah.tanggal).toISOString()
          : '',
        klasifikasi: naskah.klasifikasi,
        lampiran: naskah.lampiran,
        hasAttachment,
        final_pdf: naskah.final_pdf,

        pengirim_position: pengirim?.position || null,
        pengirim_nama: pengirim?.nama_sirkuler || null,
        pengirim_position_text: pengirim?.position_text || null,
        pengirim_organization_text: pengirim?.organization_text || null,
        pengirim_area_text: pengirim?.area_text || null,
        pengirim_sub_area_text: pengirim?.sub_area_text || null,

        penerima_positions: penerimaList
          .map((p) => p.position)
          .filter(Boolean) as string[],
        penerima_names: penerimaList
          .map((p) => p.nama_sirkuler)
          .filter(Boolean) as string[],
        penerima_organizations: penerimaList
          .map((p) => p.organization_text)
          .filter(Boolean) as string[],

        tembusan_positions: tembusanList
          .map((t) => t.position)
          .filter(Boolean) as string[],

        // Unified access control - all positions that can see this document
        access_positions: [
          ...(pengirim?.position ? [pengirim.position] : []),
          ...(penerimaList.map((p) => p.position).filter(Boolean) as string[]),
          ...(tembusanList.map((t) => t.position).filter(Boolean) as string[]),
        ].filter((v, i, a) => a.indexOf(v) === i), // Dedupe

        searchable_text: searchableText,

        createdAt: naskah.created_at
          ? new Date(naskah.created_at).getTime()
          : Date.now(),
        updatedAt: naskah.created_at
          ? new Date(naskah.created_at).getTime()
          : Date.now(),
      };

      documents.push(doc);
    }

    // Index documents in batches
    console.log(`\n🔄 Indexing ${documents.length} documents...`);
    const batchSize = 100;
    let indexed = 0;

    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      const task = await index.addDocuments(batch);
      indexed += batch.length;
      console.log(
        `   Indexed ${indexed}/${documents.length} (task: ${task.taskUid})`,
      );
    }

    // Wait for all tasks to complete
    console.log('\n⏳ Waiting for indexing to complete...');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get final stats
    const afterStats = await index.getStats();
    console.log(`\n📊 After sync: ${afterStats.numberOfDocuments} documents`);
    console.log('\n✅ Sync completed successfully!');
  } catch (error) {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

bootstrap();
