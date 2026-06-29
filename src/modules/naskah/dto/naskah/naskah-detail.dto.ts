/**
 * DTO untuk Get Detail Naskah (Global untuk semua jenis naskah)
 * Semua field dikeluarkan, FE yang consume sesuai kebutuhan
 */

// Info sirkulasi (pengirim/penerima/tembusan)
export class SirkulasiDetailDto {
  id: string;
  sirkuler: string | null; // pengirim, penerima, tembusan
  company: string | null;
  company_text: string | null;
  area: string | null;
  area_text: string | null;
  sub_area: string | null;
  sub_area_text: string | null;
  organization: string | null;
  organization_text: string | null;
  position: string | null;
  position_text: string | null;
  position_status: string | null;
  id_sirkuler: string | null; // persnum
  nama_sirkuler: string | null;
  email: string | null;
  send_read_time: Date | null;
  send_read_user: string | null;
  is_draft: boolean;
  flag_favorit: boolean;
  flag_arsip: boolean;
  created_at: Date;
  updated_at: Date | null;
}

// Info lampiran
export class LampiranDetailDto {
  id: string;
  file_name: string | null;
  file_pdf: string | null;
  jenis: string | null;
}

// Info referensi surat
export class ReferensiDetailDto {
  id: string;
  ref_jenis: string | null;
  ref_pengirim: string | null;
  ref_tanggal: Date | null;
  ref_nomor: string | null;
  ref_perihal: string | null;
}

// Info khusus Disposisi (tabel di)
export class DisposisiDetailDto {
  id: string;
  kop_logo: string | null;
  kop_judul: string | null;
  nama_jabatan: string | null;
  nomor_agenda: string | null;
  tanggal_agenda: Date | null;
  surat_dari: string | null;
  tanggal: Date | null;
  nomor: string | null;
  perihal: string | null;
  klasifikasi: string | null;
  kepada_yth: string | null;
  disposisi: string | null;
  catatan: string | null;
  paraf: string | null;
}

// Info khusus Nota Dinas (tabel nd) - jika ada
export class NotaDinasDetailDto {
  id: string;
  // Tambahkan field dari tabel nd jika ada
}

// Main response
export class NaskahDetailResponseDto {
  success: boolean;
  message: string;
  data: {
    // Data utama dari tabel naskah
    id: string;
    jenis: string; // ND, SDI, SDE, DI, KA
    jenis_label: string;
    klasifikasi: string | null;
    klasifikasi_text: string | null;
    sifat: string | null;
    nomor: string | null;
    tanggal: Date | null;
    perihal: string | null;
    konten: string | null;
    lampiran: string | null;
    status: string; // draf, final, final_tte
    label_ttd: string | null; // TTE BSrE, QR Code, Tanpa TTE

    // Sirkulasi
    pengirim: SirkulasiDetailDto | null;
    penerima: SirkulasiDetailDto[];
    tembusan: SirkulasiDetailDto[];
    penerima_grup: { id: string; nama: string; position_ids: number[] }[];
    tembusan_grup: { id: string; nama: string; position_ids: number[] }[];

    // Lampiran files
    lampiran_files: LampiranDetailDto[];

    // Referensi surat
    referensi: ReferensiDetailDto[];

    // Dikirim oleh (siapa yang mengirim/finalize naskah pending, bisa delegasi)
    dikirim_oleh: {
      persnum: string;
      nama: string | null;
      position_text: string | null;
    } | null;

    // Data spesifik per jenis naskah
    detail_disposisi: DisposisiDetailDto | null; // Khusus jenis DI
    detail_nota_dinas: NotaDinasDetailDto | null; // Khusus jenis ND (jika ada)
  };
}
