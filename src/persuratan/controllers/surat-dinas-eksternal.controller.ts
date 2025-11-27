import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { SuratDinasEksternalService } from '../services/surat-dinas-eksternal.service';
import { SdeRecipientResponseDto } from '../dto/surat-dinas-eksternal/sde-recipient-response.dto';

@Controller('SDE')
export class SuratDinasEksternalController {
  constructor(
    private readonly sdeService: SuratDinasEksternalService,
  ) {}

  /**
   * GET /SDE/get-recipient/:persnum
   * Get Surat Dinas Eksternal (SDE) recipients for a sender
   *
   * SDE Rules:
   * - Pengirim: Internal LPPNPI (hanya Managerial yang berwenang)
   * - Penerima: Pihak eksternal (bukan persnum, bukan organization)
   * - Tidak perlu hirarki OO/OSC/SP untuk penerima
   * - Validasi bahwa pengirim adalah pejabat berwenang
   */
  @Get('get-recipient/:persnum')
  async getSdeRecipients(
    @Param('persnum', ParseIntPipe) persnum: number,
  ): Promise<SdeRecipientResponseDto> {
    return this.sdeService.getSdeRecipients(persnum);
  }
}
