import { InboxItemDto } from './inbox.dto';
import { SentMessageItemDto } from './sent-message.dto';

export class InboxSentResponseDto {
    success: boolean;
    message: string;
    data: (InboxItemDto | SentMessageItemDto)[];
    meta?: {
        total: number;
        page: number;
        limit: number;
        total_pages: number;
    };
}
