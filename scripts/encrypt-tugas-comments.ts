import 'reflect-metadata';
import dataSource from '../src/data-source';
import {
  commentEncryptionKey,
  decryptComment,
  encryptComment,
  isEncryptedComment,
} from '../src/modules/tugas/helpers/tugas-comment-encryption';

interface CommentRow {
  id: string;
  isi: string;
}

async function main() {
  commentEncryptionKey(); // Validate before touching the DB.
  await dataSource.initialize();
  try {
    let encrypted = 0;
    // Atomic backfill: lock each batch to coordinate with existing deletion/writes.
    await dataSource.transaction(async (manager) => {
      let cursor = '';
      while (true) {
        const rows: CommentRow[] = await manager.query(
          'SELECT id, isi FROM tugas_task_comment WHERE id > ? ORDER BY id LIMIT 200 FOR UPDATE',
          [cursor],
        );
        if (!rows.length) break;
        for (const row of rows) {
          if (isEncryptedComment(row.isi)) {
            decryptComment(row.isi); // Verify the configured key, never double-encrypt.
          } else {
            const value = encryptComment(row.isi);
            if (decryptComment(value) !== row.isi)
              throw new Error('Encryption verification failed');
            await manager.query(
              'UPDATE tugas_task_comment SET isi = ? WHERE id = ?',
              [value, row.id],
            );
            encrypted++;
          }
        }
        cursor = rows[rows.length - 1].id;
      }
    });
    console.log(`Forum backfill complete: ${encrypted} messages encrypted.`);
  } finally {
    await dataSource.destroy();
  }
}
void main().catch(() => {
  console.error(
    'Forum backfill failed; transaction rolled back. Check DB connectivity and encryption key.',
  );
  process.exitCode = 1;
});
