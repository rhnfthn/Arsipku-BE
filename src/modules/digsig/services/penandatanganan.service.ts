import {
  Injectable,
  HttpException,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DigsigDocumentEntity } from '../entities/digsig-document.entity';
import { DigsigDocumentSignerEntity } from '../entities/digsig-document-signer.entity';
import { DigsigService } from './digsig.service';
import { DigsigLogService } from './digsig-log.service';
import { StorageService } from '../../storage/services/storage.service';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  FilterPenandatangananDto,
  SignWithPassphraseDto,
  RejectSigningDto,
  PenandatangananItemDto,
  PenandatangananPaginatedResponseDto,
  SigningResultDto,
  RejectResultDto,
  PenandatangananDetailDto,
  SignerInfoDto,
} from '../dto/penandatanganan.dto';
import { JENIS_NASKAH_OPTIONS } from '../dto/digsig-document.dto';

@Injectable()
export class PenandatangananService {
  constructor(
    @InjectRepository(DigsigDocumentEntity)
    private readonly documentRepository: Repository<DigsigDocumentEntity>,
    @InjectRepository(DigsigDocumentSignerEntity)
    private readonly signerRepository: Repository<DigsigDocumentSignerEntity>,
    private readonly digsigService: DigsigService,
    private readonly digsigLogService: DigsigLogService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Get list of documents for signing page
   * Shows documents where current user is a signer
   */
  async getMySigningList(
    persnum: number,
    filter: FilterPenandatangananDto,
  ): Promise<PenandatangananPaginatedResponseDto> {
    const page = filter.page || 1;
    const limit = filter.limit || 10;
    const skip = (page - 1) * limit;

    // Build base query - find documents where user is a signer
    const queryBuilder = this.documentRepository
      .createQueryBuilder('doc')
      .innerJoin('doc.signers', 'mySigner', 'mySigner.persnum = :persnum', { persnum })
      .leftJoinAndSelect('doc.signers', 'allSigners')
      .orderBy('doc.createdAt', 'DESC')
      .addOrderBy('allSigners.urutan', 'ASC');

    // Filter by status
    if (filter.status && filter.status !== 'all') {
      if (filter.status === 'pending') {
        // Documents where my signature is waiting
        queryBuilder.andWhere('mySigner.status = :signerStatus', { signerStatus: 'waiting' });
        queryBuilder.andWhere('doc.status = :docStatus', { docStatus: 'on_progress' });
      } else if (filter.status === 'signed') {
        queryBuilder.andWhere('mySigner.status = :signerStatus', { signerStatus: 'signed' });
      } else if (filter.status === 'rejected') {
        queryBuilder.andWhere('(mySigner.status = :signerStatus OR doc.status = :docStatus)', {
          signerStatus: 'rejected',
          docStatus: 'rejected',
        });
      }
    }

    // Filter by jenis naskah
    if (filter.jenisNaskah) {
      queryBuilder.andWhere('doc.jenisNaskah = :jenisNaskah', { jenisNaskah: filter.jenisNaskah });
    }

    // Filter by date range
    if (filter.startDate && filter.endDate) {
      queryBuilder.andWhere('doc.createdAt BETWEEN :startDate AND :endDate', {
        startDate: filter.startDate,
        endDate: filter.endDate,
      });
    } else if (filter.startDate) {
      queryBuilder.andWhere('doc.createdAt >= :startDate', { startDate: filter.startDate });
    } else if (filter.endDate) {
      queryBuilder.andWhere('doc.createdAt <= :endDate', { endDate: filter.endDate });
    }

    // Search
    if (filter.search) {
      queryBuilder.andWhere(
        '(doc.nomorDokumen LIKE :search OR doc.perihal LIKE :search)',
        { search: `%${filter.search}%` },
      );
    }

    // Get paginated results
    const [documents, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    // Get summary counts
    const summaryQuery = await this.signerRepository
      .createQueryBuilder('signer')
      .leftJoin('signer.document', 'doc')
      .select([
        `SUM(CASE WHEN signer.status = 'waiting' AND doc.status = 'on_progress' THEN 1 ELSE 0 END) as totalPending`,
        `SUM(CASE WHEN signer.status = 'signed' THEN 1 ELSE 0 END) as totalSigned`,
        `SUM(CASE WHEN signer.status = 'rejected' OR doc.status = 'rejected' THEN 1 ELSE 0 END) as totalRejected`,
      ])
      .where('signer.persnum = :persnum', { persnum })
      .getRawOne();

    // Transform to response
    const data = await Promise.all(
      documents.map(doc => this.toSigningListItem(doc, persnum)),
    );

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      summary: {
        totalPending: parseInt(summaryQuery?.totalPending || '0', 10),
        totalSigned: parseInt(summaryQuery?.totalSigned || '0', 10),
        totalRejected: parseInt(summaryQuery?.totalRejected || '0', 10),
      },
    };
  }

  /**
   * Get detail of document for signing
   */
  async getSigningDetail(
    documentId: string,
    persnum: number,
  ): Promise<PenandatangananDetailDto> {
    const document = await this.documentRepository.findOne({
      where: { id: documentId },
      relations: ['signers'],
    });

    if (!document) {
      throw new NotFoundException(`Dokumen dengan ID ${documentId} tidak ditemukan`);
    }

    // Sort signers by urutan
    if (document.signers) {
      document.signers.sort((a, b) => a.urutan - b.urutan);
    }

    // Check if user is a signer
    const mySigner = document.signers?.find(s => s.persnum === persnum);
    if (!mySigner) {
      throw new ForbiddenException('Anda tidak memiliki akses ke dokumen ini');
    }

    return this.toSigningDetail(document, persnum);
  }

  /**
   * Sign document with passphrase (BSrE)
   * NIK dan noWa diambil dari JWT payload (user profile)
   */
  async signDocument(
    documentId: string,
    dto: SignWithPassphraseDto,
    user: JwtPayload,
  ): Promise<SigningResultDto> {
    const persnum = user.persnum;
    const userName = user.nama;
    
    // Validasi NIK dari JWT payload
    const userData = this.digsigService.getUserDataFromJwt(user);
    
    const document = await this.documentRepository.findOne({
      where: { id: documentId },
      relations: ['signers'],
    });

    if (!document) {
      throw new NotFoundException(`Dokumen dengan ID ${documentId} tidak ditemukan`);
    }

    // Sort signers
    if (document.signers) {
      document.signers.sort((a, b) => a.urutan - b.urutan);
    }

    // Find signer
    const signer = document.signers?.find(s => s.persnum === persnum);
    if (!signer) {
      throw new ForbiddenException('Anda tidak terdaftar sebagai penandatangan dokumen ini');
    }

    if (signer.status !== 'waiting') {
      if (signer.status === 'signed') {
        throw new BadRequestException('Anda sudah menandatangani dokumen ini');
      } else if (signer.status === 'rejected') {
        throw new BadRequestException('Dokumen ini sudah ditolak');
      } else {
        throw new BadRequestException('Belum giliran Anda untuk menandatangani');
      }
    }

    if (document.status !== 'on_progress') {
      throw new BadRequestException(`Dokumen tidak dapat ditandatangani (status: ${document.status})`);
    }

    // Safely convert tanggalDokumen to string (handle both Date and string)
    const tanggalRaw = document.tanggalDokumen as unknown;
    const tanggalStr = tanggalRaw instanceof Date
      ? tanggalRaw.toISOString().split('T')[0]
      : typeof tanggalRaw === 'string'
        ? tanggalRaw.split('T')[0]
        : new Date(tanggalRaw as string | number).toISOString().split('T')[0];

    try {
      // Hit BSrE API for signing
      const bsreResponse = await this.digsigService.hitDigsigEndpoint(
        {
          key: document.filePath!,
          filename: document.fileName!,
          nomorDokumen: document.nomorDokumen,
          tanggalDokumen: tanggalStr,
          klasifikasi: document.klasifikasi || 'Biasa',
          jenisNaskah: document.jenisNaskah,
          perihal: document.perihal || '',
          nik: userData.nik,
          passphrase: dto.passphrase,
          path_dokumen: 'digsig-document/signed/',
          no_wa: userData.no_wa,
        },
        {
          userPersnum: persnum,
          userName: userName || signer.nama || undefined,
          idNaskah: documentId,
          jenisNaskah: document.jenisNaskah,
        },
      );

      const signedAt = new Date();

      // Update signer status
      signer.status = 'signed';
      signer.signedAt = signedAt;
      signer.signatureId = bsreResponse?.signature_id || null;
      signer.bsreDocId = bsreResponse?.doc_id || null;
      signer.bsreNameDoc = bsreResponse?.name_doc?.[0] || null;
      signer.keterangan = dto.keterangan || null;
      await this.signerRepository.save(signer);

      // Update file path to signed version
      let signedFilePreviewUrl: string | null = null;
      if (bsreResponse?.name_doc?.[0]) {
        document.signedFilePath = `digsig-document/signed/${bsreResponse.name_doc[0]}`;
        document.signedFileName = bsreResponse.name_doc[0];
        // Update filePath for next signer
        document.filePath = document.signedFilePath;

        try {
          signedFilePreviewUrl = await this.storageService.getPreviewUrl(document.signedFilePath, 3600);
        } catch (e) {
          // Ignore
        }
      }

      // Check if all signers have signed
      const unsignedCount = document.signers!.filter(
        s => s.status !== 'signed' && s.id !== signer.id,
      ).length;

      if (unsignedCount === 0) {
        // All signed - complete
        document.status = 'completed';
      } else {
        // Move to next signer
        document.currentSignerOrder = signer.urutan + 1;

        // Set next signer to waiting
        const nextSigner = document.signers!.find(s => s.urutan === signer.urutan + 1);
        if (nextSigner) {
          nextSigner.status = 'waiting';
          await this.signerRepository.save(nextSigner);
        }
      }

      await this.documentRepository.save(document);

      return {
        success: true,
        message: 'Dokumen berhasil ditandatangani',
        documentId: document.id,
        signedAt,
        signatureId: signer.signatureId || undefined,
        bsreDocId: signer.bsreDocId || undefined,
        signedFilePath: document.signedFilePath || undefined,
        signedFilePreviewUrl: signedFilePreviewUrl || undefined,
      };
    } catch (error) {
      // Log failed attempt
      await this.digsigLogService.createLog({
        userPersnum: persnum,
        userName: userName || signer.nama || undefined,
        idNaskah: documentId,
        nomorNaskah: document.nomorDokumen,
        jenisNaskah: document.jenisNaskah,
        apiEndpoint: 'SIGN_BSRE',
        action: 'sign',
        status: 'gagal',
        note: `Gagal TTD: ${error.message}`,
      });

      throw new HttpException(
        {
          message: error.response?.message || error.message || 'Gagal menandatangani dokumen',
          details: error.response?.data || null,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Reject document signing
   */
  async rejectDocument(
    documentId: string,
    persnum: number,
    dto: RejectSigningDto,
    userName?: string,
  ): Promise<RejectResultDto> {
    const document = await this.documentRepository.findOne({
      where: { id: documentId },
      relations: ['signers'],
    });

    if (!document) {
      throw new NotFoundException(`Dokumen dengan ID ${documentId} tidak ditemukan`);
    }

    // Find signer
    const signer = document.signers?.find(s => s.persnum === persnum);
    if (!signer) {
      throw new ForbiddenException('Anda tidak terdaftar sebagai penandatangan dokumen ini');
    }

    if (signer.status !== 'waiting') {
      if (signer.status === 'signed') {
        throw new BadRequestException('Anda sudah menandatangani dokumen ini, tidak dapat menolak');
      } else if (signer.status === 'rejected') {
        throw new BadRequestException('Dokumen ini sudah ditolak');
      } else {
        throw new BadRequestException('Belum giliran Anda untuk menandatangani/menolak');
      }
    }

    if (document.status !== 'on_progress') {
      throw new BadRequestException(`Dokumen tidak dapat ditolak (status: ${document.status})`);
    }

    const rejectedAt = new Date();

    // Update signer
    signer.status = 'rejected';
    signer.rejectedAt = rejectedAt;
    signer.keterangan = dto.alasan;
    await this.signerRepository.save(signer);

    // Update document
    document.status = 'rejected';
    document.rejectedBy = persnum;
    document.rejectedAt = rejectedAt;
    document.rejectionReason = dto.alasan;
    await this.documentRepository.save(document);

    // Log rejection (using 'sign' action with gagal status to indicate rejection)
    await this.digsigLogService.createLog({
      userPersnum: persnum,
      userName: userName || signer.nama || undefined,
      idNaskah: documentId,
      nomorNaskah: document.nomorDokumen,
      jenisNaskah: document.jenisNaskah,
      apiEndpoint: 'REJECT_DOCUMENT',
      action: 'sign',
      status: 'gagal',
      note: `Dokumen ditolak: ${dto.alasan}`,
    });

    return {
      success: true,
      message: 'Dokumen berhasil ditolak',
      documentId: document.id,
      rejectedAt,
    };
  }

  /**
   * Get summary statistics for current user
   */
  async getSigningSummary(persnum: number): Promise<{
    totalPending: number;
    totalSigned: number;
    totalRejected: number;
    total: number;
  }> {
    const result = await this.signerRepository
      .createQueryBuilder('signer')
      .leftJoin('signer.document', 'doc')
      .select([
        `SUM(CASE WHEN signer.status = 'waiting' AND doc.status = 'on_progress' THEN 1 ELSE 0 END) as totalPending`,
        `SUM(CASE WHEN signer.status = 'signed' THEN 1 ELSE 0 END) as totalSigned`,
        `SUM(CASE WHEN signer.status = 'rejected' OR doc.status = 'rejected' THEN 1 ELSE 0 END) as totalRejected`,
        `COUNT(*) as total`,
      ])
      .where('signer.persnum = :persnum', { persnum })
      .getRawOne();

    return {
      totalPending: parseInt(result?.totalPending || '0', 10),
      totalSigned: parseInt(result?.totalSigned || '0', 10),
      totalRejected: parseInt(result?.totalRejected || '0', 10),
      total: parseInt(result?.total || '0', 10),
    };
  }

  // ======== Private Helper Methods ========

  private async toSigningListItem(
    doc: DigsigDocumentEntity,
    persnum: number,
  ): Promise<PenandatangananItemDto> {
    const mySigner = doc.signers?.find(s => s.persnum === persnum);

    // Determine status for display
    let status: 'pending' | 'signed' | 'rejected' = 'pending';
    if (mySigner?.status === 'signed') {
      status = 'signed';
    } else if (mySigner?.status === 'rejected' || doc.status === 'rejected') {
      status = 'rejected';
    }

    // Generate file preview URLs
    let filePreviewUrl: string | null = null;
    let signedFilePreviewUrl: string | null = null;

    if (doc.filePath) {
      try {
        filePreviewUrl = await this.storageService.getPreviewUrl(doc.filePath, 3600);
      } catch (e) {
        // Ignore
      }
    }

    if (doc.signedFilePath) {
      try {
        signedFilePreviewUrl = await this.storageService.getPreviewUrl(doc.signedFilePath, 3600);
      } catch (e) {
        // Ignore
      }
    }

    return {
      id: doc.id,
      tanggalDibuat: doc.createdAt,
      nomorDokumen: doc.nomorDokumen,
      jenisNaskah: doc.jenisNaskah,
      perihal: doc.perihal,
      totalPenandatangan: doc.totalSigners,
      currentSignerOrder: doc.currentSignerOrder,
      status,
      mySignerStatus: mySigner?.status || 'pending',
      documentStatus: doc.status,
      canSign: mySigner?.status === 'waiting' && doc.status === 'on_progress',
      canReject: mySigner?.status === 'waiting' && doc.status === 'on_progress',
      signers: (doc.signers || []).map(s => this.toSignerInfo(s)),
      filePreviewUrl,
      signedFilePreviewUrl,
      createdByName: doc.createdByName,
      createdByPosition: doc.createdByPosition,
    };
  }

  private async toSigningDetail(
    doc: DigsigDocumentEntity,
    persnum: number,
  ): Promise<PenandatangananDetailDto> {
    const mySigner = doc.signers?.find(s => s.persnum === persnum);

    // Get jenis naskah label
    const jenisNaskahOption = JENIS_NASKAH_OPTIONS.find(j => j.value === doc.jenisNaskah);
    const jenisNaskahText = jenisNaskahOption?.label || doc.jenisNaskah;

    // Generate file preview URLs
    let filePreviewUrl: string | null = null;
    let signedFilePreviewUrl: string | null = null;

    if (doc.filePath) {
      try {
        filePreviewUrl = await this.storageService.getPreviewUrl(doc.filePath, 3600);
      } catch (e) {
        // Ignore
      }
    }

    if (doc.signedFilePath) {
      try {
        signedFilePreviewUrl = await this.storageService.getPreviewUrl(doc.signedFilePath, 3600);
      } catch (e) {
        // Ignore
      }
    }

    return {
      id: doc.id,
      tanggalDokumen: doc.tanggalDokumen,
      tanggalDibuat: doc.createdAt,
      nomorDokumen: doc.nomorDokumen,
      jenisNaskah: doc.jenisNaskah,
      jenisNaskahText,
      klasifikasi: doc.klasifikasi,
      klasifikasiText: doc.klasifikasiText,
      perihal: doc.perihal,
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      fileMimeType: doc.fileMimeType,
      filePreviewUrl,
      signedFileName: doc.signedFileName,
      signedFilePreviewUrl,
      documentStatus: doc.status,
      currentSignerOrder: doc.currentSignerOrder,
      totalSigners: doc.totalSigners,
      signers: (doc.signers || []).map(s => this.toSignerInfo(s)),
      mySignerInfo: mySigner ? this.toSignerInfo(mySigner) : null,
      canSign: mySigner?.status === 'waiting' && doc.status === 'on_progress',
      canReject: mySigner?.status === 'waiting' && doc.status === 'on_progress',
      createdBy: doc.createdBy,
      createdByName: doc.createdByName,
      createdByPosition: doc.createdByPosition,
      rejectionReason: doc.rejectionReason,
      rejectedBy: doc.rejectedBy,
      rejectedAt: doc.rejectedAt,
    };
  }

  private toSignerInfo(signer: DigsigDocumentSignerEntity): SignerInfoDto {
    return {
      id: signer.id,
      urutan: signer.urutan,
      persnum: signer.persnum,
      nama: signer.nama,
      jabatan: signer.jabatan,
      lokasi: signer.lokasi,
      status: signer.status,
      signedAt: signer.signedAt,
      rejectedAt: signer.rejectedAt,
      keterangan: signer.keterangan,
    };
  }
}
