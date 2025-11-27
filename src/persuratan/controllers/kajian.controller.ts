import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { KajianService } from '../services/kajian.service';
import { KajianRecipientResponseDto } from '../dto/kajian/kajian-recipient-response.dto';

@Controller('KA')
export class KajianController {
  constructor(private readonly kajianService: KajianService) {}

  /**
   * GET /KA/get-recipient/:persnum
   * Get Kajian (KA) recipients for a sender
   * 
   * Kajian Rules:
   * - Sender: Fungsional atau Staff (bukan Managerial)
   * - Recipients: Managerial & Fungsional dalam Sub Area yang sama
   * - ATASAN: atasan langsung & tidak langsung
   * - BAWAHAN: [] (tidak boleh ke bawahan)
   * - REKAN: sesama level dalam sub area yang sama
   */
  @Get('get-recipient/:persnum')
  async getKajianRecipients(
    @Param('persnum', ParseIntPipe) persnum: number,
  ): Promise<KajianRecipientResponseDto> {
    return this.kajianService.getKajianRecipients(persnum);
  }
}
