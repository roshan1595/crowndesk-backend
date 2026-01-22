-- CrownDesk V2 - Database Initialization Script
-- Per plan.txt Section 20: Database Schema
-- Creates pgvector extension and enables RLS

-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable uuid-ossp for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- RLS Helper Function
-- Sets tenant context for row-level security
CREATE OR REPLACE FUNCTION set_tenant_context(tenant_uuid UUID)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_tenant', tenant_uuid::text, true);
END;
$$ LANGUAGE plpgsql;

-- Get current tenant from context
CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_tenant', true), '')::UUID;
END;
$$ LANGUAGE plpgsql STABLE;

-- Audit log trigger function
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, changes)
        VALUES (
            OLD.tenant_id,
            NULLIF(current_setting('app.current_user', true), '')::UUID,
            'DELETE',
            TG_TABLE_NAME,
            OLD.id::text,
            jsonb_build_object('old', row_to_json(OLD))
        );
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, changes)
        VALUES (
            NEW.tenant_id,
            NULLIF(current_setting('app.current_user', true), '')::UUID,
            'UPDATE',
            TG_TABLE_NAME,
            NEW.id::text,
            jsonb_build_object('old', row_to_json(OLD), 'new', row_to_json(NEW))
        );
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, changes)
        VALUES (
            NEW.tenant_id,
            NULLIF(current_setting('app.current_user', true), '')::UUID,
            'INSERT',
            TG_TABLE_NAME,
            NEW.id::text,
            jsonb_build_object('new', row_to_json(NEW))
        );
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO crowndesk;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO crowndesk;

-- Log successful initialization
DO $$
BEGIN
    RAISE NOTICE 'CrownDesk database initialized successfully with pgvector and RLS helpers';
END $$;
