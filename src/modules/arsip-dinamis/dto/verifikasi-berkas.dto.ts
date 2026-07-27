import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class VerifikasiBerkasDto {
  @IsString()
  @IsNotEmpty({ message: 'Catatan wajib diisi' })
  @MinLength(10, { message: 'Catatan minimal 10 karakter' })
  catatan: string;
}
