/**
 * Vercel Serverless Entrypoint for NestJS Backend
 * Root-level handler for Vercel deployment
 */

import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './src/app.module';
import express from 'express';
import { VercelRequest, VercelResponse } from '@vercel/node';

let cachedServer: express.Application;

async function bootstrapServer() {
  if (!cachedServer) {
    const expressApp = express();
    const adapter = new ExpressAdapter(expressApp);
    
    const app = await NestFactory.create(AppModule, adapter, {
      logger: ['error', 'warn', 'log'],
    });

    // Enable CORS
    app.enableCors({
      origin: process.env.CORS_ORIGINS?.split(',') || '*',
      credentials: true,
    });

    // Root endpoint info (before global prefix)
    // Type assertion needed due to Express/Node type conflicts in strict mode
    expressApp.get('/', ((req: any, res: any) => {
      res.json({
        service: 'crowndesk-backend',
        version: '1.0.0',
        status: 'running',
        endpoints: {
          health: '/api/health',
          swagger: '/api/docs',
          api: '/api/*'
        }
      });
    }) as express.RequestHandler);

    // Global prefix
    app.setGlobalPrefix('api');

    await app.init();
    
    cachedServer = expressApp;
  }
  
  return cachedServer;
}

// Export handler for Vercel
export default async (req: VercelRequest, res: VercelResponse) => {
  const server = await bootstrapServer();
  // Express app is callable but TypeScript doesn't recognize it
  // Cast to any to allow the call
  (server as any)(req, res);
};
