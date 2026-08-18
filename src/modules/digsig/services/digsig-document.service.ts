import {
  Injectable,
  HttpException,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Between, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DigsigDocumentEntity } from '../entities/digsig-document.entity';
import { DigsigDocumentSignerEntity } from '../entities/digsig-document-signer.entity';
import {
  CreateDigsigDocumentDto,
  UpdateDigsigDocumentDto,
  FilterDigsigDocumentDto,
  SignDocumentDto,
  RejectDocumentDto,
  DigsigDocumentResponseDto,
  DigsigDocumentPaginatedResponseDto,
  JENIS_NASKAH_OPTIONS,
} from '../dto/digsig-document.dto';
import { DigsigService } from './digsig.service';
import { DigsigLogService } from './digsig-log.service';
import { StorageService } from '../../storage/services/storage.service';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import { NotificationService } from '../../notification/services';
import { NotificationType } from '../../notification/entities';

@Injectable()
export class DigsigDocumentService {
  constructor(
    @InjectRepository(DigsigDocumentEntity)
    private readonly documentRepository: Repository<DigsigDocumentEntity>,
    @InjectRepository(DigsigDocumentSignerEntity)
    private readonly signerRepository: Repository<DigsigDocumentSignerEntity>,
    private readonly digsigService: DigsigService,
    private readonly digsigLogService: DigsigLogService,
    private readonly storageService: StorageService,
    private readonly orgDataService: OrgDataService,
    private readonly notificationService: NotificationService,
  ) {}

  private async notifySigner(
    document: DigsigDocumentEntity,
    signer: DigsigDocumentSignerEntity | null | undefined,
  ) {
    if (!signer?.positionId) return;

    await this.notificationService.createNotification({
      positionId: String(signer.positionId),
      userPersnum: signer.persnum,
      type: NotificationType.DIGSIG_TANDA_TANGAN,
      title: 'Dokumen menunggu tanda tangan',
      body:
        document.perihal ||
        document.nomorDokumen ||
        'Ada dokumen yang perlu ditandatangani',
      data: {
        action: 'OPEN_DIGSIG_PENANDATANGANAN',
        requestId: document.id,
        documentId: document.id,
        signerId: signer.id,
        nomor: document.nomorDokumen,
        perihal: document.perihal,
        jenis: document.jenisNaskah,
      },
    });
  }

  private async notifyCreator(
    document: DigsigDocumentEntity,
    type: NotificationType.DIGSIG_SELESAI | NotificationType.DIGSIG_DITOLAK,
    title: string,
    body: string,
  ) {
    const userData = await this.orgDataService
      .findByPersnum(document.createdBy)
      .catch(() => null);
    const positionId = userData?.position;
    if (!positionId) return;

    await this.notificationService.createNotification({
      positionId: String(positionId),
      userPersnum: document.createdBy,
      type,
      title,
      body,
      data: {
        action: 'OPEN_DIGSIG_DETAIL',
        requestId: document.id,
        documentId: document.id,
        nomor: document.nomorDokumen,
        perihal: document.perihal,
        jenis: document.jenisNaskah,
      },
    });
  }

