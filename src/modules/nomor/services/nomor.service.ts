import {
  applyNomorListQuery,
  buildNomorStatusCounts,
  approvalStatusSql,
  requestStatusSql,
  manualRequestSql,
} from '../helpers/nomor-list-query';
import { formatNomorLocation } from '../../../common/helpers/nomor-location.helper';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull, EntityManager, In } from 'typeorm';
import { NomorEntity } from '../entities/nomor.entity';
import { NomorRequestEntity } from '../entities/nomor-request.entity';
import { NomorRequestDetailEntity } from '../entities/nomor-request-detail.entity';
import { JenisEntity } from '../entities/jenis.entity';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { StorageService } from '../../storage/services/storage.service';
import {
  CreateNomorRequestDto,
  CreateNomorRequestResponseDto,
} from '../dto/create-nomor-request.dto';
import {
  GetMyNomorRequestResponseDto,
  GetAdminNomorRequestResponseDto,
} from '../dto/get-nomor-request.dto';
import {
  BookingNomorRequestDto,
  BookingNomorRequestResponseDto,
  ApproveNomorRequestDetailDto,
  ApproveNomorRequestDetailResponseDto,
  RejectNomorRequestDetailResponseDto,
  ApproveBulkNomorRequestDetailDto,
  ApproveBulkNomorRequestDetailResponseDto,
  RejectBulkNomorRequestDetailDto,
  RejectBulkNomorRequestDetailResponseDto,
  DeleteNomorRequestResponseDto,
  RejectAllNomorRequestResponseDto,
  ApproveBulkPenandatanganDto,
  ApproveBulkPenandatanganResponseDto,
} from '../dto/admin-nomor-request.dto';
import { GetNomorQueryDto, GetNomorResponseDto } from '../dto/get-nomor.dto';
import {
  AdminCreateNomorDto,
  AdminCreateNomorResponseDto,
} from '../dto/admin-create-nomor.dto';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  UserRoleEntity,
  UserRole,
} from '../../superadmin/entities/user-role.entity';
import { v4 as uuidv4 } from 'uuid';
import { RealtimeEmitService } from '../../realtime/services/realtime-emit.service';
import { NotificationService } from '../../notification/services';
import { NotificationType } from '../../notification/entities';

@Injectable()
export class NomorService {
  private readonly logger = new Logger(NomorService.name);

  constructor(
    @InjectRepository(NomorEntity)
    private readonly nomorRepository: Repository<NomorEntity>,
    @InjectRepository(NomorRequestEntity)
    private readonly nomorRequestRepository: Repository<NomorRequestEntity>,
    @InjectRepository(NomorRequestDetailEntity)
    private readonly nomorRequestDetailRepository: Repository<NomorRequestDetailEntity>,
    @InjectRepository(JenisEntity)
    private readonly jenisRepository: Repository<JenisEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepository: Repository<UserRoleEntity>,
    @InjectRepository(NaskahEntity)
    private readonly naskahRepository: Repository<NaskahEntity>,
    private readonly dataSource: DataSource,
    private readonly orgDataService: OrgDataService,
    private readonly storageService: StorageService,
    private readonly realtimeEmitService: RealtimeEmitService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Helper: Get latest position JSON data dengan caching.
   * Memanfaatkan cache 5 menit di OrgDataService.findLatestOrg().
   */
  private async getLatestPositionJsonData(): Promise<any[]> {
    try {
      const latestOrgData = await this.orgDataService.findLatestOrg();
      if (
        latestOrgData?.position_json &&
        Array.isArray(latestOrgData.position_json)
      ) {
        return latestOrgData.position_json;
      }
    } catch (error) {
      console.log('Could not fetch position data from org_data');
    }

    return [];
  }

  /**
   * Helper: Determine status dari details array
   */
  private determineStatusFromDetails(
    details: NomorRequestDetailEntity[],
  ): string {
    if (details.length === 0) return 'Belum Diajukan';

    const hasDraft = details.some((d) => d.status === 'draft');
    const hasBooking = details.some((d) => d.status === 'booking');
    const hasTerpakai = details.some(
      (d) => d.status === 'terpakai' || d.status === 'terpakai_final',
    );
    const allHangus = details.every((d) => d.status === 'hangus');
    const allDitolak = details.every((d) => d.status === 'ditolak');
    const hasRejected = details.some(
      (d) => d.status === 'hangus' || d.status === 'ditolak',
    );

    if (hasTerpakai) return 'Disetujui';
    if (
      allHangus ||
      allDitolak ||
      (hasRejected && !hasBooking && !hasTerpakai && !hasDraft)
    )
      return 'Ditolak';
    if (hasBooking) return 'Menunggu Verifikasi';
    if (hasDraft) return 'Draft';

    return 'Belum Diajukan';
  }

  /**
   * Helper: Determine status key untuk counting (lowercase dengan underscore)
   */
  private determineStatusKeyFromDetails(
    details: NomorRequestDetailEntity[],
  ): string {
    if (details.length === 0) return 'belum_diajukan';

    const hasDraft = details.some((d) => d.status === 'draft');
    const hasBooking = details.some((d) => d.status === 'booking');
    const hasTerpakai = details.some(
      (d) => d.status === 'terpakai' || d.status === 'terpakai_final',
    );
    const allHangus = details.every((d) => d.status === 'hangus');
    const allDitolak = details.every((d) => d.status === 'ditolak');
    const hasRejected = details.some(
      (d) => d.status === 'hangus' || d.status === 'ditolak',
    );

    if (hasTerpakai) return 'disetujui';
    if (
      allHangus ||
      allDitolak ||
      (hasRejected && !hasBooking && !hasTerpakai && !hasDraft)
    )
      return 'ditolak';
    if (hasBooking) return 'menunggu_verifikasi';
    if (hasDraft) return 'menunggu_persetujuan';

    return 'belum_diajukan';
  }

  /**
   * Helper: Normalisasi status filter query agar kompatibel dengan label lama/typo
   */
  private normalizeStatusFilter(status?: string): string | undefined {
    if (!status) return status;

    const normalized = status.trim().toLowerCase();
    if (
      normalized === 'menunggu persetujuan' ||
      normalized === 'menunggu_persetujuan' ||
      normalized === 'draft'
    ) {
      return 'Draft';
    }

    return status;
  }

  /**
   * Scope area berdasarkan kode area user.
   * - A000 (kantor pusat): tanpa pembatasan area
   * - Selain A000: dibatasi ke area user login
   */
  private getScopedAreaCode(user: JwtPayload): string | undefined {
    const requesterAreaCode = String(user?.area || '')
      .trim()
      .toUpperCase();

    if (!requesterAreaCode) {
      throw new BadRequestException(
        'Area code tidak ditemukan pada token user',
      );
    }

    return requesterAreaCode === 'A000' ? undefined : requesterAreaCode;
  }

  /**
   * Helper legacy: Check berdasarkan status detail (dipakai sebagai fallback data lama)
   */
  private isFromTulisSuratOtomatis(
    details: NomorRequestDetailEntity[],
  ): boolean {
    if (details.length === 0) return false;
    return details.every(
      (d) => d.status === 'terpakai' || d.status === 'terpakai_final',
    );
  }

  /**
   * Helper: Pembeda usulan yang di-generate dari modul naskah.
   * Fallback ke heuristik lama hanya untuk data legacy yang belum punya flag.
   */
  private isNaskahGeneratedRequest(
    request: NomorRequestEntity,
    details: NomorRequestDetailEntity[],
  ): boolean {
    if (request.isNaskahGenerated === true) return true;
    if (request.isNaskahGenerated === false) return false;
    return this.isFromTulisSuratOtomatis(details);
  }

  /**
   * Helper: Map position text to jabatan code
   * P = Dir. SDM, U = Dirut, S = Dir. Keselamatan, O = Dir. Operasi, K = Dir. Keuangan
   */
  private mapPositionToJabatanCode(
    positionText: string | null | undefined,
  ): string {
    if (!positionText) return '';

    const positionLower = positionText.toLowerCase().trim();

    // Hardcoded mapping sesuai contoh - cek berdasarkan text dengan berbagai variasi
    if (positionLower.includes('direktur sdm dan umum')) {
      return 'P';
    }

    if (positionLower.includes('direktur utama')) {
      return 'U';
    }

    if (
      positionLower.includes('direktur keselamatan, keamanan dan standardisasi')
    ) {
      return 'S';
    }

    if (positionLower.includes('direktur operasi')) {
      return 'O';
    }

    if (positionLower.includes('direktur teknik')) {
      return 'T';
    }

    if (positionLower.includes('direktur keuangan dan manajemen risiko')) {
      return 'K';
    }

    return '';
  }

  /**
   * Helper: Kode lokasi penomoran (pusat: TNG, cabang: kode area)
   * Contoh: "TNG" untuk Pusat, "01" untuk Cabang
   */
  private extractAreaCode(area: string | null | undefined): string {
    return formatNomorLocation(area);
  }

  /**
   * Helper: Generate nomor berdasarkan format dari tabel jenis
   * Placeholder yang didukung:
   * - {TIPE} = jenis nomor (PER, KEP, INS, dll)
   * - {NO_URUT} = nomor urut dengan padding 3 digit
   * - {INSTANSI} = company code
   * - {JABATAN} = position abbreviation dari org_data
   * - {LOKASI} = area code
   * - {KLASIFIKASI} = klasifikasi code
   * - {BULAN} = bulan dalam romawi
   * - {TAHUN} = tahun 4 digit
   */
  private async generateNomorFromFormat(
    format: string,
    noUrut: number,
    request: NomorRequestEntity,
    tahun: number,
    penandatanganPositionAbbreviation?: string | null,
    penandatanganArea?: string | null,
  ): Promise<string> {
    const bulan = new Date(request.tanggal!).getMonth() + 1;
    const bulanRomawi = this.getBulanRomawi(bulan);
    const noUrutFormatted = noUrut.toString().padStart(3, '0');

    // Jabatan, Lokasi, Instansi diambil dari penandatangan
    const jabatanCode = penandatanganPositionAbbreviation || '';
    const lokasiCode = this.extractAreaCode(penandatanganArea);
    const instansi = 'LPPNPI'; // Hardcoded

    // Replace placeholders dengan nilai sebenarnya
    const nomorBaru = format
      .replace(/{TIPE}/g, request.jenis || '')
      .replace(/{NO_URUT}/g, noUrutFormatted)
      .replace(/{INSTANSI}/g, instansi)
      .replace(/{JABATAN}/g, jabatanCode)
      .replace(/{LOKASI}/g, lokasiCode)
      .replace(/{KLASIFIKASI}/g, request.klasifikasi || '')
      .replace(/{BULAN}/g, bulanRomawi)
      .replace(/{TAHUN}/g, tahun.toString());

    return nomorBaru;
  }

  /**
   * Adapter publik untuk penomoran naskah-lainnya (saat kirim/finalisasi).
   * Aditif — tidak mengubah flow admin existing (approveNomorRequestDetail dll).
   *
   * Counter scope: company + area + jenis + tahun (branch non-ND/DI, sama dengan admin).
   * Auto-skip benturan nomor manual existing (increment noUrut sampai nomor bebas, max 100).
   *
   * @param params segmen penomoran + identitas pemrakarsa
   * @param manager opsional — jika diberikan, gunakan transaksi pemanggil
   * @returns { nomor: string final, noUrut: number counter }
   */
  async generateNomorForNaskah(
    params: {
      jenis: string;
      klasifikasi?: string;
      tanggal: Date;
      company: string;
      area: string;
      subArea?: string;
      organization?: string;
      position: string;
      jabatanAbbrev: string;
      perihal?: string;
    },
    manager?: EntityManager,
  ): Promise<{ nomor: string; noUrut: number }> {
    const tahun = new Date(params.tanggal).getFullYear();
    if (!Number.isFinite(tahun)) {
      throw new BadRequestException(
        'Tanggal naskah tidak valid untuk penomoran.',
      );
    }

    // 1. Baca format per jenis
    const jenisData = await this.jenisRepository.findOne({
      where: { jenis: params.jenis as any },
    });
    if (!jenisData?.formatPenomoran) {
      throw new BadRequestException(
        `Format penomoran untuk jenis ${params.jenis} belum dikonfigurasi.`,
      );
    }
    const format = jenisData.formatPenomoran;

    // Virtual request untuk generateNomorFromFormat (hanya butuh tanggal/jenis/klasifikasi)
    const virtualRequest = {
      tanggal: params.tanggal,
      jenis: params.jenis,
      klasifikasi: params.klasifikasi ?? null,
    } as NomorRequestEntity;

    // 2. Lock + increment counter, skip benturan
    const MAX_RETRY = 100;
    let noUrut = 0;
    let nomor = '';

    const nomorRepo = manager
      ? manager.getRepository(this.nomorRepository.target)
      : this.nomorRepository;
    const naskahRepo = manager
      ? manager.getRepository(NaskahEntity)
      : this.naskahRepository;

    // Lock baris counter FOR UPDATE scope tahun+jenis+company+area
    const counterQb = nomorRepo
      .createQueryBuilder('nomor')
      .where('nomor.tahun = :tahun', { tahun })
      .andWhere('nomor.jenis = :jenis', { jenis: params.jenis })
      .andWhere('nomor.company = :company', { company: params.company })
      .andWhere('nomor.area = :area', { area: params.area })
      .setLock('pessimistic_write');

    const existingCounter = await counterQb.getOne();

    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      noUrut = (existingCounter?.nomor ?? 0) + 1 + attempt;
      nomor = await this.generateNomorFromFormat(
        format,
        noUrut,
        virtualRequest,
        tahun,
        params.jabatanAbbrev,
        params.area,
      );
      // Cek uniqueness vs naskah.nomor existing
      const clash = await naskahRepo
        .createQueryBuilder('n')
        .where('n.nomor = :nomor', { nomor })
        .getCount();
      if (clash === 0) break;
      if (attempt === MAX_RETRY - 1) {
        throw new BadRequestException(
          `Tidak menemukan nomor bebas untuk jenis ${params.jenis} setelah ${MAX_RETRY} iterasi.`,
        );
      }
    }

    // 3. Upsert counter
    if (existingCounter) {
      existingCounter.nomor = noUrut;
      await (manager
        ? manager.save(existingCounter)
        : nomorRepo.save(existingCounter));
    } else {
      const newCounter = nomorRepo.create({
        id: uuidv4(),
        company: params.company,
        area: params.area,
        subArea: params.subArea ?? null,
        organization: params.organization ?? null,
        position: params.position ?? null,
        tahun,
        jenis: params.jenis,
        nomor: noUrut,
      } as any);
      await (manager ? manager.save(newCounter) : nomorRepo.save(newCounter));
    }

    // Audit-trail: catat nomor naskah-lainnya ke register nomor_request +
    // nomor_request_detail (isNaskahGenerated=true, status=terpakai_final) dalam
    // transaksi yang sama dengan counter, agar muncul di /penomoran/nomor. Flow
    // usulan/pending-approval admin mengecualikan isNaskahGenerated (lihat
    // isNaskahGeneratedRequest) sehingga tidak mencemari usulan manual.
    const reqRepo = manager
      ? manager.getRepository(NomorRequestEntity)
      : this.nomorRequestRepository;
    const detailRepo = manager
      ? manager.getRepository(NomorRequestDetailEntity)
      : this.nomorRequestDetailRepository;

    const requestId = uuidv4();
    const nomorRequest = reqRepo.create({
      id: requestId,
      company: params.company,
      area: params.area,
      subArea: params.subArea ?? null,
      organization: params.organization ?? null,
      position: params.position || null,
      tanggal: params.tanggal,
      jenis: params.jenis,
      klasifikasi: params.klasifikasi ?? null,
      perihal: params.perihal ?? null,
      jumlah: 1,
      penandatangan: null,
      idPositionPenandatangan: null,
      isNaskahGenerated: true,
    });
    await (manager ? manager.save(nomorRequest) : reqRepo.save(nomorRequest));

    const nomorDetail = detailRepo.create({
      id: uuidv4(),
      idRequest: requestId,
      nomor,
      fileName: null,
      fileText: null,
      status: 'terpakai_final',
    });
    await (manager ? manager.save(nomorDetail) : detailRepo.save(nomorDetail));

    return { nomor, noUrut };
  }

