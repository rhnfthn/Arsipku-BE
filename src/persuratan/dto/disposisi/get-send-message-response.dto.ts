// Response DTO untuk get-send-message (list pesan yang sudah dikirim)

// Info sirkulasi singkat
export class SirkulasiInfoDto {
  position_id: string;
  position_text: string;
  organization_text: string;
  nama: string | null;
}

// Info petunjuk disposisi
export class PetunjukInfoDto {
  kode: string;
  label: string;
  catatan?: string;
}

// Data per naskah/pesan yang sudah dikirim
export class SentMessageItemDto {
  id: string;
  jenis: string;
  nomor: string | null; // ref_nomor_surat
  perihal: string | null; // ref_perihal_surat
  tanggal: Date;
  sifat: string;
  status: string; // draf, final, final_tte
  pengirim: SirkulasiInfoDto;
  penerima: SirkulasiInfoDto[];
  petunjuk_disposisi?: PetunjukInfoDto[];
  jumlah_lampiran: number;
  created_at?: Date;
}

// Main response
export class GetSendMessageResponseDto {
  success: boolean;
  message: string;
  total: number;
  data: SentMessageItemDto[];
}