  /**
   * Create new document for signing
   */
  async create(
    dto: CreateDigsigDocumentDto,
    file: { path: string; name: string; size: number; mimeType: string } | null,
    createdBy: number,
    createdByName?: string,
    createdByPosition?: string,
  ): Promise<DigsigDocumentEntity> {
    const documentId = uuidv4();

    // Create document
    const document = this.documentRepository.create({
      id: documentId,
      tanggalDokumen: new Date(dto.tanggalDokumen),
      klasifikasi: dto.klasifikasi || null,
      klasifikasiText: dto.klasifikasiText || null,
      jenisNaskah: dto.jenisNaskah,
      nomorDokumen: dto.nomorDokumen,
      perihal: dto.perihal || null,
      filePath: file?.path || null,
      fileName: file?.name || null,
      fileSize: file?.size || null,
      fileMimeType: file?.mimeType || null,
      visibleSign: dto.visibleSign ? 1 : 0,
      status: 'on_progress',
      totalSigners: dto.signers?.length || 0,
      currentSignerOrder: dto.signers && dto.signers.length > 0 ? 1 : 0,
      createdBy,
      createdByName: createdByName || null,
      createdByPosition: createdByPosition || null,
    });

    await this.documentRepository.save(document);

    // Create signers (if provided)
    if (dto.signers && dto.signers.length > 0) {
      for (let i = 0; i < dto.signers.length; i++) {
        const signerItem = dto.signers[i];

        // Normalize signer item - could be number or object
        let signerPersnum: number;
        let providedNama: string | null = null;
        let providedJabatan: string | null = null;
        let providedLokasi: string | null = null;
        let providedPositionId: number | null = null;

        if (typeof signerItem === 'number') {
          signerPersnum = signerItem;
        } else if (typeof signerItem === 'object' && signerItem !== null) {
          signerPersnum = signerItem.persnum;
          providedNama = signerItem.nama || null;
          providedJabatan = signerItem.jabatan || null;
          providedLokasi = signerItem.lokasi || null;
          providedPositionId = signerItem.positionId || null;
        } else {
          console.warn(`Invalid signer item at index ${i}:`, signerItem);
          continue;
        }

        // If nama/jabatan/lokasi not provided, try to fetch from org_data
        let signerData = {
          persnum: signerPersnum,
          nama: providedNama,
          jabatan: providedJabatan,
          lokasi: providedLokasi,
          positionId: providedPositionId,
        };

        if (!providedNama || !providedJabatan || !providedLokasi) {
          try {
            // Use creator's session to fetch signer's data
            const userData = await this.fetchUserDataFromHR(
              signerPersnum,
              createdBy,
            );
            signerData = {
              persnum: signerPersnum,
              nama: providedNama || userData.nama || null,
              jabatan: providedJabatan || userData.jabatan || null,
              lokasi: providedLokasi || userData.lokasi || null,
              positionId: providedPositionId || userData.positionId || null,
            };
          } catch (error) {
            console.warn(
              `Failed to fetch user data for persnum ${signerPersnum}:`,
              error.message,
            );
            // Continue with provided data or null
          }
        }

        const signer = this.signerRepository.create({
          id: uuidv4(),
          idDocument: documentId,
          urutan: i + 1,
          persnum: signerData.persnum,
          nama: signerData.nama,
          jabatan: signerData.jabatan,
          lokasi: signerData.lokasi,
          positionId: signerData.positionId,
          status: i === 0 ? 'waiting' : 'pending', // First signer is waiting
        });
        await this.signerRepository.save(signer);
      }
    }

    const created = await this.findById(documentId);
    this.notifySigner(
      created,
      created.signers?.find((signer) => signer.status === 'waiting'),
    ).catch((err) =>
      console.warn(
        `[DigsigDocument] Failed to send signer notification: ${err?.message}`,
      ),
    );

    return created;
  }

