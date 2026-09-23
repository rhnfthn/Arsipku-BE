import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { NaskahUmumService } from './services/naskah-umum.service';
import { PreviewDto, SendDto } from './dto/naskah-umum.dto';

@Controller('NU')
export class NaskahUmumController {
  constructor(private readonly svc: NaskahUmumService) {}

  @Get('template-schema/:jenis')
  getSchema(@Param('jenis') jenis: string) {
    const schema = this.svc.getTemplateSchema(jenis);
    if (!schema) throw new BadRequestException(`Jenis ${jenis} belum didukung`);
    return { success: true, data: schema };
  }

  @Post('preview')
  async preview(@Body() dto: PreviewDto, @Req() req: any) {
    const userId = String(req.user?.persnum ?? req.user?.id ?? 'u1');
    const { tempId, s3Key } = await this.svc.createPreview(
      dto.jenis,
      dto.fields,
      userId,
    );
    return { success: true, data: { tempId, s3Key } };
  }

  @Get('temp-status/:tempId')
  async getTempStatus(@Param('tempId') tempId: string) {
    const status = await this.svc.getTempStatus(tempId);
    return { success: true, data: { status } };
  }

  @Post('send')
  async send(@Body() dto: SendDto, @Req() req: any) {
    const userId = String(req.user?.persnum ?? req.user?.id ?? 'u1');
    const persnum = req.user?.persnum as number | undefined;
    const res = await this.svc.finalizeSend(dto, userId, persnum, req.user);
    return { success: true, data: res };
  }
}
