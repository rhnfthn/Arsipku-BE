import { Type } from 'class-transformer';
import {
  IsIn,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Trim } from './tugas-validation';

export class CreateTaskCommentDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(2000)
  isi: string;

  /** Tag task opsional — komentar forum papan dapat merujuk task tertentu. */
  @IsOptional()
  @IsUUID()
  taskId?: string | null;
}

export class QueryTaskCommentDto {
  @IsOptional()
  @IsUUID()
  taskId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 50;
}

/** Scope hapus komentar: me = hapus untuk saya, everyone = hapus untuk semua. */
export class DeleteTaskCommentScopeDto {
  @IsOptional()
  @IsIn(['me', 'everyone'])
  scope: 'me' | 'everyone' = 'me';
}
export const FORUM_REACTION_EMOJIS = [
  '👍',
  '❤️',
  '😂',
  '🎉',
  '😮',
  '😢',
  '🙏',
] as const;

export class SetCommentReactionDto {
  @IsIn(FORUM_REACTION_EMOJIS)
  emoji: string;

  @IsBoolean()
  active: boolean;
}
