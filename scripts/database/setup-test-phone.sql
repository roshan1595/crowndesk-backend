-- Setup script for testing with existing Twilio number
-- Run this in your database to add the phone number for testing

-- First, get your tenant ID (replace with your actual organization ID from Clerk)
-- You can get this from the Clerk dashboard or by logging in and checking the org_id in the JWT

-- Example tenant ID - REPLACE THIS WITH YOUR ACTUAL TENANT ID
-- To find it: Log into your app, open browser console, run: 
-- fetch('/api/v1/health', {headers: {'Authorization': 'Bearer YOUR_TOKEN'}})

DO $$
DECLARE
  test_tenant_id TEXT := 'org_38ND2k8ceVkfp0z4piE59jalL8O'; -- REPLACE WITH YOUR ACTUAL TENANT ID
  test_phone_number TEXT := '+18335456864';
  test_phone_id UUID;
BEGIN
  -- Check if phone number already exists
  SELECT id INTO test_phone_id FROM "PhoneNumber" 
  WHERE "phoneNumber" = test_phone_number AND "tenantId" = test_tenant_id;

  -- If not exists, create it
  IF test_phone_id IS NULL THEN
    INSERT INTO "PhoneNumber" (
      id,
      "tenantId",
      "phoneNumber",
      provider,
      "providerId",
      "friendlyName",
      status,
      "voiceEnabled",
      "smsEnabled",
      "createdAt",
      "updatedAt"
    ) VALUES (
      gen_random_uuid(),
      test_tenant_id,
      test_phone_number,
      'TWILIO',
      'PN_test_registration', -- Placeholder since it's existing number
      'Main Registration Line',
      'ACTIVE',
      true,
      true,
      NOW(),
      NOW()
    ) RETURNING id INTO test_phone_id;
    
    RAISE NOTICE 'Created phone number with ID: %', test_phone_id;
  ELSE
    RAISE NOTICE 'Phone number already exists with ID: %', test_phone_id;
  END IF;

  -- Optional: Create an agent config if you want to track which agent uses this number
  -- This links the phone number to the AI receptionist configuration
  
END $$;

-- Verify the setup
SELECT 
  "phoneNumber",
  provider,
  "friendlyName",
  status,
  "voiceEnabled",
  "smsEnabled",
  "createdAt"
FROM "PhoneNumber"
WHERE "phoneNumber" = '+18335456864';
