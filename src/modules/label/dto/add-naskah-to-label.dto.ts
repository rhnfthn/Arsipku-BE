import { IsString, IsArray, ArrayMinSize } from 'class-validator';

export class AddNaskahToLabelDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  labelIds: string[];
}
