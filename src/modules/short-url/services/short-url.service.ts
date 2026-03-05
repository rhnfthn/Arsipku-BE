import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import {
  ShortUrlDataDto,
  ShortUrlSubmitDto,
  ShortUrlUpdateDto,
  ShortUrlDeleteDto,
  ShortUrlGetOneDto,
} from '../dto';

@Injectable()
export class ShortUrlService {
  private readonly logger = new Logger(ShortUrlService.name);
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;

  /** Cached token & expiry */
  private cachedToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('SHORT_URL_BASE_URL', 'http://172.20.16.115:30001');
    this.username = this.configService.get<string>('SHORT_URL_USERNAME', 'nazar');
    this.password = this.configService.get<string>('SHORT_URL_PASSWORD', '123');
  }

  // ──────────────────────────────────────────────
  // AUTH – get / refresh token from external API
  // ──────────────────────────────────────────────

  /**
   * Authenticate against the external short-url service and cache the JWT.
   * Token is refreshed automatically when it expires or 5 minutes before expiry.
   */
  private async getToken(): Promise<string> {
    // Return cached token if still valid (with 5-min buffer)
    const now = Date.now();
    if (this.cachedToken && this.tokenExpiresAt - now > 5 * 60 * 1000) {
      return this.cachedToken;
    }

    try {
      this.logger.log('Requesting new token from short-url service...');

      const response = await axios.post(`${this.baseUrl}/user/login`, {
        username: this.username,
        password: this.password,
      });

      const data = response.data;
      const token: string = data?.token || data?.data?.token || data?.accessToken;

      if (!token) {
        throw new HttpException(
          'Short-URL service login failed: no token in response',
          HttpStatus.BAD_GATEWAY,
        );
      }

      // Decode JWT payload to get expiry (without verification – the external service is the authority)
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString(),
      );
      const exp = payload.exp ? payload.exp * 1000 : now + 24 * 60 * 60 * 1000; // fallback 24h

      this.cachedToken = token;
      this.tokenExpiresAt = exp;

      this.logger.log('Short-URL token obtained successfully');
      return token;
    } catch (error) {
      this.handleAxiosError(error, 'getToken');
    }
  }

  /**
   * Build Authorization headers with current token.
   */
  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.getToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  // ──────────────────────────────────────────────
  // CRUD wrappers
  // ──────────────────────────────────────────────

  /**
   * POST /uri/data – list / search short urls
   */
  async getData(dto: ShortUrlDataDto): Promise<any> {
    try {
      const headers = await this.authHeaders();
      const response = await axios.post(`${this.baseUrl}/uri/data`, dto, { headers });
      return response.data;
    } catch (error) {
      this.handleAxiosError(error, 'getData');
    }
  }

  /**
   * POST /uri – create a new short url
   */
  async submitUrl(dto: ShortUrlSubmitDto): Promise<any> {
    try {
      const headers = await this.authHeaders();
      const response = await axios.post(`${this.baseUrl}/uri`, dto, { headers });
      return response.data;
    } catch (error) {
      this.handleAxiosError(error, 'submitUrl');
    }
  }

  /**
   * POST /uri/getone – get a short url by id
   */
  async getUrlById(dto: ShortUrlGetOneDto): Promise<any> {
    try {
      const headers = await this.authHeaders();
      const response = await axios.post(`${this.baseUrl}/uri/getone`, dto, { headers });
      return response.data;
    } catch (error) {
      this.handleAxiosError(error, 'getUrlById');
    }
  }

  /**
   * PUT /uri – update a short url
   */
  async updateUrl(dto: ShortUrlUpdateDto): Promise<any> {
    try {
      const headers = await this.authHeaders();
      const response = await axios.put(`${this.baseUrl}/uri`, dto, { headers });
      return response.data;
    } catch (error) {
      this.handleAxiosError(error, 'updateUrl');
    }
  }

  /**
   * DELETE /uri – delete a short url
   */
  async deleteUrl(dto: ShortUrlDeleteDto): Promise<any> {
    try {
      const headers = await this.authHeaders();
      const response = await axios.delete(`${this.baseUrl}/uri`, {
        headers,
        data: dto,
      });
      return response.data;
    } catch (error) {
      this.handleAxiosError(error, 'deleteUrl');
    }
  }

  // ──────────────────────────────────────────────
  // Error handling
  // ──────────────────────────────────────────────

  private handleAxiosError(error: any, method: string): never {
    if (axios.isAxiosError(error)) {
      const axiosErr = error as AxiosError;
      const status = axiosErr.response?.status || HttpStatus.BAD_GATEWAY;
      const message =
        (axiosErr.response?.data as any)?.message ||
        axiosErr.message ||
        'Short-URL service error';

      this.logger.error(
        `[${method}] Axios error ${status}: ${message}`,
        axiosErr.response?.data ? JSON.stringify(axiosErr.response.data) : '',
      );

      // If 401, clear cached token so the next call will re-authenticate
      if (status === 401) {
        this.cachedToken = null;
        this.tokenExpiresAt = 0;
      }

      throw new HttpException(
        { success: false, message: `Short-URL service error: ${message}` },
        status >= 500 ? HttpStatus.BAD_GATEWAY : status,
      );
    }

    this.logger.error(`[${method}] Unexpected error:`, error);
    throw new HttpException(
      { success: false, message: error?.message || 'Unexpected error calling Short-URL service' },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
