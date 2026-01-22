import { IsUUID, IsOptional, IsBoolean } from 'class-validator';

export class AddFamilyMemberDto {
  @IsUUID()
  patientId!: string;

  @IsOptional()
  @IsBoolean()
  isPrimaryAccountHolder?: boolean;
}
