import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Session ID dari login response',
    example: 'f1ba2dff-9a9f-43ef-929c-a11c1c123cd9',
  })
  @IsUUID()
  sessionId: string;
}
