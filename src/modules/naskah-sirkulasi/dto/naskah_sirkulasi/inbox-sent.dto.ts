import { InboxItemDto } from './inbox.dto';
import { SentMessageItemDto } from './sent-message.dto';

// Extended DTO for consistency in combined endpoint
export class SentItemForCombinedDto extends SentMessageItemDto {
    is_favorit?: boolean;
    is_arsip?: boolean;
    is_note?: boolean;
    is_tindak_lanjut?: boolean;
    is_locked?: boolean;
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
