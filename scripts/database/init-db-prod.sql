-- CrownDesk V2 - Database Initialization Script
-- Sets up pgvector extension and initial configuration

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Create initial database user (if needed)
-- CREATE USER crowndesk_app WITH PASSWORD '<secure-password>';
-- GRANT ALL PRIVILEGES ON DATABASE crowndesk_prod TO crowndesk_app;

-- Row Level Security (RLS) will be managed by Prisma migrations
-- Initial setup complete
