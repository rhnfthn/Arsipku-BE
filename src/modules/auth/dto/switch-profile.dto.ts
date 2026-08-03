import { IsIn, IsNotEmpty } from 'class-validator';

export class SwitchProfileDto {
  @IsNotEmpty()
  @IsIn(['akun_asli', 'sekretaris'])
  profile: 'akun_asli' | 'sekretaris';
}
