/**
 * Service reset database development dari halaman konfigurasi superadmin.
 * Implementasi runbook: RUNBOOK-PEMBERSIHAN-DATABASE-DEVELOPMENT.md
 *
 * Keamanan berlapis:
 * 1. Hanya SUPERADMIN (RolesGuard) + permission konfigurasi.
 * 2. Allowlist database development (RESET_ALLOWED_DB_NAMES).
 * 3. Hanya aktif saat NODE_ENV=development, atau NODE_ENV=qa dengan
 *    RESET_DATABASE_ENABLED=true.
 * 4. DELETE berurutan dalam satu transaction + verifikasi + commit/rollback.
 */
import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

/** Allowlist database development. Default sesuai runbook. */
const ALLOWED_DB_NAMES = (
  process.env.RESET_ALLOWED_DB_NAMES || 'newarsipku_db,newarsipku_arsip'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

type ResetLevel = 'level1' | 'level2' | 'level3';

/**
 * Urutan penghapusan child → parent per level.
 * Harus konsisten dengan scripts/db-reset/tables.ts (sumber kebenaran runbook).
 */
const LEVEL1_TABLES = [
  'sessions',
  'fcm_token',
  'notification',
  'mail_log',
  'ai_request_logs',
  'bsre_alert',
  'faq_vote',
  'naskah_umum_temp',
  'naskah_routing_applied',
];

const LEVEL2_TABLES = [
  // Tugas
  'tugas_task_evidence',
  'tugas_task_reference',
  'tugas_task_comment_hide',
  'tugas_task_comment',
  'tugas_activity',
  'tugas_task',
  'tugas_board_member',
  'tugas_board',
  // Persuratan (child → parent)
  'naskah_label',
  'naskah_dinas_verifikator',
  'naskah_lainnya_approval',
  'naskah_lainnya_blanko',
  'naskah_lainnya_riwayat',
  'naskah_lainnya_dokumen',
  'naskah_share_log',
  'naskah_share_recipient',
  'naskah_share',
  'naskah_lampiran',
  'naskah_referensi',
  'naskah_sirkulasi',
  'konsep_riwayat',
  'konsep',
  'digsig_document_signer',
  'digsig_log',
  'digsig_document',
  'tte_signing_transaction',
  'di',
  'naskah',
  // Penomoran
  'nomor_request_detail',
  'nomor_request',
  'nomor',
  // Berkas, retensi, transfer, penyusutan
  'berkas_verifikasi',
  'berkas_riwayat_retensi',
  'berkas_naskah',
  'penyusutan_verifikator',
  'penyusutan',
  'transfer_approval_levels',
  'transfer_active_to_inactive',
  'transfer_inactive_file',
  'usulan_pindah_arsip_inaktif',
  'usulan_akses_verification_step',
  'usulan_akses_berkas_item',
  'usulan_akses_entitlement',
  'usulan_akses_berkas',
  'berkas',
  // SDE masal
  'sde_masal_folder',
  'sde_masal',
];

const LEVEL2_ARCHIVE_TABLES = [
  'arsip_penyusutan_log',
  'arsip_transfer_log',
  'arsip_naskah_lampiran',
  'arsip_berkas_naskah',
  'arsip_naskah',
  'arsip_berkas',
];

const LEVEL3_TABLES = [
  'label',
  'grup_penerima_detail',
  'grup_penerima',
  'user_ai_config',
  'user_dashboard_layout',
  'delegasi',
];

function tablesForLevel(level: ResetLevel): string[] {
  switch (level) {
    case 'level1':
      return [...LEVEL1_TABLES];
    case 'level2':
      return [...LEVEL1_TABLES, ...LEVEL2_TABLES, ...LEVEL2_ARCHIVE_TABLES];
    case 'level3':
      return [
        ...LEVEL1_TABLES,
        ...LEVEL2_TABLES,
        ...LEVEL2_ARCHIVE_TABLES,
        ...LEVEL3_TABLES,
      ];
  }
}

@Injectable()
export class DbResetService {
  private readonly logger = new Logger(DbResetService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  /** Ringkasan jumlah baris tabel target — read-only, untuk ditampilkan di UI. */
  async getStats(level: ResetLevel): Promise<{
    level: ResetLevel;
    databases: { name: string; tables: { table: string; rows: number }[] }[];
    totalRows: number;
  }> {
    this.assertDevEnvironment();
    const mainDb = this.configService.get<string>('DB_NAME') || '';
    const archiveDb =
      this.configService.get<string>('ARCHIVE_DB_NAME') ||
      this.configService.get<string>('ARCHIVE_DATABASE_NAME') ||
      'newarsipku_arsip';
    const targets = tablesForLevel(level);

    const databases: {
      name: string;
      tables: { table: string; rows: number }[];
    }[] = [];
    let totalRows = 0;

    for (const [dbName, tables] of [
      [mainDb, targets.filter((t) => !LEVEL2_ARCHIVE_TABLES.includes(t))],
      [archiveDb, LEVEL2_ARCHIVE_TABLES],
    ] as [string, string[]][]) {
      if (!dbName || !ALLOWED_DB_NAMES.includes(dbName)) continue;
      const tableStats: { table: string; rows: number }[] = [];
      for (const table of tables) {
        try {
          const rows = await this.countRows(dbName, table);
          tableStats.push({ table, rows });
          totalRows += rows;
        } catch {
          // tabel tidak ada — skip
        }
      }
      databases.push({ name: dbName, tables: tableStats });
    }

    return { level, databases, totalRows };
  }

  /** Eksekusi reset: DELETE berurutan dalam satu transaction. */
  async execute(level: ResetLevel): Promise<{
    level: ResetLevel;
    deleted: Record<string, number>;
    totalDeleted: number;
  }> {
    this.assertDevEnvironment();
    const mainDb = this.configService.get<string>('DB_NAME') || '';
    const archiveDb =
      this.configService.get<string>('ARCHIVE_DB_NAME') ||
      this.configService.get<string>('ARCHIVE_DATABASE_NAME') ||
      'newarsipku_arsip';

    if (!ALLOWED_DB_NAMES.includes(mainDb)) {
      throw new ForbiddenException(
        `DB_NAME "${mainDb}" tidak ada di allowlist reset (${ALLOWED_DB_NAMES.join(', ')}).`,
      );
    }

    const targets = tablesForLevel(level);
    const deleted: Record<string, number> = {};

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.startTransaction();

      for (const table of targets) {
        const dbName = LEVEL2_ARCHIVE_TABLES.includes(table)
          ? archiveDb
          : mainDb;
        const qname = `\`${dbName}\`.\`${table}\``;
        try {
          const result = await queryRunner.query(`DELETE FROM ${qname}`);
          deleted[qname] = Number(result?.affectedRows ?? 0);
        } catch (error) {
          // Tabel opsional (legacy) tidak ada → skip tanpa gagal
          if (this.isMissingTableError(error)) {
            this.logger.warn(`Skip tabel opsional: ${qname}`);
            continue;
          }
          throw error;
        }
      }

      // Verifikasi pasca-hapus dalam transaction yang sama
      for (const table of targets) {
        const dbName = LEVEL2_ARCHIVE_TABLES.includes(table)
          ? archiveDb
          : mainDb;
        const qname = `\`${dbName}\`.\`${table}\``;
        try {
          const rows = await this.countRows(dbName, table);
          if (rows > 0) {
            throw new Error(
              `Verifikasi gagal: ${qname} masih berisi ${rows} baris`,
            );
          }
        } catch (error) {
          if (this.isMissingTableError(error)) continue;
          throw error;
        }
      }

      await queryRunner.commitTransaction();
      const totalDeleted = Object.values(deleted).reduce((a, b) => a + b, 0);
      this.logger.log(
        `DB reset ${level} selesai: ${totalDeleted} baris dari ${targets.length} tabel`,
      );
      return { level, deleted, totalDeleted };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `DB reset ${level} gagal, rollback: ${error instanceof Error ? error.message : error}`,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async countRows(dbName: string, table: string): Promise<number> {
    const result = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt FROM \`${dbName}\`.\`${table}\``,
    );
    return Number(result?.[0]?.cnt ?? 0);
  }

  private isMissingTableError(error: unknown): boolean {
    const code = (error as { code?: string })?.code;
    return code === 'ER_NO_SUCH_TABLE';
  }

  private assertDevEnvironment(): void {
    // QA server memakai NODE_ENV=qa walaupun DB yang dipakai adalah database
    // development. Tetap fail-closed: QA harus mengaktifkan fitur ini secara
    // eksplisit, sedangkan production tidak pernah boleh menggunakannya.
    const nodeEnv = (
      this.configService.get<string>('NODE_ENV') || 'development'
    )
      .trim()
      .toLowerCase();
    const resetEnabled =
      this.configService.get<string>('RESET_DATABASE_ENABLED') === 'true';
    const environmentAllowed =
      nodeEnv === 'development' || (nodeEnv === 'qa' && resetEnabled);

    if (!environmentAllowed) {
      throw new ForbiddenException(
        `Reset database ditolak untuk NODE_ENV="${nodeEnv}". Gunakan NODE_ENV=development atau aktifkan RESET_DATABASE_ENABLED=true khusus pada server QA development.`,
      );
    }
    const dbName = this.configService.get<string>('DB_NAME') || '';
    if (!ALLOWED_DB_NAMES.includes(dbName)) {
      throw new ForbiddenException(
        `DB_NAME "${dbName}" tidak ada di allowlist reset (${ALLOWED_DB_NAMES.join(', ')}).`,
      );
    }
  }
}
