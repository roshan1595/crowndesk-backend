/**
 * Vercel Serverless Entrypoint for NestJS Backend
 * 
 * This file adapts the NestJS application to run as a Vercel serverless function.
 * Research: NestJS Vercel deployment requires exporting a handler function.
 */

import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import express from 'express';

let cachedApp: any;

async function bootstrap() {
  if (!cachedApp) {
    const expressApp = express();
    const adapter = new ExpressAdapter(expressApp);
    
    cachedApp = await NestFactory.create(
      AppModule,
      adapter,
      {
        logger: ['error', 'warn', 'log'],
      },
    );

    // Enable CORS
    cachedApp.enableCors({
      origin: process.env.CORS_ORIGINS?.split(',') || '*',
      credentials: true,
    });

    // Global prefix
    cachedApp.setGlobalPrefix('api');

    await cachedApp.init();
  }
  
  return cachedApp;
}

// Export the serverless handler
export default async (req: any, res: any) => {
  const app = await bootstrap();
  const expressApp = app.getHttpAdapter().getInstance();
  return expressApp(req, res);
};
