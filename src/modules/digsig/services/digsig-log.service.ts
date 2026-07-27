import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Like, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DigsigLogEntity } from '../entities/digsig-log.entity';
import {
  CreateDigsigLogDto,
  FilterDigsigLogDto,
  DigsigLogResponseDto,
  DigsigLogPaginatedResponseDto,
} from '../dto/digsig-log.dto';

@Injectable()
export class DigsigLogService {
  constructor(
    @InjectRepository(DigsigLogEntity)
    private readonly digsigLogRepository: Repository<DigsigLogEntity>,
  ) {}

  /**
   * Create a new digsig log entry
   * Called automatically by DigsigService on sign/verify operations
   */
  async createLog(dto: CreateDigsigLogDto): Promise<DigsigLogEntity> {
    const log = this.digsigLogRepository.create({
      id: uuidv4(),
      tanggal: new Date(),
      ipAddress: dto.ipAddress || null,
      userPersnum: dto.userPersnum,
      userName: dto.userName || null,
      apiEndpoint: dto.apiEndpoint,
      idNaskah: dto.idNaskah || null,
      nomorNaskah: dto.nomorNaskah || null,
      jenisNaskah: dto.jenisNaskah || null,
      action: dto.action,
      status: dto.status || 'pending',
      note: dto.note || null,
      bsreResponse: dto.bsreResponse || null,
    });

    return await this.digsigLogRepository.save(log);
  }

  /**
   * Quick method to log sign activity
   */
  async logSignActivity(params: {
    userPersnum: number;
    userName?: string;
    ipAddress?: string;
    idNaskah?: string;
    nomorNaskah?: string;
    jenisNaskah?: string;
    apiEndpoint: string;
    status: 'sukses' | 'gagal' | 'pending';
    note?: string;
    bsreResponse?: Record<string, any>;
  }): Promise<DigsigLogEntity> {
    return this.createLog({
      ...params,
      action: 'sign',
    });
  }

  /**
   * Quick method to log verify activity
   */
  async logVerifyActivity(params: {
    userPersnum: number;
    userName?: string;
    ipAddress?: string;
    idNaskah?: string;
    nomorNaskah?: string;
    jenisNaskah?: string;
    apiEndpoint: string;
    status: 'sukses' | 'gagal' | 'pending';
    note?: string;
    bsreResponse?: Record<string, any>;
  }): Promise<DigsigLogEntity> {
    return this.createLog({
      ...params,
      action: 'verify',
    });
  }

