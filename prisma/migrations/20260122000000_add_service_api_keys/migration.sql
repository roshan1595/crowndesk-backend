-- CreateTable: Service API Keys for AI agents, webhooks, integrations
-- This allows non-user services to authenticate with the backend

CREATE TABLE IF NOT EXISTS "service_api_keys" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "key_hash" VARCHAR(64) NOT NULL,
    "service_type" VARCHAR(50) NOT NULL DEFAULT 'ai_agent',
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" UUID,

    CONSTRAINT "service_api_keys_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE INDEX "service_api_keys_tenant_id_idx" ON "service_api_keys"("tenant_id");
CREATE INDEX "service_api_keys_key_hash_idx" ON "service_api_keys"("key_hash");
CREATE UNIQUE INDEX "service_api_keys_tenant_id_name_key" ON "service_api_keys"("tenant_id", "name");

-- Add foreign key constraints
ALTER TABLE "service_api_keys" ADD CONSTRAINT "service_api_keys_tenant_id_fkey" 
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_api_keys" ADD CONSTRAINT "service_api_keys_created_by_user_id_fkey" 
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Comments
COMMENT ON TABLE "service_api_keys" IS 'API keys for service-to-service authentication (AI agents, webhooks, integrations)';
COMMENT ON COLUMN "service_api_keys"."key_hash" IS 'SHA-256 hash of the API key (never store plain text)';
COMMENT ON COLUMN "service_api_keys"."service_type" IS 'Type of service: ai_agent, webhook, integration';
COMMENT ON COLUMN "service_api_keys"."usage_count" IS 'Number of times this API key has been used';
