import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Delete,
  Param,
  Query,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { EksternalService } from '../services/eksternal.service';
import { CreateEksternalDto } from '../dto/eksternal/create_eksternal.dto';
import { UpdateEksternalDto } from '../dto/eksternal/update_eksternal.dto';
import {
  EksternalListResponseDto,
  EksternalItemResponseDto,
  EksternalActionResponseDto,
} from '../dto/eksternal/eksternal-response.dto';
import { RequirePermission } from '../../../common/decorators';

@Controller('persuratan/eksternal')
export class EksternalController {
  constructor(private readonly eksternalService: EksternalService) {}

  @Post()
  @RequirePermission('master-data', 'create-tertuju')
  async create(
    @Body() createEksternalDto: CreateEksternalDto,
  ): Promise<EksternalItemResponseDto> {
    try {
      const created = await this.eksternalService.create(createEksternalDto);
      return {
        success: true,
        data: created,
      };
    } catch (err) {
      throw new HttpException(
        { success: false, message: err.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get()
  async findAll(
    @Query('company') company?: string,
    @Query('area') area?: string,
    @Query('include_inactive') includeInactive?: string,
  ): Promise<EksternalListResponseDto> {
    const list = await this.eksternalService.findAll(
      company,
      area,
      includeInactive === 'true',
    );
    return {
      success: true,
      total: list.length,
      data: list,
    };
  }

  @Get('generate-kode')
  async generateKode(): Promise<{ success: boolean; data: string }> {
    const kode = await this.eksternalService.generateKodePreview();
    return {
      success: true,
      data: kode,
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<EksternalItemResponseDto> {
    const eksternal = await this.eksternalService.findOne(id);
    return {
      success: true,
      data: eksternal,
    };
  }

  @Put(':id')
  @RequirePermission('master-data', 'update-tertuju')
  async update(
    @Param('id') id: string,
    @Body() updateEksternalDto: UpdateEksternalDto,
  ): Promise<EksternalItemResponseDto> {
    const updated = await this.eksternalService.update(id, updateEksternalDto);
    return {
      success: true,
      data: updated,
    };
  }

  @Put(':id/toggle-aktif')
  @RequirePermission('master-data', 'update-tertuju')
  async toggleAktif(
    @Param('id') id: string,
  ): Promise<EksternalItemResponseDto> {
    const result = await this.eksternalService.toggleAktif(id);
    return {
      success: true,
      data: result,
    };
  }

  @Delete(':id')
  @RequirePermission('master-data', 'delete-tertuju')
  async remove(@Param('id') id: string): Promise<EksternalActionResponseDto> {
    await this.eksternalService.remove(id);
    return {
      success: true,
      message: 'Eksternal removed successfully',
    };
  }
}