  private looksLikeStorageKey(key: string | null | undefined): boolean {
    if (!key) return false;
    // Expected pattern from StorageService.uploadFile(): {folder}/{timestamp}-{sanitizedFileName}
    if (!key.includes('/')) return false;
    const base = key.split('/').pop() || '';
    return /^\d{10,}-/.test(base);
  }

  private async getDetailFileUrlAndHeal(
    detail: NomorRequestDetailEntity,
    folder: string = 'nomor',
  ): Promise<string | null> {
    const key = detail.fileText;
    if (key && this.looksLikeStorageKey(key)) {
      // Fast-path: treat as valid key
      return await this.storageService.getFileUrl(key);
    }

    // Jika fileText kosong atau kelihatan bukan key (misalnya nama file original), coba self-heal
    const originalName = detail.fileName || detail.fileText;
    if (!originalName) return null;

    const foundKey = await this.storageService.findLatestKeyByOriginalName(
      originalName,
      folder,
    );

    if (!foundKey) {
      return null;
    }

    // Update DB agar request berikutnya sudah benar
    detail.fileText = foundKey;
    if (!detail.fileName) {
      detail.fileName = originalName;
    }
    await this.nomorRequestDetailRepository.save(detail);

    return await this.storageService.getFileUrl(foundKey);
  }

  /**
   * User membuat usulan nomor baru
   * Data company, area, sub_area, organization diambil dari org_data berdasarkan position_id
   */
  async createNomorRequest(
    dto: CreateNomorRequestDto,
  ): Promise<CreateNomorRequestResponseDto> {
    const tglFormatted = this.formatDate(dto.tanggal);
    let orgDataRecord;
    try {
      orgDataRecord = await this.orgDataService.findOrg(tglFormatted);
    } catch {
      orgDataRecord = await this.orgDataService.findLatestOrg();
    }
    if (!orgDataRecord) {
      throw new NotFoundException(
        `Data org_data tidak ditemukan untuk tanggal ${tglFormatted} maupun data terbaru`,
      );
    }

    // Parse position_json dan cari position_id
    const positionJson = orgDataRecord.position_json;
    const positionData = Array.isArray(positionJson)
      ? positionJson.find((p: any) => p.position === dto.position_id)
      : null;

    if (!positionData) {
      throw new NotFoundException(
        `Position dengan ID ${dto.position_id} tidak ditemukan di org_data untuk tanggal ${tglFormatted}`,
      );
    }

    const requestId = uuidv4();

    const nomorRequest = this.nomorRequestRepository.create({
      id: requestId,
      company: positionData.company?.toString() || null,
      area: positionData.area || null,
      subArea: positionData.sub_area?.toString() || null,
      organization: positionData.organization_id?.toString() || null,
      position: dto.position_id.toString(),
      tanggal: dto.tanggal,
      jenis: dto.jenis,
      klasifikasi: dto.klasifikasi || null,
      perihal: dto.perihal,
      jumlah: dto.jumlah,
      penandatangan: dto.penandatangan || null,
      idPositionPenandatangan: dto.id_position_penandatangan || null,
      isNaskahGenerated: false,
    });

    await this.nomorRequestRepository.save(nomorRequest);

    // Emit nomor count lengkap ke admin (ada usulan baru)
    try {
      await this.emitNomorCountRefresh(dto.position_id?.toString());
    } catch {}

    if (nomorRequest.idPositionPenandatangan) {
      this.notifyNomorPosition({
        positionId: nomorRequest.idPositionPenandatangan,
        request: nomorRequest,
        type: NotificationType.PENOMORAN_USULAN,
        title: 'Usulan penomoran baru',
        body:
          nomorRequest.perihal || 'Ada usulan penomoran yang perlu disetujui',
        action: 'OPEN_PERSETUJUAN_PENOMORAN',
      }).catch((err) =>
        this.logger.warn(
          `Failed to send PENOMORAN_USULAN notification: ${err?.message}`,
        ),
      );
    } else {
      this.notifyNomorAdmins(
        nomorRequest,
        NotificationType.PENOMORAN_USULAN,
        'Usulan penomoran baru',
        nomorRequest.perihal || 'Ada usulan penomoran baru',
      ).catch((err) =>
        this.logger.warn(
          `Failed to send PENOMORAN_USULAN admin notification: ${err?.message}`,
        ),
      );
    }

    return {
      success: true,
      message: 'Usulan nomor berhasil dibuat',
      data: {
        id: nomorRequest.id,
        company: nomorRequest.company!,
        area: nomorRequest.area!,
        sub_area: nomorRequest.subArea!,
        organization: nomorRequest.organization!,
        position: nomorRequest.position!,
        tanggal: nomorRequest.tanggal!,
        jenis: nomorRequest.jenis!,
        klasifikasi: nomorRequest.klasifikasi,
        perihal: nomorRequest.perihal!,
        jumlah: nomorRequest.jumlah!,
        penandatangan: nomorRequest.penandatangan,
        created_at: nomorRequest.createdAt,
      },
    };
  }

