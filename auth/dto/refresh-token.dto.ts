import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Session ID hasil loginWithSsoToken',
    example: 'f1ba2dff-9a9f-43ef-929c-a11c1c123cd9',
  })
  @IsUUID()
  sessionId: string;
}
