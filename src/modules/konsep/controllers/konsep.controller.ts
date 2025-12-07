import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common';
import { KonsepService, KonsepRecipientResponse } from '../services/konsep.service';
import {
  CreateKonsepDto,
  ReviewKonsepDto,
  FinalizeKonsepDto,
  ForwardKonsepDto,
  CreateKonsepResponseDto,
  ReviewKonsepResponseDto,
  FinalizeKonsepResponseDto,
  ForwardKonsepResponseDto,
  KonsepInboxResponseDto,
  KonsepSentResponseDto,
} from '../dto/konsep';

@Controller('KONSEP')
export class KonsepController {
  constructor(private readonly konsepService: KonsepService) {}

  // ============================================================
  // GET RECIPIENTS (ATASAN)
  // ============================================================

  /**
   * GET /KONSEP/get-recipient/:position_id
   * Dapatkan daftar atasan yang bisa dipilih sebagai penerima konsep
   * 
   * @param position_id Position ID pembuat konsep
   * @returns Sender info dan list of managerial positions (ATASAN)
   */
  @Get('get-recipient/:position_id')
  async getRecipient(
    @Param('position_id', ParseIntPipe) positionId: number,
  ): Promise<KonsepRecipientResponse> {
    try {
      return await this.konsepService.getRecipient(positionId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Gagal mendapatkan daftar penerima',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // CREATE KONSEP
  // ============================================================

  /**
   * POST /KONSEP/create
   * Buat konsep naskah baru (ND/SDI/SDE)
   * 
   * Konsep dibuat oleh konseptor (bawahan) untuk dikirim ke pemeriksa/pengirim (atasan)
   * 
   * @param dto CreateKonsepDto
   * @returns CreateKonsepResponseDto
   */
  @Post('create')
  async createKonsep(@Body() dto: CreateKonsepDto): Promise<CreateKonsepResponseDto> {
    try {
      return await this.konsepService.createKonsep(dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Gagal membuat konsep',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // GET INBOX
  // ============================================================

  /**
   * GET /KONSEP/inbox/:position_id
   * Dapatkan inbox konsep untuk pemeriksa/pengirim
   * 
   * @param position_id Position ID pemeriksa/pengirim
   * @returns KonsepInboxResponseDto
   */
  @Get('inbox/:position_id')
  async getInbox(
    @Param('position_id', ParseIntPipe) positionId: number,
  ): Promise<KonsepInboxResponseDto> {
    try {
      return await this.konsepService.getInbox(positionId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Gagal mendapatkan inbox konsep',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // GET SENT
  // ============================================================

  /**
   * GET /KONSEP/sent/:position_id
   * Dapatkan konsep yang dikirim oleh konseptor/pemeriksa
   * 
   * @param position_id Position ID konseptor/pemeriksa
   * @returns KonsepSentResponseDto
   */
  @Get('sent/:position_id')
  async getSent(
    @Param('position_id', ParseIntPipe) positionId: number,
  ): Promise<KonsepSentResponseDto> {
    try {
      return await this.konsepService.getSent(positionId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Gagal mendapatkan konsep yang dikirim',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // FORWARD KONSEP
  // ============================================================

  /**
   * POST /KONSEP/forward/:id
   * Forward konsep ke atasan berikutnya
   * 
   * Penerima konsep bisa meneruskan ke atasannya lagi
   * 
   * @param id Konsep ID yang akan di-forward
   * @param dto ForwardKonsepDto
   * @returns ForwardKonsepResponseDto
   */
  @Post('forward/:id')
  async forwardKonsep(
    @Param('id') id: string,
    @Body() dto: ForwardKonsepDto,
  ): Promise<ForwardKonsepResponseDto> {
    try {
      return await this.konsepService.forwardKonsep(id, dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Gagal meneruskan konsep',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // REVIEW KONSEP
  // ============================================================

  /**
   * PUT /KONSEP/review/:id
   * Review konsep oleh pemeriksa
   * 
   * Actions:
   * - approve: Setujui konsep (lanjut ke pemeriksa berikutnya atau pengirim)
   * - revisi: Kembalikan ke konseptor untuk revisi
   * - reject: Tolak konsep
   * 
   * @param id Konsep ID
   * @param position_id Position ID reviewer (query param)
   * @param dto ReviewKonsepDto
   * @returns ReviewKonsepResponseDto
   */
  @Put('review/:id')
  async reviewKonsep(
    @Param('id') id: string,
    @Query('position_id', ParseIntPipe) positionId: number,
    @Body() dto: ReviewKonsepDto,
  ): Promise<ReviewKonsepResponseDto> {
    try {
      return await this.konsepService.reviewKonsep(id, positionId, dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Gagal review konsep',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // FINALIZE KONSEP
  // ============================================================

  /**
   * POST /KONSEP/finalize/:id
   * Finalisasi konsep oleh pengirim/penandatangan
   * 
   * Setelah difinalisasi:
   * - Nomor surat resmi digenerate
   * - Status naskah diubah ke 'final' atau 'final_tte'
   * - Sirkulasi pengirim, penerima, dan tembusan dibuat
   * - Naskah siap dikirim ke penerima
   * 
   * @param id Konsep ID
   * @param dto FinalizeKonsepDto (termasuk from_position_id)
   * @returns FinalizeKonsepResponseDto
   */
  @Post('finalize/:id')
  async finalizeKonsep(
    @Param('id') id: string,
    @Body() dto: FinalizeKonsepDto,
  ): Promise<FinalizeKonsepResponseDto> {
    try {
      return await this.konsepService.finalizeKonsep(id, dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Gagal finalisasi konsep',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // MARK AS READ
  // ============================================================

  /**
   * PUT /KONSEP/read/:id
   * Tandai konsep sebagai sudah dibaca
   * 
   * @param id Konsep ID
   * @param position_id Position ID pembaca (query param)
   * @returns { success: boolean, message: string }
   */
  @Put('read/:id')
  async markAsRead(
    @Param('id') id: string,
    @Query('position_id', ParseIntPipe) positionId: number,
  ): Promise<{ success: boolean; message: string }> {
    try {
      return await this.konsepService.markAsRead(id, positionId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Gagal menandai konsep sebagai sudah dibaca',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
