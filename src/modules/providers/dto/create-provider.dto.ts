import { IsString, IsOptional, IsEnum, IsBoolean, IsEmail } from 'class-validator';

// Define enum locally to avoid Prisma client initialization issues with decorators
// Must match schema.prisma enum values exactly
export enum ProviderSpecialty {
  general_dentist = 'general_dentist',
  orthodontist = 'orthodontist',
  periodontist = 'periodontist',
  endodontist = 'endodontist',
  oral_surgeon = 'oral_surgeon',
  prosthodontist = 'prosthodontist',
  pediatric_dentist = 'pediatric_dentist',
  hygienist = 'hygienist',
}

export class CreateProviderDto {
  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  npi?: string;

  @IsOptional()
  @IsString()
  license?: string;

  @IsOptional()
  @IsEnum(ProviderSpecialty)
  specialty?: ProviderSpecialty;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  workingHours?: object;
}
