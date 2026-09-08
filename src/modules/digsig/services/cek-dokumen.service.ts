import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  CekDokumenResponseDto,
  BsreVerifyResponse,
} from '../dto/cek-dokumen.dto';
import { DigsigLogService } from './digsig-log.service';
import { StorageService } from '../../storage/services/storage.service';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import { NotificationService } from '../../notification/services';
import { NotificationType } from '../../notification/entities';

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
  private readonly bsreBasicAuthHeader: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly digsigLogService: DigsigLogService,
    private readonly storageService: StorageService,
    private readonly orgDataService: OrgDataService,
    private readonly notificationService: NotificationService,
  ) {
    this.bsreVerifyUrl =
      this.configService.get<string>('BSRE_VERIFY_URL') ||
      'http://172.20.8.68/api/v2/verify/pdf';
    this.bsreTimeout = this.configService.get<number>('BSRE_TIMEOUT') || 30000;

    // Basic Auth untuk BSrE API v2
    const basicUser = this.configService.get<string>('BSRE_BASIC_USER') || 'esign';
    const basicPass = this.configService.get<string>('BSRE_BASIC_PASS') || '';
    this.bsreBasicAuthHeader = `Basic ${Buffer.from(`${basicUser}:${basicPass}`).toString('base64')}`;
  }

  private async notifyVerificationResult(
    userPersnum: number,
    filename: string,
    message: string,
  ) {
    const userData = await this.orgDataService
      .findByPersnum(userPersnum)
      .catch(() => null);
    const positionId = userData?.position;
    if (!positionId) return;

    await this.notificationService.createNotification({
      positionId: String(positionId),
      userPersnum,
      type: NotificationType.DIGSIG_VERIFIKASI,
      title: 'Verifikasi dokumen selesai',
      body: `${filename}: ${message}`,
      data: {
        action: 'OPEN_DIGSIG_VERIFIKASI',
        filename,
      },
    });
  }

  /**
   * Verifikasi dokumen dengan upload file PDF
   * Flow (API v2):
   * 1. Validasi file PDF
   * 2. Kirim base64 PDF langsung ke BSrE API v2 (tidak perlu upload temp ke MinIO)
   * 3. Return hasil verifikasi
   *
   * @param file - File PDF yang akan diverifikasi
   * @param userPersnum - Persnum user yang melakukan verifikasi
   */
  async verifyByFile(
    file: Express.Multer.File,
    userPersnum: number,
    userName?: string,
    ipAddress?: string,
  ): Promise<CekDokumenResponseDto> {
    try {
      // Validate file type
      if (file.mimetype !== 'application/pdf') {
        throw new BadRequestException('File harus berformat PDF');
      }

      console.log(
        `[CekDokumenService] Verifying file: ${file.originalname}, size: ${file.size} bytes`,
      );

      // 1. Encode file ke base64 — API v2 menerima base64 langsung
      const fileB64 = file.buffer.toString('base64');

      // 2. Prepare payload sesuai BSrE API v2 spec
      //    file berupa STRING base64 (bukan array, beda dari endpoint sign)
      const payload = {
        file: fileB64,
      };

      console.log(
        `[CekDokumenService] Calling BSrE API v2: ${this.bsreVerifyUrl}`,
      );

      // 3. Hit BSrE Verify API v2 (Basic Auth)
      const response = await axios.post<BsreVerifyResponse>(
        this.bsreVerifyUrl,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: this.bsreBasicAuthHeader,
          },
          timeout: this.bsreTimeout,
        },
      );

      console.log(
        `[CekDokumenService] BSrE Response:`,
        JSON.stringify(response.data, null, 2),
      );

      // Log successful verification
      await this.digsigLogService.createLog({
        userPersnum: userPersnum,
        userName: userName || undefined,
        ipAddress: ipAddress || undefined,
        apiEndpoint: this.bsreVerifyUrl,
        action: 'verify',
        status: 'sukses',
        note: `Verifikasi file: ${file.originalname}`,
      });

      // Transform response dari BSrE ke format standar
      const result = this.transformBsreResponse(
        response.data,
        file.originalname,
      );
      this.notifyVerificationResult(
        userPersnum,
        file.originalname,
        result.message || 'Verifikasi selesai',
      ).catch((err) =>
        console.warn(
          `[CekDokumenService] Failed to send verification notification: ${err?.message}`,
        ),
      );

      return result;
    } catch (error) {
      console.error(`[CekDokumenService] Error verifying file:`, error.message);

      // Log failed verification
      await this.digsigLogService.createLog({
        userPersnum: userPersnum,
        userName: userName || undefined,
        ipAddress: ipAddress || undefined,
        apiEndpoint: this.bsreVerifyUrl,
        action: 'verify',
        status: 'gagal',
        note: `Gagal verifikasi file: ${file.originalname} - ${error.message}`,
      });

      if (error instanceof BadRequestException) {
        throw error;
      }

      // Handle axios error
      if (axios.isAxiosError(error)) {
        const status =
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
        const message =
          error.response?.data?.error ||
          error.response?.data?.message ||
          'Gagal memverifikasi dokumen dari BSrE';

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
    userName?: string,
    ipAddress?: string,
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
        userName: userName || undefined,
        ipAddress: ipAddress || undefined,
        apiEndpoint: `${this.bsreVerifyUrl}/${signatureId}`,
        action: 'verify',
        status: 'sukses',
        note: `Verifikasi signature ID: ${signatureId}`,
      });

      // TODO: Ganti dengan response dari BSrE API
      const result: CekDokumenResponseDto = {
        success: true,
        message:
          'Fitur verifikasi dokumen via signature ID belum tersedia. API BSrE verify endpoint belum dikonfigurasi.',
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
      this.notifyVerificationResult(
        userPersnum,
        signatureId,
        result.message,
      ).catch((err) =>
        console.warn(
          `[CekDokumenService] Failed to send verification notification: ${err?.message}`,
        ),
      );
      return result;
    } catch (error) {
      // Log failed verification
      await this.digsigLogService.createLog({
        userPersnum: userPersnum,
        userName: userName || undefined,
        ipAddress: ipAddress || undefined,
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
    userName?: string,
    ipAddress?: string,
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
        userName: userName || undefined,
        ipAddress: ipAddress || undefined,
        apiEndpoint: `${this.bsreVerifyUrl}/doc`,
        action: 'verify',
        status: 'sukses',
        note: `Verifikasi name_doc: ${nameDoc}`,
      });

      // TODO: Ganti dengan response dari BSrE API
      const result: CekDokumenResponseDto = {
        success: true,
        message:
          'Fitur verifikasi dokumen via name_doc belum tersedia. API BSrE verify endpoint belum dikonfigurasi.',
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
      this.notifyVerificationResult(userPersnum, nameDoc, result.message).catch(
        (err) =>
          console.warn(
            `[CekDokumenService] Failed to send verification notification: ${err?.message}`,
          ),
      );
      return result;
    } catch (error) {
      // Log failed verification
      await this.digsigLogService.createLog({
        userPersnum: userPersnum,
        userName: userName || undefined,
        ipAddress: ipAddress || undefined,
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
   * BSrE API v2 Response Format:
   * {
   *   "warning": [],
   *   "description": "Dokumen valid, Sertifikat yang digunakan tidak terpercaya",
   *   "conclusion": "WARNING" | "VALID" | "INVALID",
   *   "signatureCount": 1,
   *   "signatureInformations": [{
   *     "id": "S-...", "fieldName": "Signature1",
   *     "signatureFormat": "PAdES-BASELINE-T",
   *     "integrityValid": true, "certificateTrusted": false,
   *     "signatureDate": "...", "signerName": "...",
   *     "timestampInfomation": {...},
   *     "certificateDetails": [{ "issuerName": "...", "commonName": "...", ... }]
   *   }]
   * }
   *
   * Legacy v1 format (fallback):
   * { "nama_dokumen": "...", "jumlah_signature": 1, "notes": "...", "details": [...], "summary": "WARNING" }
   */
  private transformBsreResponse(
    bsreResponse: BsreVerifyResponse,
    filename?: string,
  ): CekDokumenResponseDto {
    // Handle jika response kosong atau tidak valid
    if (!bsreResponse) {
      return {
        success: false,
        message: 'Tidak ada response dari BSrE',
      };
    }

    // ===== Format API v2 (conclusion + signatureInformations) =====
    if (
      bsreResponse.conclusion !== undefined ||
      bsreResponse.signatureInformations !== undefined
    ) {
      const conclusion =
        (bsreResponse.conclusion as string) || 'UNKNOWN';
      const isValid = conclusion === 'VALID';
      const isWarning = conclusion === 'WARNING';

      // Map conclusion to status
      let status: 'VALID' | 'WARNING' | 'INVALID' | 'UNKNOWN' = 'UNKNOWN';
      if (conclusion === 'VALID') status = 'VALID';
      else if (conclusion === 'WARNING') status = 'WARNING';
      else if (conclusion === 'INVALID') status = 'INVALID';

      // Transform signatureInformations array to signers
      const signers = (bsreResponse.signatureInformations || []).map(
        (sig) => {
          const cert = sig.certificateDetails?.[0];
          return {
            // Identitas signer
            nama: sig.signerName || cert?.commonName || '',
            nik: undefined,
            instansi: undefined,
            email: undefined,

            // Certificate info
            diterbitkanOleh: cert?.issuerName,
            subjectDN: cert?.commonName,

            // Signature details
            tanggalSign: sig.signatureDate || '',
            reason: sig.reason || undefined,
            location: sig.location || undefined,

            // Algorithm & validity
            algoritmaTandatangan: cert?.signatureAlgoritm,
            validDari: cert?.notBeforeDate,
            validHingga: cert?.notAfterDate,

            // Verification status
            valid: sig.integrityValid ?? false,
            certificateValid: sig.certificateTrusted,
            signatureValid: sig.integrityValid,

            // Additional info
            signatureField: sig.fieldName,
            useTsa: !!sig.timestampInfomation,
            tsaName: sig.timestampInfomation?.signerName,
          };
        },
      );

      return {
        success: true,
        message: isValid
          ? 'Dokumen valid dan sudah ditandatangani'
          : isWarning
            ? 'Dokumen valid tetapi sertifikat tidak terpercaya'
            : 'Dokumen tidak valid',
        data: {
          namaDokumen: filename || 'Unknown',
          jumlahSignature: bsreResponse.signatureCount || signers.length,
          status,
          keterangan: bsreResponse.description || '',
          isValid: isValid || isWarning, // WARNING masih dianggap dokumen valid, hanya cert tidak trusted
          signers,
          verificationDetails: {
            summary: conclusion,
          },
          verifiedAt: new Date().toISOString(),
          rawResponse: bsreResponse,
        },
      };
    }

    // ===== Legacy v1 format (nama_dokumen, jumlah_signature, notes, details, summary) =====
    if (
      bsreResponse.nama_dokumen !== undefined ||
      bsreResponse.summary !== undefined
    ) {
      const summary = bsreResponse.summary || 'UNKNOWN';
      const isValid = summary === 'VALID';
      const isWarning = summary === 'WARNING';

      // Map summary to status
      let status: 'VALID' | 'WARNING' | 'INVALID' | 'UNKNOWN' = 'UNKNOWN';
      if (summary === 'VALID') status = 'VALID';
      else if (summary === 'WARNING') status = 'WARNING';
      else if (summary === 'INVALID') status = 'INVALID';

      // Transform details array to signers
      const signers = (bsreResponse.details || []).map((detail) => ({
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
