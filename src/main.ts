/**
 * CrownDesk V2 - NestJS Backend Entry Point
 *
 * Configures and starts the NestJS application with:
 * - Swagger API documentation
 * - Helmet security headers
 * - Global validation pipes
 * - CORS configuration
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security
  app.use(helmet());

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  });

  // API Versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('CrownDesk V2 API')
    .setDescription(
      `
      CrownDesk V2 - AI-powered dental operations platform API.

      ## Authentication
      All endpoints require Clerk JWT authentication unless marked as public.

      ## System Ownership
      - **NestJS Core**: Tenancy, RBAC, Approvals, Audit, PMS Sync, Billing
      - **FastAPI AI Service**: AI Orchestration, RAG, Intent Classification

      ## Key Principles
      - PMS is always the system of record
      - AI assists, humans approve
      - No silent writes to PMS
    `,
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter Clerk JWT token',
      },
      'clerk-jwt',
    )
    .addTag('health', 'Health check endpoints')
    .addTag('tenants', 'Tenant management')
    .addTag('users', 'User management')
    .addTag('patients', 'Patient management')
    .addTag('appointments', 'Appointment management')
    .addTag('insurance', 'Insurance and eligibility')
    .addTag('claims', 'Insurance claim management - create, submit, track, appeal')
    .addTag('pre-authorizations', 'Pre-authorization requests and tracking')
    .addTag('ai', 'AI-powered features - code suggestions, insights, intent classification')
    .addTag('ai-feedback', 'AI feedback and retraining system')
    .addTag('payment-posting', 'ERA processing and payment posting')
    .addTag('billing', 'Patient statements and billing')
    .addTag('approvals', 'Approval workflow')
    .addTag('sync', 'PMS synchronization')
    .addTag('agents', 'AI agent configuration and management')
    .addTag('audit', 'Audit logging')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port);

  console.log(`🏥 CrownDesk V2 Backend running on port ${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
}

bootstrap();
