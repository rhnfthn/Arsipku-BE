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
    status: 'VALID' | 'INVALID' | 'UNKNOWN'; // Status keseluruhan dokumen
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
    };
    
    // Metadata
    verifiedAt?: string; // Timestamp saat verifikasi dilakukan
    
    // Raw response dari BSrE API (untuk debugging/troubleshooting)
    rawResponse?: any;
  };
}

// ======== BSrE API Response (expected structure) ========
/**
 * Expected response structure dari BSrE API Verify
 * Ini adalah struktur yang diharapkan dari BSrE setelah verifikasi PDF signature
 * 
 * BSrE akan melakukan:
 * 1. Parse PDF file
 * 2. Extract semua digital signatures
 * 3. Verify setiap signature (certificate validity, chain, revocation)
 * 4. Return detail setiap signer dan status verifikasi
 */
export interface BsreVerifyResponse {
  status: boolean; // Overall API call status
  message: string; // API message
  data?: {
    // Document Info (dari PDF metadata)
    doc_name?: string;
    file_name?: string;
    
    // Overall Verification Status
    is_valid?: boolean; // Apakah semua signature valid
    status?: 'VALID' | 'INVALID' | 'UNKNOWN';
    description?: string; // Deskripsi hasil verifikasi
    
    // Signatures (array karena PDF bisa punya multiple signatures)
    signature_count?: number;
    signatures?: Array<{
      // Signer Identity (dari Certificate Subject DN)
      name?: string; // Nama dari certificate CN (Common Name)
      nik?: string; // NIK jika tersimpan di certificate
      institution?: string; // Organization dari certificate
      email?: string; // Email jika ada di certificate
      
      // Certificate Details
      issuer_dn?: string; // Certificate Issuer - contoh: "C=ID,O=Lembaga Sandi Negara,CN=OSD LU Kelas 2"
      subject_dn?: string; // Full Subject DN
      
      // Signature Timestamp & Details
      signed_at?: string; // Waktu signature dibuat
      signing_time?: string; // Alternative timestamp field
      reason?: string; // Signature reason - contoh: "Dokumen ini ditandatangani secara elektronik"
      location?: string; // Signature location
      
      // Algorithm & Certificate Validity
      signature_algorithm?: string; // contoh: "RSA with SHA256"
      valid_from?: string; // Certificate valid from date
      valid_to?: string; // Certificate expiry date
      
      // Verification Results (hasil checking BSrE)
      valid?: boolean; // Overall signature validity
      certificate_valid?: boolean; // Certificate masih valid?
      signature_valid?: boolean; // Signature integrity valid?
    }>;
    
    // Technical Verification Details
    verification?: {
      algorithm?: string;
      hash_valid?: boolean; // Document hash integrity
      certificate_chain_valid?: boolean; // Certificate chain trusted?
      timestamp_valid?: boolean; // Timestamp valid?
      revocation_checked?: boolean; // Certificate revocation checked?
    };
    
    // Metadata
    verified_at?: string; // Timestamp verifikasi dilakukan
  };
}
