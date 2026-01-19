import {
  Injectable,
  NotFoundException,
  HttpException,
  BadRequestException,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StorageService } from '../../storage/services/storage.service';
import { NdEntity } from '../../nota-dinas/entities/nd.entity';
import { SdiSdeEntity } from '../../surat-dinas-internal/entities/sdi_sde.entity';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../../shared/entities/naskah_sirkulasi.entity';
import { Session } from '../../auth/entities/session.entity';
import { formatSignatureData, generateSignatureId } from '../../../common/helpers/signature.helper';
import { QRCodeService, QRCodeData } from './qrcode.service';
import { DigsigLogService } from './digsig-log.service';
import { GeneratePdfNodinService } from '../../generate_pdf/services/generate_pdf_nodin.service';
import { GeneratePdfSudinService } from '../../generate_pdf/services/generate_pdf_sudin.service';
import { SubAreaAlamatService } from '../../sub-area-alamat/services/sub_area_alamat.service';
import axios, { AxiosError } from 'axios';

export interface DigsigParams {
  key: string; // key minio (path lengkap)
  filename: string; // filename.pdf
  nomorDokumen: string;
  tanggalDokumen: string;
  klasifikasi: string;
  jenisNaskah: string;
  perihal: string;
  nik: string;
  passphrase: string;
  path_dokumen: string;
  no_wa: string;
}

export interface VerifyDigsigParams {
  filename: string; // filename.pdf
  fileurl: string;
}

/**
 * Optional context for logging BSrE activities
 * Pass this to hitDigsigEndpoint for automatic logging
 */
export interface DigsigLogContext {
  userPersnum: number;
  userName?: string;
  idNaskah?: string;
  jenisNaskah?: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA';
  ipAddress?: string;
}

export interface DigsigResponse {
  status: string;
  message: string;
  doc_id?: string;
  signed_file_path?: string;
  data?: any;
}

export interface SignResultResponse {
  message: string;
  data: DigsigResponse;
  signature_metadata: {
    type: string;
    doc_id: string | null;
    signed_at: string;
    signer_nik: string | null;
    path: string | null;
  };
}

export interface SignInternalResultResponse {
  message: string;
  signature_metadata: {
    type: string;
    signature_id: string;
    signed_at: string;
    signer_id: string | null;
    signer_name: string | null;
    signer_jabatan: string | null;
    path: string | null;
  };
}

// Default passphrase untuk testing
const DEFAULT_PASSPHRASE = '12345';

// Default COMPANY_ID
const COMPANY_ID = process.env.COMPANY_ID || '1000';

// Base URL untuk verifikasi (ganti dengan URL production nanti)
const VERIFICATION_BASE_URL = process.env.VERIFICATION_URL || 'https://arsipku.airnavindonesia.co.id/verify';

// BSrE API Endpoints
const BSRE_SIGNIN_URL = process.env.BSRE_SIGNIN_URL || 'http://172.20.16.115:7000/signin';
const BSRE_VERIFY_URL = process.env.BSRE_VERIFY_URL || 'http://172.20.16.115:7000/verify';

@Injectable()
export class DigsigService {
  constructor(
    private readonly storageService: StorageService,
    private readonly qrCodeService: QRCodeService,
    private readonly digsigLogService: DigsigLogService,
    private readonly generatePdfNodinService: GeneratePdfNodinService,
    private readonly generatePdfSudinService: GeneratePdfSudinService,
    private readonly subAreaAlamatService: SubAreaAlamatService,
    @InjectRepository(NdEntity)
    private readonly ndRepository: Repository<NdEntity>,
    @InjectRepository(SdiSdeEntity)
    private readonly sdiSdeRepository: Repository<SdiSdeEntity>,
    @InjectRepository(NaskahEntity)
    private readonly naskahRepository: Repository<NaskahEntity>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(NaskahSirkulasi)
    private readonly naskahSirkulasiRepository: Repository<NaskahSirkulasi>,
  ) {}