  /**
   * Helper: Format Date ke YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Page parent requests first, then fetch details only for that page.
   */
  private async loadNomorListPage(
    query: GetNomorQueryDto | undefined,
    options: {
      mode: 'usulan' | 'admin-usulan' | 'submitted' | 'approval' | 'nomor';
      position?: number;
      area?: string;
      adminPositions?: string[];
      draftPosition?: number;
    },
    positions: any[] = [],
  ) {
    const page = Math.max(1, query?.page || 1);
    const limit = Math.min(100, Math.max(1, query?.limit || 10));
    const search = query?.search?.toLowerCase();
    const matchingPositions = search
      ? positions
          .filter((position) =>
            [position.persnum_person_text, position.persnum_person].some(
              (value) =>
                value != null && String(value).toLowerCase().includes(search),
            ),
          )
          .map((position) => String(position.position))
      : [];
    const qb = this.nomorRequestRepository.createQueryBuilder('request');
    applyNomorListQuery(qb, query, { ...options, matchingPositions });
    let counts: Record<string, number> | undefined;
    if (options.mode === 'approval') {
      const countQuery =
        this.nomorRequestRepository.createQueryBuilder('request');
      applyNomorListQuery(
        countQuery,
        { ...query, status: undefined },
        { ...options, matchingPositions },
      );
      const totals = await buildNomorStatusCounts(
        countQuery,
        approvalStatusSql,
      ).getRawMany<{ status: string; total: string }>();
      counts = { all: 0, draft: 0, approved: 0, rejected: 0 };
      for (const row of totals) {
        counts[row.status] = Number(row.total);
        counts.all += Number(row.total);
      }
    }
    const total = await qb.clone().getCount();
    const requests = await qb
      .offset((page - 1) * limit)
      .limit(limit)
      .getMany();
    if (requests.length) {
      const details = await this.nomorRequestDetailRepository.find({
        where: { idRequest: In(requests.map((request) => request.id)) },
        ...(options.mode === 'submitted' ||
        options.mode === 'nomor' ||
        options.mode === 'admin-usulan'
          ? {
              select: {
                id: true,
                idRequest: true,
                nomor: true,
                status: true,
                createdAt: true,
              },
            }
          : {}),
        order: { createdAt: 'ASC', id: 'ASC' },
      });
      const byRequest = new Map<string, NomorRequestDetailEntity[]>();
      for (const detail of details) {
        const list = byRequest.get(detail.idRequest!) || [];
        list.push(detail);
        byRequest.set(detail.idRequest!, list);
      }
      requests.forEach((request) => {
        request.details = byRequest.get(request.id) || [];
      });
    }
    return {
      requests,
      counts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private async listTemplateContext(requests: NomorRequestEntity[]) {
    const codes = [
      ...new Set(
        requests
          .map((request) => request.jenis)
          .filter((code): code is string => Boolean(code)),
      ),
    ];
    const jenis = codes.length
      ? await this.jenisRepository.find({ where: { jenis: In(codes) } })
      : [];
    return {
      jenis: new Map(jenis.map((item) => [item.jenis!, item])),
      org: new Map<string, Promise<any>>(),
    };
  }

  async getNomorRequestByPosition(
    positionId: number,
    query?: GetNomorQueryDto,
  ): Promise<GetMyNomorRequestResponseDto> {
    const { requests, pagination } = await this.loadNomorListPage(query, {
      mode: 'usulan',
      position: positionId,
    });
    const context = await this.listTemplateContext(requests);
    const data = await Promise.all(
      requests.map(async (request) => ({
        id: request.id,
        company: request.company!,
        area: request.area!,
        sub_area: request.subArea!,
        organization: request.organization!,
        position: request.position!,
        tanggal: request.tanggal!,
        jenis: request.jenis!,
        klasifikasi: request.klasifikasi,
        perihal: request.perihal!,
        jumlah: request.jumlah!,
        penandatangan: request.penandatangan,
        is_single_file: request.isSingleFile,
        status: this.determineStatusFromDetails(request.details || []),
        template_nomor: await this.generateNomorTemplate(request, context),
        created_at: request.createdAt,
        details: await Promise.all(
          (request.details || []).map(async (detail) => ({
            id: detail.id,
            nomor: detail.nomor,
            status: detail.status,
            file_name: detail.fileName,
            file_url: await this.getDetailFileUrlAndHeal(detail, 'nomor'),
            created_at: detail.createdAt,
          })),
        ),
      })),
    );
    return {
      success: true,
      message: 'Data usulan nomor berhasil diambil',
      data,
      pagination,
    };
  }

  /**
   * Admin melihat semua usulan nomor yang sudah diajukan (status != 'Belum Diajukan')
   * Hanya menampilkan data dari usulan manual (is_naskah_generated != true)
   */
  async getAdminNomorRequestSubmitted(
    query?: GetNomorQueryDto,
    user?: JwtPayload,
  ): Promise<GetAdminNomorRequestResponseDto> {
    const area = this.getScopedAreaCode(user as JwtPayload);
    const positions = await this.getLatestPositionJsonData();
    const byPosition = new Map(
      positions.map((position) => [Number(position.position), position]),
    );
    const { requests, pagination } = await this.loadNomorListPage(
      query,
      { mode: 'submitted', area },
      positions,
    );
    const data = requests.map((request) => {
      const position = byPosition.get(Number(request.position));
      return {
        id: request.id,
        company: request.company!,
        area: request.area!,
        sub_area: request.subArea!,
        organization: request.organization!,
        position: request.position!,
        persnum: position?.persnum_person || null,
        nama: position?.persnum_person_text || null,
        tanggal: request.tanggal!,
        jenis: request.jenis!,
        klasifikasi: request.klasifikasi,
        perihal: request.perihal!,
        jumlah: request.jumlah!,
        penandatangan: request.penandatangan,
        created_at: request.createdAt,
        status: this.determineStatusFromDetails(request.details || []),
      };
    });
    return {
      success: true,
      message: 'Data usulan nomor yang diajukan berhasil diambil',
      data,
      pagination,
    };
  }

  /**
   * Count nomor request by status (for admin dashboard)
   * - Semua data dengan status selain "Belum Diajukan" di-count
   * - Data dengan status "Belum Diajukan" hanya yang dibuat oleh posisi tertentu
   * Hanya count data dari usulan manual (is_naskah_generated != true)
   */
  private async nomorCountSummary(positionId: number, user?: JwtPayload) {
    const area = user ? this.getScopedAreaCode(user) : undefined;
    let adminPositions: string[] = [];
    if (user) {
      const [positions, roles] = await Promise.all([
        this.getLatestPositionJsonData(),
        this.userRoleRepository.find({
          where: [{ role: UserRole.ADMIN }, { role: UserRole.SUPERADMIN }],
          select: ['persnum'],
        }),
      ]);
      const admins = new Set(roles.map((role) => Number(role.persnum)));
      adminPositions = positions
        .filter((position) => admins.has(Number(position.persnum_person)))
        .map((position) => String(position.position));
    }
    const group = this.nomorRequestRepository
      .createQueryBuilder('request')
      .where(manualRequestSql);
    const signer = this.nomorRequestRepository
      .createQueryBuilder('request')
      .where(manualRequestSql)
      .andWhere('request.id_position_penandatangan = :position', {
        position: positionId,
      })
      .andWhere(`(${requestStatusSql}) = 'Draft'`);
    if (user) {
      if (area) {
        group.andWhere('request.area = :area', { area });
        signer.andWhere('request.area = :area', { area });
      }
      group.andWhere(
        `((${requestStatusSql}) <> 'Belum Diajukan' OR request.position = :position)`,
        { position: String(positionId) },
      );
      if (adminPositions.length) {
        group.andWhere(
          `((${requestStatusSql}) <> 'Draft' OR request.position IN (:...adminPositions))`,
          { adminPositions },
        );
        signer.andWhere('request.position IN (:...adminPositions)', {
          adminPositions,
        });
      } else {
        group.andWhere(`(${requestStatusSql}) <> 'Draft'`);
        signer.andWhere('1=0');
      }
    } else
      group.andWhere('request.position = :position', {
        position: String(positionId),
      });
    const [totals, approvals] = await Promise.all([
      buildNomorStatusCounts(group, requestStatusSql).getRawMany<{
        status: string;
        total: string;
      }>(),
      signer.getCount(),
    ]);
    const counts = {
      menunggu_verifikasi: 0,
      disetujui: 0,
      ditolak: 0,
      belum_diajukan: 0,
      draft: 0,
      menunggu_persetujuan: approvals,
      total: 0,
    };
    const keys: Record<
      string,
      | 'menunggu_verifikasi'
      | 'disetujui'
      | 'ditolak'
      | 'belum_diajukan'
      | 'draft'
    > = {
      'Menunggu Verifikasi': 'menunggu_verifikasi',
      Disetujui: 'disetujui',
      Ditolak: 'ditolak',
      'Belum Diajukan': 'belum_diajukan',
      Draft: 'draft',
    };
    for (const row of totals) {
      const key = keys[row.status];
      if (key) counts[key] = Number(row.total);
      if (key !== 'draft') counts.total += Number(row.total);
    }
    return counts;
  }

  async getAdminCountNomorRequest(
    positionId: number,
    user?: JwtPayload,
  ): Promise<any> {
    // Preserve the existing mandatory admin area scope.
    this.getScopedAreaCode(user as JwtPayload);
    return {
      success: true,
      message: 'Count usulan nomor berhasil diambil',
      data: await this.nomorCountSummary(positionId, user),
    };
  }

  async getAdminCountNomorRequestByPosition(positionId: number): Promise<any> {
    return {
      success: true,
      message: 'Count usulan nomor untuk position berhasil diambil',
      data: {
        position_id: positionId,
        ...(await this.nomorCountSummary(positionId)),
      },
    };
  }

  /**
   * Helper: Emit nomor count lengkap ke admin (broadcast) dan user (per position).
   * Dipanggil setelah aksi yang mengubah count (create, approve, reject, submit, etc).
   */
  private async emitNomorCountRefresh(
    positionId?: string,
    user?: JwtPayload,
  ): Promise<void> {
    try {
      // Emit ke admin/superadmin dengan count lengkap
      if (user) {
        const adminResult = await this.getAdminCountNomorRequest(
          Number(user.position),
          user,
        );
        this.realtimeEmitService.emitNomorCountAdminBroadcast(
          adminResult?.data ?? {},
        );
      }

      // Emit ke user position dengan count lengkap
      if (positionId) {
        const userResult = await this.getAdminCountNomorRequestByPosition(
          Number(positionId),
        );
        this.realtimeEmitService.emitNomorCountUser(
          positionId,
          userResult?.data ?? {},
        );
      }
    } catch (err: any) {
      this.logger?.warn?.(`⚠️ [emitNomorCountRefresh] failed: ${err?.message}`);
    }
  }

  private async resolvePersnumByPosition(
    positionId?: string | number | null,
  ): Promise<number | undefined> {
    if (positionId == null) return undefined;

    try {
      const positionJsonData = await this.getLatestPositionJsonData();
      const position = positionJsonData.find(
        (p: any) => String(p.position) === String(positionId),
      );
      const persnum = Number(position?.persnum_person);
      return Number.isFinite(persnum) ? persnum : undefined;
    } catch {
      return undefined;
    }
  }

  private buildNomorNotificationData(
    request: NomorRequestEntity,
    action: string,
    detail?: NomorRequestDetailEntity,
  ) {
    return {
      action,
      requestId: request.id,
      detailId: detail?.id || null,
      nomor: detail?.nomor || null,
      jenis: request.jenis || null,
      perihal: request.perihal || null,
      tanggal: request.tanggal || null,
      positionId: request.position || null,
      penandatanganPositionId: request.idPositionPenandatangan || null,
    };
  }

  private async notifyNomorPosition(params: {
    positionId?: string | number | null;
    userPersnum?: number;
    request: NomorRequestEntity;
    detail?: NomorRequestDetailEntity;
    type: NotificationType;
    title: string;
    body: string;
    action: string;
  }) {
    if (params.positionId == null) return;

    const userPersnum =
      params.userPersnum ??
      (await this.resolvePersnumByPosition(params.positionId));

    await this.notificationService.createNotification({
      positionId: String(params.positionId),
      userPersnum,
      type: params.type,
      title: params.title,
      body: params.body,
      data: this.buildNomorNotificationData(
        params.request,
        params.action,
        params.detail,
      ),
    });
  }

  private async notifyNomorAdmins(
    request: NomorRequestEntity,
    type: NotificationType,
    title: string,
    body: string,
    action = 'OPEN_VERIFIKASI_PENOMORAN',
  ) {
    const admins = await this.userRoleRepository.find({
      where: [{ role: UserRole.ADMIN }, { role: UserRole.SUPERADMIN }],
    });

    const deduped = new Map<string, UserRoleEntity>();
    for (const admin of admins) {
      if (admin.idPosition) deduped.set(String(admin.idPosition), admin);
    }

    await Promise.allSettled(
      Array.from(deduped.values()).map((admin) =>
        this.notifyNomorPosition({
          positionId: admin.idPosition,
          userPersnum: admin.persnum,
          request,
          type,
          title,
          body,
          action,
        }),
      ),
    );
  }

  private async notifyNomorRequester(
    request: NomorRequestEntity,
    type: NotificationType,
    title: string,
    body: string,
    action = 'OPEN_USULAN_PENOMORAN',
    detail?: NomorRequestDetailEntity,
  ) {
    await this.notifyNomorPosition({
      positionId: request.position,
      request,
      detail,
      type,
      title,
      body,
      action,
    });
  }

  /**
   * Admin melihat semua usulan nomor
   * Hanya menampilkan data dari usulan manual (is_naskah_generated != true)
   * Filter: Request yang pernah memiliki detail dengan status 'booking'
   */
  async getAdminNomorRequest(
    query?: GetNomorQueryDto,
  ): Promise<GetAdminNomorRequestResponseDto> {
    const normalizedStatus = this.normalizeStatusFilter(query?.status);

    // Optimized: Load dengan relations dalam 1 query
    const requests = await this.nomorRequestRepository.find({
      relations: ['details'],
      order: { createdAt: 'DESC' },
    });

    // Optimized: Gunakan cached position data
    const positionJsonData = await this.getLatestPositionJsonData();

    // Process tanpa N+1 query
    const data = requests.map((request) => {
      const details = request.details || [];

      // Skip jika request di-generate dari modul naskah
      if (this.isNaskahGeneratedRequest(request, details)) {
        return null;
      }

      const status = this.determineStatusFromDetails(details);

      // Get position data
      const positionNumber = parseInt(request.position!, 10);
      const positionData = positionJsonData.find(
        (p: any) => p.position === positionNumber,
      );

      const persnum = positionData?.persnum_person || null;
      const nama = positionData?.persnum_person_text || null;

      // Apply search filter
      if (query?.search) {
        const searchLower = query.search.toLowerCase();
        const perihalMatch =
          request.perihal &&
          request.perihal.toLowerCase().includes(searchLower);
        const jenisMatch =
          request.jenis && request.jenis.toLowerCase().includes(searchLower);
        const nomorMatch =
          request.penandatangan &&
          request.penandatangan.toLowerCase().includes(searchLower);

        if (!perihalMatch && !jenisMatch && !nomorMatch) {
          return null;
        }
      }

      // Apply status filter
      if (
        normalizedStatus &&
        normalizedStatus !== 'Semua' &&
        status !== normalizedStatus
      ) {
        return null;
      }

      return {
        id: request.id,
        company: request.company!,
        area: request.area!,
        sub_area: request.subArea!,
        organization: request.organization!,
        position: request.position!,
        persnum,
        nama,
        tanggal: request.tanggal!,
        jenis: request.jenis!,
        klasifikasi: request.klasifikasi,
        perihal: request.perihal!,
        jumlah: request.jumlah!,
        penandatangan: request.penandatangan,
        created_at: request.createdAt,
        status,
      };
    });

    // Filter out null values
    const filteredData = data.filter(
      (item): item is Exclude<typeof item, null> => item !== null,
    );

    // Apply sorting
    if (query?.sort_by) {
      const sortOrder = query.sort_order?.toLowerCase() === 'asc' ? 1 : -1;
      filteredData.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        if (query.sort_by === 'tanggal') {
          aValue = new Date(a.tanggal).getTime();
          bValue = new Date(b.tanggal).getTime();
        } else if (
          query.sort_by === 'tanggal_usulan' ||
          query.sort_by === 'waktu'
        ) {
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
        } else if (query.sort_by === 'jenis') {
          aValue = (a.jenis || '').toLowerCase();
          bValue = (b.jenis || '').toLowerCase();
          return aValue.localeCompare(bValue) * sortOrder;
        } else if (query.sort_by === 'status') {
          aValue = (a.status || '').toLowerCase();
          bValue = (b.status || '').toLowerCase();
          return aValue.localeCompare(bValue) * sortOrder;
        } else {
          return 0;
        }

        return (aValue - bValue) * sortOrder;
      });
    }

    // Apply pagination
    const page = query?.page || 1;
    const limit = query?.limit || 10;
    const total = filteredData.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const paginatedData = filteredData.slice(skip, skip + limit);

    return {
      success: true,
      message: 'Data usulan nomor berhasil diambil',
      data: paginatedData,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Admin melihat semua usulan nomor dengan filter posisi
   * - Semua data dengan status selain "Belum Diajukan" ditampilkan
   * - Data dengan status "Belum Diajukan" hanya yang dibuat oleh posisi tertentu
   * - Hanya menampilkan data dari usulan manual (is_naskah_generated != true)
   */
  async getAdminNomorRequestByPosition(
    positionId: number,
    query?: GetNomorQueryDto,
    user?: JwtPayload,
  ): Promise<GetAdminNomorRequestResponseDto> {
    const area = this.getScopedAreaCode(user as JwtPayload);
    const [positions, roles] = await Promise.all([
      this.getLatestPositionJsonData(),
      this.userRoleRepository.find({
        where: [{ role: UserRole.ADMIN }, { role: UserRole.SUPERADMIN }],
        select: ['persnum'],
      }),
    ]);
    const admins = new Set(roles.map((role) => Number(role.persnum)));
    const adminPositions = positions
      .filter((position) => admins.has(Number(position.persnum_person)))
      .map((position) => String(position.position));
    const byPosition = new Map(
      positions.map((position) => [Number(position.position), position]),
    );
    const { requests, pagination } = await this.loadNomorListPage(
      query,
      { mode: 'admin-usulan', area, adminPositions, draftPosition: positionId },
      positions,
    );
    const data = requests.map((request) => ({
      id: request.id,
      company: request.company!,
      area: request.area!,
      sub_area: request.subArea!,
      organization: request.organization!,
      position: request.position!,
      persnum: byPosition.get(Number(request.position))?.persnum_person || null,
      nama:
        byPosition.get(Number(request.position))?.persnum_person_text || null,
      tanggal: request.tanggal!,
      jenis: request.jenis!,
      klasifikasi: request.klasifikasi,
      perihal: request.perihal!,
      jumlah: request.jumlah!,
      penandatangan: request.penandatangan,
      created_at: request.createdAt,
      status: this.determineStatusFromDetails(request.details || []),
    }));
    return {
      success: true,
      message: 'Data usulan nomor berhasil diambil',
      data,
      pagination,
    };
  }

  /**
   * Get detail usulan nomor berdasarkan ID (usulan saja, tanpa details)
   */
  async getNomorRequestDetail(requestId: string): Promise<any> {
    const request = await this.nomorRequestRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException(
        `Usulan nomor dengan ID ${requestId} tidak ditemukan`,
      );
    }

    // Get org_data untuk tanggal request
    const tglFormatted = this.formatDate(request.tanggal!);
    let positionJsonData: any[] = [];
    let usingLatestFallback = false;

    try {
      const orgData = await this.orgDataService.findOrg(tglFormatted);
      if (orgData?.position_json && Array.isArray(orgData.position_json)) {
        positionJsonData = orgData.position_json;
      }
    } catch (error) {
      console.log(
        'Could not fetch position data from org_data for date:',
        tglFormatted,
      );
    }

    // Fallback: If position_json is empty or position not found, try latest org_data
    if (positionJsonData.length === 0) {
      try {
        const latestOrgData = await this.orgDataService.findLatestOrg();
        if (
          latestOrgData?.position_json &&
          Array.isArray(latestOrgData.position_json)
        ) {
          positionJsonData = latestOrgData.position_json;
          usingLatestFallback = true;
          console.log(
            'Using latest org_data as fallback, date:',
            latestOrgData.tgl,
          );
        }
      } catch (error) {
        console.log('Could not fetch latest org_data');
      }
    }

    // Get details untuk menentukan status
    const details = await this.nomorRequestDetailRepository.find({
      where: { idRequest: requestId },
    });

    // Determine status
    let status = 'Belum Diajukan';
    if (details.length > 0) {
      const hasBooking = details.some((d) => d.status === 'booking');
      const hasTerpakai = details.some(
        (d) => d.status === 'terpakai' || d.status === 'terpakai_final',
      );
      const allHangus = details.every((d) => d.status === 'hangus');
      const allDitolak = details.every((d) => d.status === 'ditolak');
      const hasRejected = details.some(
        (d) => d.status === 'hangus' || d.status === 'ditolak',
      );

      if (hasTerpakai) {
        status = 'Disetujui';
      } else if (
        allHangus ||
        allDitolak ||
        (hasRejected && !hasBooking && !hasTerpakai)
      ) {
        status = 'Ditolak';
      } else if (hasBooking) {
        status = 'Menunggu Verifikasi';
      }
    }

    // Get position data
    const positionNumber = parseInt(request.position!, 10);
    const positionData = positionJsonData.find(
      (p: any) => Number(p.position) === positionNumber,
    );

    const persnum = positionData?.persnum_person || null;
    const nama = positionData?.persnum_person_text || null;

    // Get penandatangan position abbreviation
    let penandatanganPositionAbbreviation: string | null = null;

    if (request.idPositionPenandatangan) {
      const searchId = Number(request.idPositionPenandatangan);
      const penandatanganPosition = positionJsonData.find(
        (p: any) => Number(p.position) === searchId,
      );

      if (penandatanganPosition) {
        penandatanganPositionAbbreviation =
          penandatanganPosition.position_abbreviation ||
          penandatanganPosition.abbreviation ||
          null;
        console.log(
          'Found penandatangan position:',
          searchId,
          'abbreviation:',
          penandatanganPositionAbbreviation,
        );
      } else {
        console.log(
          'Position',
          searchId,
          'not found in org_data (using fallback:',
          usingLatestFallback,
          ')',
        );
      }
    }

    // Generate template nomor
    const templateNomor = await this.generateNomorTemplate(request);

    // Build response dengan optional details jika sudah diajukan
    const responseData: any = {
      id: request.id,
      company: request.company!,
      area: request.area!,
      sub_area: request.subArea!,
      organization: request.organization!,
      position: request.position!,
      persnum,
      nama,
      tanggal: request.tanggal!,
      jenis: request.jenis!,
      klasifikasi: request.klasifikasi,
      perihal: request.perihal!,
      jumlah: request.jumlah!,
      penandatangan: request.penandatangan,
      penandatangan_position_id: request.idPositionPenandatangan,
      penandatangan_position_abbreviation: penandatanganPositionAbbreviation,
      template_nomor: templateNomor,
      created_at: request.createdAt,
      status,
    };

    // Tambahkan details jika sudah diajukan (ada file)
    if (details.length > 0) {
      const detailsWithUrls = await Promise.all(
        details.map(async (d) => ({
          id: d.id,
          nomor: d.nomor,
          status: d.status,
          file_name: d.fileName,
          file_url: await this.getDetailFileUrlAndHeal(d, 'nomor'),
          created_at: d.createdAt,
        })),
      );

      responseData.details = detailsWithUrls;
    }

    responseData.is_single_file = request.isSingleFile;

    return {
      success: true,
      message: 'Detail usulan nomor berhasil diambil',
      data: responseData,
    };
  }

  /**
   * Helper: Generate template nomor (preview format dengan nomor urut kosong)
   */
  private async generateNomorTemplate(
    request: NomorRequestEntity,
    context?: {
      jenis: Map<string, JenisEntity>;
      org: Map<string, Promise<any>>;
    },
  ): Promise<string | null> {
    try {
      if (!request.jenis) return null;

      // Ambil format dari jenis table
      const jenisData = context
        ? context.jenis.get(request.jenis)
        : await this.jenisRepository.findOne({
            where: { jenis: request.jenis },
          });

      if (!jenisData || !jenisData.formatPenomoran) {
        return null;
      }

      // Ambil data penandatangan dari position_json (same logic as getNomorRequestDetail)
      let penandatanganPositionAbbreviation: string | null = null;
      let penandatanganArea: string | null = null;

      if (request.idPositionPenandatangan) {
        const tglFormatted = this.formatDate(request.tanggal!);
        let positionJsonData: any[] = [];

        try {
          if (context && !context.org.has(tglFormatted)) {
            context.org.set(
              tglFormatted,
              this.orgDataService
                .findOrg(tglFormatted)
                .catch(() => this.orgDataService.findLatestOrg()),
            );
          }
          const orgData = context
            ? await context.org.get(tglFormatted)
            : await this.orgDataService.findOrg(tglFormatted);
          if (orgData?.position_json && Array.isArray(orgData.position_json)) {
            positionJsonData = orgData.position_json;
          }
        } catch (error) {
          // Fallback to latest org_data if date not found
          try {
            const latestOrgData = await this.orgDataService.findLatestOrg();
            if (
              latestOrgData?.position_json &&
              Array.isArray(latestOrgData.position_json)
            ) {
              positionJsonData = latestOrgData.position_json;
            }
          } catch (err) {
            console.log('Could not fetch org_data');
          }
        }

        const searchId = Number(request.idPositionPenandatangan);
        const penandatanganPosition = positionJsonData.find(
          (p: any) => Number(p.position) === searchId,
        );

        if (penandatanganPosition) {
          penandatanganPositionAbbreviation =
            penandatanganPosition.position_abbreviation ||
            penandatanganPosition.abbreviation ||
            null;
          penandatanganArea = penandatanganPosition.area || null;
        }

        if (!penandatanganArea && request.area) {
          penandatanganArea = request.area;
        }
      } else {
        penandatanganArea = request.area;
      }

      // Generate template dengan nomor urut kosong
      const tahun = new Date(request.tanggal!).getFullYear();
      const bulan = new Date(request.tanggal!).getMonth() + 1;
      const bulanRomawi = this.getBulanRomawi(bulan);

      const jabatanCode = penandatanganPositionAbbreviation || '';
      const lokasiCode = this.extractAreaCode(penandatanganArea);
      const instansi = 'LPPNPI';

      // Ganti {NO_URUT} dengan dots, replace placeholder lainnya
      const template = jenisData.formatPenomoran
        .replace(/{NO_URUT}/g, '.....')
        .replace(/{TIPE}/g, request.jenis || '')
        .replace(/{INSTANSI}/g, instansi)
        .replace(/{JABATAN}/g, jabatanCode)
        .replace(/{LOKASI}/g, lokasiCode)
        .replace(/{KLASIFIKASI}/g, request.klasifikasi || '')
        .replace(/{BULAN}/g, bulanRomawi)
        .replace(/{TAHUN}/g, tahun.toString());

      return template;
    } catch (error) {
      console.log('Error generating nomor template:', error);
      return null;
    }
  }

  /**
   * Get detail penomoran (usulan + nomor request details)
   */
  async getNomorDetailPenomoran(requestId: string): Promise<any> {
    const request = await this.nomorRequestRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException(
        `Usulan nomor dengan ID ${requestId} tidak ditemukan`,
      );
    }

    // Get latest org_data untuk extract position details
    // Use findLatestOrg() (cached, limit 1) instead of findAll() to avoid timeout
    let positionJsonData: any[] = [];
    try {
      const latestOrgData = await this.orgDataService.findLatestOrg();
      if (
        latestOrgData?.position_json &&
        Array.isArray(latestOrgData.position_json)
      ) {
        positionJsonData = latestOrgData.position_json;
      }
    } catch (error) {
      console.log('Could not fetch position data from org_data');
    }

    // Get details
    const details = await this.nomorRequestDetailRepository.find({
      where: { idRequest: requestId },
      order: { createdAt: 'ASC' },
    });

    // Determine status
    let status = 'Belum Diajukan';
    if (details.length > 0) {
      const hasBooking = details.some((d) => d.status === 'booking');
      const hasTerpakai = details.some(
        (d) => d.status === 'terpakai' || d.status === 'terpakai_final',
      );
      const allHangus = details.every((d) => d.status === 'hangus');
      const allDitolak = details.every((d) => d.status === 'ditolak');
      const hasRejected = details.some(
        (d) => d.status === 'hangus' || d.status === 'ditolak',
      );

      if (hasTerpakai) {
        status = 'Disetujui';
      } else if (
        allHangus ||
        allDitolak ||
        (hasRejected && !hasBooking && !hasTerpakai)
      ) {
        status = 'Ditolak';
      } else if (hasBooking) {
        status = 'Menunggu Verifikasi';
      }
    }

    // Get position data
    const positionNumber = parseInt(request.position!, 10);
    const positionData = positionJsonData.find(
      (p: any) => p.position === positionNumber,
    );

    const persnum = positionData?.persnum_person || null;
    const nama = positionData?.persnum_person_text || null;

    // Generate signed URLs untuk details
    const detailsWithUrls = await Promise.all(
      details.map(async (d) => ({
        id: d.id,
        nomor: d.nomor,
        status: d.status,
        file_name: d.fileName,
        file_text: d.fileText,
        file_url: await this.getDetailFileUrlAndHeal(d, 'nomor'),
        created_at: d.createdAt,
      })),
    );

    return {
      success: true,
      message: 'Detail penomoran berhasil diambil',
      data: {
        id: request.id,
        company: request.company!,
        area: request.area!,
        sub_area: request.subArea!,
        organization: request.organization!,
        position: request.position!,
        persnum,
        nama,
        tanggal: request.tanggal!,
        jenis: request.jenis!,
        klasifikasi: request.klasifikasi,
        perihal: request.perihal!,
        jumlah: request.jumlah!,
        penandatangan: request.penandatangan,
        created_at: request.createdAt,
        status,
        is_single_file: request.isSingleFile,
        details: detailsWithUrls,
      },
    };
  }

