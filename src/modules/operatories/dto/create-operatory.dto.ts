import { IsString, IsOptional, IsBoolean, IsArray, IsUUID } from 'class-validator';

export class CreateOperatoryDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  shortName?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isHygiene?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  equipment?: string[];

  @IsOptional()
  @IsUUID()
  defaultProviderId?: string;
}