  /**
   * Fetch user data from OrgDataService using persnum
   * Uses local org_data cache instead of external HR API
   * @param targetPersnum - Persnum of user to fetch
   * @param creatorPersnum - Persnum of logged-in user (not used, kept for compatibility)
   */
  private async fetchUserDataFromHR(
    targetPersnum: number,
    creatorPersnum: number,
  ): Promise<{
    nama: string;
    jabatan: string;
    lokasi: string;
    positionId: number | null;
  }> {
    try {
      // Use OrgDataService to find user by persnum from local cache
      const userData = await this.orgDataService.findByPersnum(targetPersnum);

      if (!userData) {
        console.warn(
          `User with persnum ${targetPersnum} not found in org_data`,
        );
        return {
          nama: `User ${targetPersnum}`,
          jabatan: '',
          lokasi: '',
          positionId: null,
        };
      }

      // Build lokasi from area/subArea
      let lokasi = '';
      if (userData.subAreaText) {
        lokasi = userData.subAreaText;
      } else if (userData.areaText) {
        lokasi = userData.areaText;
      }

      return {
        nama: userData.nama || `User ${targetPersnum}`,
        jabatan: userData.positionText || '',
        lokasi: lokasi,
        positionId: userData.position || null,
      };
    } catch (error) {
      console.error(
        `Error fetching user data for persnum ${targetPersnum}:`,
        error.message,
      );
      // Return default values instead of throwing
      return {
        nama: `User ${targetPersnum}`,
        jabatan: '',
        lokasi: '',
        positionId: null,
      };
    }
  }

  /**
   * Update document (only if still draft or on_progress with no signatures yet)
   */
  async update(
    id: string,
    dto: UpdateDigsigDocumentDto,
    file?: {
      path: string;
      name: string;
      size: number;
      mimeType: string;
    } | null,
  ): Promise<DigsigDocumentEntity> {
    const document = await this.findById(id);

    // Check if can edit
    const signedSigners = await this.signerRepository.count({
      where: { idDocument: id, status: 'signed' },
    });

    if (signedSigners > 0) {
      throw new BadRequestException(
        'Dokumen tidak bisa diedit karena sudah ada penandatangan',
      );
    }

    // Update document fields
    if (dto.tanggalDokumen)
      document.tanggalDokumen = new Date(dto.tanggalDokumen);
    if (dto.klasifikasi !== undefined)
      document.klasifikasi = dto.klasifikasi || null;
    if (dto.klasifikasiText !== undefined)
      document.klasifikasiText = dto.klasifikasiText || null;
    if (dto.jenisNaskah) document.jenisNaskah = dto.jenisNaskah;
    if (dto.nomorDokumen) document.nomorDokumen = dto.nomorDokumen;
    if (dto.perihal !== undefined) document.perihal = dto.perihal || null;
    if (dto.visibleSign !== undefined)
      document.visibleSign = dto.visibleSign ? 1 : 0;

    // Update file if provided
    if (file) {
      // Delete old file if exists
      if (document.filePath) {
        try {
          await this.storageService.deleteFile(document.filePath);
        } catch (e) {
          console.warn(`Failed to delete old file: ${e.message}`);
        }
      }
      document.filePath = file.path;
      document.fileName = file.name;
      document.fileSize = file.size;
      document.fileMimeType = file.mimeType;
    }

    // Update signers if provided
    if (dto.signers && dto.signers.length > 0) {
      // Delete existing signers
      await this.signerRepository.delete({ idDocument: id });

      // Create new signers (same logic as create)
      for (let i = 0; i < dto.signers.length; i++) {
        const signerItem = dto.signers[i];

        // Normalize signer item - could be number or object
        let signerPersnum: number;
        let providedNama: string | null = null;
        let providedJabatan: string | null = null;
        let providedLokasi: string | null = null;
        let providedPositionId: number | null = null;

        if (typeof signerItem === 'number') {
          signerPersnum = signerItem;
        } else if (typeof signerItem === 'object' && signerItem !== null) {
          signerPersnum = signerItem.persnum;
          providedNama = signerItem.nama || null;
          providedJabatan = signerItem.jabatan || null;
          providedLokasi = signerItem.lokasi || null;
          providedPositionId = signerItem.positionId || null;
        } else {
          console.warn(`Invalid signer item at index ${i}:`, signerItem);
          continue;
        }

        // If nama/jabatan/lokasi not provided, try to fetch from org_data
        let signerData = {
          persnum: signerPersnum,
          nama: providedNama,
          jabatan: providedJabatan,
          lokasi: providedLokasi,
          positionId: providedPositionId,
        };

        if (!providedNama || !providedJabatan || !providedLokasi) {
          try {
            const userData = await this.fetchUserDataFromHR(
              signerPersnum,
              document.createdBy,
            );
            signerData = {
              persnum: signerPersnum,
              nama: providedNama || userData.nama || null,
              jabatan: providedJabatan || userData.jabatan || null,
              lokasi: providedLokasi || userData.lokasi || null,
              positionId: providedPositionId || userData.positionId || null,
            };
          } catch (error) {
            console.warn(
              `Failed to fetch user data for persnum ${signerPersnum}:`,
              error.message,
            );
          }
        }

        const signer = this.signerRepository.create({
          id: uuidv4(),
          idDocument: id,
          urutan: i + 1,
          persnum: signerData.persnum,
          nama: signerData.nama,
          jabatan: signerData.jabatan,
          lokasi: signerData.lokasi,
          positionId: signerData.positionId,
          status: i === 0 ? 'waiting' : 'pending',
        });
        await this.signerRepository.save(signer);
      }
      document.totalSigners = dto.signers.length;
      document.currentSignerOrder = 1;
    }

    // Hindari menyimpan ulang relasi signers yang sudah ter-load dari findById(),
    // karena signers lama bisa ikut terbawa setelah delete/recreate dan memicu
    // insert/update relasi yang tidak diinginkan.
    delete (document as any).signers;
    await this.documentRepository.save(document);
    return this.findById(id);
  }

