import { Controller, Get } from '@nestjs/common';
import { JenisService } from '../services/jenis.service';
import { JenisResponseDto } from '../dto/jenis.dto';

@Controller('jenis')
export class JenisController {
  constructor(private readonly jenisService: JenisService) {}

  /**
   * GET /jenis
   * Mengambil semua jenis surat
   */
  @Get()
  async findAll(): Promise<JenisResponseDto> {
    return this.jenisService.findAll();
  }
}
