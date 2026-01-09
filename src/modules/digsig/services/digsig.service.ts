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
import { formatSignatureData, generateSignatureId } from '../../../common/helpers/signature.helper';
import { QRCodeService, QRCodeData } from './qrcode.service';
import { GeneratePdfNodinService } from '../../generate_pdf/services/generate_pdf_nodin.service';
import { GeneratePdfSudinService } from '../../generate_pdf/services/generate_pdf_sudin.service';
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

// Base URL untuk verifikasi (ganti dengan URL production nanti)
const VERIFICATION_BASE_URL = process.env.VERIFICATION_URL || 'https://arsipku.airnavindonesia.co.id/verify';

@Injectable()
export class DigsigService {
  constructor(
    private readonly storageService: StorageService,
    private readonly qrCodeService: QRCodeService,
    private readonly generatePdfNodinService: GeneratePdfNodinService,
    private readonly generatePdfSudinService: GeneratePdfSudinService,
    @InjectRepository(NdEntity)
    private readonly ndRepository: Repository<NdEntity>,
    @InjectRepository(SdiSdeEntity)
    private readonly sdiSdeRepository: Repository<SdiSdeEntity>,
    @InjectRepository(NaskahEntity)
    private readonly naskahRepository: Repository<NaskahEntity>,
  ) {}

  /**
   * Sign Nota Dinas dengan Digsig
   */
  async signNotaDinas(
    id: string,
    dto: { nik: string; passphrase: string; no_wa: string; klasifikasi?: string },
  ) {
    // 1. Cari nota dinas dan naskah terkait
    const nd = await this.ndRepository.findOne({ where: { id } });
    if (!nd) {
      throw new NotFoundException(`Nota Dinas dengan ID ${id} tidak ditemukan`);
    }

    if (!nd.idNaskah) {
      throw new BadRequestException('Nota Dinas tidak memiliki naskah terkait');
    }

    const naskah = await this.naskahRepository.findOne({
      where: { id: nd.idNaskah },
    });

    if (!naskah) {
      throw new NotFoundException('Data naskah tidak ditemukan');
    }

    if (!naskah.final_pdf) {
      throw new BadRequestException(
        'Dokumen PDF belum di-generate. Harap generate PDF terlebih dahulu',
      );
    }

    // 2. Prepare params untuk digsig
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
      nik: dto.nik,
      passphrase: dto.passphrase,
      path_dokumen: 'nota-dinas/digsig/',
      no_wa: dto.no_wa,
    };

    // 3. Hit digsig endpoint
    const response = await this.hitDigsigEndpoint(params);

    // 4. Update tanda_tangan di ND dan status di Naskah
    const signatureMetadata = formatSignatureData({
      type: 'digsig',
      doc_id: response.doc_id || response.data?.doc_id,
      signed_at: new Date().toISOString(),
      signer_nik: dto.nik,
      path: response.signed_file_path || response.data?.signed_file_path,
    });

    await this.ndRepository.update(id, {
      tandaTangan: signatureMetadata,
    });

    await this.naskahRepository.update(nd.idNaskah, {
      status: 'final_tte',
    });

