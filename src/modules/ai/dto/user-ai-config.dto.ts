import { IsString, Allow } from 'class-validator';

export class UserAiConfigDto {
  // Empty string clears the stored key; any other value is stored as-is.
  @Allow()
  @IsString()
  apiKey: string;
}