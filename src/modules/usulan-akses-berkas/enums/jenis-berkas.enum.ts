/**
 * Jenis berkas yang dipinjam — menentukan divisi pemberi
 * - AKTIF: user wajib pilih divisi pemberi
 * - INAKTIF: backend otomatis set divisi pemberi ke Corporate Secretary Division
 */
export enum JenisBerkas {
  AKTIF = 'AKTIF',
  INAKTIF = 'INAKTIF',
}