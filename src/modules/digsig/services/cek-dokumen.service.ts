import { Injectable, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  CekDokumenResponseDto,
  BsreVerifyResponse,
} from '../dto/cek-dokumen.dto';
import { DigsigLogService } from './digsig-log.service';
import { StorageService } from '../../storage/services/storage.service';

/**
 * Service untuk fitur "Cek Dokumen"
 * Verifikasi dokumen yang sudah ditandatangani BSrE
 * 
 * BSrE Verify API mengharapkan:
 * - Content-Type: application/json
 * - Payload: { filename: string, fileurl: string }
 */
@Injectable()
export class CekDokumenService {
  private readonly bsreVerifyUrl: string;
  private readonly bsreTimeout: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly digsigLogService: DigsigLogService,
    private readonly storageService: StorageService,
  ) {
    this.bsreVerifyUrl = this.configService.get<string>('BSRE_VERIFY_URL') || 'http://172.20.16.115:7000/verify';
    this.bsreTimeout = this.configService.get<number>('BSRE_TIMEOUT') || 30000;
  }

  /**
   * Verifikasi dokumen dengan upload file PDF
   * Flow:
   * 1. Upload file ke storage (temporary path)
   * 2. Get file URL dari storage
   * 3. Kirim filename + fileurl ke BSrE API
   * 4. Return hasil verifikasi
   * 
   * @param file - File PDF yang akan diverifikasi
   * @param userPersnum - Persnum user yang melakukan verifikasi
   */
  async verifyByFile(
    file: Express.Multer.File,
    userPersnum: number,
  ): Promise<CekDokumenResponseDto> {
    let tempFilePath: string | null = null;
    
    try {
      // Validate file type
      if (file.mimetype !== 'application/pdf') {
        throw new BadRequestException('File harus berformat PDF');
      }

      console.log(`[CekDokumenService] Verifying file: ${file.originalname}, size: ${file.size} bytes`);

      // 1. Upload file ke storage (folder khusus untuk cek dokumen/verifikasi)
      const folder = 'cek-dokumen';
      
      const uploadResult = await this.storageService.uploadBuffer(
        file.buffer,
        file.originalname,  // filename asli
        file.mimetype,
        folder,             // folder tujuan
      );
      
      // Gunakan key dari hasil upload (format: folder/timestamp-filename)
      tempFilePath = uploadResult.key;
      console.log(`[CekDokumenService] File uploaded to storage: ${tempFilePath}`);

      // 2. Get file URL dari storage (sudah ada di uploadResult)
      const fileUrl = uploadResult.url;
      console.log(`[CekDokumenService] File URL: ${fileUrl}`);

      // 3. Prepare payload sesuai BSrE API spec
      // Ambil filename dari key (tanpa folder prefix)
      const filenameForBsre = tempFilePath.split('/').pop() || file.originalname;
      const payload = {
        filename: filenameForBsre,
        fileurl: fileUrl,
      };

      console.log(`[CekDokumenService] Calling BSrE API: ${this.bsreVerifyUrl}`);
      console.log(`[CekDokumenService] Payload:`, JSON.stringify(payload, null, 2));

      // 4. Hit BSrE Verify API
      const response = await axios.post<BsreVerifyResponse>(
        this.bsreVerifyUrl,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: this.bsreTimeout,
        },
      );

      console.log(`[CekDokumenService] BSrE Response:`, JSON.stringify(response.data, null, 2));

      // Log successful verification
      await this.digsigLogService.createLog({
        userPersnum: userPersnum,
        apiEndpoint: this.bsreVerifyUrl,
        action: 'verify',
        status: 'sukses',
        note: `Verifikasi file: ${file.originalname}`,
      });

      // 5. Cleanup temp file (optional - bisa dihapus atau dibiarkan)
      try {
        await this.storageService.deleteFile(tempFilePath);
        console.log(`[CekDokumenService] Temp file deleted: ${tempFilePath}`);
      } catch (deleteError) {
        console.warn(`[CekDokumenService] Failed to delete temp file: ${deleteError.message}`);
      }

      // Transform response dari BSrE ke format standar
      return this.transformBsreResponse(response.data, file.originalname);
    } catch (error) {
      console.error(`[CekDokumenService] Error verifying file:`, error.message);
      
      // Log failed verification
      await this.digsigLogService.createLog({
        userPersnum: userPersnum,
        apiEndpoint: this.bsreVerifyUrl,
        action: 'verify',
        status: 'gagal',
        note: `Gagal verifikasi file: ${file.originalname} - ${error.message}`,
      });

      // Cleanup temp file on error
      if (tempFilePath) {
        try {
          await this.storageService.deleteFile(tempFilePath);
        } catch (deleteError) {
          console.warn(`[CekDokumenService] Failed to delete temp file on error: ${deleteError.message}`);
        }
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      // Handle axios error
      if (axios.isAxiosError(error)) {
        const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
        const message = error.response?.data?.message || error.response?.data?.error || 'Gagal memverifikasi dokumen dari BSrE';
        
        throw new HttpException(
          {
            success: false,
            message,
            source: 'bsre-verify',
            detail: error.response?.data,
          },
          status,
        );
      }

      return {
        success: false,
        message: `Gagal memverifikasi dokumen: ${error.message}`,
      };
    }
  }

  /**
   * Verifikasi dokumen berdasarkan Signature ID
   * @param signatureId - ID signature dari BSrE
   * @param userPersnum - Persnum user yang melakukan verifikasi
   */
  async verifyBySignatureId(
    signatureId: string,
    userPersnum: number,
  ): Promise<CekDokumenResponseDto> {
    try {
      // TODO: Implement actual BSrE API call
      // Endpoint: GET {bsreBaseUrl}/verify/{signatureId} atau sesuai dokumentasi
      // const response = await firstValueFrom(
      //   this.httpService.get<BsreVerifyResponse>(
      //     `${this.bsreBaseUrl}/verify/${signatureId}`,
      //     { timeout: this.bsreTimeout },
      //   ),
      // );

      // Log verification attempt
      await this.digsigLogService.createLog({
        userPersnum: userPersnum,
        apiEndpoint: `${this.bsreVerifyUrl}/${signatureId}`,
        action: 'verify',
        status: 'sukses',
        note: `Verifikasi signature ID: ${signatureId}`,
      });

      // TODO: Ganti dengan response dari BSrE API
      return {
        success: true,
        message: 'Fitur verifikasi dokumen via signature ID belum tersedia. API BSrE verify endpoint belum dikonfigurasi.',
        data: {
          namaDokumen: 'Unknown',
          jumlahSignature: 0,
          status: 'UNKNOWN',
          keterangan: 'Verifikasi belum tersedia',
          isValid: false,
          signers: [],
          verificationDetails: {},
          verifiedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      // Log failed verification
      await this.digsigLogService.createLog({
        userPersnum: userPersnum,
        apiEndpoint: `${this.bsreVerifyUrl}/${signatureId}`,
        action: 'verify',
        status: 'gagal',
        note: `Gagal verifikasi signature ID: ${signatureId} - ${error.message}`,
      });

      return {
        success: false,
        message: `Gagal memverifikasi dokumen: ${error.message}`,
      };
    }
  }

  /**
   * Verifikasi dokumen berdasarkan nama dokumen (name_doc dari BSrE)
   * @param nameDoc - Nama dokumen yang diberikan BSrE setelah signing
   * @param userPersnum - Persnum user yang melakukan verifikasi
   */
  async verifyByNameDoc(
    nameDoc: string,
    userPersnum: number,
  ): Promise<CekDokumenResponseDto> {
    try {
      // TODO: Implement actual BSrE API call
      // Endpoint: POST {bsreBaseUrl}/verify/doc atau sesuai dokumentasi
      // const response = await firstValueFrom(
      //   this.httpService.post<BsreVerifyResponse>(
      //     `${this.bsreBaseUrl}/verify/doc`,
      //     { name_doc: nameDoc },
      //     { timeout: this.bsreTimeout },
      //   ),
      // );

      // Log verification attempt
      await this.digsigLogService.createLog({
        userPersnum: userPersnum,
        apiEndpoint: `${this.bsreVerifyUrl}/doc`,
        action: 'verify',
        status: 'sukses',
        note: `Verifikasi name_doc: ${nameDoc}`,
      });

      // TODO: Ganti dengan response dari BSrE API
      return {
        success: true,
        message: 'Fitur verifikasi dokumen via name_doc belum tersedia. API BSrE verify endpoint belum dikonfigurasi.',
        data: {
          namaDokumen: nameDoc,
          jumlahSignature: 0,
          status: 'UNKNOWN',
          keterangan: 'Verifikasi belum tersedia',
          isValid: false,
          signers: [],
          verificationDetails: {},
          verifiedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      // Log failed verification
      await this.digsigLogService.createLog({
        userPersnum: userPersnum,
        apiEndpoint: `${this.bsreVerifyUrl}/doc`,
        action: 'verify',
        status: 'gagal',
        note: `Gagal verifikasi name_doc: ${nameDoc} - ${error.message}`,
      });

      return {
        success: false,
        message: `Gagal memverifikasi dokumen: ${error.message}`,
      };
    }
  }

  /**
   * Helper untuk transform response BSrE ke format standar
   * 
   * BSrE Response Format:
   * {
   *   "nama_dokumen": "...",
   *   "jumlah_signature": 1,
   *   "notes": "Dokumen valid, Sertifikat yang digunakan tidak terpercaya",
   *   "details": [...],
   *   "summary": "WARNING" | "VALID" | "INVALID"
   * }
   */
  private transformBsreResponse(bsreResponse: BsreVerifyResponse, filename?: string): CekDokumenResponseDto {
    // Handle jika response kosong atau tidak valid
    if (!bsreResponse) {
      return {
        success: false,
        message: 'Tidak ada response dari BSrE',
      };
    }

    // Handle actual BSrE response format (nama_dokumen, jumlah_signature, notes, details, summary)
    if (bsreResponse.nama_dokumen !== undefined || bsreResponse.summary !== undefined) {
      const summary = bsreResponse.summary || 'UNKNOWN';
      const isValid = summary === 'VALID';
      const isWarning = summary === 'WARNING';
      
      // Map summary to status
      let status: 'VALID' | 'INVALID' | 'UNKNOWN' = 'UNKNOWN';
      if (summary === 'VALID') status = 'VALID';
      else if (summary === 'WARNING' || summary === 'INVALID') status = 'INVALID';

      // Transform details array to signers
      const signers = (bsreResponse.details || []).map(detail => ({
        // Identitas dari info_signer
        nama: detail.info_signer?.signer_name || '',
        nik: undefined,
        instansi: undefined,
        email: undefined,
        
        // Certificate dari info_signer
        diterbitkanOleh: detail.info_signer?.issuer_dn,
        subjectDN: detail.info_signer?.signer_dn,
        
        // Signature Details dari signature_document
        tanggalSign: detail.signature_document?.signed_in || '',
        reason: detail.signature_document?.reason,
        location: detail.signature_document?.location,
        
        // Certificate Validity dari info_signer
        validDari: detail.info_signer?.signer_cert_validity?.split(' to ')[0],
        validHingga: detail.info_signer?.signer_cert_validity?.split(' to ')[1],
        
        // Verification status
        valid: detail.signature_document?.document_integrity || false,
        certificateValid: detail.info_signer?.cert_user_certified,
        signatureValid: detail.signature_document?.document_integrity,
        
        // Additional info
        signatureField: detail.signature_field,
        useTsa: detail.signature_document?.signed_using_tsa,
        tsaName: detail.info_tsa?.name,
      }));

      return {
        success: true,
        message: isValid 
          ? 'Dokumen valid dan sudah ditandatangani' 
          : isWarning
            ? 'Dokumen valid tetapi sertifikat tidak terpercaya'
            : 'Dokumen tidak valid',
        data: {
          namaDokumen: bsreResponse.nama_dokumen || filename || 'Unknown',
          jumlahSignature: bsreResponse.jumlah_signature || 0,
          status,
          keterangan: bsreResponse.notes || '',
          isValid: isValid || isWarning, // WARNING masih dianggap dokumen valid, hanya cert tidak trusted
          signers,
          verificationDetails: {
            summary: bsreResponse.summary,
          },
          verifiedAt: new Date().toISOString(),
          rawResponse: bsreResponse,
        },
      };
    }

    // Legacy format handling (untuk backward compatibility)
    const legacyStatus = bsreResponse.status;
    const legacyData = bsreResponse.data;

    if (legacyStatus === false || (!legacyData && !bsreResponse.message)) {
      return {
        success: false,
        message: bsreResponse.message || 'Gagal memverifikasi dokumen',
      };
    }

    // Fallback - response ada tapi format tidak dikenali
    return {
      success: true,
      message: 'Verifikasi selesai',
      data: {
        namaDokumen: filename || 'Unknown',
        jumlahSignature: 0,
        status: 'UNKNOWN',
        keterangan: 'Format response tidak dikenali',
        isValid: false,
        signers: [],
        verificationDetails: {},
        verifiedAt: new Date().toISOString(),
        rawResponse: bsreResponse,
      },
    };
  }
}
