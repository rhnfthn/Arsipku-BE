import { IsString, IsUUID, IsNotEmpty, MaxLength } from 'class-validator';

export class TteCallbackDto {
  /** Authorization code dari query callback portal */
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  code!: string;

  /** State anti-CSRF dari query callback */
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  state!: string;
}

export class TteStatusParamsDto {
  @IsUUID()
  transactionId!: string;
}
