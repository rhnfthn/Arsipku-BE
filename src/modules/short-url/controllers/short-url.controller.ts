import {
  Controller,
  Post,
  Put,
  Delete,
  Body,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { ShortUrlService } from '../services/short-url.service';
import {
  ShortUrlDataDto,
  ShortUrlSubmitDto,
  ShortUrlUpdateDto,
  ShortUrlDeleteDto,
  ShortUrlGetOneDto,
} from '../dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@Controller('short-url')
export class ShortUrlController {
  constructor(private readonly shortUrlService: ShortUrlService) {}

  /**
   * POST /short-url/data
   * List / search short urls (paginated)
   * persnum otomatis dari token auth arsipku
   */
  @Post('data')
  async getData(@CurrentUser() user: any, @Body() dto: ShortUrlDataDto) {
    try {
      const result = await this.shortUrlService.getData({
        ...dto,
        persnum: user.persnum,
      });
      return { success: true, data: result };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        { success: false, message: err.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * POST /short-url/submit
   * Create a new short url
   * persnum otomatis dari token auth arsipku
   */
  @Post('submit')
  async submitUrl(@CurrentUser() user: any, @Body() dto: ShortUrlSubmitDto) {
    try {
      const result = await this.shortUrlService.submitUrl({
        ...dto,
        persnum: user.persnum,
      });
      return { success: true, data: result };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        { success: false, message: err.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * POST /short-url/getone
   * Get a short url by id
   */
  @Post('getone')
  async getUrlById(@Body() dto: ShortUrlGetOneDto) {
    try {
      const result = await this.shortUrlService.getUrlById(dto);
      return { success: true, data: result };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        { success: false, message: err.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * PUT /short-url
   * Update a short url
   * persnum otomatis dari token auth arsipku
   */
  @Put()
  async updateUrl(@CurrentUser() user: any, @Body() dto: ShortUrlUpdateDto) {
    try {
      const result = await this.shortUrlService.updateUrl({
        ...dto,
        persnum: user.persnum,
      });
      return { success: true, data: result };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        { success: false, message: err.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * DELETE /short-url
   * Delete a short url
   */
  @Delete()
  async deleteUrl(@Body() dto: ShortUrlDeleteDto) {
    try {
      const result = await this.shortUrlService.deleteUrl(dto);
      return { success: true, data: result };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        { success: false, message: err.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
