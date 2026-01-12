import { Injectable, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as FormData from 'form-data';
import {
  CekDokumenResponseDto,
  BsreVerifyResponse,
} from '../dto/cek-dokumen.dto';
import { DigsigLogService } from './digsig-log.service';

/**
 * Service untuk fitur "Cek Dokumen"
 * Verifikasi dokumen yang sudah ditandatangani BSrE
 */
@Injectable()
export class CekDokumenService {
  private readonly bsreBaseUrl: string;
  private readonly bsreTimeout: number = 30000;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly digsigLogService: DigsigLogService,
  ) {
    // TODO: Ganti dengan URL BSrE verify endpoint yang benar
    this.bsreBaseUrl = this.configService.get<string>('BSRE_BASE_URL') || 'http://172.20.16.115:7000';
  }

  /**
   * Verifikasi dokumen dengan upload file PDF
   * @param file - File PDF yang akan diverifikasi
   * @param userPersnum - Persnum user yang melakukan verifikasi
   */
  async verifyByFile(
    file: Express.Multer.File,
    userPersnum: number,
  ): Promise<CekDokumenResponseDto> {
    try {
      // Validate file type
      if (file.mimetype !== 'application/pdf') {
        throw new BadRequestException('File harus berformat PDF');
      }

      // TODO: Implement actual BSrE API call
      // Endpoint: POST {bsreBaseUrl}/verify atau sesuai dokumentasi BSrE
      // const formData = new FormData();
      // formData.append('file', file.buffer, file.originalname);
      // const response = await firstValueFrom(
      //   this.httpService.post<BsreVerifyResponse>(
      //     `${this.bsreBaseUrl}/verify`,
      //     formData,
      //     {
      //       headers: formData.getHeaders(),
      //       timeout: this.bsreTimeout,
      //     },
      //   ),
      // );

      // Log verification attempt
      await this.digsigLogService.createLog({
        userPersnum: userPersnum,
        apiEndpoint: `${this.bsreBaseUrl}/verify`,
        action: 'verify',
        status: 'sukses',
        note: `Verifikasi file: ${file.originalname}`,
      });

      // TODO: Ganti dengan response dari BSrE API
      return {
        success: true,
        message: 'Fitur verifikasi dokumen via file upload belum tersedia. API BSrE verify endpoint belum dikonfigurasi.',
        data: {
          namaDokumen: file.originalname,
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
        apiEndpoint: `${this.bsreBaseUrl}/verify`,
        action: 'verify',
        status: 'gagal',
        note: `Gagal verifikasi file: ${file.originalname} - ${error.message}`,
      });

      if (error instanceof BadRequestException) {
        throw error;
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
        apiEndpoint: `${this.bsreBaseUrl}/verify/${signatureId}`,
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
        apiEndpoint: `${this.bsreBaseUrl}/verify/${signatureId}`,
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
        apiEndpoint: `${this.bsreBaseUrl}/verify/doc`,
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
        apiEndpoint: `${this.bsreBaseUrl}/verify/doc`,
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
   */
  private transformBsreResponse(bsreResponse: BsreVerifyResponse): CekDokumenResponseDto {
    if (!bsreResponse.status || !bsreResponse.data) {
      return {
        success: false,
        message: bsreResponse.message || 'Gagal memverifikasi dokumen',
      };
    }

    const data = bsreResponse.data;
    const isValid = data.is_valid || false;
    const status = data.status || (isValid ? 'VALID' : 'INVALID');

    return {
      success: true,
      message: isValid 
        ? 'Dokumen valid dan sudah ditandatangani' 
        : 'Dokumen tidak valid atau terdapat masalah pada signature',
      data: {
        namaDokumen: data.doc_name || data.file_name || 'Unknown',
        jumlahSignature: data.signature_count || data.signatures?.length || 0,
        status,
        keterangan: data.description || (isValid 
          ? 'Dokumen valid, Sertifikat yang digunakan terpercaya' 
          : 'Dokumen tidak valid'),
        isValid,
        signers: (data.signatures || []).map(s => ({
          // Identitas
          nama: s.name || '',
          nik: s.nik,
          instansi: s.institution,
          email: s.email,
          
          // Certificate
          diterbitkanOleh: s.issuer_dn,
          subjectDN: s.subject_dn,
          
          // Signature Details
          tanggalSign: s.signed_at || s.signing_time || '',
          reason: s.reason,
          location: s.location,
          
          // Algorithm & Validity
          algoritmaTandatangan: s.signature_algorithm,
          validDari: s.valid_from,
          validHingga: s.valid_to,
          
          // Verification
          valid: s.valid || false,
          certificateValid: s.certificate_valid,
          signatureValid: s.signature_valid,
        })),
        verificationDetails: data.verification ? {
          algorithm: data.verification.algorithm,
          hashValid: data.verification.hash_valid,
          certificateChainValid: data.verification.certificate_chain_valid,
          timestampValid: data.verification.timestamp_valid,
          revocationChecked: data.verification.revocation_checked,
        } : undefined,
        verifiedAt: data.verified_at || new Date().toISOString(),
        rawResponse: bsreResponse,
      },
    };
  }
}
