import { IsString, IsEnum, IsOptional } from 'class-validator';

export class CreateSubscriptionDto {
  @IsEnum(['starter', 'professional', 'enterprise'])
  plan!: 'starter' | 'professional' | 'enterprise';

  @IsString()
  @IsOptional()
  paymentMethodId?: string;

  @IsString()
  email!: string;
}
