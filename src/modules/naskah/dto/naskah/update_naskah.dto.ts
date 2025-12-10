export class UpdateNaskahDto {
  jenis?: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA';
  klasifikasi?: string;
  klasifikasi_text?: string;
  sifat?: 'sangat_rahasia' | 'rahasia' | 'terbatas' | 'terbuka';
  nomor?: string;
  tanggal?: Date;
  lampiran?: string;
  perihal?: string;
  konten?: string;
  tempat?: string;
  status?: 'draf' | 'final' | 'final_tte';
  final_pdf?: string;
  english?: boolean;
}