  /**
   * User/Admin memproses usulan dan membuat booking nomor
   * Dengan file upload ke storage menggunakan folder query parameter
   * Mendukkan multiple file upload
   *
   * Flow:
   * 1. Validasi request ada
   * 2. Jika action=replace, hapus detail lama dengan status booking (dan file di storage)
   * 3. Jika ada files, upload semua ke storage dengan folder path
   * 4. Buat detail record per file dengan status = 'booking' dan file key dari storage
   * 5. Jika tidak ada file, buat berdasarkan jumlah
   * 6. Return response dengan file information
   */
  async bookingNomorRequest(
    requestId: string,
    dto: BookingNomorRequestDto,
    files?: Express.Multer.File | Express.Multer.File[],
    folder: string = 'nomor',
    action: 'append' | 'replace' = 'append',
  ): Promise<BookingNomorRequestResponseDto> {
    const request = await this.nomorRequestRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException(
        `Usulan nomor dengan ID ${requestId} tidak ditemukan`,
      );
    }

    // Jika action = 'replace', hapus detail lama dengan status draft dan file-nya
    if (action === 'replace') {
      const oldDetails = await this.nomorRequestDetailRepository.find({
        where: { idRequest: requestId, status: 'draft' },
      });

      // Delete files dari storage untuk setiap detail
      for (const detail of oldDetails) {
        if (detail.fileText) {
          try {
            await this.storageService.deleteFile(detail.fileText);
            console.log(`Deleted old file from storage: ${detail.fileText}`);
          } catch (error) {
            // Log error tapi jangan throw, proses tetap lanjut
            console.log(
              `Failed to delete file ${detail.fileText}:`,
              error.message,
            );
          }
        }
      }

      // Hapus detail dari database
      await this.nomorRequestDetailRepository.delete({
        idRequest: requestId,
        status: 'draft',
      });
    }

    const details: NomorRequestDetailEntity[] = [];

    // Normalize files ke array
    const fileArray = files ? (Array.isArray(files) ? files : [files]) : [];

    // Upload files jika ada
    if (fileArray && fileArray.length > 0) {
      for (const file of fileArray) {
        const detailId = uuidv4();
        let fileKey: string | null = null;
        const fileName: string | null = file.originalname;

        // Upload file ke storage dengan folder path
        try {
          const uploadResult = await this.storageService.uploadFile(
            file,
            folder,
          );
          fileKey = uploadResult.key;
          console.log(`✅ File uploaded successfully: ${fileKey}`);
        } catch (error) {
          console.error(`❌ File upload error for ${fileName}:`, error.message);
          throw new BadRequestException(
            `Gagal upload file ${fileName}: ${error.message}`,
          );
        }

        const detail = this.nomorRequestDetailRepository.create({
          id: detailId,
          idRequest: requestId,
          nomor: null,
          fileName: fileName,
          fileText: fileKey, // Simpan file key dari storage
          status: 'draft',
        });
        details.push(detail);
      }
    }

    // Tambah details tanpa file berdasarkan jumlah (untuk melengkapi total quantity)
    const jumlahDiajukan = dto.jumlah || request.jumlah || 0;
    const uploadedFileCount = fileArray.length;

    // Jika jumlah lebih besar dari file count, buat details tambahan tanpa file
    if (jumlahDiajukan > uploadedFileCount) {
      for (let i = uploadedFileCount; i < jumlahDiajukan; i++) {
        const detailId = uuidv4();
        const detail = this.nomorRequestDetailRepository.create({
          id: detailId,
          idRequest: requestId,
          nomor: null,
          fileName: null,
          fileText: null,
          status: 'draft',
        });
        details.push(detail);
      }
    }

    // Validasi: minimal harus ada 1 detail (file atau quantity)
    if (details.length === 0) {
      throw new BadRequestException(
        'Minimal harus upload file atau mengisi jumlah nomor yang diajukan',
      );
    }