  /**
   * Hit Digsig API Endpoint
   * @param params - DigsigParams for BSrE API
   * @param logContext - Optional context for logging (currently unused, for future logging)
   */
  async hitDigsigEndpoint(params: DigsigParams, logContext?: DigsigLogContext) {
    try {
      console.log('[DigsigService] hitDigsigEndpoint - Starting...');
      console.log('[DigsigService] Params:', {
        key: params.key,
        filename: params.filename,
        nik: params.nik,
        no_wa: params.no_wa,
        nomorDokumen: params.nomorDokumen,
        jenisNaskah: params.jenisNaskah,
      });

      // 1. Ambil file dari MinIO
      console.log('[DigsigService] Fetching file from MinIO:', params.key);
      const buffer = await this.storageService.getFile(params.key);
      console.log('[DigsigService] File fetched, size:', buffer.length, 'bytes');
      const base64File = buffer.toString('base64');
      const dokumenName = params.filename;

      const timestamp = Date.now();
      const newDokumenName = dokumenName.replace(/\.pdf$/i, `-${timestamp}.pdf`);

      // 2. Payload sesuai spesifikasi
      const payload = {
        tanggalDokumen: params.tanggalDokumen,
        klasifikasi: params.klasifikasi,
        jenisNaskah: params.jenisNaskah,
        perihal: params.perihal,
        dokumen: [
          {
            nomorDokumen: params.nomorDokumen,
            filename: newDokumenName,
            data: base64File,
          },
        ],
        nik: params.nik,
        passphrase: params.passphrase,
        no_wa: params.no_wa,
        path_dokumen: params.path_dokumen,
        jenis_ttd_digital: 'Digsig',
        tampilan_ttd_digital: 'INVISIBLE',
        ttd64: '',
        tag: '',
      };

      console.log('[DigsigService] Payload prepared, hitting BSrE API...');
      console.log('[DigsigService] BSrE URL:', BSRE_SIGNIN_URL);

      // 3. Hit endpoint
      const response = await axios.post(
        BSRE_SIGNIN_URL,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );

      console.log('[DigsigService] BSrE Response:', response.data);

      // Log success if context provided
      console.log('[DigsigService] logContext received:', logContext);
      if (logContext) {
        try {
          console.log('[DigsigService] Attempting to log success...');
          const logResult = await this.digsigLogService.logSignActivity({
            userPersnum: logContext.userPersnum,
            userName: logContext.userName,
            ipAddress: logContext.ipAddress,
            idNaskah: logContext.idNaskah,
            nomorNaskah: params.nomorDokumen,
            jenisNaskah: logContext.jenisNaskah,
            apiEndpoint: 'POST /signin',
            status: 'sukses',
            note: 'BSrE signing berhasil',
            bsreResponse: response.data,
          });
          console.log('[DigsigService] Log saved successfully:', logResult.id);
        } catch (logError) {
          console.error('[DigsigService] Failed to log success:', logError);
        }
      } else {
        console.log('[DigsigService] No logContext provided - skipping logging');
      }

      return response.data;
    } catch (error: any) {
      // Log failure if context provided
      console.log('[DigsigService] Error occurred, logContext:', logContext);
      if (logContext) {
        try {
          console.log('[DigsigService] Attempting to log failure...');
          const logResult = await this.digsigLogService.logSignActivity({
            userPersnum: logContext.userPersnum,
            userName: logContext.userName,
            ipAddress: logContext.ipAddress,
            idNaskah: logContext.idNaskah,
            nomorNaskah: params.nomorDokumen,
            jenisNaskah: logContext.jenisNaskah,
            apiEndpoint: 'POST /signin',
            status: 'gagal',
            note: axios.isAxiosError(error) ? (error.response?.data?.message || error.message) : error.message,
            bsreResponse: axios.isAxiosError(error) ? error.response?.data : { error: error.message },
          });
          console.log('[DigsigService] Failure log saved:', logResult.id);
        } catch (logError) {
          console.error('[DigsigService] Failed to log failure:', logError);
        }
      } else {
        console.log('[DigsigService] No logContext for failure - skipping logging');
      }

      if (axios.isAxiosError(error)) {
        console.error('[DigsigService] Axios Error Message:', error.message);
        console.error('[DigsigService] Status:', error.response?.status);
        console.error('[DigsigService] Response Data:', JSON.stringify(error.response?.data, null, 2));
        console.error('[DigsigService] Request URL:', error.config?.url);
        const status =
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;

        const message =
          error.response?.data?.message ||
          error.response?.data?.error ||
          'Gagal mengambil data dari service external';

        // 🔥 lempar ulang ke controller
        throw new HttpException(
          {
            success: false,
            message,
            source: 'external-service',
            detail: error.response?.data,
          },
          status,
        );
      }
      console.error('[DigsigService] Unexpected Error:', error);
      throw new HttpException(
        {
          success: false,
          message: 'Unexpected error',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Mendapatkan AirNav Access Token dari session berdasarkan persnum
   * Token ini digunakan untuk mengakses HR API
   * @param persnum - Persnum user yang login
   * @returns Token string untuk Authorization header
   */
  private async getAirnavTokenFromSession(persnum: number): Promise<string> {
    // Cari session terbaru dari user berdasarkan persnum
    const session = await this.sessionRepository.findOne({
      where: { userPersnum: persnum },
      order: { createdAt: 'DESC' }, // Ambil session terbaru
    });

    if (!session) {
      throw new BadRequestException(
        'Session tidak ditemukan. Silakan login ulang untuk melanjutkan.',
      );
    }

    // Check apakah token sudah expired
    if (new Date() > new Date(session.airnavExpiredAt)) {
      throw new BadRequestException(
        'Token AirNav sudah expired. Silakan login ulang untuk melanjutkan.',
      );
    }

    return session.airnavAccessToken;
  }

  /**
   * Get NIK/KTP user dari HR API berdasarkan persnum
   * Token diambil dari session user yang sedang login
   * @param params.persnum - Persnum user yang login
   * @returns Object containing noktp (NIK 16 digit)
   */
  async getKTPUser(params: { persnum: string }): Promise<{ noktp: string }> {
    try {
      // Ambil token dari session berdasarkan persnum
      const token = await this.getAirnavTokenFromSession(Number(params.persnum));
      
      const response = await axios.get(
        `https://api.airnavindonesia.co.id/dataset-dev/hc/personal-ids/${params.persnum}`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          timeout: 30000,
        },
      );
      const data = response.data?.data ?? [];
      // subType '01' = KTP
      const filterktp = data.find((x) => x.subType === '01');
      if (!filterktp) {
        throw new BadRequestException('Data KTP dengan subType 01 tidak ditemukan');
      }
      return {
        noktp: filterktp.number
      };
    } catch (error: any) {
      // Re-throw BadRequestException dari getAirnavTokenFromSession
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      if (axios.isAxiosError(error)) {
        console.error('Axios Error Message:', error.message);
        console.error('Status:', error.response?.status);
        console.error('Response Data:', error.response?.data);
        const status =
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;

        const message =
          error.response?.data?.message ||
          error.response?.data?.error ||
          error.response?.data?.errors ||
          'Gagal mengambil data KTP dari HR API';

        throw new HttpException(
          {
            success: false,
            message,
            error: error instanceof Error ? error.message : String(error),
          },
          status,
        );
      }
      const msgerror = error?.message ?? 'Unexpected error';
      console.error('Unexpected Error:', error);
      throw new HttpException(
        {
          success: false,
          message: msgerror,
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get nomor HP/WhatsApp user dari HR API berdasarkan persnum
   * Token diambil dari session user yang sedang login
   * @param params.persnum - Persnum user yang login
   * @returns Object containing no_wa (nomor WhatsApp)
   */
  async getPhoneUser(params: { persnum: string }): Promise<{ no_wa: string }> {
    try {
      // Ambil token dari session berdasarkan persnum
      const token = await this.getAirnavTokenFromSession(Number(params.persnum));
      
      const response = await axios.get(
        `https://api.airnavindonesia.co.id/dataset-dev/hc/communication-infos/${params.persnum}`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          timeout: 30000,
        },
      );
      const data = response.data?.data ?? [];
      // commType '2' = Mobile Phone / WhatsApp
      const phoneData = data.find((x) => x.commType === '2');
      if (!phoneData) {
        throw new BadRequestException('Data nomor HP/WhatsApp tidak ditemukan');
      }
      
      // Format nomor dengan prefix +62 jika diperlukan
      let no_wa = phoneData.id;
      if (no_wa && no_wa.startsWith('0')) {
        no_wa = '+62' + no_wa.substring(1);
      } else if (no_wa && !no_wa.startsWith('+')) {
        no_wa = '+' + no_wa;
      }
      
      return { no_wa };
    } catch (error: any) {
      // Re-throw BadRequestException dari getAirnavTokenFromSession
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      if (axios.isAxiosError(error)) {
        console.error('Axios Error getting phone:', error.message);
        const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
        const message = error.response?.data?.message || 'Gagal mengambil data nomor HP dari HR API';

        throw new HttpException(
          {
            success: false,
            message,
            error: error instanceof Error ? error.message : String(error),
          },
          status,
        );
      }
      throw new HttpException(
        {
          success: false,
          message: 'Gagal mengambil data nomor HP',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get data user untuk BSrE signing (NIK dan no_wa) dari HR API
   * @param persnum - Persnum user yang login
   * @returns Object containing nik dan no_wa
   */
  async getUserDataForBsre(persnum: string): Promise<{ nik: string; no_wa: string }> {
    console.log(`[DigsigService] Getting user data for BSrE, persnum: ${persnum}`);
    
    // Fetch NIK terlebih dahulu (wajib)
    const ktpResult = await this.getKTPUser({ persnum });
    
    // Fetch phone (optional - tidak block jika gagal)
    let no_wa = '';
    try {
      const phoneResult = await this.getPhoneUser({ persnum });
      no_wa = phoneResult.no_wa;
    } catch (error) {
      console.warn(`[DigsigService] Gagal mengambil nomor HP untuk persnum ${persnum}:`, error.message);
      // Jika phone tidak tersedia, gunakan placeholder atau kosong
      // BSrE mungkin tetap bisa berjalan tanpa no_wa tergantung konfigurasi
      no_wa = '';
    }

    console.log(`[DigsigService] NIK: ${ktpResult.noktp}, Phone: ${no_wa || '(tidak tersedia)'}`);
    
    return {
      nik: ktpResult.noktp,
      no_wa: no_wa,
    };
  }

  // ============================================
  // SIGN DENGAN BSrE - Auto-fetch NIK dan no_wa
  // ============================================

  /**
   * Sign Nota Dinas dengan BSrE (NIK dan no_wa otomatis dari HR API)
   * @param idNaskah - ID dari tabel naskah
   * @param dto - Object containing passphrase dan optional klasifikasi
   * @param persnum - Persnum user yang login (untuk fetch NIK dan no_wa)
   */
  async signNotaDinasBsre(
    idNaskah: string,
    dto: { passphrase: string; klasifikasi?: string },
    persnum: number,
  ): Promise<SignResultResponse> {
    console.log(`[DigsigService] signNotaDinasBsre - idNaskah: ${idNaskah}, persnum: ${persnum}`);

    // 1. Fetch NIK dan no_wa dari HR API
    const userData = await this.getUserDataForBsre(persnum.toString());
    console.log(`[DigsigService] User data fetched - NIK: ${userData.nik}, no_wa: ${userData.no_wa}`);

    // 2. Cari naskah berdasarkan idNaskah
    const naskah = await this.naskahRepository.findOne({
      where: { id: idNaskah },
    });

    if (!naskah) {
      throw new NotFoundException(`Naskah dengan ID ${idNaskah} tidak ditemukan`);
    }

    // Validasi jenis naskah
    if (naskah.jenis !== 'ND') {
      throw new BadRequestException('Naskah bukan Nota Dinas');
    }

    // Cari nota dinas berdasarkan id_naskah
    const nd = await this.ndRepository.findOne({ where: { idNaskah } });
    if (!nd) {
      throw new NotFoundException(`Nota Dinas dengan id_naskah ${idNaskah} tidak ditemukan`);
    }

    if (!naskah.final_pdf) {
      throw new BadRequestException(
        'Dokumen PDF belum di-generate. Harap generate PDF terlebih dahulu',
      );
    }

    // 3. Prepare params untuk digsig
    const filename = naskah.final_pdf.split('/').pop() || 'document.pdf';
    const key = naskah.final_pdf;

    const params: DigsigParams = {
      key: key,
      filename: filename,
      nomorDokumen: nd.nomor || naskah.nomor || '-',
      tanggalDokumen: naskah.tanggal
        ? new Date(naskah.tanggal).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      klasifikasi: dto.klasifikasi || naskah.klasifikasi || 'Biasa',
      jenisNaskah: 'Nota Dinas',
      perihal: nd.perihal || naskah.perihal || '-',
      nik: userData.nik,
      passphrase: dto.passphrase,
      path_dokumen: 'nota-dinas/digsig/',
      no_wa: userData.no_wa,
    };

    // 4. Hit digsig endpoint
    const response = await this.hitDigsigEndpoint(params);

    // 5. Generate QR Code (BSrE tidak return QR, jadi dibuat internal)
    const signedAt = new Date().toISOString();
    const signatureId = generateSignatureId();
    const documentNumber = nd.nomor || naskah.nomor || '-';
    const signerName = nd.namaLengkap || 'Penandatangan';
    const signerJabatan = nd.namaJabatan || 'Jabatan';
    const verificationUrl = `${VERIFICATION_BASE_URL}/${signatureId}`;
    const finalPdfPath = naskah.final_pdf;
    const pdfUrl = finalPdfPath ? this.storageService.getPublicUrl(finalPdfPath) : undefined;

    const qrData: QRCodeData = {
      signature_id: signatureId,
      document_number: documentNumber,
      signed_at: signedAt,
      signer_name: signerName,
      signer_jabatan: signerJabatan,
      document_type: 'Nota Dinas',
      verification_url: verificationUrl,
      pdf_url: pdfUrl,
    };

    // 6. Regenerate PDF dengan QR code
    try {
      if (finalPdfPath) {
        await this.regenerateNdPdfWithQRCode(naskah, nd, qrData);
      }
    } catch (error) {
      console.error('[DigsigService] Failed to regenerate PDF with QR:', error);
      // Continue without QR code if PDF generation fails
    }

    // 7. Update tanda_tangan di ND dan status di Naskah
    const signatureMetadata = formatSignatureData({
      type: 'digsig',
      doc_id: response.doc_id || response.data?.doc_id,
      signature_id: signatureId,
      signed_at: signedAt,
      signer_nik: userData.nik,
      signer_name: signerName,
      signer_jabatan: signerJabatan,
      path: finalPdfPath,
      verification_url: verificationUrl,
    });

    await this.ndRepository.update(nd.id, {
      tandaTangan: signatureMetadata,
    });

    await this.naskahRepository.update(idNaskah, {
      status: 'final_tte',
    });

    return {
      message: 'Nota Dinas berhasil ditandatangani dengan BSrE',
      data: response,
      signature_metadata: JSON.parse(signatureMetadata),
    };
  }

  /**
   * Sign Surat Dinas Internal dengan BSrE (NIK dan no_wa otomatis dari HR API)
   * @param idNaskah - ID dari tabel naskah
   * @param dto - Object containing passphrase dan optional klasifikasi
   * @param persnum - Persnum user yang login (untuk fetch NIK dan no_wa)
   */
  async signSdiBsre(
    idNaskah: string,
    dto: { passphrase: string; klasifikasi?: string },
    persnum: number,
  ): Promise<SignResultResponse> {
    console.log(`[DigsigService] signSdiBsre - idNaskah: ${idNaskah}, persnum: ${persnum}`);

    // 1. Fetch NIK dan no_wa dari HR API
    const userData = await this.getUserDataForBsre(persnum.toString());
    console.log(`[DigsigService] User data fetched - NIK: ${userData.nik}, no_wa: ${userData.no_wa}`);

    // 2. Cari naskah berdasarkan idNaskah
    const naskah = await this.naskahRepository.findOne({
      where: { id: idNaskah },
    });

    if (!naskah) {
      throw new NotFoundException(`Naskah dengan ID ${idNaskah} tidak ditemukan`);
    }

    // Validasi jenis naskah
    if (naskah.jenis !== 'SDI') {
      throw new BadRequestException('Naskah bukan Surat Dinas Internal');
    }

    // Cari SDI berdasarkan id_naskah
    const sdi = await this.sdiSdeRepository.findOne({ where: { idNaskah } });
    if (!sdi) {
      throw new NotFoundException(`Surat Dinas Internal dengan id_naskah ${idNaskah} tidak ditemukan`);
    }

    if (!naskah.final_pdf) {
      throw new BadRequestException(
        'Dokumen PDF belum di-generate. Harap generate PDF terlebih dahulu',
      );
    }

    // 3. Prepare params untuk digsig
    const filename = naskah.final_pdf.split('/').pop() || 'document.pdf';
    const key = naskah.final_pdf;

    const params: DigsigParams = {
      key: key,
      filename: filename,
      nomorDokumen: sdi.nomor || naskah.nomor || '-',
      tanggalDokumen: naskah.tanggal
        ? new Date(naskah.tanggal).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      klasifikasi: dto.klasifikasi || naskah.klasifikasi || 'Biasa',
      jenisNaskah: 'Surat Dinas Internal',
      perihal: sdi.perihal || naskah.perihal || '-',
      nik: userData.nik,
      passphrase: dto.passphrase,
      path_dokumen: 'surat-dinas-internal/digsig/',
      no_wa: userData.no_wa,
    };

    // 4. Hit digsig endpoint
    const response = await this.hitDigsigEndpoint(params);

    // 5. Generate QR Code (BSrE tidak return QR, jadi dibuat internal)
    const signedAt = new Date().toISOString();
    const signatureId = generateSignatureId();
    const documentNumber = sdi.nomor || naskah.nomor || '-';
    const signerName = sdi.namaLengkap || 'Penandatangan';
    const signerJabatan = sdi.namaJabatan || 'Jabatan';
    const verificationUrl = `${VERIFICATION_BASE_URL}/${signatureId}`;
    const finalPdfPath = naskah.final_pdf;
    const pdfUrl = finalPdfPath ? this.storageService.getPublicUrl(finalPdfPath) : undefined;

    const qrData: QRCodeData = {
      signature_id: signatureId,
      document_number: documentNumber,
      signed_at: signedAt,
      signer_name: signerName,
      signer_jabatan: signerJabatan,
      document_type: 'Surat Dinas Internal',
      verification_url: verificationUrl,
      pdf_url: pdfUrl,
    };

    // 6. Regenerate PDF dengan QR code
    try {
      if (finalPdfPath) {
        await this.regenerateSdiSdePdfWithQRCode(naskah, sdi, qrData);
      }
    } catch (error) {
      console.error('[DigsigService] Failed to regenerate PDF with QR:', error);
    }

    // 7. Update tanda_tangan di SDI dan status di Naskah
    const signatureMetadata = formatSignatureData({
      type: 'digsig',
      doc_id: response.doc_id || response.data?.doc_id,
      signature_id: signatureId,
      signed_at: signedAt,
      signer_nik: userData.nik,
      signer_name: signerName,
      signer_jabatan: signerJabatan,
      path: finalPdfPath,
      verification_url: verificationUrl,
    });

    await this.sdiSdeRepository.update(sdi.id, {
      tandaTangan: signatureMetadata,
    });

    await this.naskahRepository.update(idNaskah, {
      status: 'final_tte',
    });

    return {
      message: 'Surat Dinas Internal berhasil ditandatangani dengan BSrE',
      data: response,
      signature_metadata: JSON.parse(signatureMetadata),
    };
  }

  /**
   * Sign Surat Dinas Eksternal dengan BSrE (NIK dan no_wa otomatis dari HR API)
   * @param idNaskah - ID dari tabel naskah
   * @param dto - Object containing passphrase dan optional klasifikasi
   * @param persnum - Persnum user yang login (untuk fetch NIK dan no_wa)
   */
  async signSdeBsre(
    idNaskah: string,
    dto: { passphrase: string; klasifikasi?: string },
    persnum: number,
  ): Promise<SignResultResponse> {
    console.log(`[DigsigService] signSdeBsre - idNaskah: ${idNaskah}, persnum: ${persnum}`);

    // 1. Fetch NIK dan no_wa dari HR API
    const userData = await this.getUserDataForBsre(persnum.toString());
    console.log(`[DigsigService] User data fetched - NIK: ${userData.nik}, no_wa: ${userData.no_wa}`);

    // 2. Cari naskah berdasarkan idNaskah
    const naskah = await this.naskahRepository.findOne({
      where: { id: idNaskah },
    });

    if (!naskah) {
      throw new NotFoundException(`Naskah dengan ID ${idNaskah} tidak ditemukan`);
    }

    // Validasi jenis naskah
    if (naskah.jenis !== 'SDE') {
      throw new BadRequestException('Naskah bukan Surat Dinas Eksternal');
    }

    // Cari SDE berdasarkan id_naskah
    const sde = await this.sdiSdeRepository.findOne({ where: { idNaskah } });
    if (!sde) {
      throw new NotFoundException(`Surat Dinas Eksternal dengan id_naskah ${idNaskah} tidak ditemukan`);
    }

    if (!naskah.final_pdf) {
      throw new BadRequestException(
        'Dokumen PDF belum di-generate. Harap generate PDF terlebih dahulu',
      );
    }

    // 3. Prepare params untuk digsig
    const filename = naskah.final_pdf.split('/').pop() || 'document.pdf';
    const key = naskah.final_pdf;

    const params: DigsigParams = {
      key: key,
      filename: filename,
      nomorDokumen: sde.nomor || naskah.nomor || '-',
      tanggalDokumen: naskah.tanggal
        ? new Date(naskah.tanggal).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      klasifikasi: dto.klasifikasi || naskah.klasifikasi || 'Biasa',
      jenisNaskah: 'Surat Dinas Eksternal',
      perihal: sde.perihal || naskah.perihal || '-',
      nik: userData.nik,
      passphrase: dto.passphrase,
      path_dokumen: 'surat-dinas-eksternal/digsig/',
      no_wa: userData.no_wa,
    };

    // 4. Hit digsig endpoint
    const response = await this.hitDigsigEndpoint(params);

    // 5. Generate QR Code (BSrE tidak return QR, jadi dibuat internal)
    const signedAt = new Date().toISOString();
    const signatureId = generateSignatureId();
    const documentNumber = sde.nomor || naskah.nomor || '-';
    const signerName = sde.namaLengkap || 'Penandatangan';
    const signerJabatan = sde.namaJabatan || 'Jabatan';
    const verificationUrl = `${VERIFICATION_BASE_URL}/${signatureId}`;
    const finalPdfPath = naskah.final_pdf;
    const pdfUrl = finalPdfPath ? this.storageService.getPublicUrl(finalPdfPath) : undefined;

    const qrData: QRCodeData = {
      signature_id: signatureId,
      document_number: documentNumber,
      signed_at: signedAt,
      signer_name: signerName,
      signer_jabatan: signerJabatan,
      document_type: 'Surat Dinas Eksternal',
      verification_url: verificationUrl,
      pdf_url: pdfUrl,
    };

    // 6. Regenerate PDF dengan QR code
    try {
      if (finalPdfPath) {
        await this.regenerateSdiSdePdfWithQRCode(naskah, sde, qrData);
      }
    } catch (error) {
      console.error('[DigsigService] Failed to regenerate PDF with QR:', error);
    }

    // 7. Update tanda_tangan di SDE dan status di Naskah
    const signatureMetadata = formatSignatureData({
      type: 'digsig',
      doc_id: response.doc_id || response.data?.doc_id,
      signature_id: signatureId,
      signed_at: signedAt,
      signer_nik: userData.nik,
      signer_name: signerName,
      signer_jabatan: signerJabatan,
      path: finalPdfPath,
      verification_url: verificationUrl,
    });

    await this.sdiSdeRepository.update(sde.id, {
      tandaTangan: signatureMetadata,
    });

    await this.naskahRepository.update(idNaskah, {
      status: 'final_tte',
    });

    return {
      message: 'Surat Dinas Eksternal berhasil ditandatangani dengan BSrE',
      data: response,
      signature_metadata: JSON.parse(signatureMetadata),
    };
  }

  // ============================================
  // SIGN INTERNAL (Tanpa BSrE) - Untuk Testing
  // ============================================

  /**
   * Sign Nota Dinas dengan Internal (tanpa BSrE)
   * @param idNaskah - ID dari tabel naskah
   */
  async signNotaDinasInternal(
    idNaskah: string,
    dto: { passphrase: string },
  ): Promise<SignInternalResultResponse> {
    // Validasi passphrase
    if (dto.passphrase !== DEFAULT_PASSPHRASE) {
      throw new BadRequestException('Passphrase tidak valid');
    }

    // Cari naskah terlebih dahulu
    const naskah = await this.naskahRepository.findOne({
      where: { id: idNaskah },
    });

    if (!naskah) {
      throw new NotFoundException(`Naskah dengan ID ${idNaskah} tidak ditemukan`);
    }

    // Validasi jenis naskah
    if (naskah.jenis !== 'ND') {
      throw new BadRequestException('Naskah bukan Nota Dinas');
    }

    // Cari nota dinas berdasarkan id_naskah
    const nd = await this.ndRepository.findOne({ where: { idNaskah } });
    if (!nd) {
      throw new NotFoundException(
        `Nota Dinas dengan id_naskah ${idNaskah} tidak ditemukan`,
      );
    }

    // Generate signature ID dan metadata
    const signatureId = generateSignatureId();
    const signedAt = new Date().toISOString();
    const signerName = nd.namaLengkap || 'Penandatangan';
    const signerJabatan = nd.namaJabatan || 'Jabatan';
    const documentNumber = nd.nomor || naskah.nomor || '-';
    const verificationUrl = `${VERIFICATION_BASE_URL}/${signatureId}`;

    // Get public URL untuk final PDF
    const finalPdfPath = naskah.final_pdf;
    const pdfUrl = finalPdfPath ? this.storageService.getPublicUrl(finalPdfPath) : undefined;

    // Generate QR Code untuk signature - langsung ke PDF
    const qrData: QRCodeData = {
      signature_id: signatureId,
      document_number: documentNumber,
      signed_at: signedAt,
      signer_name: signerName,
      signer_jabatan: signerJabatan,
      document_type: 'Nota Dinas',
      verification_url: verificationUrl,
      pdf_url: pdfUrl, // QR code langsung ke dokumen PDF
    };

    // Generate PDF baru dengan QR code - overwrite final_pdf
    try {
      if (finalPdfPath) {
        await this.regenerateNdPdfWithQRCode(naskah, nd, qrData);
      }
    } catch (error) {
      console.error('[DigsigService] Failed to regenerate PDF with QR:', error);
      // Continue without QR code if PDF generation fails
    }

    // Update tanda_tangan dan status (tetap final_pdf)
    const signatureMetadata = formatSignatureData({
      type: 'internal',
      signature_id: signatureId,
      signed_at: signedAt,
      signer_name: signerName,
      signer_jabatan: signerJabatan,
      path: finalPdfPath,
      verification_url: verificationUrl,
    });

    await this.ndRepository.update(nd.id, {
      tandaTangan: signatureMetadata,
    });

    // Status tetap final_pdf (tidak berubah)
    // Hanya update tanda_tangan di nd table

    return {
      message: 'Nota Dinas berhasil ditandatangani (Internal)',
      signature_metadata: {
        type: 'internal',
        signature_id: signatureId,
        signed_at: signedAt,
        signer_id: null, // TODO: dari user profile
        signer_name: signerName,
        signer_jabatan: signerJabatan,
        path: finalPdfPath,
      },
    };
  }

  /**
   * Sign Surat Dinas Internal dengan Internal (tanpa BSrE)
   * @param idNaskah - ID dari tabel naskah
   */
  async signSdiInternal(
    idNaskah: string,
    dto: { passphrase: string },
  ): Promise<SignInternalResultResponse> {
    // Validasi passphrase
    if (dto.passphrase !== DEFAULT_PASSPHRASE) {
      throw new BadRequestException('Passphrase tidak valid');
    }

    // Cari naskah terlebih dahulu
    const naskah = await this.naskahRepository.findOne({
      where: { id: idNaskah },
    });

    if (!naskah) {
      throw new NotFoundException(`Naskah dengan ID ${idNaskah} tidak ditemukan`);
    }

    // Validasi jenis naskah
    if (naskah.jenis !== 'SDI') {
      throw new BadRequestException('Naskah bukan Surat Dinas Internal');
    }

    // Cari SDI berdasarkan id_naskah
    const sdi = await this.sdiSdeRepository.findOne({ where: { idNaskah } });
    if (!sdi) {
      throw new NotFoundException(
        `Surat Dinas Internal dengan id_naskah ${idNaskah} tidak ditemukan`,
      );
    }

    // Generate signature ID dan metadata
    const signatureId = generateSignatureId();
    const signedAt = new Date().toISOString();
    const signerName = sdi.namaLengkap || 'Penandatangan';
    const signerJabatan = sdi.namaJabatan || 'Jabatan';
    const documentNumber = sdi.nomor || naskah.nomor || '-';
    const verificationUrl = `${VERIFICATION_BASE_URL}/${signatureId}`;

    // Get public URL untuk final PDF
    const finalPdfPath = naskah.final_pdf;
    const pdfUrl = finalPdfPath ? this.storageService.getPublicUrl(finalPdfPath) : undefined;

    // Generate QR Code untuk signature - langsung ke PDF
    const qrData: QRCodeData = {
      signature_id: signatureId,
      document_number: documentNumber,
      signed_at: signedAt,
      signer_name: signerName,
      signer_jabatan: signerJabatan,
      document_type: 'Surat Dinas Internal',
      verification_url: verificationUrl,
      pdf_url: pdfUrl,
    };

    // Generate PDF baru dengan QR code - overwrite final_pdf
    try {
      if (finalPdfPath) {
        await this.regenerateSdiSdePdfWithQRCode(naskah, sdi, qrData);
      }
    } catch (error) {
      console.error('[DigsigService] Failed to regenerate PDF with QR:', error);
    }

    // Update tanda_tangan
    const signatureMetadata = formatSignatureData({
      type: 'internal',
      signature_id: signatureId,
      signed_at: signedAt,
      signer_name: signerName,
      signer_jabatan: signerJabatan,
      path: finalPdfPath,
      verification_url: verificationUrl,
    });

    await this.sdiSdeRepository.update(sdi.id, {
      tandaTangan: signatureMetadata,
    });

    // Status tetap final_pdf (tidak berubah)

    return {
      message: 'Surat Dinas Internal berhasil ditandatangani (Internal)',
      signature_metadata: {
        type: 'internal',
        signature_id: signatureId,
        signed_at: signedAt,
        signer_id: null,
        signer_name: signerName,
        signer_jabatan: signerJabatan,
        path: finalPdfPath,
      },
    };
  }

  /**
   * Sign Surat Dinas Eksternal dengan Internal (tanpa BSrE)
   * @param idNaskah - ID dari tabel naskah
   */
  async signSdeInternal(
    idNaskah: string,
    dto: { passphrase: string },
  ): Promise<SignInternalResultResponse> {
    // Validasi passphrase
    if (dto.passphrase !== DEFAULT_PASSPHRASE) {
      throw new BadRequestException('Passphrase tidak valid');
    }

    // Cari naskah terlebih dahulu
    const naskah = await this.naskahRepository.findOne({
      where: { id: idNaskah },
    });

    if (!naskah) {
      throw new NotFoundException(`Naskah dengan ID ${idNaskah} tidak ditemukan`);
    }

    // Validasi jenis naskah
    if (naskah.jenis !== 'SDE') {
      throw new BadRequestException('Naskah bukan Surat Dinas Eksternal');
    }

    // Cari SDE berdasarkan id_naskah
    const sde = await this.sdiSdeRepository.findOne({ where: { idNaskah } });
    if (!sde) {
      throw new NotFoundException(
        `Surat Dinas Eksternal dengan id_naskah ${idNaskah} tidak ditemukan`,
      );
    }

    // Generate signature ID dan metadata
    const signatureId = generateSignatureId();
    const signedAt = new Date().toISOString();
    const signerName = sde.namaLengkap || 'Penandatangan';
    const signerJabatan = sde.namaJabatan || 'Jabatan';
    const documentNumber = sde.nomor || naskah.nomor || '-';
    const verificationUrl = `${VERIFICATION_BASE_URL}/${signatureId}`;

    // Get public URL untuk final PDF
    const finalPdfPath = naskah.final_pdf;
    const pdfUrl = finalPdfPath ? this.storageService.getPublicUrl(finalPdfPath) : undefined;

    // Generate QR Code untuk signature - langsung ke PDF
    const qrData: QRCodeData = {
      signature_id: signatureId,
      document_number: documentNumber,
      signed_at: signedAt,
      signer_name: signerName,
      signer_jabatan: signerJabatan,
      document_type: 'Surat Dinas Eksternal',
      verification_url: verificationUrl,
      pdf_url: pdfUrl,
    };

    // Generate PDF baru dengan QR code - overwrite final_pdf
    try {
      if (finalPdfPath) {
        await this.regenerateSdiSdePdfWithQRCode(naskah, sde, qrData);
      }
    } catch (error) {
      console.error('[DigsigService] Failed to regenerate PDF with QR:', error);
    }

    // Update tanda_tangan
    const signatureMetadata = formatSignatureData({
      type: 'internal',
      signature_id: signatureId,
      signed_at: signedAt,
      signer_name: signerName,
      signer_jabatan: signerJabatan,
      path: finalPdfPath,
      verification_url: verificationUrl,
    });

    await this.sdiSdeRepository.update(sde.id, {
      tandaTangan: signatureMetadata,
    });

    // Status tetap final_pdf (tidak berubah)

    return {
      message: 'Surat Dinas Eksternal berhasil ditandatangani (Internal)',
      signature_metadata: {
        type: 'internal',
        signature_id: signatureId,
        signed_at: signedAt,
        signer_id: null,
        signer_name: signerName,
        signer_jabatan: signerJabatan,
        path: finalPdfPath,
      },
    };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Helper: Format tanggal ke format Indonesia (e.g., "29 Desember 2025")
   * Sama dengan format yang digunakan di surat-dinas-internal.service.ts
   */
  private formatDateToIndonesian(date: Date): string {
    return date.toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Jakarta',
    });
  }

  /**
   * Helper: Get dynamic header info dari sub_area_alamat berdasarkan naskah_sirkulasi pengirim
   * @param idNaskah - ID naskah untuk mencari pengirim di naskah_sirkulasi
   * @param tanggal - Optional tanggal dari naskah
   * @returns Header info (kantor, gedung, alamat, kota) atau null
   */
  private async getHeaderInfoFromNaskah(
    idNaskah: string,
    tanggal?: Date,
  ): Promise<{ kantor: string; gedung: string; alamat: string; kota: string } | null> {
    try {
      // Get pengirim dari naskah_sirkulasi
      const pengirim = await this.naskahSirkulasiRepository.findOne({
        where: {
          idNaskah: idNaskah,
          sirkuler: 'pengirim',
        },
      });

      if (!pengirim) {
        console.log('[DigsigService getHeaderInfo] Pengirim not found in naskah_sirkulasi');
        return null;
      }

      const company = String(pengirim.company || COMPANY_ID);
      const area = pengirim.area || '';
      const subArea = pengirim.subArea || '';

      if (!area || !subArea) {
        console.log('[DigsigService getHeaderInfo] Missing area or subArea, using default');
        return null;
      }

      const queryDate = tanggal || new Date();

      const headerInfo = await this.subAreaAlamatService.findAlamatByUserContext(
        company,
        area,
        subArea,
        queryDate,
      );

      if (headerInfo) {
        console.log('[DigsigService getHeaderInfo] Found header info:', headerInfo);
        return headerInfo;
      }

      console.log('[DigsigService getHeaderInfo] No header info found, using default');
      return null;
    } catch (error) {
      console.error('[DigsigService getHeaderInfo] Error:', error);
      return null;
    }
  }

  /**
   * Regenerate Nota Dinas PDF dengan QR Code signature
   * Menggunakan template generate_pdf_nodin dan overwrite final_pdf
   */
  private async regenerateNdPdfWithQRCode(
    naskah: NaskahEntity,
    nd: NdEntity,
    qrData: QRCodeData,
  ): Promise<void> {
    // Generate QR code base64
    const qrCodeBase64 = await this.qrCodeService.generateQRCodeBase64(qrData);

    // Generate QR code HTML untuk di dalam section TTD
    const qrCodeHtml = this.generateQRCodeForTTD(qrCodeBase64, qrData);

    // Get dynamic header info dari sub_area_alamat berdasarkan pengirim di naskah_sirkulasi
    const tanggalNaskah = naskah.tanggal ? new Date(naskah.tanggal) : new Date();
    const headerInfo = await this.getHeaderInfoFromNaskah(naskah.id, tanggalNaskah);

    // Parse tertuju/penerima
    let tertuju: string[] = [];
    if (nd.kepadaYth) {
      try {
        tertuju = JSON.parse(nd.kepadaYth);
      } catch {
        tertuju = [nd.kepadaYth];
      }
    }

    // Parse tembusan
    let tembusan: string[] = [];
    if (nd.tembusan) {
      try {
        tembusan = JSON.parse(nd.tembusan);
      } catch {
        tembusan = nd.tembusan ? [nd.tembusan] : [];
      }
    }

    // Format tanggal sama dengan send message (format Indonesia)
    const tanggalFormatted = this.formatDateToIndonesian(tanggalNaskah);

    // Prepare options untuk generate PDF menggunakan generate_pdf_nodin
    const pdfOptions = {
      html: nd.konten || naskah.konten || '',
      perihal: nd.perihal || naskah.perihal || '',
      dari: nd.dari || '',
      namaLengkap: nd.namaLengkap || '',
      positionText: nd.namaJabatan || '',
      nomor: nd.nomor || naskah.nomor || '',
      tanggal: tanggalFormatted,
      nama_tempat: headerInfo?.kota || nd.namaTempat || 'Tangerang',
      tertuju: tertuju,
      tembusan: tembusan,
      qrCodeHtml: qrCodeHtml, // QR code untuk section TTD
      // Dynamic header info dari sub_area_alamat
      headerKantor: headerInfo?.kantor,
      headerGedung: headerInfo?.gedung,
      headerAlamat: headerInfo?.alamat,
    };

    // Generate PDF menggunakan GeneratePdfNodinService
    const pdfBuffer = await this.generatePdfNodinService.generatePdf(pdfOptions);

    // Overwrite file di storage (gunakan path yang sama)
    const finalPdfPath = naskah.final_pdf;
    if (finalPdfPath) {
      await this.storageService.deleteFile(finalPdfPath).catch(() => {});
      
      // Extract folder dan filename dari path
      const pathParts = finalPdfPath.split('/');
      const filename = pathParts.pop() || `${naskah.id}.pdf`;
      const folder = pathParts.join('/');

      // Upload dengan key yang sama
      await this.storageService.uploadBuffer(
        pdfBuffer,
        filename,
        'application/pdf',
        folder,
      );
    }
  }

  /**
   * Regenerate SDI/SDE PDF dengan QR Code signature
   * Menggunakan template generate_pdf_sudin dan overwrite final_pdf
   */
  private async regenerateSdiSdePdfWithQRCode(
    naskah: NaskahEntity,
    sdiSde: SdiSdeEntity,
    qrData: QRCodeData,
  ): Promise<void> {
    // Generate QR code base64
    const qrCodeBase64 = await this.qrCodeService.generateQRCodeBase64(qrData);

    // Generate QR code HTML untuk di section TTD (simpel, hanya gambar QR centered)
    const qrCodeHtml = this.generateQRCodeForTTD(qrCodeBase64, qrData);

    // Get dynamic header info dari sub_area_alamat berdasarkan pengirim di naskah_sirkulasi
    const tanggalNaskah = naskah.tanggal ? new Date(naskah.tanggal) : new Date();
    const headerInfo = await this.getHeaderInfoFromNaskah(naskah.id, tanggalNaskah);

    // Get konten (tanpa append QR ke body - QR akan ditampilkan di TTD section)
    const konten = sdiSde.konten || naskah.konten || '';

    // Parse penerima
    let penerima: string[] = [];
    if (sdiSde.kepadaYth) {
      try {
        penerima = JSON.parse(sdiSde.kepadaYth);
      } catch {
        penerima = [sdiSde.kepadaYth];
      }
    }

    // Parse tembusan
    let tembusan: string[] = [];
    if (sdiSde.tembusan) {
      try {
        tembusan = JSON.parse(sdiSde.tembusan);
      } catch {
        tembusan = sdiSde.tembusan ? [sdiSde.tembusan] : [];
      }
    }

    // Format tanggal sama dengan send message (format Indonesia)
    const tanggalFormatted = this.formatDateToIndonesian(tanggalNaskah);

    // Prepare options untuk generate PDF
    const pdfOptions = {
      html: Buffer.from(konten, 'utf-8').toString('base64'),
      perihal: sdiSde.perihal || naskah.perihal || '',
      namaLengkap: sdiSde.namaLengkap || '',
      positionText: sdiSde.namaJabatan || '',
      nomor: sdiSde.nomor || naskah.nomor || '',
      tanggal: tanggalFormatted,
      nama_tempat: headerInfo?.kota || sdiSde.namaTempat || 'Tangerang',
      nama_jabatan: sdiSde.namaJabatan || '',
      sifat: sdiSde.sifat || 'Biasa',
      lampiran: sdiSde.lampiran || '-',
      penerima: penerima,
      tembusan: tembusan,
      qrCodeHtml: qrCodeHtml, // QR code akan ditampilkan di TTD section
      // Dynamic header info dari sub_area_alamat
      headerKantor: headerInfo?.kantor,
      headerGedung: headerInfo?.gedung,
      headerAlamat: headerInfo?.alamat,
    };

    // Generate PDF menggunakan GeneratePdfSudinService
    const pdfBuffer = await this.generatePdfSudinService.generatePdf(pdfOptions);

    // Overwrite file di storage (gunakan path yang sama)
    const finalPdfPath = naskah.final_pdf;
    if (finalPdfPath) {
      await this.storageService.deleteFile(finalPdfPath).catch(() => {});
      
      // Extract folder dan filename dari path
      const pathParts = finalPdfPath.split('/');
      const filename = pathParts.pop() || `${naskah.id}.pdf`;
      const folder = pathParts.join('/');

      // Upload dengan key yang sama
      await this.storageService.uploadBuffer(
        pdfBuffer,
        filename,
        'application/pdf',
        folder,
      );
    }
  }

  /**
   * Generate QR Code HTML khusus untuk section TTD (Nota Dinas)
   * Posisi di antara nama jabatan dan nama lengkap
   * Hanya tampilkan QR code tanpa detail text - centered
   */
  private generateQRCodeForTTD(qrDataUrl: string, _data: QRCodeData): string {
    return `
      <div style="text-align: center; margin: 10px 0;">
        <img src="${qrDataUrl}" style="width: 100px; height: 100px;" />
      </div>
    `;
  }

  // ============================================
  // VERIFICATION METHODS
  // ============================================

  /**
   * Verifikasi dokumen berdasarkan signature_id
   * Mencari di tabel nd dan sdi_sde
   */
  async verifyBySignatureId(signatureId: string): Promise<{
    valid: boolean;
    document?: {
      type: string;
      nomor: string;
      perihal: string;
      tanggal: string;
      signed_at: string;
      signer_name: string;
      signer_jabatan: string;
      status: string;
    };
    message: string;
  }> {
    try {
      // Search in ND table
      const ndList = await this.ndRepository
        .createQueryBuilder('nd')
        .where('nd.tandaTangan LIKE :pattern', { pattern: `%${signatureId}%` })
        .getMany();

      if (ndList.length > 0) {
        const nd = ndList[0];
        const metadata = JSON.parse(nd.tandaTangan || '{}');
        
        // Get naskah status
        const naskah = nd.idNaskah ? await this.naskahRepository.findOne({ where: { id: nd.idNaskah } }) : null;
        
        return {
          valid: true,
          document: {
            type: 'Nota Dinas',
            nomor: nd.nomor || '',
            perihal: nd.perihal || '',
            tanggal: nd.tanggal?.toISOString().split('T')[0] || '',
            signed_at: metadata.signed_at || '',
            signer_name: metadata.signer_name || nd.namaLengkap || '',
            signer_jabatan: metadata.signer_jabatan || nd.namaJabatan || '',
            status: naskah?.status || 'unknown',
          },
          message: 'Dokumen valid dan telah ditandatangani secara digital',
        };
      }

      // Search in SDI/SDE table
      const sdiList = await this.sdiSdeRepository
        .createQueryBuilder('sdi')
        .where('sdi.tandaTangan LIKE :pattern', { pattern: `%${signatureId}%` })
        .getMany();

      if (sdiList.length > 0) {
        const sdi = sdiList[0];
        const metadata = JSON.parse(sdi.tandaTangan || '{}');
        
        // Get naskah info
        const naskah = sdi.idNaskah ? await this.naskahRepository.findOne({ where: { id: sdi.idNaskah } }) : null;
        const docType = naskah?.jenis === 'SDE' ? 'Surat Dinas Eksternal' : 'Surat Dinas Internal';
        
        return {
          valid: true,
          document: {
            type: docType,
            nomor: sdi.nomor || '',
            perihal: sdi.perihal || '',
            tanggal: sdi.tanggal?.toISOString().split('T')[0] || '',
            signed_at: metadata.signed_at || '',
            signer_name: metadata.signer_name || sdi.namaLengkap || '',
            signer_jabatan: metadata.signer_jabatan || sdi.namaJabatan || '',
            status: naskah?.status || 'unknown',
          },
          message: 'Dokumen valid dan telah ditandatangani secara digital',
        };
      }

      return {
        valid: false,
        message: 'Dokumen dengan signature ID tersebut tidak ditemukan',
      };
    } catch (error) {
      return {
        valid: false,
        message: `Error verifikasi: ${error.message}`,
      };
    }
  }

  /**
   * Verifikasi dokumen dengan BSrE menggunakan name_doc
   * name_doc adalah nama file yang dikembalikan oleh BSrE saat signing
   */
  async verifyWithBsre(nameDoc: string): Promise<{
    valid: boolean;
    bsre_response?: any;
    message: string;
  }> {
    try {
      if (!nameDoc) {
        return {
          valid: false,
          message: 'name_doc tidak boleh kosong',
        };
      }

      // Hit BSrE verify endpoint
      // Note: URL endpoint verify BSrE perlu disesuaikan dengan dokumentasi BSrE
      
      const response = await axios.post(
        BSRE_VERIFY_URL,
        { name_doc: nameDoc },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000,
        },
      );

      // Parse response dari BSrE
      const bsreData = response.data;
      
      // Asumsi BSrE return status success jika dokumen valid
      if (bsreData.status === 'success' || bsreData.valid === true) {
        return {
          valid: true,
          bsre_response: bsreData,
          message: 'Dokumen valid dan terdaftar di BSrE',
        };
      }

      return {
        valid: false,
        bsre_response: bsreData,
        message: bsreData.message || 'Dokumen tidak valid atau tidak terdaftar di BSrE',
      };

    } catch (error: any) {
      console.error('[DigsigService] BSrE verify error:', error.message);
      
      if (axios.isAxiosError(error)) {
        return {
          valid: false,
          bsre_response: error.response?.data,
          message: error.response?.data?.message || 'Gagal verifikasi dengan BSrE',
        };
      }

      return {
        valid: false,
        message: `Error verifikasi: ${error.message}`,
      };
    }
  }

  async hitVerifyDigsig(params: VerifyDigsigParams) {
    try {
      console.log('[DigsigService] hitDigsigVerify - Starting...');
      const filename = params.filename;
      const fileurl = params.fileurl;
      const finalfileurl = await this.storageService.getFileUrl(fileurl);
      console.log(finalfileurl);
      // 2. Payload sesuai spesifikasi
      const payload = {
        filename: filename,
        fileurl: finalfileurl,
      };

      // 3. Hit endpoint
      const response = await axios.post(
        BSRE_VERIFY_URL,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );

      console.log('[DigsigService] BSrE Response:', response.data);
      return response.data;
    } catch (error: any) {      
      if (axios.isAxiosError(error)) {
        console.error('[DigsigService] Axios Error Message:', error.message);
        console.error('[DigsigService] Status:', error.response?.status);
        console.error('[DigsigService] Response Data:', JSON.stringify(error.response?.data, null, 2));
        console.error('[DigsigService] Request URL:', error.config?.url);
        const status =
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;

        const message =
          error.response?.data?.message ||
          error.response?.data?.error ||
          'Gagal mengambil data dari service external';

        // 🔥 lempar ulang ke controller
        throw new HttpException(
          {
            success: false,
            message,
            source: 'external-service',
            detail: error.response?.data,
          },
          status,
        );
      }
      console.error('[DigsigService] Unexpected Error:', error);
      throw new HttpException(
        {
          success: false,
          message: 'Unexpected error',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  
}
