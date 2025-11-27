import { IsIn, IsInt } from 'class-validator';

export class GetMessageDto {
  @IsInt()
  persnum: number;

  @IsIn(['pengirim', 'penerima'])
  type: 'pengirim' | 'penerima';
}