  /**
   * Find document by ID with signers
   */
  async findById(id: string): Promise<DigsigDocumentEntity> {
    const document = await this.documentRepository.findOne({
      where: { id },
      relations: ['signers'],
    });

    if (!document) {
      throw new NotFoundException(`Dokumen dengan ID ${id} tidak ditemukan`);
    }

    // Sort signers by urutan
    if (document.signers) {
      document.signers.sort((a, b) => a.urutan - b.urutan);
    }

    return document;
  }

  /**
   * Find all documents with filtering
   */
  async findAll(
    filter: FilterDigsigDocumentDto,
  ): Promise<DigsigDocumentPaginatedResponseDto> {
    const page = filter.page || 1;
    const limit = filter.limit || 10;
    const skip = (page - 1) * limit;

    const queryBuilder = this.documentRepository
      .createQueryBuilder('doc')
      .leftJoinAndSelect('doc.signers', 'signers')
      .orderBy('doc.createdAt', 'DESC')
      .addOrderBy('signers.urutan', 'ASC');

    // Apply filters
    if (filter.status) {
      queryBuilder.andWhere('doc.status = :status', { status: filter.status });
    }

    if (filter.jenisNaskah) {
      queryBuilder.andWhere('doc.jenisNaskah = :jenisNaskah', {
        jenisNaskah: filter.jenisNaskah,
      });
    }

    if (filter.klasifikasi) {
      queryBuilder.andWhere('doc.klasifikasi = :klasifikasi', {
        klasifikasi: filter.klasifikasi,
      });
    }

    if (filter.createdBy) {
      queryBuilder.andWhere('doc.createdBy = :createdBy', {
        createdBy: filter.createdBy,
      });
    }

    if (filter.signerPersnum) {
      queryBuilder.andWhere('signers.persnum = :signerPersnum', {
        signerPersnum: filter.signerPersnum,
      });
    }

    if (filter.startDate && filter.endDate) {
      queryBuilder.andWhere(
        'doc.tanggalDokumen BETWEEN :startDate AND :endDate',
        {
          startDate: filter.startDate,
          endDate: filter.endDate,
        },
      );
    } else if (filter.startDate) {
      queryBuilder.andWhere('doc.tanggalDokumen >= :startDate', {
        startDate: filter.startDate,
      });
    } else if (filter.endDate) {
      queryBuilder.andWhere('doc.tanggalDokumen <= :endDate', {
        endDate: filter.endDate,
      });
    }

    if (filter.search) {
      queryBuilder.andWhere(
        '(doc.nomorDokumen LIKE :search OR doc.perihal LIKE :search)',
        { search: `%${filter.search}%` },
      );
    }

    const [documents, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: await Promise.all(documents.map((doc) => this.toResponseDto(doc))),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get documents pending signature for a user
   */
  async getMyPendingSignatures(
    persnum: number,
    filter: FilterDigsigDocumentDto,
  ): Promise<DigsigDocumentPaginatedResponseDto> {
    const page = filter.page || 1;
    const limit = filter.limit || 10;
    const skip = (page - 1) * limit;

    const queryBuilder = this.documentRepository
      .createQueryBuilder('doc')
      .innerJoinAndSelect('doc.signers', 'signers')
      .leftJoinAndSelect('doc.signers', 'allSigners')
      .where('signers.persnum = :persnum', { persnum })
      .andWhere('signers.status = :status', { status: 'waiting' })
      .andWhere('doc.status = :docStatus', { docStatus: 'on_progress' })
      .orderBy('doc.createdAt', 'DESC')
      .addOrderBy('allSigners.urutan', 'ASC');

    const [documents, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: await Promise.all(documents.map((doc) => this.toResponseDto(doc))),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Sign document by current signer
   */
  async signDocument(
    documentId: string,
    persnum: number,
    dto: SignDocumentDto,
  ): Promise<DigsigDocumentEntity> {
    const document = await this.findById(documentId);

    // Find signer
    const signer = document.signers.find(
      (s) => s.persnum === persnum && s.status === 'waiting',
    );
    if (!signer) {
      throw new BadRequestException(
        'Anda tidak memiliki hak untuk menandatangani dokumen ini atau bukan giliran Anda',
      );
    }

    // Get user data for BSrE
    const userData = await this.digsigService.getUserDataForBsre(
      persnum.toString(),
    );

    // Safely convert tanggalDokumen to string (handle both Date and string)
    const tanggalRaw = document.tanggalDokumen as unknown;
    const tanggalStr =
      tanggalRaw instanceof Date
        ? tanggalRaw.toISOString().split('T')[0]
        : typeof tanggalRaw === 'string'
          ? tanggalRaw.split('T')[0]
          : new Date(tanggalRaw as string | number).toISOString().split('T')[0];

    try {
      // Hit BSrE API
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
          userName: signer.nama || undefined,
          idNaskah: documentId,
          jenisNaskah: document.jenisNaskah,
        },
      );

      // Update signer status
      signer.status = 'signed';
      signer.signedAt = new Date();
      signer.signatureId = bsreResponse?.signature_id || null;
      signer.bsreDocId = bsreResponse?.doc_id || null;
      signer.bsreNameDoc = bsreResponse?.name_doc?.[0] || null;
      signer.keterangan = dto.keterangan || null;
      await this.signerRepository.save(signer);

      // Update file path to signed version if available
      if (bsreResponse?.name_doc?.[0]) {
        document.signedFilePath = `digsig-document/signed/${bsreResponse.name_doc[0]}`;
        document.signedFileName = bsreResponse.name_doc[0];
        // Update filePath for next signer
        document.filePath = document.signedFilePath;
      }

      // Check if all signers have signed
      const pendingSigners = document.signers.filter(
        (s) => s.status !== 'signed' && s.id !== signer.id,
      );

      if (pendingSigners.length === 0) {
        // All signed - complete
        document.status = 'completed';
      } else {
        // Move to next signer
        document.currentSignerOrder = signer.urutan + 1;

        // Set next signer to waiting
        const nextSigner = document.signers.find(
          (s) => s.urutan === signer.urutan + 1,
        );
        if (nextSigner) {
          nextSigner.status = 'waiting';
          await this.signerRepository.save(nextSigner);
          this.notifySigner(document, nextSigner).catch((err) =>
            console.warn(
              `[DigsigDocument] Failed to send next signer notification: ${err?.message}`,
            ),
          );
        }
      }

      await this.documentRepository.save(document);

      if (document.status === 'completed') {
        this.notifyCreator(
          document,
          NotificationType.DIGSIG_SELESAI,
          'Dokumen selesai ditandatangani',
          document.perihal ||
            document.nomorDokumen ||
            'Dokumen selesai ditandatangani',
        ).catch((err) =>
          console.warn(
            `[DigsigDocument] Failed to send completed notification: ${err?.message}`,
          ),
        );
      }

      return this.findById(documentId);
    } catch (error) {
      throw new HttpException(
        error.response || { message: error.message },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Reject document by current signer
   */
  async rejectDocument(
    documentId: string,
    persnum: number,
    dto: RejectDocumentDto,
  ): Promise<DigsigDocumentEntity> {
    const document = await this.findById(documentId);

    // Find signer
    const signer = document.signers.find(
      (s) => s.persnum === persnum && s.status === 'waiting',
    );
    if (!signer) {
      throw new BadRequestException(
        'Anda tidak memiliki hak untuk menolak dokumen ini atau bukan giliran Anda',
      );
    }

    // Update signer
    signer.status = 'rejected';
    signer.rejectedAt = new Date();
    signer.keterangan = dto.keterangan;
    await this.signerRepository.save(signer);

    // Update document
    document.status = 'rejected';
    document.rejectedBy = persnum;
    document.rejectedAt = new Date();
    document.rejectionReason = dto.keterangan;
    await this.documentRepository.save(document);

    this.notifyCreator(
      document,
      NotificationType.DIGSIG_DITOLAK,
      'Dokumen ditolak',
      dto.keterangan || document.perihal || 'Dokumen ditolak',
    ).catch((err) =>
      console.warn(
        `[DigsigDocument] Failed to send rejected notification: ${err?.message}`,
      ),
    );

    // Log rejection
    await this.digsigLogService.createLog({
      userPersnum: persnum,
      userName: signer.nama || undefined,
      idNaskah: documentId,
      nomorNaskah: document.nomorDokumen,
      jenisNaskah: document.jenisNaskah,
      apiEndpoint: 'REJECT',
      action: 'sign',
      status: 'gagal',
      note: `Dokumen ditolak: ${dto.keterangan}`,
    });

    return this.findById(documentId);
  }

  /**
   * Cancel document (by creator only)
   */
  async cancelDocument(documentId: string, createdBy: number): Promise<void> {
    const document = await this.findById(documentId);

    if (document.createdBy !== createdBy) {
      throw new BadRequestException(
        'Hanya pembuat dokumen yang dapat membatalkan',
      );
    }

    if (document.status === 'completed') {
      throw new BadRequestException(
        'Dokumen yang sudah selesai tidak dapat dibatalkan',
      );
    }

    // Check if any signatures
    const signedCount = await this.signerRepository.count({
      where: { idDocument: documentId, status: 'signed' },
    });

    if (signedCount > 0) {
      throw new BadRequestException(
        'Dokumen tidak dapat dibatalkan karena sudah ada tanda tangan',
      );
    }

    document.status = 'cancelled';
    await this.documentRepository.save(document);
  }

  /**
   * Delete document (soft delete by setting status to cancelled)
   */
  async delete(documentId: string, createdBy: number): Promise<void> {
    await this.cancelDocument(documentId, createdBy);
  }

  /**
   * Get jenis naskah options
   */
  getJenisNaskahOptions() {
    return JENIS_NASKAH_OPTIONS;
  }

  /**
   * Convert entity to response DTO
   */
  private async toResponseDto(
    doc: DigsigDocumentEntity,
  ): Promise<DigsigDocumentResponseDto> {
    // Generate preview URLs for files
    let filePreviewUrl: string | null = null;
    let signedFilePreviewUrl: string | null = null;

    if (doc.filePath) {
      try {
        filePreviewUrl = await this.storageService.getPreviewUrl(
          doc.filePath,
          3600,
        ); // 1 hour
      } catch (error) {
        // Ignore error, leave as null
      }
    }

    if (doc.signedFilePath) {
      try {
        signedFilePreviewUrl = await this.storageService.getPreviewUrl(
          doc.signedFilePath,
          3600,
        );
      } catch (error) {
        // Ignore error, leave as null
      }
    }

    return {
      id: doc.id,
      tanggalDokumen: doc.tanggalDokumen,
      klasifikasi: doc.klasifikasi,
      klasifikasiText: doc.klasifikasiText,
      jenisNaskah: doc.jenisNaskah,
      nomorDokumen: doc.nomorDokumen,
      perihal: doc.perihal,
      filePath: doc.filePath,
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      filePreviewUrl,
      signedFilePath: doc.signedFilePath,
      signedFilePreviewUrl,
      visibleSign: doc.visibleSign === 1,
      status: doc.status,
      currentSignerOrder: doc.currentSignerOrder,
      totalSigners: doc.totalSigners,
      createdBy: doc.createdBy,
      createdByName: doc.createdByName,
      createdByPosition: doc.createdByPosition,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      signers: (doc.signers || []).map((s) => ({
        id: s.id,
        urutan: s.urutan,
        persnum: s.persnum,
        nik: s.nik,
        nama: s.nama,
        jabatan: s.jabatan,
        positionId: s.positionId,
        status: s.status,
        signedAt: s.signedAt,
        keterangan: s.keterangan,
      })),
    };
  }

  /**
   * Get list of verifikator (chiefs in the same area)
   * @param userArea - Area of the current user
   * @returns List of users with chief = 1 and area = userArea
   */
  async getVerifikator(userArea: string, chiefOnly = true) {
    try {
      // Get latest org data
      const orgData = await this.orgDataService.findLatestOrg();

      if (!orgData || !orgData.position_json) {
        throw new NotFoundException('Data organisasi tidak ditemukan');
      }

      const positionJson = orgData.position_json;

      if (!Array.isArray(positionJson)) {
        throw new BadRequestException('Format data organisasi tidak valid');
      }

      // Filter: area = userArea. chiefOnly=true → hanya chief=1 (default, untuk naskah-dinas).
      // chiefOnly=false → semua orang di area (staff + managerial, untuk naskah-lainnya).
      const verifikator = positionJson.filter((x: any) => {
        return x.area === userArea && (!chiefOnly || x.chief === 1);
      });

      console.log(
        '[DigsigDocumentService] Found verifikator count:',
        verifikator.length,
      );

      // Map to return format
      const result = verifikator.map((v: any) => {
        // Build lokasi from subAreaText or areaText
        const lokasi = v.sub_area_text || v.area_text || '';

        console.log('[DigsigDocumentService] Mapping verifikator:', {
          persnum: v.persnum_person,
          nama: v.persnum_person_text,
          position: v.position,
          jabatan: v.position_text,
        });

        return {
          persnum: v.persnum_person || null,
          nama: v.persnum_person_text || null,
          positionId: v.position || null,
          jabatan: v.position_text || null,
          lokasi: lokasi,
          company: v.company || null,
          companyText: v.company_name || null,
          area: v.area || null,
          areaText: v.area_text || null,
          subArea: v.sub_area || null,
          subAreaText: v.sub_area_text || null,
          organization: v.organization || null,
          organizationText: v.organization_text || null,
          abbreviation: v.abbreviation || null,
          bodTag: v.bod_tag || null,
          isChief: v.chief === 1,
        };
      });

      return {
        success: true,
        data: result,
        total: result.length,
      };
    } catch (error) {
      console.error('[DigsigDocumentService] Error in getVerifikator:', error);
      throw error;
    }
  }
}