    await this.nomorRequestDetailRepository.save(details);

    if (request.idPositionPenandatangan) {
      this.notifyNomorPosition({
        positionId: request.idPositionPenandatangan,
        request,
        type: NotificationType.PENOMORAN_USULAN,
        title: 'Usulan penomoran menunggu persetujuan',
        body: request.perihal || 'Ada usulan penomoran yang perlu disetujui',
        action: 'OPEN_PERSETUJUAN_PENOMORAN',
      }).catch((err) =>
        this.logger.warn(
          `Failed to send PENOMORAN_USULAN notification: ${err?.message}`,
        ),
      );
    } else {
      this.notifyNomorAdmins(
        request,
        NotificationType.PENOMORAN_VERIFIKASI,
        'Usulan penomoran siap diverifikasi',
        request.perihal || 'Ada usulan penomoran yang siap diverifikasi',
      ).catch((err) =>
        this.logger.warn(
          `Failed to send PENOMORAN_VERIFIKASI notification: ${err?.message}`,
        ),
      );
    }

    // Generate signed URLs untuk files yang berhasil di-upload
    const detailsWithUrls = await Promise.all(
      details.map(async (detail) => ({
        id: detail.id,
        status: detail.status,
        file_name: detail.fileName,
        file_text: detail.fileText,
        file_url: await this.getDetailFileUrlAndHeal(detail, folder),
        created_at: detail.createdAt,
      })),
    );

    // Hitung berapa file dan berapa nomor tanpa file
    const fileCount = details.filter((d) => d.fileText).length;
    const noFileCount = details.filter((d) => !d.fileText).length;

    let resultMessage = `Berhasil booking ${details.length} nomor`;
    if (fileCount > 0 && noFileCount > 0) {
      resultMessage = `Berhasil booking ${details.length} nomor (${fileCount} dengan file, ${noFileCount} tanpa file)`;
    } else if (fileCount > 0) {
      resultMessage = `Berhasil booking ${fileCount} nomor dengan file`;
    } else if (noFileCount > 0) {
      resultMessage = `Berhasil booking ${noFileCount} nomor (tanpa file)`;
    }

