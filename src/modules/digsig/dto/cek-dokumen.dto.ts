import {
  IsString,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';

/**
 * DTO untuk Cek Dokumen
 * Fitur untuk verifikasi dokumen yang sudah ditandatangani BSrE
 */

// ======== Cek by File Upload ========
export class CekDokumenUploadDto {
  // File akan dihandle terpisah via multipart
}

// ======== Cek by Signature ID ========
export class CekDokumenBySignatureIdDto {
  @IsString()
  @IsNotEmpty({ message: 'Signature ID wajib diisi' })
  signatureId: string;
}

// ======== Cek by Document Name ========
export class CekDokumenByNameDocDto {
  @IsString()
  @IsNotEmpty({ message: 'Nama dokumen wajib diisi' })
  nameDoc: string;
}

// ======== Response DTOs ========

/**
 * Info Penanda Tangan
 * Semua data ini didapat dari BSrE API hasil parsing PDF signature
 */
export class SignerInfoDto {
  // Identitas Signer (dari Certificate Subject)
  nama: string; // Nama penandatangan dari certificate
  nik?: string; // NIK (jika ada di certificate)
  instansi?: string; // Organisasi/instansi
  email?: string; // Email (jika ada)
  
  // Certificate Info (dari Certificate Details)
  diterbitkanOleh?: string; // Issuer DN - contoh: "C=ID,O=Lembaga Sandi Negara,CN=OSD LU Kelas 2"
  subjectDN?: string; // Subject Distinguished Name (full)
  
  // Signature Details (dari Signature Properties)
  tanggalSign: string; // Timestamp saat ditandatangani - contoh: "08.03.2024 11:14:52"
  reason?: string; // Alasan penandatanganan - contoh: "Dokumen ini ditandatangani secara elektronik"
  location?: string; // Lokasi penandatanganan (jika ada)
  
  // Algorithm & Validity (dari Certificate)
  algoritmaTandatangan?: string; // Algorithm yang digunakan - contoh: "RSA with SHA256"
  validDari?: string; // Certificate valid from
  validHingga?: string; // Certificate valid until - contoh: "06.12.2025 08:40:33"
  
  // Verification Status (hasil verifikasi BSrE)
  valid: boolean; // Apakah signature valid
  certificateValid?: boolean; // Apakah certificate valid
  signatureValid?: boolean; // Apakah signature integrity valid
}

/**
 * Response Cek Dokumen
 * Data berasal dari:
 * - File upload: namaDokumen (nama file asli)
 * - BSrE API: semua field lainnya (hasil verifikasi PDF signature)
 */
export class CekDokumenResponseDto {
  success: boolean;
  message: string;
  data?: {
    // Document Info (dari file upload + BSrE)
    namaDokumen: string; // Nama file dokumen yang diupload/diverifikasi
    jumlahSignature: number; // Total signature dalam dokumen (dari BSrE)
    
    // Status (dari BSrE verification result)
    status: 'VALID' | 'WARNING' | 'INVALID' | 'UNKNOWN'; // Status keseluruhan dokumen
    keterangan?: string; // Deskripsi status - contoh: "Dokumen valid, Sertifikat yang digunakan terpercaya"
    isValid: boolean; // Boolean status valid/tidak
    
    // Signature Details (dari BSrE - array karena bisa multiple signatures)
    signers: SignerInfoDto[]; // List info penandatangan
    
    // Technical Verification Details (dari BSrE - untuk advanced info)
    verificationDetails?: {
      algorithm?: string;
      hashValid?: boolean; // Apakah document hash valid
      certificateChainValid?: boolean; // Apakah certificate chain valid
      timestampValid?: boolean; // Apakah timestamp valid
      revocationChecked?: boolean; // Apakah sudah dicek revocation status
      summary?: string; // BSrE summary status (VALID, WARNING, INVALID)
    };
    
    // Metadata
    verifiedAt?: string; // Timestamp saat verifikasi dilakukan
    
    // Raw response dari BSrE API (untuk debugging/troubleshooting)
    rawResponse?: any;
  };
}

// ======== BSrE API Response (actual structure from BSrE) ========
/**
 * Actual response structure dari BSrE API Verify
 * Based on real response:
 * {
 *   "nama_dokumen": "...",
 *   "jumlah_signature": 1,
 *   "notes": "Dokumen valid, Sertifikat yang digunakan tidak terpercaya",
 *   "details": [...],
 *   "summary": "WARNING"
 * }
 */
export interface BsreVerifyResponse {
  nama_dokumen?: string;
  jumlah_signature?: number;
  notes?: string;
  summary?: 'VALID' | 'WARNING' | 'INVALID' | string;
  details?: Array<{
    signature_field?: string;
    info_tsa?: {
      name?: string;
      tsa_cert_validity?: string | null;
    };
    info_signer?: {
      issuer_dn?: string;
      signer_name?: string;
      signer_cert_validity?: string;
      signer_dn?: string;
      cert_user_certified?: boolean;
    };
    signature_document?: {
      signed_using_tsa?: boolean;
      reason?: string;
      document_integrity?: boolean;
      signature_value?: string | null;
      signed_in?: string;
      location?: string;
      hash_value?: string | null;
    };
  }>;
  
  // Legacy fields (untuk backward compatibility)
  status?: boolean;
  message?: string;
  data?: any;
}
