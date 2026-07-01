import { Injectable, HttpException, HttpStatus, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, { AxiosError } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { SendMailDto } from '../dto';
import { MailLogEntity } from '../entities';
import { Session } from '../../auth/entities/session.entity';

export interface MailLogContext {
  naskah_id?: string;
  jenis_naskah?: string;
  nomor_surat?: string;
  perihal?: string;
  sender_persnum?: string;
  sender_nama?: string;
}

@Injectable()
export class MailServiceService {
  private readonly logger = new Logger(MailServiceService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(MailLogEntity)
    private readonly mailLogRepository: Repository<MailLogEntity>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
  ) {
    this.baseUrl = this.normalizeBaseUrl(this.configService.get<string>('MAIL_API_BASE_URL') || '');

    if (!this.baseUrl) {
      this.logger.warn('MAIL_API_BASE_URL is not set. Mail service will not work properly.');
    }
  }

  /**
   * Get AirNav SSO access token from session (same pattern as digsig module)
   * Token ini didapat saat user login via SSO AirNav
   */
  private async getAirnavTokenFromSession(persnum: number): Promise<string> {
    const session = await this.sessionRepository.findOne({
      where: { userPersnum: persnum },
      order: { createdAt: 'DESC' },
    });

    if (!session) {
      throw new BadRequestException(
        'Session tidak ditemukan. Silakan login ulang untuk mengirim email.',
      );
    }

    if (new Date() > new Date(session.airnavExpiredAt)) {
      throw new BadRequestException(
        'Token AirNav sudah expired. Silakan login ulang untuk mengirim email.',
      );
    }

    return session.airnavAccessToken;
  }

  /**
   * Kirim email dengan lampiran dari URL
   * Endpoint: GET /mail (body in request, per Postman collection)
   */
  async sendMail(dto: SendMailDto, persnum: number, context?: MailLogContext) {
    const token = await this.getAirnavTokenFromSession(persnum);
    const result = await this.callMailApi('/mail', dto, 'GET', token);
    await this.logMail(dto, 'success', null, result, context);
    return result;
  }

  /**
   * Kirim email dengan lampiran base64
   * Endpoint: POST /mail/base64
   */
  async sendMailBase64(dto: SendMailDto, persnum: number, context?: MailLogContext) {
    try {
      const token = await this.getAirnavTokenFromSession(persnum);
      const result = await this.callMailApi('/mail/base64', dto, 'POST', token);
      await this.logMail(dto, 'success', null, result, context);
      return result;
    } catch (err) {
      await this.logMail(dto, 'failed', err.message, null, context);
      throw err;
    }
  }

  /**
   * Simpan draft email
   * Endpoint: POST /mail/draft
   */
  async saveDraft(dto: SendMailDto, persnum: number, context?: MailLogContext) {
    const token = await this.getAirnavTokenFromSession(persnum);
    const result = await this.callMailApi('/mail/draft', dto, 'POST', token);
    await this.logMail(dto, 'success', null, result, context);
    return result;
  }

  /**
   * Ambil log email dengan pagination
   */
  async getLogs(page: number = 1, limit: number = 20, status?: string) {
    const qb = this.mailLogRepository.createQueryBuilder('log')
      .orderBy('log.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status) {
      qb.andWhere('log.status = :status', { status });
    }

    const [data, total] = await qb.getManyAndCount();

    return {
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Simpan log email ke database
   */
  private async logMail(
    dto: SendMailDto,
    status: string,
    errorMessage: string | null,
    apiResponse: any,
    context?: MailLogContext,
  ) {
    try {
      const log = this.mailLogRepository.create({
        id: uuidv4(),
        naskah_id: context?.naskah_id || null,
        jenis_naskah: context?.jenis_naskah || null,
        nomor_surat: context?.nomor_surat || null,
        perihal: context?.perihal || null,
        subjek: dto.subjek,
        from_as: dto.from_as,
        to: dto.to,
        cc: dto.cc || null,
        bcc: dto.bcc || null,
        lampiran_count: dto.lampiran?.length || 0,
        status,
        error_message: errorMessage,
        api_response: apiResponse ? JSON.stringify(apiResponse).substring(0, 5000) : null,
        sender_persnum: context?.sender_persnum || null,
        sender_nama: context?.sender_nama || null,
      });
      await this.mailLogRepository.save(log);
    } catch (err) {
      this.logger.error('Failed to save mail log:', err.message);
    }
  }

  /**
   * Helper: panggil API mail eksternal dengan SSO bearer token dari session
   */
  private async callMailApi(endpoint: string, dto: SendMailDto, method: 'GET' | 'POST' = 'POST', token: string) {
    if (!this.baseUrl || !token) {
      throw new HttpException(
        { success: false, message: 'Mail API configuration is missing (MAIL_API_BASE_URL / SSO token)' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const url = this.buildMailApiUrl(endpoint);

    try {
      this.logger.log(`Calling mail API: ${method} ${url}`);
      const config = {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      };

      const response = method === 'GET'
        ? await axios.get(url, { ...config, data: dto })
        : await axios.post(url, dto, config);

      this.logger.log(`Mail API response: ${response.status}`);
      return response.data;
    } catch (err) {
      const error = err as AxiosError;
      this.logger.error(`Mail API error at ${endpoint}:`, error.message);

      if (error.response) {
        this.logger.error(`Mail API ${endpoint} responded with status ${error.response.status}:`, JSON.stringify(error.response.data));
        throw new HttpException(
          {
            success: false,
            message: 'Mail API returned an error',
            status: error.response.status,
            data: error.response.data,
          },
          HttpStatus.BAD_GATEWAY,
        );
      }

      throw new HttpException(
        { success: false, message: `Failed to call mail API: ${error.message}` },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private normalizeBaseUrl(value: string): string {
    const trimmed = value.trim().replace(/\/+$/, '');
    if (!trimmed) return '';

    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }

    return `https://${trimmed}`;
  }

  private buildMailApiUrl(endpoint: string): string {
    try {
      const url = new URL(this.baseUrl);
      const baseSegments = url.pathname.split('/').filter(Boolean);
      const endpointSegments = endpoint.split('/').filter(Boolean);

      while (
        baseSegments.length > 0 &&
        endpointSegments.length > 0 &&
        baseSegments[baseSegments.length - 1] === endpointSegments[0]
      ) {
        endpointSegments.shift();
      }

      const finalSegments = [...baseSegments, ...endpointSegments];
      url.pathname = finalSegments.length ? `/${finalSegments.join('/')}` : '/';
      url.search = '';
      url.hash = '';

      return url.toString();
    } catch {
      throw new HttpException(
        { success: false, message: 'Invalid MAIL_API_BASE_URL configuration' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
