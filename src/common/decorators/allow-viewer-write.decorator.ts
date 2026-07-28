import { SetMetadata } from '@nestjs/common';

export const ALLOW_VIEWER_WRITE_KEY = 'allowViewerWrite';
export const AllowViewerWrite = (...statuses: string[]) =>
  SetMetadata(ALLOW_VIEWER_WRITE_KEY, statuses);
