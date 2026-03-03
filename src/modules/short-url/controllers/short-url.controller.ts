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

@Controller('short-url')
export class ShortUrlController {
  constructor(private readonly shortUrlService: ShortUrlService) {}

  /**
   * POST /short-url/data
   * List / search short urls (paginated)
   */
  @Post('data')
  async getData(@Body() dto: ShortUrlDataDto) {
    try {
      const result = await this.shortUrlService.getData(dto);
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
   */
  @Post('submit')
  async submitUrl(@Body() dto: ShortUrlSubmitDto) {
    try {
      const result = await this.shortUrlService.submitUrl(dto);
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
   */
  @Put()
  async updateUrl(@Body() dto: ShortUrlUpdateDto) {
    try {
      const result = await this.shortUrlService.updateUrl(dto);
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
