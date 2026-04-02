# Supabase Edge Functions

## Function Added

- run-auto-migration

## What It Does

- Runs migration server-side for customer and payment CSV payloads.
- Imports data in chunks for better large-volume stability.
- Logs import jobs, errors, and reconciliation data.
- Optionally sends completion email via existing broadcast-email function.

## Required Secrets

Set these in Supabase project secrets before deploy:

- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY

## Deploy Command

From project root:

supabase functions deploy run-auto-migration

Keep JWT verification enabled for this function.

## Client Call

The app calls this endpoint in Background Mode:

POST /functions/v1/run-auto-migration

Request body fields:

- sourcePreset
- customerCsv
- customerFileName
- paymentCsv
- paymentFileName
- notifyEmail
