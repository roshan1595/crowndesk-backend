/**
 * CrownDesk V2 - Configuration Module
 *
 * Centralized configuration with type safety and validation.
 */

export default () => ({
  // Application
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '4000', 10),
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  },

  // Database
  database: {
    url: process.env.DATABASE_URL,
    poolSize: parseInt(process.env.DATABASE_POOL_SIZE || '10', 10),
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  // Clerk Authentication
  clerk: {
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
  },

  // Stripe Billing
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  },

  // Stedi EDI
  stedi: {
    apiKey: process.env.STEDI_API_KEY,
  },

  // AWS
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    s3: {
      documentsBucket: process.env.S3_BUCKET_NAME || 'crowndesk-documents',
      audioBucket: process.env.S3_BUCKET_AUDIO || 'crowndesk-audio',
    },
  },

  // AI Service
  ai: {
    serviceUrl: process.env.AI_SERVICE_URL || 'http://localhost:8000',
    openaiApiKey: process.env.OPENAI_API_KEY,
  },

  // Open Dental PMS
  openDental: {
    apiUrl: process.env.OPENDENTAL_API_URL,
    apiKey: process.env.OPENDENTAL_API_KEY,
  },

  // Feature Flags
  features: {
    aiReceptionist: process.env.ENABLE_AI_RECEPTIONIST === 'true',
    codingAssistant: process.env.ENABLE_CODING_ASSISTANT === 'true',
    stripeConnect: process.env.ENABLE_STRIPE_CONNECT === 'true',
  },
});