  /**
   * Get all logs with filtering and pagination
   */
  async findAll(
    filter: FilterDigsigLogDto,
  ): Promise<DigsigLogPaginatedResponseDto> {
    const page = filter.page || 1;
    const limit = filter.limit || 10;
    const skip = (page - 1) * limit;

    const queryBuilder = this.digsigLogRepository
      .createQueryBuilder('log')
      .orderBy('log.tanggal', 'DESC');

    // Apply filters
    if (filter.userPersnum) {
      queryBuilder.andWhere('log.user_persnum = :userPersnum', {
        userPersnum: filter.userPersnum,
      });
    }

    if (filter.userName) {
      queryBuilder.andWhere('log.user_name LIKE :userName', {
        userName: `%${filter.userName}%`,
      });
    }

    if (filter.idNaskah) {
      queryBuilder.andWhere('log.id_naskah = :idNaskah', {
        idNaskah: filter.idNaskah,
      });
    }

    if (filter.nomorNaskah) {
      queryBuilder.andWhere('log.nomor_naskah LIKE :nomorNaskah', {
        nomorNaskah: `%${filter.nomorNaskah}%`,
      });
    }

    if (filter.jenisNaskah) {
      queryBuilder.andWhere('log.jenis_naskah = :jenisNaskah', {
        jenisNaskah: filter.jenisNaskah,
      });
    }

    if (filter.action) {
      queryBuilder.andWhere('log.action = :action', {
        action: filter.action,
      });
    }

    if (filter.status) {
      queryBuilder.andWhere('log.status = :status', {
        status: filter.status,
      });
    }

    // Date range filter
    if (filter.startDate && filter.endDate) {
      queryBuilder.andWhere('log.tanggal BETWEEN :startDate AND :endDate', {
        startDate: `${filter.startDate} 00:00:00`,
        endDate: `${filter.endDate} 23:59:59`,
      });
    } else if (filter.startDate) {
      queryBuilder.andWhere('log.tanggal >= :startDate', {
        startDate: `${filter.startDate} 00:00:00`,
      });
    } else if (filter.endDate) {
      queryBuilder.andWhere('log.tanggal <= :endDate', {
        endDate: `${filter.endDate} 23:59:59`,
      });
    }

    // Search across multiple fields
    if (filter.search) {
      queryBuilder.andWhere(
        '(log.nomor_naskah LIKE :search OR log.user_name LIKE :search OR log.note LIKE :search)',
        { search: `%${filter.search}%` },
      );
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination
    queryBuilder.skip(skip).take(limit);

    const logs = await queryBuilder.getMany();

    const data: DigsigLogResponseDto[] = logs.map((log) => ({
      id: log.id,
      tanggal: log.tanggal,
      ipAddress: log.ipAddress,
      userPersnum: log.userPersnum,
      userName: log.userName,
      apiEndpoint: log.apiEndpoint,
      idNaskah: log.idNaskah,
      nomorNaskah: log.nomorNaskah,
      jenisNaskah: log.jenisNaskah,
      action: log.action,
      status: log.status,
      note: log.note,
      createdAt: log.createdAt,
    }));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single log by ID
   */
  async findOne(id: string): Promise<DigsigLogEntity> {
    const log = await this.digsigLogRepository.findOne({ where: { id } });

    if (!log) {
      throw new NotFoundException(`Log dengan ID ${id} tidak ditemukan`);
    }

    return log;
  }

  /**
   * Get logs by user persnum
   */
  async findByUser(
    userPersnum: number,
    filter?: FilterDigsigLogDto,
  ): Promise<DigsigLogPaginatedResponseDto> {
    return this.findAll({ ...filter, userPersnum });
  }

  /**
   * Get logs by naskah ID
   */
  async findByNaskah(
    idNaskah: string,
    filter?: FilterDigsigLogDto,
  ): Promise<DigsigLogPaginatedResponseDto> {
    return this.findAll({ ...filter, idNaskah });
  }

  /**
   * Get statistics/summary for dashboard
   */
  async getStatistics(filter?: {
    startDate?: string;
    endDate?: string;
    userPersnum?: number;
  }): Promise<{
    totalLogs: number;
    byStatus: { sukses: number; gagal: number; pending: number };
    byAction: {
      sign: number;
      verify: number;
      download: number;
      upload: number;
    };
    byJenisNaskah: Record<string, number>;
    recentLogs: DigsigLogResponseDto[];
  }> {
    const queryBuilder = this.digsigLogRepository.createQueryBuilder('log');

    // Apply date filter if provided
    if (filter?.startDate && filter?.endDate) {
      queryBuilder.where('log.tanggal BETWEEN :startDate AND :endDate', {
        startDate: `${filter.startDate} 00:00:00`,
        endDate: `${filter.endDate} 23:59:59`,
      });
    }

    if (filter?.userPersnum) {
      queryBuilder.andWhere('log.user_persnum = :userPersnum', {
        userPersnum: filter.userPersnum,
      });
    }

    // Get total
    const totalLogs = await queryBuilder.getCount();

    // Get count by status
    const statusCounts = await this.digsigLogRepository
      .createQueryBuilder('log')
      .select('log.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('log.status')
      .getRawMany();

    const byStatus = {
      sukses: 0,
      gagal: 0,
      pending: 0,
    };
    statusCounts.forEach((row) => {
      byStatus[row.status] = parseInt(row.count, 10);
    });

    // Get count by action
    const actionCounts = await this.digsigLogRepository
      .createQueryBuilder('log')
      .select('log.action', 'action')
      .addSelect('COUNT(*)', 'count')
      .groupBy('log.action')
      .getRawMany();

    const byAction = {
      sign: 0,
      verify: 0,
      download: 0,
      upload: 0,
    };
    actionCounts.forEach((row) => {
      byAction[row.action] = parseInt(row.count, 10);
    });

    // Get count by jenis naskah
    const jenisNaskahCounts = await this.digsigLogRepository
      .createQueryBuilder('log')
      .select('log.jenis_naskah', 'jenisNaskah')
      .addSelect('COUNT(*)', 'count')
      .where('log.jenis_naskah IS NOT NULL')
      .groupBy('log.jenis_naskah')
      .getRawMany();

    const byJenisNaskah: Record<string, number> = {};
    jenisNaskahCounts.forEach((row) => {
      if (row.jenisNaskah) {
        byJenisNaskah[row.jenisNaskah] = parseInt(row.count, 10);
      }
    });

    // Get 5 recent logs
    const recentLogs = await this.digsigLogRepository.find({
      order: { tanggal: 'DESC' },
      take: 5,
    });

    return {
      totalLogs,
      byStatus,
      byAction,
      byJenisNaskah,
      recentLogs: recentLogs.map((log) => ({
        id: log.id,
        tanggal: log.tanggal,
        ipAddress: log.ipAddress,
        userPersnum: log.userPersnum,
        userName: log.userName,
        apiEndpoint: log.apiEndpoint,
        idNaskah: log.idNaskah,
        nomorNaskah: log.nomorNaskah,
        jenisNaskah: log.jenisNaskah,
        action: log.action,
        status: log.status,
        note: log.note,
        createdAt: log.createdAt,
      })),
    };
  }

  /**
   * Check if BSrE service has issues (based on recent failures)
   * Returns true if there are significant failures in the last hour
   */
  async checkBsreHealth(): Promise<{
    isHealthy: boolean;
    recentFailures: number;
    recentSuccesses: number;
    lastFailureNote?: string;
  }> {
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const recentLogs = await this.digsigLogRepository.find({
      where: {
        tanggal: Between(oneHourAgo, new Date()),
        action: 'sign',
      },
      order: { tanggal: 'DESC' },
    });

    const recentFailures = recentLogs.filter(
      (log) => log.status === 'gagal',
    ).length;
    const recentSuccesses = recentLogs.filter(
      (log) => log.status === 'sukses',
    ).length;

    // Consider unhealthy if failure rate > 50% with at least 3 attempts
    const totalAttempts = recentFailures + recentSuccesses;
    const isHealthy = totalAttempts < 3 || recentFailures / totalAttempts < 0.5;

    const lastFailure = recentLogs.find((log) => log.status === 'gagal');

    return {
      isHealthy,
      recentFailures,
      recentSuccesses,
      lastFailureNote: lastFailure?.note || undefined,
    };
  }
}