    return {
      success: true,
      message: resultMessage,
      data: {
        request_id: requestId,
        details: detailsWithUrls,
      },
    };
  }

  /**
   * User/Admin memproses usulan dan membuat booking nomor
   * Upload SATU file yang akan di-assign ke SEMUA request detail
   * Semua detail akan memiliki file path yang sama
   *
   * Flow:
   * 1. Validasi request ada
   * 2. Jika action=replace, hapus detail lama dengan status booking (dan file di storage)
   * 3. Upload satu file ke storage
   * 4. Buat detail records sesuai jumlah, semua dengan file key yang sama
   * 5. Return response dengan file information
   */
  async bookingNomorRequestSingleFile(
    requestId: string,
    dto: BookingNomorRequestDto,
    file?: Express.Multer.File,
    folder: string = 'nomor',
    action: 'append' | 'replace' = 'append',
  ): Promise<BookingNomorRequestResponseDto> {
    const request = await this.nomorRequestRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException(
        `Usulan nomor dengan ID ${requestId} tidak ditemukan`,
      );
    }

    // Jika action = 'replace', hapus detail lama dengan status draft dan file-nya
    if (action === 'replace') {
      const oldDetails = await this.nomorRequestDetailRepository.find({
        where: { idRequest: requestId, status: 'draft' },
      });

      // Collect unique file keys untuk dihapus (hindari double delete)
      const uniqueFileKeys = new Set<string>();
      for (const detail of oldDetails) {
        if (detail.fileText) {
          uniqueFileKeys.add(detail.fileText);
        }
      }

      // Delete unique files dari storage
      for (const fileKey of uniqueFileKeys) {
        try {
          await this.storageService.deleteFile(fileKey);
          console.log(`Deleted old file from storage: ${fileKey}`);
        } catch (error) {
          console.log(`Failed to delete file ${fileKey}:`, error.message);
        }
      }

      // Hapus detail dari database
      await this.nomorRequestDetailRepository.delete({
        idRequest: requestId,
        status: 'draft',
      });
    }

    // Upload satu file jika ada
    let fileKey: string | null = null;
    let fileName: string | null = null;

    if (file) {
      fileName = file.originalname;
      try {
        const uploadResult = await this.storageService.uploadFile(file, folder);
        fileKey = uploadResult.key;
        console.log(`✅ File uploaded successfully (single): ${fileKey}`);
      } catch (error) {
        console.error(`❌ File upload error for ${fileName}:`, error.message);
        throw new BadRequestException(
          `Gagal upload file ${fileName}: ${error.message}`,
        );
      }
    }

    // Tentukan jumlah detail yang akan dibuat
    const jumlahDiajukan = dto.jumlah || request.jumlah || 0;

    if (jumlahDiajukan <= 0 && !file) {
      throw new BadRequestException(
        'Minimal harus upload file atau mengisi jumlah nomor yang diajukan',
      );
    }

    const totalDetails = jumlahDiajukan > 0 ? jumlahDiajukan : 1;

    // Buat semua details dengan file path yang sama
    const details: NomorRequestDetailEntity[] = [];
    for (let i = 0; i < totalDetails; i++) {
      const detailId = uuidv4();
      const detail = this.nomorRequestDetailRepository.create({
        id: detailId,
        idRequest: requestId,
        nomor: null,
        fileName: fileName,
        fileText: fileKey,
        status: 'draft',
      });
      details.push(detail);
    }

    await this.nomorRequestDetailRepository.save(details);

    // Tandai request sebagai single file
    request.isSingleFile = 1;
    await this.nomorRequestRepository.save(request);

    if (request.idPositionPenandatangan) {
      this.notifyNomorPosition({
        positionId: request.idPositionPenandatangan,
        request,
        type: NotificationType.PENOMORAN_USULAN,
        title: 'Usulan penomoran menunggu persetujuan',
        body: request.perihal || 'Ada usulan penomoran yang perlu disetujui',
        action: 'OPEN_PERSETUJUAN_PENOMORAN',
      }).catch((err) =>
        this.logger.warn(
          `Failed to send PENOMORAN_USULAN notification: ${err?.message}`,
        ),
      );
    } else {
      this.notifyNomorAdmins(
        request,
        NotificationType.PENOMORAN_VERIFIKASI,
        'Usulan penomoran siap diverifikasi',
        request.perihal || 'Ada usulan penomoran yang siap diverifikasi',
      ).catch((err) =>
        this.logger.warn(
          `Failed to send PENOMORAN_VERIFIKASI notification: ${err?.message}`,
        ),
      );
    }

    // Generate signed URL sekali saja karena semua detail pakai file yang sama
    let fileUrl: string | null = null;
    if (fileKey) {
      fileUrl = await this.storageService.getFileUrl(fileKey);
    }

    const detailsWithUrls = details.map((detail) => ({
      id: detail.id,
      status: detail.status,
      file_name: detail.fileName,
      file_text: detail.fileText,
      file_url: fileUrl,
      created_at: detail.createdAt,
    }));

    const resultMessage = file
      ? `Berhasil booking ${totalDetails} nomor dengan 1 file yang sama`
      : `Berhasil booking ${totalDetails} nomor (tanpa file)`;

    return {
      success: true,
      message: resultMessage,
      data: {
        request_id: requestId,
        details: detailsWithUrls,
      },
    };
  }

  /**
   * User/Admin update file di detail yang masih booking
   * Untuk replace lampiran sebelum approve
   */
  async updateNomorRequestDetailFile(
    detailId: string,
    file: Express.Multer.File,
    folder: string = 'nomor',
  ): Promise<any> {
    const detail = await this.nomorRequestDetailRepository.findOne({
      where: { id: detailId },
    });

    if (!detail) {
      throw new NotFoundException(
        `Detail nomor dengan ID ${detailId} tidak ditemukan`,
      );
    }

    if (detail.status !== 'booking') {
      throw new BadRequestException(
        `Tidak dapat update file untuk detail dengan status: ${detail.status}. Hanya detail dengan status 'booking' yang bisa diupdate.`,
      );
    }

    // Delete file lama dari storage jika ada
    if (detail.fileText) {
      try {
        await this.storageService.deleteFile(detail.fileText);
        console.log(`Deleted old file from storage: ${detail.fileText}`);
      } catch (error) {
        console.log(
          `Failed to delete old file ${detail.fileText}:`,
          error.message,
        );
      }
    }

    // Upload file baru ke storage
    let fileKey: string | null = null;
    try {
      const uploadResult = await this.storageService.uploadFile(file, folder);
      fileKey = uploadResult.key;
    } catch (error) {
      throw new BadRequestException(
        `Gagal upload file ${file.originalname}: ${error.message}`,
      );
    }

    // Update detail dengan file baru
    detail.fileName = file.originalname;
    detail.fileText = fileKey;
    await this.nomorRequestDetailRepository.save(detail);

    return {
      success: true,
      message: 'File berhasil diupdate',
      data: {
        id: detail.id,
        file_name: detail.fileName,
        file_text: detail.fileText,
        status: detail.status,
        updated_at: new Date(),
      },
    };
  }

  /**
   * Admin upload file final untuk detail dengan status terpakai
   * Upload file dan ubah status menjadi terpakai_final
   */
  async uploadFileToTerpakaiAkhir(
    detailId: string,
    file: Express.Multer.File,
    folder: string = 'nomor',
  ): Promise<any> {
    const detail = await this.nomorRequestDetailRepository.findOne({
      where: { id: detailId },
    });

    if (!detail) {
      throw new NotFoundException(
        `Detail nomor dengan ID ${detailId} tidak ditemukan`,
      );
    }

    if (detail.status !== 'terpakai') {
      throw new BadRequestException(
        `Tidak dapat upload file untuk detail dengan status: ${detail.status}. Hanya detail dengan status 'terpakai' yang bisa diupload file final.`,
      );
    }

    // Delete file lama dari storage jika ada
    if (detail.fileText) {
      try {
        await this.storageService.deleteFile(detail.fileText);
        console.log(`Deleted old file from storage: ${detail.fileText}`);
      } catch (error) {
        console.log(
          `Failed to delete old file ${detail.fileText}:`,
          error.message,
        );
      }
    }

    // Upload file baru ke storage
    let fileKey: string | null = null;
    try {
      const uploadResult = await this.storageService.uploadFile(file, folder);
      fileKey = uploadResult.key;
      console.log(
        `✅ File uploaded successfully for terpakai_final: ${fileKey}`,
      );
    } catch (error) {
      throw new BadRequestException(
        `Gagal upload file ${file.originalname}: ${error.message}`,
      );
    }

    // Cek apakah request ini single file mode
    const request = await this.nomorRequestRepository.findOne({
      where: { id: detail.idRequest! },
    });

    if (request?.isSingleFile === 1) {
      // Single file mode: update semua detail yang berstatus 'terpakai' dalam request ini
      const allTerpakaiDetails = await this.nomorRequestDetailRepository.find({
        where: { idRequest: detail.idRequest!, status: 'terpakai' },
      });

      await Promise.all(
        allTerpakaiDetails.map((d) => {
          d.fileName = file.originalname;
          d.fileText = fileKey;
          d.status = 'terpakai_final';
          return this.nomorRequestDetailRepository.save(d);
        }),
      );

      // Reload detail setelah update
      detail.fileName = file.originalname;
      detail.fileText = fileKey;
      detail.status = 'terpakai_final';
    } else {
      // Multi file mode: hanya update detail yang dipilih
      detail.fileName = file.originalname;
      detail.fileText = fileKey;
      detail.status = 'terpakai_final';
      await this.nomorRequestDetailRepository.save(detail);
    }

    return {
      success: true,
      message:
        'File berhasil diupload dan status berubah menjadi terpakai_final',
      data: {
        id: detail.id,
        nomor: detail.nomor,
        file_name: detail.fileName,
        file_text: detail.fileText,
        status: detail.status,
        updated_at: new Date(),
      },
    };
  }

  /**
   * Admin menyetujui usulan dan generate nomor
   *
   * Flow:
   * 1. Ambil nomor terakhir dari tabel nomor (dengan locking)
   * 2. Generate nomor baru
   * 3. Update nomor_request_detail: status = 'terpakai', nomor = nomor baru
   * 4. Insert data ke tabel nomor sebagai nomor resmi
   *
   * Menggunakan transaction dan locking untuk mencegah duplikasi
   */
  async approveNomorRequestDetail(
    detailId: string,
    dto: ApproveNomorRequestDetailDto,
  ): Promise<ApproveNomorRequestDetailResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Ambil detail dengan locking
      const detail = await queryRunner.manager.findOne(
        NomorRequestDetailEntity,
        {
          where: { id: detailId },
          lock: { mode: 'pessimistic_write' },
        },
      );

      if (!detail) {
        throw new NotFoundException(
          `Detail nomor dengan ID ${detailId} tidak ditemukan`,
        );
      }

      if (detail.status !== 'booking') {
        throw new BadRequestException(
          `Detail nomor sudah diproses dengan status: ${detail.status}`,
        );
      }

      // 2. Ambil request untuk mendapatkan info
      const request = await queryRunner.manager.findOne(NomorRequestEntity, {
        where: { id: detail.idRequest! },
      });

      if (!request) {
        throw new NotFoundException(`Request nomor tidak ditemukan`);
      }

      const tahun = new Date(request.tanggal!).getFullYear();

      // 3. Validasi jenis ada
      if (!request.jenis) {
        throw new BadRequestException(
          'Jenis nomor tidak ditemukan pada request',
        );
      }

      // 4. Ambil format penomoran dari tabel jenis
      const jenisData = await queryRunner.manager.findOne(JenisEntity, {
        where: { jenis: request.jenis },
      });

      if (!jenisData || !jenisData.formatPenomoran) {
        throw new BadRequestException(
          `Format penomoran untuk jenis ${request.jenis} tidak ditemukan`,
        );
      }

      // 5. Ambil nomor terakhir dari tabel nomor dengan locking
      // Parameter counter berbeda untuk ND/DI vs jenis lainnya:
      // - ND & DI: Company + Position + Jenis + Tahun
      // - Lainnya: Company + Area + Jenis + Tahun
      const isNdOrDi = request.jenis === 'ND' || request.jenis === 'DI';

      let queryBuilder = queryRunner.manager
        .createQueryBuilder(NomorEntity, 'n')
        .where('n.tahun = :tahun', { tahun })
        .andWhere('n.jenis = :jenis', { jenis: request.jenis })
        .andWhere('n.company = :company', { company: request.company });

      if (isNdOrDi) {
        // ND & DI: gunakan position sebagai parameter
        queryBuilder = queryBuilder.andWhere('n.position = :position', {
          position: request.position,
        });
      } else {
        // Jenis lainnya: gunakan area sebagai parameter
        queryBuilder = queryBuilder.andWhere('n.area = :area', {
          area: request.area,
        });
      }

      const nomorRecord = await queryBuilder
        .setLock('pessimistic_write')
        .getOne();

      // 6. Generate nomor urut baru (increment dari nomor terakhir)
      let noUrut = 1;
      if (nomorRecord && nomorRecord.nomor) {
        // Nomor di database sudah integer, tinggal increment
        noUrut = nomorRecord.nomor + 1;
      }

      // 7. Ambil data penandatangan untuk position abbreviation, lokasi, dan instansi
      let penandatanganPositionAbbreviation: string | null = null;
      let penandatanganArea: string | null = null;

      if (request.idPositionPenandatangan) {
        const tglFormatted = this.formatDate(request.tanggal!);
        let positionJsonData: any[] = [];

        try {
          const orgData = await this.orgDataService.findOrg(tglFormatted);
          if (orgData?.position_json && Array.isArray(orgData.position_json)) {
            positionJsonData = orgData.position_json;
          }
        } catch (error) {
          // Fallback to latest org_data if date not found
          try {
            const latestOrgData = await this.orgDataService.findLatestOrg();
            if (
              latestOrgData?.position_json &&
              Array.isArray(latestOrgData.position_json)
            ) {
              positionJsonData = latestOrgData.position_json;
            }
          } catch (err) {
            console.log('Could not fetch org_data for single approve');
          }
        }

        const searchId = Number(request.idPositionPenandatangan);
        const penandatanganPosition = positionJsonData.find(
          (p: any) => Number(p.position) === searchId,
        );

        if (penandatanganPosition) {
          penandatanganPositionAbbreviation =
            penandatanganPosition.position_abbreviation ||
            penandatanganPosition.abbreviation ||
            null;
          penandatanganArea = penandatanganPosition.area || null;
        }

        // Fallback: gunakan area dari request jika tidak ditemukan dari position lookup
        if (!penandatanganArea && request.area) {
          penandatanganArea = request.area;
        }

        // Log untuk debugging
        console.log('Penandatangan lookup (single):', {
          detailId: detailId,
          idPositionPenandatangan: request.idPositionPenandatangan,
          found: !!penandatanganPosition,
          abbreviation: penandatanganPositionAbbreviation,
          area: penandatanganArea,
        });
      } else {
        // Jika idPositionPenandatangan tidak ada, gunakan area dari request
        penandatanganArea = request.area;
        console.log(
          'Penandatangan lookup (single): idPositionPenandatangan is null, using request area',
        );
      }

      // Generate nomor menggunakan format dari tabel jenis dengan data penandatangan
      const nomorBaru = await this.generateNomorFromFormat(
        jenisData.formatPenomoran,
        noUrut,
        request,
        tahun,
        penandatanganPositionAbbreviation,
        penandatanganArea,
      );

      // 8. Update detail: status = 'terpakai', nomor = nomor baru
      detail.status = 'terpakai';
      detail.nomor = nomorBaru;
      // Preserve existing file information, don't overwrite with null
      if (dto.file_name !== undefined) {
        detail.fileName = dto.file_name;
      }
      if (dto.file_text !== undefined) {
        detail.fileText = dto.file_text;
      }
      await queryRunner.manager.save(detail);

      // 9. UPSERT ke tabel nomor (update counter jika ada, insert jika belum)
      if (nomorRecord) {
        // Update nomor urut terakhir (integer) dan data terbaru
        nomorRecord.nomor = noUrut;
        nomorRecord.area = request.area;
        nomorRecord.subArea = request.subArea;
        nomorRecord.organization = request.organization;
        nomorRecord.position = request.position;
        nomorRecord.updatedAt = new Date();
        await queryRunner.manager.save(nomorRecord);
      } else {
        // Insert record baru sebagai counter dengan semua field
        const nomorId = uuidv4();
        const nomor = this.nomorRepository.create({
          id: nomorId,
          company: request.company,
          area: request.area,
          subArea: request.subArea,
          organization: request.organization,
          position: request.position,
          tahun,
          jenis: request.jenis,
          nomor: noUrut,
        });
        await queryRunner.manager.save(nomor);
      }

      await queryRunner.commitTransaction();

      // Emit nomor count lengkap ke requester position + admin
      try {
        await this.emitNomorCountRefresh(request.position ?? undefined);
      } catch {}

      this.notifyNomorRequester(
        request,
        NotificationType.PENOMORAN_SELESAI,
        'Nomor berhasil diterbitkan',
        detail.nomor
          ? `Nomor ${detail.nomor} telah diterbitkan`
          : 'Nomor telah diterbitkan',
        'OPEN_DETAIL_PENOMORAN',
        detail,
      ).catch((err) =>
        this.logger.warn(
          `Failed to send PENOMORAN_SELESAI notification: ${err?.message}`,
        ),
      );

      return {
        success: true,
        message: 'Nomor berhasil disetujui dan digenerate',
        data: {
          id: detail.id,
          nomor: detail.nomor,
          status: detail.status,
          file_name: detail.fileName,
          file_text: detail.fileText,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Admin menolak usulan
   * status = 'hangus', nomor tetap NULL, file dihapus dari storage
   */
  async rejectNomorRequestDetail(
    detailId: string,
  ): Promise<RejectNomorRequestDetailResponseDto> {
    const detail = await this.nomorRequestDetailRepository.findOne({
      where: { id: detailId },
    });

    if (!detail) {
      throw new NotFoundException(
        `Detail nomor dengan ID ${detailId} tidak ditemukan`,
      );
    }

    if (detail.status !== 'booking') {
      throw new BadRequestException(
        `Detail nomor sudah diproses dengan status: ${detail.status}`,
      );
    }

    const request = detail.idRequest
      ? await this.nomorRequestRepository.findOne({
          where: { id: detail.idRequest },
        })
      : null;

    detail.status = 'hangus';
    await this.nomorRequestDetailRepository.save(detail);

    // Emit nomor count lengkap ke admin
    try {
      await this.emitNomorCountRefresh(request?.position ?? undefined);
    } catch {}

    if (request) {
      this.notifyNomorRequester(
        request,
        NotificationType.PENOMORAN_DITOLAK,
        'Usulan penomoran ditolak',
        request.perihal || 'Usulan penomoran ditolak',
        'OPEN_DETAIL_PENOMORAN',
        detail,
      ).catch((err) =>
        this.logger.warn(
          `Failed to send PENOMORAN_DITOLAK notification: ${err?.message}`,
        ),
      );
    }

    return {
      success: true,
      message: 'Nomor berhasil ditolak',
      data: {
        id: detail.id,
        status: detail.status,
      },
    };
  }

  /**
   * Admin menyetujui banyak usulan sekaligus
   */
  async approveBulkNomorRequestDetail(
    dto: ApproveBulkNomorRequestDetailDto,
  ): Promise<ApproveBulkNomorRequestDetailResponseDto> {
    const results: {
      id: string;
      nomor: string | null;
      status: string;
      success: boolean;
      error?: string;
    }[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (const detailId of dto.detail_ids) {
      try {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
          // 1. Ambil detail dengan locking
          const detail = await queryRunner.manager.findOne(
            NomorRequestDetailEntity,
            {
              where: { id: detailId },
              lock: { mode: 'pessimistic_write' },
            },
          );

          if (!detail) {
            throw new NotFoundException(
              `Detail nomor dengan ID ${detailId} tidak ditemukan`,
            );
          }

          if (detail.status !== 'booking') {
            throw new BadRequestException(
              `Detail nomor sudah diproses dengan status: ${detail.status}`,
            );
          }

          // 2. Ambil request untuk mendapatkan info
          const request = await queryRunner.manager.findOne(
            NomorRequestEntity,
            {
              where: { id: detail.idRequest! },
            },
          );

          if (!request) {
            throw new NotFoundException(`Request nomor tidak ditemukan`);
          }

          const tahun = new Date(request.tanggal!).getFullYear();

          // 3. Validasi jenis ada
          if (!request.jenis) {
            throw new BadRequestException(
              'Jenis nomor tidak ditemukan pada request',
            );
          }

          // 4. Ambil format penomoran dari tabel jenis
          const jenisData = await queryRunner.manager.findOne(JenisEntity, {
            where: { jenis: request.jenis },
          });

          if (!jenisData || !jenisData.formatPenomoran) {
            throw new BadRequestException(
              `Format penomoran untuk jenis ${request.jenis} tidak ditemukan`,
            );
          }

          // 5. Ambil nomor terakhir dari tabel nomor dengan locking
          // Parameter counter berbeda untuk ND/DI vs jenis lainnya:
          // - ND & DI: Company + Position + Jenis + Tahun
          // - Lainnya: Company + Area + Jenis + Tahun
          const isNdOrDi = request.jenis === 'ND' || request.jenis === 'DI';

          let queryBuilder = queryRunner.manager
            .createQueryBuilder(NomorEntity, 'n')
            .where('n.tahun = :tahun', { tahun })
            .andWhere('n.jenis = :jenis', { jenis: request.jenis })
            .andWhere('n.company = :company', { company: request.company });

          if (isNdOrDi) {
            // ND & DI: gunakan position sebagai parameter
            queryBuilder = queryBuilder.andWhere('n.position = :position', {
              position: request.position,
            });
          } else {
            // Jenis lainnya: gunakan area sebagai parameter
            queryBuilder = queryBuilder.andWhere('n.area = :area', {
              area: request.area,
            });
          }

          const nomorRecord = await queryBuilder
            .setLock('pessimistic_write')
            .getOne();

          // 6. Generate nomor urut baru (increment dari nomor terakhir)
          let noUrut = 1;
          if (nomorRecord && nomorRecord.nomor) {
            // Nomor di database sudah integer, tinggal increment
            noUrut = nomorRecord.nomor + 1;
          }

          // 7. Ambil data penandatangan untuk position abbreviation, lokasi, dan instansi
          let penandatanganPositionAbbreviation: string | null = null;
          let penandatanganArea: string | null = null;

          if (request.idPositionPenandatangan) {
            const tglFormatted = this.formatDate(request.tanggal!);
            let positionJsonData: any[] = [];

            try {
              const orgData = await this.orgDataService.findOrg(tglFormatted);
              if (
                orgData?.position_json &&
                Array.isArray(orgData.position_json)
              ) {
                positionJsonData = orgData.position_json;
              }
            } catch (error) {
              // Fallback to latest org_data if date not found
              try {
                const latestOrgData = await this.orgDataService.findLatestOrg();
                if (
                  latestOrgData?.position_json &&
                  Array.isArray(latestOrgData.position_json)
                ) {
                  positionJsonData = latestOrgData.position_json;
                }
              } catch (err) {
                console.log('Could not fetch org_data for bulk approve');
              }
            }

            const searchId = Number(request.idPositionPenandatangan);
            const penandatanganPosition = positionJsonData.find(
              (p: any) => Number(p.position) === searchId,
            );

            if (penandatanganPosition) {
              penandatanganPositionAbbreviation =
                penandatanganPosition.position_abbreviation ||
                penandatanganPosition.abbreviation ||
                null;
              penandatanganArea = penandatanganPosition.area || null;
            }

            // Fallback: gunakan area dari request jika tidak ditemukan dari position lookup
            if (!penandatanganArea && request.area) {
              penandatanganArea = request.area;
            }

            // Log untuk debugging
            console.log('Penandatangan lookup (bulk):', {
              detailId: detailId,
              idPositionPenandatangan: request.idPositionPenandatangan,
              found: !!penandatanganPosition,
              abbreviation: penandatanganPositionAbbreviation,
              area: penandatanganArea,
            });
          } else {
            // Jika idPositionPenandatangan tidak ada, gunakan area dari request
            penandatanganArea = request.area;
            console.log(
              'Penandatangan lookup (bulk): idPositionPenandatangan is null, using request area',
            );
          }

          // Generate nomor menggunakan format dari tabel jenis dengan data penandatangan
          const nomorBaru = await this.generateNomorFromFormat(
            jenisData.formatPenomoran,
            noUrut,
            request,
            tahun,
            penandatanganPositionAbbreviation,
            penandatanganArea,
          );

          // 8. Update detail: status = 'terpakai', nomor = nomor baru
          detail.status = 'terpakai';
          detail.nomor = nomorBaru;
          // Preserve existing file information, don't overwrite with null
          if (dto.file_name !== undefined) {
            detail.fileName = dto.file_name;
          }
          if (dto.file_text !== undefined) {
            detail.fileText = dto.file_text;
          }
          await queryRunner.manager.save(detail);

          // 9. UPSERT ke tabel nomor (update counter jika ada, insert jika belum)
          if (nomorRecord) {
            // Update nomor urut terakhir (integer) dan data terbaru
            nomorRecord.nomor = noUrut;
            nomorRecord.area = request.area;
            nomorRecord.subArea = request.subArea;
            nomorRecord.organization = request.organization;
            nomorRecord.position = request.position;
            nomorRecord.updatedAt = new Date();
            await queryRunner.manager.save(nomorRecord);
          } else {
            // Insert record baru sebagai counter dengan semua field
            const nomorId = uuidv4();
            const nomor = this.nomorRepository.create({
              id: nomorId,
              company: request.company,
              area: request.area,
              subArea: request.subArea,
              organization: request.organization,
              position: request.position,
              tahun,
              jenis: request.jenis,
              nomor: noUrut,
            });
            await queryRunner.manager.save(nomor);
          }

          await queryRunner.commitTransaction();

          this.notifyNomorRequester(
            request,
            NotificationType.PENOMORAN_SELESAI,
            'Nomor berhasil diterbitkan',
            detail.nomor
              ? `Nomor ${detail.nomor} telah diterbitkan`
              : 'Nomor telah diterbitkan',
            'OPEN_DETAIL_PENOMORAN',
            detail,
          ).catch((err) =>
            this.logger.warn(
              `Failed to send PENOMORAN_SELESAI notification: ${err?.message}`,
            ),
          );

          results.push({
            id: detail.id,
            nomor: detail.nomor,
            status: detail.status,
            success: true,
          });
          successCount++;
        } catch (error) {
          await queryRunner.rollbackTransaction();
          results.push({
            id: detailId,
            nomor: null,
            status: 'booking',
            success: false,
            error: error.message,
          });
          failedCount++;
        } finally {
          await queryRunner.release();
        }
      } catch (error) {
        results.push({
          id: detailId,
          nomor: null,
          status: 'booking',
          success: false,
          error: error.message,
        });
        failedCount++;
      }
    }

    // Emit nomor count lengkap ke admin (bulk approve selesai)
    try {
      await this.emitNomorCountRefresh();
    } catch {}

    return {
      success: true,
      message: `Selesai memproses ${dto.detail_ids.length} detail: ${successCount} berhasil, ${failedCount} gagal`,
      data: {
        success_count: successCount,
        failed_count: failedCount,
        results,
      },
    };
  }

  /**
   * Admin menolak banyak usulan sekaligus
   */
  async rejectBulkNomorRequestDetail(
    dto: RejectBulkNomorRequestDetailDto,
  ): Promise<RejectBulkNomorRequestDetailResponseDto> {
    const results: {
      id: string;
      status: string;
      success: boolean;
      error?: string;
    }[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (const detailId of dto.detail_ids) {
      try {
        const detail = await this.nomorRequestDetailRepository.findOne({
          where: { id: detailId },
        });

        if (!detail) {
          throw new NotFoundException(
            `Detail nomor dengan ID ${detailId} tidak ditemukan`,
          );
        }

        if (detail.status !== 'booking') {
          throw new BadRequestException(
            `Detail nomor sudah diproses dengan status: ${detail.status}`,
          );
        }

        const request = detail.idRequest
          ? await this.nomorRequestRepository.findOne({
              where: { id: detail.idRequest },
            })
          : null;

        detail.status = 'hangus';
        await this.nomorRequestDetailRepository.save(detail);

        if (request) {
          this.notifyNomorRequester(
            request,
            NotificationType.PENOMORAN_DITOLAK,
            'Usulan penomoran ditolak',
            request.perihal || 'Usulan penomoran ditolak',
            'OPEN_DETAIL_PENOMORAN',
            detail,
          ).catch((err) =>
            this.logger.warn(
              `Failed to send PENOMORAN_DITOLAK notification: ${err?.message}`,
            ),
          );
        }

        results.push({
          id: detail.id,
          status: detail.status,
          success: true,
        });
        successCount++;
      } catch (error) {
        results.push({
          id: detailId,
          status: 'booking',
          success: false,
          error: error.message,
        });
        failedCount++;
      }
    }

    // Emit nomor count lengkap ke admin (bulk reject selesai)
    try {
      await this.emitNomorCountRefresh();
    } catch {}

    return {
      success: true,
      message: `Selesai memproses ${dto.detail_ids.length} detail: ${successCount} berhasil, ${failedCount} gagal`,
      data: {
        success_count: successCount,
        failed_count: failedCount,
        results,
      },
    };
  }

  /**
   * Admin mengubah status detail menjadi hangus
   * Bisa digunakan untuk nomor dengan status apapun (terpakai, terpakai_final, booking, dll)
   */
  async setStatusHangus(detailId: string): Promise<any> {
    const detail = await this.nomorRequestDetailRepository.findOne({
      where: { id: detailId },
    });

    if (!detail) {
      throw new NotFoundException(
        `Detail nomor dengan ID ${detailId} tidak ditemukan`,
      );
    }

    // Simpan status lama untuk log
    const oldStatus = detail.status;

    // Update status menjadi hangus
    detail.status = 'hangus';
    await this.nomorRequestDetailRepository.save(detail);

    return {
      success: true,
      message: `Status berhasil diubah dari ${oldStatus} menjadi hangus`,
      data: {
        id: detail.id,
        nomor: detail.nomor,
        old_status: oldStatus,
        new_status: detail.status,
        updated_at: new Date(),
      },
    };
  }

  /**
   * Get semua nomor yang sudah jadi (dari nomor_request_detail dengan status terpakai, terpakai_final, atau hangus)
   * OPTIMIZED: Pagination per usulan (request), output tetap flat per nomor
   */
  async getNomor(
    query: GetNomorQueryDto,
    user?: JwtPayload,
  ): Promise<GetNomorResponseDto> {
    const area = user ? this.getScopedAreaCode(user) : undefined;
    const { requests, pagination } = await this.loadNomorListPage(query, {
      mode: 'nomor',
      area,
    });
    const positions = await this.getLatestPositionJsonData();
    const byPosition = new Map(
      positions.map((position) => [Number(position.position), position]),
    );
    const data = requests.flatMap((request) => {
      const nama =
        byPosition.get(Number(request.position))?.persnum_person_text || null;
      const jabatan =
        byPosition.get(Number(request.idPositionPenandatangan))
          ?.position_text || null;
      return (request.details || [])
        .filter((detail) =>
          ['terpakai', 'terpakai_final', 'hangus'].includes(detail.status),
        )
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .map((detail) => ({
          id: detail.id,
          id_request: request.id,
          jenis: request.jenis,
          jabatan,
          klasifikasi: request.klasifikasi,
          perihal: request.perihal,
          tanggal: request.tanggal,
          nomor: detail.nomor,
          status: detail.status,
          nama_pengirim: nama,
          waktu: detail.createdAt,
        }));
    });
    return {
      success: true,
      message: 'Data nomor berhasil diambil',
      data,
      pagination,
    };
  }

  /**
   * Get nomor by id request (menampilkan semua nomor dalam satu request)
   * OPTIMIZED: Menggunakan caching untuk position data
   */
  async getNomorById(idRequest: string): Promise<any> {
    const request = await this.nomorRequestRepository.findOne({
      where: { id: idRequest },
    });

    if (!request) {
      throw new Error('Nomor request not found');
    }

    // Optimized: Gunakan cached position data
    const positionJsonData = await this.getLatestPositionJsonData();

    // Get position data penandatangan untuk jabatan
    let jabatan = null;
    if (request.idPositionPenandatangan) {
      const penandatanganPosition = positionJsonData.find(
        (p: any) =>
          Number(p.position) === Number(request.idPositionPenandatangan),
      );
      jabatan = penandatanganPosition?.position_text || null;
    }

    // Get all request details for this request (nomor yang sudah jadi ada di sini)
    const details = await this.nomorRequestDetailRepository.find({
      where: { idRequest },
      order: { createdAt: 'ASC' },
    });

    const validDetails = details.filter(
      (d) =>
        (d.status === 'terpakai' ||
          d.status === 'terpakai_final' ||
          d.status === 'hangus') &&
        d.nomor,
    );

    // Generate signed URLs untuk nomor_list
    const nomorListWithUrls = await Promise.all(
      validDetails.map(async (d) => ({
        id: d.id,
        nomor: d.nomor,
        status: d.status,
        file_name: d.fileName || null,
        file_text: d.fileText || null,
        file_url: await this.getDetailFileUrlAndHeal(d, 'nomor'),
        created_at: d.createdAt,
      })),
    );

    return {
      success: true,
      message: 'Data nomor berhasil diambil',
      data: {
        id: request.id,
        jenis: request.jenis,
        jabatan,
        klasifikasi: request.klasifikasi,
        perihal: request.perihal,
        tanggal: request.tanggal,
        jumlah: request.jumlah,
        is_single_file: request.isSingleFile,
        nomor_list: nomorListWithUrls,
      },
    };
  }

  /**
   * Hapus usulan nomor dan semua detailnya (plus file di storage)
   */
  async deleteNomorRequest(requestId: string): Promise<any> {
    const request = await this.nomorRequestRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException(
        `Usulan nomor dengan ID ${requestId} tidak ditemukan`,
      );
    }

    // Ambil semua detail untuk hapus file dari storage
    const details = await this.nomorRequestDetailRepository.find({
      where: { idRequest: requestId },
    });

    // Delete semua file dari storage
    for (const detail of details) {
      if (detail.fileText) {
        try {
          await this.storageService.deleteFile(detail.fileText);
          console.log(
            `Deleted file from storage on delete request: ${detail.fileText}`,
          );
        } catch (error) {
          console.log(
            `Failed to delete file ${detail.fileText}:`,
            error.message,
          );
        }
      }
    }

    // Delete semua detail terkait
    await this.nomorRequestDetailRepository.delete({ idRequest: requestId });

    // Delete request
    await this.nomorRequestRepository.delete({ id: requestId });

    // Emit nomor count lengkap ke requester position + admin
    try {
      await this.emitNomorCountRefresh(request.position ?? undefined);
    } catch {}

    return {
      success: true,
      message: 'Usulan nomor berhasil dihapus',
      data: {
        id: requestId,
        deleted_at: new Date(),
      },
    };
  }

  /**
   * Tolak semua nomor dalam satu request (set semua details status = 'ditolak')
   */
  async rejectAllNomorRequest(requestId: string): Promise<any> {
    const request = await this.nomorRequestRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException(
        `Usulan nomor dengan ID ${requestId} tidak ditemukan`,
      );
    }

    // Get semua details untuk request ini
    const details = await this.nomorRequestDetailRepository.find({
      where: { idRequest: requestId },
    });

    if (details.length === 0) {
      throw new BadRequestException(
        `Tidak ada nomor yang diajukan untuk usulan dengan ID ${requestId}`,
      );
    }

    // Update semua details yang belum diproses menjadi ditolak
    const rejectedDetails: { id: string; status: string }[] = [];

    for (const detail of details) {
      // Hanya set ditolak jika status masih booking
      if (detail.status === 'booking') {
        detail.status = 'ditolak';
        await this.nomorRequestDetailRepository.save(detail);
        rejectedDetails.push({
          id: detail.id,
          status: detail.status,
        });
      }
    }

    // Emit nomor count lengkap ke requester position + admin
    try {
      await this.emitNomorCountRefresh(request.position ?? undefined);
    } catch {}

    if (rejectedDetails.length > 0) {
      this.notifyNomorRequester(
        request,
        NotificationType.PENOMORAN_DITOLAK,
        'Usulan penomoran ditolak',
        request.perihal || 'Usulan penomoran ditolak',
        'OPEN_DETAIL_PENOMORAN',
      ).catch((err) =>
        this.logger.warn(
          `Failed to send PENOMORAN_DITOLAK notification: ${err?.message}`,
        ),
      );
    }

    return {
      success: true,
      message: `${rejectedDetails.length} nomor berhasil ditolak`,
      data: {
        request_id: requestId,
        total_rejected: rejectedDetails.length,
        rejected_details: rejectedDetails,
      },
    };
  }

  /**
   * Penandatangan melihat daftar usulan berdasarkan posisi penandatangan.
   * Semua detail ditampilkan apa adanya (tanpa mapping status):
   * draft, booking, terpakai, terpakai_final, ditolak, hangus, dll.
   * position_id diambil dari bearer token
   */
  async getPendingApproval(
    positionId: number,
    query?: GetNomorQueryDto,
  ): Promise<any> {
    const positions = await this.getLatestPositionJsonData();
    const byPosition = new Map(
      positions.map((position) => [Number(position.position), position]),
    );
    const { requests, pagination, counts } = await this.loadNomorListPage(
      query,
      { mode: 'approval', position: positionId },
      positions,
    );
    const context = await this.listTemplateContext(requests);
    const data = await Promise.all(
      requests.map(async (request) => {
        const details = request.details || [];
        const template = await this.generateNomorTemplate(request, context);
        const status =
          this.determineStatusFromDetails(details) === 'Ditolak'
            ? 'rejected'
            : details.some((detail) => detail.status !== 'draft')
              ? 'approved'
              : 'draft';
        return {
          id: request.id,
          company: request.company,
          area: request.area,
          sub_area: request.subArea,
          organization: request.organization,
          position: request.position,
          nama:
            byPosition.get(Number(request.position))?.persnum_person_text ||
            null,
          tanggal: request.tanggal,
          jenis: request.jenis,
          klasifikasi: request.klasifikasi,
          perihal: request.perihal,
          jumlah: request.jumlah,
          penandatangan: request.penandatangan,
          is_single_file: request.isSingleFile,
          status,
          template_nomor: template,
          created_at: request.createdAt,
          details: await Promise.all(
            details.map(async (detail) => ({
              id: detail.id,
              status: detail.status,
              file_name: detail.fileName,
              file_url: await this.getDetailFileUrlAndHeal(detail, 'nomor'),
              template_nomor: template,
              created_at: detail.createdAt,
            })),
          ),
        };
      }),
    );
    return {
      success: true,
      message: 'Daftar usulan menunggu persetujuan berhasil diambil',
      data,
      pagination,
      counts,
    };
  }

  /**
   * Penandatangan menyetujui usulan (ubah semua detail draft → booking)
   * Validasi: positionId dari token harus cocok dengan id_position_penandatangan di request
   */
  async approvePenandatangan(
    requestId: string,
    positionId: number,
  ): Promise<any> {
    const request = await this.nomorRequestRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException(
        `Usulan nomor dengan ID ${requestId} tidak ditemukan`,
      );
    }

    if (Number(request.idPositionPenandatangan) !== positionId) {
      throw new BadRequestException(
        'Anda tidak berwenang menyetujui usulan ini. Hanya penandatangan yang ditunjuk yang dapat menyetujui.',
      );
    }

    const draftDetails = await this.nomorRequestDetailRepository.find({
      where: { idRequest: requestId, status: 'draft' },
    });

    if (draftDetails.length === 0) {
      throw new BadRequestException(
        'Tidak ada detail dengan status draft untuk disetujui',
      );
    }

    for (const detail of draftDetails) {
      detail.status = 'booking';
    }
    await this.nomorRequestDetailRepository.save(draftDetails);

    // Emit nomor count lengkap ke admin (ada usulan siap diverifikasi)
    try {
      await this.emitNomorCountRefresh();
    } catch {}

    this.notifyNomorRequester(
      request,
      NotificationType.PENOMORAN_PERSETUJUAN,
      'Usulan penomoran disetujui penandatangan',
      request.perihal || 'Usulan penomoran telah disetujui penandatangan',
      'OPEN_USULAN_PENOMORAN',
    ).catch((err) =>
      this.logger.warn(
        `Failed to send PENOMORAN_PERSETUJUAN notification: ${err?.message}`,
      ),
    );

    this.notifyNomorAdmins(
      request,
      NotificationType.PENOMORAN_VERIFIKASI,
      'Usulan penomoran siap diverifikasi',
      request.perihal || 'Ada usulan penomoran yang siap diverifikasi',
    ).catch((err) =>
      this.logger.warn(
        `Failed to send PENOMORAN_VERIFIKASI notification: ${err?.message}`,
      ),
    );

    return {
      success: true,
      message: `${draftDetails.length} usulan berhasil disetujui dan siap diverifikasi admin`,
      data: {
        request_id: requestId,
        approved_count: draftDetails.length,
        details: draftDetails.map((d) => ({ id: d.id, status: d.status })),
      },
    };
  }

  /**
   * Penandatangan menolak usulan (ubah semua detail draft → ditolak)
   * Validasi: positionId dari token harus cocok dengan id_position_penandatangan di request
   */
  async rejectPenandatangan(
    requestId: string,
    positionId: number,
  ): Promise<any> {
    const request = await this.nomorRequestRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException(
        `Usulan nomor dengan ID ${requestId} tidak ditemukan`,
      );
    }

    if (Number(request.idPositionPenandatangan) !== positionId) {
      throw new BadRequestException(
        'Anda tidak berwenang menolak usulan ini. Hanya penandatangan yang ditunjuk yang dapat menolak.',
      );
    }

    const draftDetails = await this.nomorRequestDetailRepository.find({
      where: { idRequest: requestId, status: 'draft' },
    });

    if (draftDetails.length === 0) {
      throw new BadRequestException(
        'Tidak ada detail dengan status draft untuk ditolak',
      );
    }

    for (const detail of draftDetails) {
      detail.status = 'ditolak';
    }
    await this.nomorRequestDetailRepository.save(draftDetails);

    // Emit nomor count lengkap ke requester position
    try {
      if (request.position) {
        await this.emitNomorCountRefresh(request.position);
      }
    } catch {}

    this.notifyNomorRequester(
      request,
      NotificationType.PENOMORAN_DITOLAK,
      'Usulan penomoran ditolak penandatangan',
      request.perihal || 'Usulan penomoran ditolak penandatangan',
      'OPEN_USULAN_PENOMORAN',
    ).catch((err) =>
      this.logger.warn(
        `Failed to send PENOMORAN_DITOLAK notification: ${err?.message}`,
      ),
    );

    return {
      success: true,
      message: `${draftDetails.length} usulan berhasil ditolak`,
      data: {
        request_id: requestId,
        rejected_count: draftDetails.length,
        details: draftDetails.map((d) => ({ id: d.id, status: d.status })),
      },
    };
  }

  /**
   * Penandatangan menyetujui banyak detail sekaligus (draft -> booking)
   */
  async approveBulkPenandatangan(
    dto: ApproveBulkPenandatanganDto,
    positionId: number,
  ): Promise<ApproveBulkPenandatanganResponseDto> {
    const results: {
      detail_id: string;
      request_id: string;
      status: string;
      success: boolean;
      error?: string;
    }[] = [];

    let successCount = 0;
    let failedCount = 0;

    for (const detailId of dto.detail_ids) {
      try {
        const detail = await this.nomorRequestDetailRepository.findOne({
          where: { id: detailId },
        });

        if (!detail) {
          throw new NotFoundException(
            `Detail nomor dengan ID ${detailId} tidak ditemukan`,
          );
        }

        if (detail.status !== 'draft') {
          throw new BadRequestException(
            `Detail nomor sudah diproses dengan status: ${detail.status}`,
          );
        }

        const request = await this.nomorRequestRepository.findOne({
          where: { id: detail.idRequest! },
        });

        if (!request) {
          throw new NotFoundException(
            `Usulan nomor dengan ID ${detail.idRequest} tidak ditemukan`,
          );
        }

        if (Number(request.idPositionPenandatangan) !== positionId) {
          throw new BadRequestException(
            'Anda tidak berwenang menyetujui usulan ini. Hanya penandatangan yang ditunjuk yang dapat menyetujui.',
          );
        }

        detail.status = 'booking';
        await this.nomorRequestDetailRepository.save(detail);

        this.notifyNomorRequester(
          request,
          NotificationType.PENOMORAN_PERSETUJUAN,
          'Usulan penomoran disetujui penandatangan',
          request.perihal || 'Usulan penomoran telah disetujui penandatangan',
          'OPEN_USULAN_PENOMORAN',
          detail,
        ).catch((err) =>
          this.logger.warn(
            `Failed to send PENOMORAN_PERSETUJUAN notification: ${err?.message}`,
          ),
        );

        this.notifyNomorAdmins(
          request,
          NotificationType.PENOMORAN_VERIFIKASI,
          'Usulan penomoran siap diverifikasi',
          request.perihal || 'Ada usulan penomoran yang siap diverifikasi',
        ).catch((err) =>
          this.logger.warn(
            `Failed to send PENOMORAN_VERIFIKASI notification: ${err?.message}`,
          ),
        );

        results.push({
          detail_id: detailId,
          request_id: request.id,
          status: detail.status,
          success: true,
        });
        successCount++;
      } catch (error) {
        results.push({
          detail_id: detailId,
          request_id: '',
          status: 'draft',
          success: false,
          error: error.message,
        });
        failedCount++;
      }
    }

    try {
      await this.emitNomorCountRefresh();
    } catch {}

    return {
      success: true,
      message: `Selesai memproses ${dto.detail_ids.length} detail: ${successCount} berhasil, ${failedCount} gagal`,
      data: {
        success_count: successCount,
        failed_count: failedCount,
        results,
      },
    };
  }

  /**
   * Helper: Convert bulan ke Romawi
   */
  private getBulanRomawi(bulan: number): string {
    const mapping: Record<number, string> = {
      1: 'I',
      2: 'II',
      3: 'III',
      4: 'IV',
      5: 'V',
      6: 'VI',
      7: 'VII',
      8: 'VIII',
      9: 'IX',
      10: 'X',
      11: 'XI',
      12: 'XII',
    };
    return mapping[bulan] || 'I';
  }

  /**
   * Admin langsung create nomor valid (tanpa melalui booking/approve)
   * Menggabungkan proses create request + approve dalam satu step
   */
  async adminCreateNomor(
    dto: AdminCreateNomorDto,
  ): Promise<AdminCreateNomorResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Ambil data org_data berdasarkan tanggal
      const tglFormatted = this.formatDate(new Date(dto.tanggal));
      let positionJsonData: any[] = [];

      try {
        const orgData = await this.orgDataService.findOrg(tglFormatted);
        if (orgData?.position_json && Array.isArray(orgData.position_json)) {
          positionJsonData = orgData.position_json;
        }
      } catch (error) {
        // Fallback to latest org_data
        const latestOrgData = await this.orgDataService.findLatestOrg();
        if (latestOrgData?.position_json) {
          positionJsonData = latestOrgData.position_json;
        }
      }

      // 2. Parse position_json dan cari position_id pengirim
      const positionData = positionJsonData.find(
        (p: any) => p.position === dto.position_id,
      );

      if (!positionData) {
        throw new NotFoundException(
          `Position dengan ID ${dto.position_id} tidak ditemukan di org_data untuk tanggal ${tglFormatted}`,
        );
      }

      // 3. Ambil data penandatangan untuk parameter counter
      // Parameter counter menggunakan data dari penandatangan, bukan pengirim
      let penandatanganData: any = null;
      if (dto.id_position_penandatangan) {
        penandatanganData = positionJsonData.find(
          (p: any) => p.position === dto.id_position_penandatangan,
        );
        if (!penandatanganData) {
          throw new NotFoundException(
            `Position penandatangan dengan ID ${dto.id_position_penandatangan} tidak ditemukan di org_data`,
          );
        }
      }

      // Gunakan data penandatangan untuk parameter counter, fallback ke pengirim jika tidak ada
      const counterData = penandatanganData || positionData;

      // 4. Create nomor_request
      const requestId = uuidv4();
      const nomorRequest = this.nomorRequestRepository.create({
        id: requestId,
        company: counterData.company?.toString() || null,
        area: counterData.area || null,
        subArea: counterData.sub_area?.toString() || null,
        organization: counterData.organization_id?.toString() || null,
        position: dto.position_id.toString(),
        tanggal: dto.tanggal,
        jenis: dto.jenis,
        klasifikasi: dto.klasifikasi || null,
        perihal: dto.perihal,
        jumlah: dto.jumlah,
        penandatangan: dto.penandatangan || null,
        idPositionPenandatangan: dto.id_position_penandatangan || null,
        isNaskahGenerated: false,
      });

      await queryRunner.manager.save(nomorRequest);

      // 6. Ambil format penomoran dari tabel jenis
      const jenisData = await queryRunner.manager.findOne(JenisEntity, {
        where: { jenis: dto.jenis },
      });

      if (!jenisData || !jenisData.formatPenomoran) {
        throw new BadRequestException(
          `Format penomoran untuk jenis ${dto.jenis} tidak ditemukan`,
        );
      }

      const tahun = new Date(dto.tanggal).getFullYear();
      const isNdOrDi = dto.jenis === 'ND' || dto.jenis === 'DI';

      // 8. Ambil abbreviation dari penandatangan untuk placeholder {JABATAN}
      let penandatanganPositionAbbreviation: string | null = null;
      let penandatanganArea: string | null = null;

      if (penandatanganData) {
        penandatanganPositionAbbreviation =
          penandatanganData.position_abbreviation ||
          penandatanganData.abbreviation ||
          null;
        penandatanganArea = penandatanganData.area || null;
      }

      if (!penandatanganArea && nomorRequest.area) {
        penandatanganArea = nomorRequest.area;
      }

      // 9. Loop untuk generate setiap nomor sesuai jumlah yang diminta
      const nomorList: any[] = [];

      for (let i = 0; i < dto.jumlah; i++) {
        // Query nomor terakhir dengan locking
        let queryBuilder = queryRunner.manager
          .createQueryBuilder(NomorEntity, 'n')
          .where('n.tahun = :tahun', { tahun })
          .andWhere('n.jenis = :jenis', { jenis: dto.jenis })
          .andWhere('n.company = :company', { company: nomorRequest.company });

        if (isNdOrDi) {
          queryBuilder = queryBuilder.andWhere('n.position = :position', {
            position: nomorRequest.position,
          });
        } else {
          queryBuilder = queryBuilder.andWhere('n.area = :area', {
            area: nomorRequest.area,
          });
        }

        const nomorRecord = await queryBuilder
          .setLock('pessimistic_write')
          .getOne();

        // Generate nomor urut baru
        let noUrut = 1;
        if (nomorRecord && nomorRecord.nomor) {
          noUrut = nomorRecord.nomor + 1;
        }

        // Generate nomor lengkap
        const nomorBaru = await this.generateNomorFromFormat(
          jenisData.formatPenomoran,
          noUrut,
          nomorRequest,
          tahun,
          penandatanganPositionAbbreviation,
          penandatanganArea,
        );

        // Insert nomor_request_detail dengan status terpakai (langsung dari admin)
        const detailId = uuidv4();
        const detail = this.nomorRequestDetailRepository.create({
          id: detailId,
          idRequest: requestId,
          nomor: nomorBaru,
          status: 'terpakai',
        });

        await queryRunner.manager.save(detail);

        // UPSERT ke tabel nomor (update counter)
        if (nomorRecord) {
          nomorRecord.nomor = noUrut;
          nomorRecord.area = nomorRequest.area;
          nomorRecord.subArea = nomorRequest.subArea;
          nomorRecord.organization = nomorRequest.organization;
          nomorRecord.position = nomorRequest.position;
          nomorRecord.updatedAt = new Date();
          await queryRunner.manager.save(nomorRecord);
        } else {
          const nomorId = uuidv4();
          const nomor = this.nomorRepository.create({
            id: nomorId,
            company: nomorRequest.company,
            area: nomorRequest.area,
            subArea: nomorRequest.subArea,
            organization: nomorRequest.organization,
            position: nomorRequest.position,
            tahun,
            jenis: dto.jenis,
            nomor: noUrut,
          });
          await queryRunner.manager.save(nomor);
        }

        nomorList.push({
          id: detailId,
          nomor: nomorBaru,
          status: 'terpakai',
        });
      }

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: `${dto.jumlah} nomor berhasil dibuat`,
        data: {
          request_id: requestId,
          nomor_list: nomorList,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
