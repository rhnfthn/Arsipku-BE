/**
 * Response DTO untuk info posisi dalam konsep
 */
export class KonsepPositionInfoDto {
  position_id: number;
  position_text: string;
  persnum: number | null;
  nama: string | null;
  organization_id: number;
  organization_text: string;
  sub_area: number | null;
  sub_area_text: string | null;
  area: string | null;
  area_text: string | null;
  actor: string; // 'pembuat' | 'penerima' | 'penerus'
}

/**
 * Response DTO untuk detail konsep
 */
export class KonsepDetailDto {
  id: string;
  id_naskah: string | null;
  jenis: 'ND' | 'SDI' | 'SDE' | null;
  
  from: KonsepPositionInfoDto;
  to: KonsepPositionInfoDto;

  // Naskah info
  perihal: string | null;
  konten: string | null;
  klasifikasi: string | null;
  klasifikasi_text: string | null;
  sifat: string | null;
  status: string | null; // draf/final/final_tte

  catatan: string | null;
  
  send_read_time: Date | null;
  send_read_user: string | null;

  flag_favorit: boolean;
  flag_note: boolean;
  flag_arsip: boolean;

  create_at: Date;
  update_at: Date;

  // Lampiran
  lampiran?: Array<{
    id: string;
    nama_file: string;
    url: string;
  }>;
}

/**
 * Response DTO untuk list konsep (inbox/sent)
 */
export class KonsepListItemDto {
  id: string;
  id_naskah: string | null;
  jenis: 'ND' | 'SDI' | 'SDE' | null;

  from_position_id: string;
  from_position_text: string;
  from_nama: string | null;
  from_actor: string | null; // 'pembuat' | 'penerus'

  to_position_id: string;
  to_position_text: string;
  to_nama: string | null;
  to_actor: string | null; // 'penerima'

  perihal: string | null;
  status: string | null;
  catatan: string | null;

  send_read_time: Date | null;
  is_read: boolean;

  create_at: Date;
}

/**
 * Response DTO untuk create konsep
 */
export class CreateKonsepResponseDto {
  success: boolean;
  message: string;
  data?: {
    id_konsep: string;
    id_naskah: string;
    jenis: 'ND' | 'SDI' | 'SDE';
    from: KonsepPositionInfoDto;
    to: KonsepPositionInfoDto;
    status: 'final' | 'final_tte';
  };
}

/**
 * Response DTO untuk review konsep
 */
export class ReviewKonsepResponseDto {
  success: boolean;
  message: string;
  data?: {
    id_konsep: string;
    action: 'approve' | 'revisi' | 'reject';
    forward_to?: KonsepPositionInfoDto;
    status: string;
  };
}

/**
 * Response DTO untuk finalize konsep
 */
export class FinalizeKonsepResponseDto {
  success: boolean;
  message: string;
  data?: {
    id_konsep: string;
    id_naskah: string;
    nomor_surat: string;
    status: 'final' | 'final_tte';
    penerima: Array<{
      position_id: number;
      position_text: string;
      nama: string | null;
    }>;
    tembusan?: Array<{
      position_id: number;
      position_text: string;
      nama: string | null;
    }>;
  };
}

/**
 * Response DTO untuk inbox konsep
 */
export class KonsepInboxResponseDto {
  success: boolean;
  message: string;
  total: number;
  data: KonsepListItemDto[];
}

/**
 * Response DTO untuk sent konsep
 */
export class KonsepSentResponseDto {
  success: boolean;
  message: string;
  total: number;
  data: KonsepListItemDto[];
}

/**
 * Response DTO untuk forward konsep
 */
export class ForwardKonsepResponseDto {
  success: boolean;
  message: string;
  data?: {
    id_konsep: string;
    id_naskah: string;
    jenis: 'ND' | 'SDI' | 'SDE';
    from: KonsepPositionInfoDto;
    to: KonsepPositionInfoDto;
  };
}
