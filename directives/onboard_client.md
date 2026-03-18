# Directive: Client Onboarding Workflow

## Overview
This directive outlines the standardized process for onboarding new clients, including setting up workspace environment, sending welcome emails, and initializing project tracking.

## Steps
1.  **Verification**: Confirm client details (name, email, plan).
2.  **Environment Setup**: Ensure `.env` is populated with correct SMTP credentials.
3.  **Execution**: Run `execution/send_onboarding_email.py` with appropriate arguments.
4.  **Confirmation**: Verify email receipt and log the status in `temp/onboarding_log.json`.

## Best Practices
- Always use the `execution/` script for consistency.
- Maintain premium typography in the email body (HTML template).
