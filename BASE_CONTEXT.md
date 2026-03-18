# Project Base Context

> [!NOTE]
> This is a shared context file for all AI models (Claude, Gemini, etc.). Modification here affects all models.

## Project Overview
This project follows a **3-Layer Architecture** for organized agentic workflows. It prioritizes **Premium Design Aesthetics** and proactive problem-solving.

## Operating Principles (3-Layer Architecture)
The project is organized into three distinct layers to manage complexity:

1.  **Directives (`/directives`)**: Standardized instructions, SOPs, and prompt-like files that define *how* tasks should be approached.
2.  **Execution (`/execution`)**: Automated scripts (Python, JS, etc.) and tools that perform the heavy lifting.
3.  **Environment (`/.env`, `/temp`)**: Configuration variables and transient workspaces for temporary file generation.

## Agent Guidelines
- **Aesthetics**: Use modern typography (Inter, Roboto), vibrant gradients, and glassmorphism. Avoid browser defaults.
- **Workflow**: Always check `BASE_CONTEXT.md` and relevant `directives/` before starting work.
- **Artifacts**: Use the internal brain directory for planning and task management.

## Standard Commands
- Build: `npm run build`
- Dev: `npm run dev`
- Test: `npm test`

App: Hamming — a gym management SaaS platform.

STACK:
- Frontend: React (functional components + hooks)
- Styling: Tailwind CSS
- Backend/DB: Supabase (auth, database, storage)
- Supabase client always imported from: ../lib/supabaseClient
- Routing: React Router v6

DESIGN SYSTEM:
- Outer background: #000000 (black)
- Card/surface background: #E8E0D5 (warm greige/linen)
- Primary text: #0A0A0A
- Accent/button: solid black #0A0A0A, white text
- Logo font: Bebas Neue (Google Fonts)
- Body font: DM Sans (Google Fonts)
- Aesthetic: editorial, minimal, luxury — like a high-end magazine layout
- Corner label style: small monospace text, e.g. "HMG / 01"

DATABASE TABLES (Supabase):
- gyms: id, name, email, phone, created_at
- customers: id, gym_id, full_name, phone, email, date_of_birth, emergency_contact, photo_url, created_at
- subscriptions: id, customer_id, gym_id, plan_name, start_date, end_date, status, amount_paid, created_at
- payments: id, customer_id, gym_id, amount, payment_date, plan_name, receipt_number, created_at

RULES:
- Every query must filter by gym_id (Row Level Security — each gym sees only their data)
- Never rewrite entire files — show only what changes and where
- Keep components small and single-purpose
- Always handle loading and error states