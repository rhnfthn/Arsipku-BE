import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  UseInterceptors,
  UploadedFiles,
  UploadedFile,
} from '@nestjs/common';
import { FilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { NomorService } from '../services/nomor.service';
import {
  CreateNomorRequestDto,
  CreateNomorRequestResponseDto,
} from '../dto/create-nomor-request.dto';
import {
  GetMyNomorRequestResponseDto,
  GetAdminNomorRequestResponseDto,
} from '../dto/get-nomor-request.dto';
import { GetNomorDetailPenomoranResponseDto } from '../dto/get-nomor-request-detail.dto';
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
} from '../dto/admin-nomor-request.dto';
import {
  GetNomorQueryDto,
  GetNomorResponseDto,
  GetNomorByIdResponseDto,
} from '../dto/get-nomor.dto';
import {
  AdminCreateNomorDto,
  AdminCreateNomorResponseDto,
} from '../dto/admin-create-nomor.dto';
import { AdminCountNomorRequestResponseDto } from '../dto/admin-count-nomor.dto';

@Controller('/')
export class NomorController {
  constructor(private readonly nomorService: NomorService) {}

  /**
   * POST /nomor-request
   * User membuat usulan nomor baru
   */
  @Post('nomor-request')
  async createNomorRequest(
    @Body() dto: CreateNomorRequestDto,
  ): Promise<CreateNomorRequestResponseDto> {
    try {
      return await this.nomorService.createNomorRequest(dto);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to create nomor request',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /nomor-request/:positionId
   * User melihat usulan nomor berdasarkan position ID
   */
  @Get('nomor-request/:positionId')
  async getNomorRequestByPosition(
    @Param('positionId') positionId: string,
    @Query() query: GetNomorQueryDto,
  ): Promise<GetMyNomorRequestResponseDto> {
    try {
      const positionIdNum = parseInt(positionId, 10);
      if (isNaN(positionIdNum)) {
        throw new HttpException(
          {
            success: false,
            message: 'Position ID must be a valid number',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      return await this.nomorService.getNomorRequestByPosition(positionIdNum, query);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get nomor request by position',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /admin/nomor-request
   * Admin melihat semua usulan nomor
   */
  @Get('admin/nomor-request')
  async getAdminNomorRequest(@Query() query: GetNomorQueryDto): Promise<GetAdminNomorRequestResponseDto> {
    try {
      return await this.nomorService.getAdminNomorRequest(query);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get admin nomor request',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /admin/nomor-request-by-position/:id_posisi
   * Admin melihat usulan nomor dengan filter posisi
   * - Semua data dengan status selain "Belum Diajukan" ditampilkan
   * - Data dengan status "Belum Diajukan" hanya yang dibuat oleh posisi tertentu
   */
  @Get('admin/nomor-request-by-position/:id_posisi')
  async getAdminNomorRequestByPosition(
    @Param('id_posisi') idPosisi: string,
    @Query() query: GetNomorQueryDto,
  ): Promise<GetAdminNomorRequestResponseDto> {
    try {
      const positionId = parseInt(idPosisi, 10);
      if (isNaN(positionId)) {
        throw new HttpException(
          {
            success: false,
            message: 'Position ID must be a valid number',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      return await this.nomorService.getAdminNomorRequestByPosition(positionId, query);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get admin nomor request by position',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /admin/nomor-request-submitted
   * Admin melihat semua usulan nomor yang sudah diajukan (status != 'Belum Diajukan')
   */
  @Get('admin/nomor-request-submitted')
  async getAdminNomorRequestSubmitted(@Query() query: GetNomorQueryDto): Promise<GetAdminNomorRequestResponseDto> {
    try {
      return await this.nomorService.getAdminNomorRequestSubmitted(query);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get submitted nomor request',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /admin/nomor-request-count
   * Admin melihat count/statistik usulan nomor berdasarkan status
   */
  @Get('admin/nomor-request-count')
  async getAdminCountNomorRequest(): Promise<AdminCountNomorRequestResponseDto> {
    try {
      return await this.nomorService.getAdminCountNomorRequest();
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get nomor request count',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /nomor-request-count/:positionId
   * Admin melihat count/statistik usulan nomor berdasarkan status untuk position tertentu
   */
  @Get('nomor-request-count/:positionId')
  async getAdminCountNomorRequestByPosition(
    @Param('positionId') positionId: string,
  ): Promise<AdminCountNomorRequestResponseDto> {
    try {
      const positionIdNum = parseInt(positionId, 10);
      if (isNaN(positionIdNum)) {
        throw new HttpException(
          {
            success: false,
            message: 'Position ID must be a valid number',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      return await this.nomorService.getAdminCountNomorRequestByPosition(positionIdNum);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get nomor request count by position',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /admin/nomor-request/:id
   * Admin melihat detail usulan nomor saja
   */
  @Get('admin/nomor-request/:id')
  async getNomorRequestDetail(
    @Param('id') id: string,
  ): Promise<GetAdminNomorRequestResponseDto> {
    try {
      return await this.nomorService.getNomorRequestDetail(id);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get nomor request detail',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /admin/detail-nomor-request/:id
   * Admin melihat detail penomoran (usulan + nomor details)
   */
  @Get('admin/detail-nomor-request/:id')
  async getDetailNomorRequest(
    @Param('id') id: string,
  ): Promise<GetNomorDetailPenomoranResponseDto> {
    try {
      return await this.nomorService.getNomorDetailPenomoran(id);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get detail nomor request',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /nomor-request/:id/booking
   * User/Admin memproses usulan dan create booking dengan file upload
   * Mendukung multiple file upload via FormData
   * 
   * FormData fields:
   * - file: binary files (optional, bisa multiple)
   * - jumlah: number (optional, gunakan jika tidak ada file)
   * 
   * Query parameters:
   * - folder: path folder untuk menyimpan file (default: 'nomor')
   * - action: 'append' (default) untuk tambah file, 'replace' untuk replace semua file booking
   */
  @UseInterceptors(FilesInterceptor('file', 10)) // Max 10 files
  @Post('nomor-request/:id/booking')
  async bookingNomorRequest(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Query('folder') folder?: string,
    @Query('action') action?: 'append' | 'replace',
    @Body() body?: any,
  ): Promise<BookingNomorRequestResponseDto> {
    try {
      // Parse body untuk ambil jumlah dari FormData
      const dto: BookingNomorRequestDto = {
        jumlah: body?.jumlah ? parseInt(body.jumlah) : undefined,
      };
      
      return await this.nomorService.bookingNomorRequest(
        id,
        dto,
        files,
        folder || 'nomor',
        action || 'append',
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: 'Failed to booking nomor request',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * PATCH /admin/nomor-request-detail/:id/file
   * Admin update file lampiran di detail tertentu (hanya status booking)
   * 
   * FormData fields:
   * - file: binary file (required, single file)
   * 
   * Query parameters:
   * - folder: path folder untuk menyimpan file (default: 'nomor')
   */
  @UseInterceptors(FileInterceptor('file'))
  @Patch('admin/nomor-request-detail/:id/file')
  async updateNomorRequestDetailFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder?: string,
  ): Promise<any> {
    try {
      if (!file) {
        throw new HttpException(
          {
            success: false,
            message: 'File is required',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      return await this.nomorService.updateNomorRequestDetailFile(
        id,
        file,
        folder || 'nomor',
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: 'Failed to update nomor request detail file',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /admin/nomor-request-detail/:detail_id/file
   * Admin upload file final untuk nomor dengan status terpakai
   * Upload file akan mengubah status menjadi terpakai_final
   * 
   * FormData fields:
   * - file: binary file (required, single file)
   * 
   * Query parameters:
   * - folder: path folder untuk menyimpan file (default: 'nomor')
   */
  @UseInterceptors(FileInterceptor('file'))
  @Post('admin/nomor-request-detail/:detail_id/file')
  async uploadFileToTerpakaiAkhir(
    @Param('detail_id') detailId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder?: string,
  ): Promise<any> {
    try {
      if (!file) {
        throw new HttpException(
          {
            success: false,
            message: 'File is required',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      return await this.nomorService.uploadFileToTerpakaiAkhir(
        detailId,
        file,
        folder || 'nomor',
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: 'Failed to upload file to terpakai final',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /admin/nomor-request-detail/:id/approve
   * Admin menyetujui dan generate nomor
   */
  @Post('admin/nomor-request-detail/:id/approve')
  async approveNomorRequestDetail(
    @Param('id') id: string,
    @Body() dto: ApproveNomorRequestDetailDto,
  ): Promise<ApproveNomorRequestDetailResponseDto> {
    try {
      return await this.nomorService.approveNomorRequestDetail(id, dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: 'Failed to approve nomor request detail',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /admin/nomor-request-detail/:detail_id/reject
   * Admin menolak usulan
   */
  @Post('admin/nomor-request-detail/:id/reject')
  async rejectNomorRequestDetail(
    @Param('id') id: string,
  ): Promise<RejectNomorRequestDetailResponseDto> {
    try {
      return await this.nomorService.rejectNomorRequestDetail(id);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: 'Failed to reject nomor request detail',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /admin/nomor-request-detail/:detail_id/hangus
   * Admin mengubah status detail menjadi hangus
   */
  @Post('admin/nomor-request-detail/:detail_id/hangus')
  async setStatusHangus(
    @Param('detail_id') detailId: string,
  ): Promise<any> {
    try {
      return await this.nomorService.setStatusHangus(detailId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: 'Failed to set status hangus',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /admin/nomor-request-detail/approve-bulk
   * Admin menyetujui banyak detail sekaligus
   */
  @Post('admin/nomor-request-detail/approve-bulk')
  async approveBulkNomorRequestDetail(
    @Body() dto: ApproveBulkNomorRequestDetailDto,
  ): Promise<ApproveBulkNomorRequestDetailResponseDto> {
    try {
      return await this.nomorService.approveBulkNomorRequestDetail(dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: 'Failed to approve bulk nomor request detail',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /admin/nomor-request-detail/reject-bulk
   * Admin menolak banyak detail sekaligus
   */
  @Post('admin/nomor-request-detail/reject-bulk')
  async rejectBulkNomorRequestDetail(
    @Body() dto: RejectBulkNomorRequestDetailDto,
  ): Promise<RejectBulkNomorRequestDetailResponseDto> {
    try {
      return await this.nomorService.rejectBulkNomorRequestDetail(dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: 'Failed to reject bulk nomor request detail',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * DELETE /admin/nomor-request/:id
   * Hapus usulan nomor
   */
  @Delete('admin/nomor-request/:id')
  async deleteNomorRequest(
    @Param('id') id: string,
  ): Promise<DeleteNomorRequestResponseDto> {
    try {
      return await this.nomorService.deleteNomorRequest(id);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: 'Failed to delete nomor request',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /admin/nomor-request/:id/reject-nomor
   * Tolak nomor (set semua details status menjadi hangus)
   */
  @Post('admin/nomor-request/:id/reject-nomor')
  async rejectAllNomorRequest(
    @Param('id') id: string,
  ): Promise<RejectAllNomorRequestResponseDto> {
    try {
      return await this.nomorService.rejectAllNomorRequest(id);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: 'Failed to reject all nomor in request',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /nomor
   * Get semua nomor (user view)
   */
  @Get('nomor')
  async getNomor(@Query() query: GetNomorQueryDto): Promise<GetNomorResponseDto> {
    try {
      return await this.nomorService.getNomor(query);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get nomor',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /admin/nomor
   * Admin langsung create nomor valid (tanpa melalui booking/approve)
   */
  @Post('admin/nomor')
  async adminCreateNomor(
    @Body() dto: AdminCreateNomorDto,
  ): Promise<AdminCreateNomorResponseDto> {
    try {
      return await this.nomorService.adminCreateNomor(dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: 'Failed to create nomor',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /admin/nomor?tahun=YYYY
   * Get semua nomor dengan filter tahun (admin view)
   */
  @Get('admin/nomor')
  async getAdminNomor(@Query() query: GetNomorQueryDto): Promise<GetNomorResponseDto> {
    try {
      return await this.nomorService.getNomor(query);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get admin nomor',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /nomor/:id
   * Get nomor by id (where id is id_request)
   */
  @Get('nomor/:id')
  async getNomorById(@Param('id') id: string): Promise<GetNomorByIdResponseDto> {
    try {
      return await this.nomorService.getNomorById(id);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get nomor',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
