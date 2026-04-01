import { IsOptional, IsEnum, IsNumber, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { InboxItemDto } from './inbox.dto';
import { SentMessageItemDto } from './sent-message.dto';

/**
 * Query params for inbox-sent combined endpoint
 */
export class InboxSentQueryDto {
    @IsOptional()
    @IsEnum(['ND', 'SDI', 'SDE', 'DI', 'KA', 'K'], { message: 'Jenis naskah tidak valid' })
    jenis?: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA' | 'K';

    @IsOptional()
    @IsEnum(['terbaca', 'belum_terbaca'], { message: 'Status baca tidak valid' })
    status_baca?: 'terbaca' | 'belum_terbaca';

    @IsOptional()
    @IsEnum(['inbox', 'sent'], { message: 'Source tidak valid' })
    source?: 'inbox' | 'sent';

    @IsOptional()
    @Transform(({ value }) => value === 'true' || value === true)
    @IsBoolean()
    is_favorit?: boolean;

    @IsOptional()
    @Transform(({ value }) => value === 'true' || value === true)
    @IsBoolean()
    is_arsip?: boolean;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    limit?: number = 10;
}

// Extended DTO for consistency in combined endpoint
export class SentItemForCombinedDto extends SentMessageItemDto {
    is_favorit?: boolean;
    is_arsip?: boolean;
    is_note?: boolean;
}

export class InboxSentResponseDto {
    success: boolean;
    message: string;
    data: (InboxItemDto | SentItemForCombinedDto)[];
    pagination?: {
        total: number;
        page: number;
        limit: number;
        total_pages: number;
    };
}
