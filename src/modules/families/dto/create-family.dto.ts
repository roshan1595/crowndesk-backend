import { IsString, IsOptional, IsUUID, IsArray } from 'class-validator';

export class CreateFamilyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsUUID()
  guarantorId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  memberIds?: string[];
}