    return {
      message: 'Nota Dinas berhasil ditandatangani dengan Digsig',
      data: response,
      signature_metadata: JSON.parse(signatureMetadata),
    };
  }

  /**
   * Sign Surat Dinas Internal dengan Digsig
   */
  async signSuratDinasInternal(
    id: string,
    dto: { nik: string; passphrase: string; no_wa: string; klasifikasi?: string },
  ) {
    const sdi = await this.sdiSdeRepository.findOne({ where: { id } });
    if (!sdi) {
      throw new NotFoundException(
        `Surat Dinas Internal dengan ID ${id} tidak ditemukan`,
      );
    }

    if (!sdi.idNaskah) {
      throw new BadRequestException(
        'Surat Dinas Internal tidak memiliki naskah terkait',
      );
    }

    const naskah = await this.naskahRepository.findOne({
      where: { id: sdi.idNaskah },
    });

    if (!naskah) {
      throw new NotFoundException('Data naskah tidak ditemukan');
    }

    // Validasi bahwa ini adalah SDI
    if (naskah.jenis !== 'SDI') {
      throw new BadRequestException('Naskah bukan Surat Dinas Internal');
    }

    if (!naskah.final_pdf) {
      throw new BadRequestException(
        'Dokumen PDF belum di-generate. Harap generate PDF terlebih dahulu',
      );
    }

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
      nik: dto.nik,
      passphrase: dto.passphrase,
      path_dokumen: 'surat-dinas-internal/digsig/',
      no_wa: dto.no_wa,
    };

    const response = await this.hitDigsigEndpoint(params);

    const signatureMetadata = formatSignatureData({
      type: 'digsig',
      doc_id: response.doc_id || response.data?.doc_id,
      signed_at: new Date().toISOString(),
      signer_nik: dto.nik,
      path: response.signed_file_path || response.data?.signed_file_path,
    });

    await this.sdiSdeRepository.update(id, {
      tandaTangan: signatureMetadata,
    });

    await this.naskahRepository.update(sdi.idNaskah, {
      status: 'final_tte',
    });

    return {
      message: 'Surat Dinas Internal berhasil ditandatangani dengan Digsig',
      data: response,
      signature_metadata: JSON.parse(signatureMetadata),
    };
  }

  /**
   * Sign Surat Dinas Eksternal dengan Digsig
   */
  async signSuratDinasEksternal(
    id: string,
    dto: { nik: string; passphrase: string; no_wa: string; klasifikasi?: string },
  ) {
    const sde = await this.sdiSdeRepository.findOne({ where: { id } });
    if (!sde) {
      throw new NotFoundException(
        `Surat Dinas Eksternal dengan ID ${id} tidak ditemukan`,
      );
    }

    if (!sde.idNaskah) {
      throw new BadRequestException(
        'Surat Dinas Eksternal tidak memiliki naskah terkait',
      );
    }

    const naskah = await this.naskahRepository.findOne({
      where: { id: sde.idNaskah },
    });

    if (!naskah) {
      throw new NotFoundException('Data naskah tidak ditemukan');
    }

    // Validasi bahwa ini adalah SDE
    if (naskah.jenis !== 'SDE') {
      throw new BadRequestException('Naskah bukan Surat Dinas Eksternal');
    }

    if (!naskah.final_pdf) {
      throw new BadRequestException(
        'Dokumen PDF belum di-generate. Harap generate PDF terlebih dahulu',
      );
    }

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
      nik: dto.nik,
      passphrase: dto.passphrase,
      path_dokumen: 'surat-dinas-eksternal/digsig/',
      no_wa: dto.no_wa,
    };

    const response = await this.hitDigsigEndpoint(params);

    const signatureMetadata = formatSignatureData({
      type: 'digsig',
      doc_id: response.doc_id || response.data?.doc_id,
      signed_at: new Date().toISOString(),
      signer_nik: dto.nik,
      path: response.signed_file_path || response.data?.signed_file_path,
    });

    await this.sdiSdeRepository.update(id, {
      tandaTangan: signatureMetadata,
    });

    await this.naskahRepository.update(sde.idNaskah, {
      status: 'final_tte',
    });

    return {
      message: 'Surat Dinas Eksternal berhasil ditandatangani dengan Digsig',
      data: response,
      signature_metadata: JSON.parse(signatureMetadata),
    };
  }

  /**
   * Hit Digsig API Endpoint
   */
  async hitDigsigEndpoint(params: DigsigParams) {
    try {
      // 1. Ambil file dari MinIO
      const buffer = await this.storageService.getFile(params.key);
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

      // 3. Hit endpoint
      const response = await axios.post(
        'http://172.20.16.115:7000/signin',
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );

      return response.data;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        console.error('Axios Error Message:', error.message);
        console.error('Status:', error.response?.status);
        console.error('Response Data:', error.response?.data);
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
          },
          status,
        );
      }
      console.error('Unexpected Error:', error);
      throw new HttpException(
        {
          success: false,
          message: 'Unexpected error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getKTPUser(params: { persnum: string }) {
    try {
      const response = await axios.get(
        `https://api.airnavindonesia.co.id/dataset-dev/hc/personal-ids/${params.persnum}`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization:
              'Bearer ZTE3MTdkN2QyMzE4YmQzYzkyMzc4MmQ2YWEwNjYzYTU0NGYxYzRjMmY2YzEwNjcxNTNlODhmODZjMTE0MmE0MjIyZmNmYWJiMDcyZGM5NmRlMjY5ODk5ODAwMmVjNTJlNGMwYjAwODAxZjUzOGQ5MWI1YzhlNTliYzVmY2RlOTY4YzM3OTllMWYxMTAxMDVmYzFhMTAzYjk1YzM2MDVhYTNkM2U3M2FlMGZiZTBmMWZiMTM3ZmNmZjc4ODY5MTNhOWM1MjU3ZmI1MzlmZGMxM2IwN2VmMTJjYWMxMTIwM2ZkMTQ2OGE5MjkyYjM1YzdmOTI5OWQzODEzMzkxZjE0MjVmZjQ1Yzg2MDg3NDA0MzY4N2M3NDNlMjkyYjhmMzRhMjJmYjQwZjA5OGNiMWM5Mjk4ZGM0MzU5YmI1OTM1MThmNTkyMzJiMDc1NzJmZjUxNjA3YzEzN2U5M2RmNzQ4YTIyZDZiOGY0ZThlM2Q2NDJmN2VmZjE5ZGJjODY5MWY2ZDk2Y2FmYTc5NDY5NTk5YTc5MWZjNzVjZjgzYzZhOGJiOGQwYTBlZWI2YjcwYzQwZWRhYjc5YzVlMzhhMWM3ZDVmNmU5YWFmNjFkYmZmMzVjN2U0OWU0NzRhNDcyYjdiYmI4MjRkNTkxNDM3YjhkOWJjYjZkMzZhMTNjMzk5MzQ3ZTAyNzY5ZDc3ODk1ZWNkNjQyY2ZlM2FlNDg0MTYyYg==',
          },
          timeout: 30000,
        },
      );
      const data = response.data?.data ?? [];
      const filterktp = data.find((x) => x.subType === '01');
      if (!filterktp) {
        throw new BadRequestException('Data KTP dengan subType 01 tidak ditemukan');
      }
      return {
        noktp: filterktp.number
      };
    } catch (error: any) {
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
          'Gagal mengambil data dari service external';

        // 🔥 lempar ulang ke controller
        throw new HttpException(
          {
            success: false,
            message,
            error: error instanceof Error ? error.message : String(error),
          },
          status,
        );
      }
      const msgerror = error.response.message ?? 'Unexpected error';
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

    // Prepare options untuk generate PDF menggunakan generate_pdf_nodin
    const pdfOptions = {
      html: nd.konten || naskah.konten || '',
      perihal: nd.perihal || naskah.perihal || '',
      dari: nd.dari || '',
      namaLengkap: nd.namaLengkap || '',
      positionText: nd.namaJabatan || '',
      nomor: nd.nomor || naskah.nomor || '',
      tanggal: naskah.tanggal
        ? new Date(naskah.tanggal).toISOString().split('T')[0]
        : '',
      nama_tempat: nd.namaTempat || 'Tangerang',
      tertuju: tertuju,
      tembusan: tembusan,
      qrCodeHtml: qrCodeHtml, // QR code untuk section TTD
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

    // Generate QR code HTML section
    const qrCodeHtml = this.qrCodeService.generateQRCodeHtml(qrCodeBase64, qrData);

    // Get konten dan append QR code
    const konten = sdiSde.konten || naskah.konten || '';
    const kontenWithQR = konten + qrCodeHtml;

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

    // Prepare options untuk generate PDF
    const pdfOptions = {
      html: Buffer.from(kontenWithQR, 'utf-8').toString('base64'),
      perihal: sdiSde.perihal || naskah.perihal || '',
      namaLengkap: sdiSde.namaLengkap || '',
      positionText: sdiSde.namaJabatan || '',
      nomor: sdiSde.nomor || naskah.nomor || '',
      tanggal: naskah.tanggal
        ? new Date(naskah.tanggal).toISOString().split('T')[0]
        : '',
      nama_tempat: sdiSde.namaTempat || 'Tangerang',
      nama_jabatan: sdiSde.namaJabatan || '',
      sifat: sdiSde.sifat || 'Biasa',
      lampiran: sdiSde.lampiran || '-',
      penerima: penerima,
      tembusan: tembusan,
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
}
