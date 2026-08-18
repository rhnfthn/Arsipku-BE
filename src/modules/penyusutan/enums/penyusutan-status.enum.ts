/**
 * Status alur Pengajuan Penyusutan.
 *
 * Flow:
 *   DRAFT → DIAJUKAN → DITERIMA → SELESAI
 *   DIAJUKAN → DITOLAK
 */
export enum PenyusutanStatus {
  DRAFT = 'draft',
  DIAJUKAN = 'diajukan',
  DITERIMA = 'diterima',
  DITOLAK = 'ditolak',
  SELESAI = 'selesai',
}

export type JenisPenyusutan = 'permanen' | 'musnah';
