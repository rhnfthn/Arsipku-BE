export class CreateNaskahReferensiDto {
  id_naskah?: string;
  ref_jenis?: 'ND' | 'SDI' | 'SDE';
  ref_pengirim?: string;
  ref_tanggal?: Date;
  ref_nomor?: string;
  ref_perihal?: string;
}
