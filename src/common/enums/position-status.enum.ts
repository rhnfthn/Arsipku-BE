/**
 * Position Status / Actor Types untuk Delegasi
 * - YBS: Yang Bersangkutan (Definitif, Interim Officer)
 * - PT: Pelaksana Tugas
 * - PH: Pelaksana Harian
 * - PS: Penugasan Sementara
 * - VI: Viewer (Jabatan Lama)
 * - SE: Sekretaris
 * - EXT: External
 */
export enum PositionStatus {
  YBS = 'YBS',  // Yang Bersangkutan (Definitif, Interim Officer)
  PT = 'PT',   // Pelaksana Tugas
  PH = 'PH',   // Pelaksana Harian
  PS = 'PS',   // Penugasan Sementara
  VI = 'VI',   // Viewer (Jabatan Lama)
  SE = 'SE',   // Sekretaris
  EXT = 'EXT', // External
}

/**
 * Position Status Labels for display
 */
export const POSITION_STATUS_LABELS: Record<PositionStatus, string> = {
  [PositionStatus.YBS]: 'Yang Bersangkutan (Definitif/Interim Officer)',
  [PositionStatus.PT]: 'Pelaksana Tugas',
  [PositionStatus.PH]: 'Pelaksana Harian',
  [PositionStatus.PS]: 'Penugasan Sementara',
  [PositionStatus.VI]: 'Viewer (Jabatan Lama)',
  [PositionStatus.SE]: 'Sekretaris',
  [PositionStatus.EXT]: 'External',
};

/**
 * Position Status Descriptions
 */
export const POSITION_STATUS_DESCRIPTIONS: Record<PositionStatus, string> = {
  [PositionStatus.YBS]: 'YBS atau yang bersangkutan, adalah jabatan manajerial/non manajerial tetap karyawan sesuai SK mutasi',
  [PositionStatus.PT]: 'Rangkap jabatan manajerial tidak tetap karyawan sesuai SPRINT penugasan karena belum ditetapkannya pejabat definitif',
  [PositionStatus.PH]: 'Rangkap jabatan manajerial tidak tetap karyawan sesuai SPRINT penugasan karena pejabat definitif sedang berhalangan sementara seperti sedang cuti, sakit, dll',
  [PositionStatus.PS]: 'Pemindahan data hirarki jabatan non manajerial (relasi OS) tidak tetap karyawan sesuai SPRINT penugasan karena kebutuhan korespondensi di unit kerja penugasan tanpa dilakukan mutasi jabatan',
  [PositionStatus.VI]: 'Akses lihat saja terhadap naskah dinas jabatan manajerial/non manajerial tertentu, dan biasanya jabatan lama yang sudah non aktif karena perubahan organisasi',
  [PositionStatus.SE]: 'Akses lihat saja terhadap naskah dinas manajerial tertentu, dan biasanya jabatan BOD, atau BOD-1 yang diberikan untuk membantu administrasi/sebagai personal asisten',
  [PositionStatus.EXT]: 'Pihak di luar Company sebagai sender/receiver dalam Surat Dinas Eksternal',
};

/**
 * Get delegable position statuses (excludes YBS as it's the default/definitif role)
 */
export function getDelegablePositionStatuses(): PositionStatus[] {
  return [
    PositionStatus.PT,
    PositionStatus.PH,
    PositionStatus.PS,
    PositionStatus.VI,
    PositionStatus.SE,
  ];
}
