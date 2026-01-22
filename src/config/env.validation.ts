/**
 * CrownDesk V2 - Environment Validation
 *
 * Validates environment variables at startup.
 */

import { plainToInstance } from 'class-transformer';
import { IsString, IsNumber, IsOptional, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsString()
  NODE_ENV!: string;

  @IsNumber()
  @IsOptional()
  PORT?: number;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  @IsOptional()
  REDIS_URL?: string;

  @IsString()
  CLERK_SECRET_KEY!: string;

  @IsString()
  CLERK_PUBLISHABLE_KEY!: string;

  @IsString()
  @IsOptional()
  STRIPE_SECRET_KEY?: string;

  @IsString()
  @IsOptional()
  STRIPE_WEBHOOK_SECRET?: string;

  @IsString()
  @IsOptional()
  STEDI_API_KEY?: string;

  @IsString()
  @IsOptional()
  AWS_REGION?: string;

  @IsString()
  @IsOptional()
  AWS_ACCESS_KEY_ID?: string;

  @IsString()
  @IsOptional()
  AWS_SECRET_ACCESS_KEY?: string;

  @IsString()
  @IsOptional()
  S3_BUCKET_NAME?: string;

  @IsString()
  @IsOptional()
  AI_SERVICE_URL?: string;

  @IsString()
  @IsOptional()
  OPENAI_API_KEY?: string;

  @IsString()
  @IsOptional()
  OPENDENTAL_API_URL?: string;

  @IsString()
  @IsOptional()
  OPENDENTAL_API_KEY?: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
