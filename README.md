# Sales Saathi - Local Development Environment

Welcome to the Sales Saathi frontend repository! This project has been configured with Vite to provide a blazing-fast local development experience, complete with hot-module replacement, mock data modes, and production-ready build commands.

## Prerequisites
- **Node.js** (v18 or higher recommended)
- **NPM** (comes with Node.js)

## Installation & Setup

1. **Install Dependencies**
   Run the following command in the root directory to install Vite and other development dependencies:
   ```bash
   npm install
   ```

2. **Environment Variables**
   The project requires certain environment variables for backend API integration. 
   Copy the `.env.example` file to a new file named `.env`:
   ```bash
   cp .env.example .env
   ```
   *(Note: The `.env` file is already created for you in this setup. You can open it to configure your real API keys later).*

## Running the Application Locally

To start the local development server, run:
```bash
npm run dev
```
By default, the server will launch on **http://localhost:3000**. If port 3000 is occupied by another process, Vite will automatically find and use the next available port.

## Mock Data Mode

For development and demonstration purposes, the application can run in a "Mock Data Mode" even if backend services (OpenAI, HubSpot, Salesforce, etc.) are not connected. 
- Look inside `src/api/mockData.js` to see realistic JSON data for Pre-Meeting Briefs, Ice-Breakers, Deal Risk Predictors, etc.
- `src/api/mockApi.js` provides asynchronous simulated API fetches that automatically fall back to this mock data when real backend environment variables are missing.

## Production Build & Deployment

This project is completely production-ready and can be deployed directly to Vercel, Netlify, or AWS Amplify. No localhost-specific hardcoding remains.

1. **Build for Production**
   ```bash
   npm run build
   ```
   This will generate optimized, minified static HTML, CSS, and JS assets in the `dist` folder.

2. **Preview Production Build**
   To test the production build locally before deploying:
   ```bash
   npm run preview
   ```

## Troubleshooting

- **Server won't start?** Ensure you ran `npm install` first.
- **Port issues?** If it doesn't open on 3000, look at the terminal output to see which port Vite automatically selected (e.g., `http://localhost:3001`).
- **Missing Data?** If integrating the real backend fails, ensure your `.env` variables match the exact keys defined in `.env.example`.

## AI Security Guardrails & Telemetry Integration

This project has been reinforced with a production-grade secure AI execution layer implemented as a shared module across all Supabase Edge Functions (`enrich-prospect`, `generate-brief`, and `generate-outreach`).

### 1. Secure API Key & Environment Handling
* **Cold-Start Verification**: All required secrets are checked at function cold-start. If any key is missing or malformed, the handler fails fast with a `500` error before processing user input.
* **Safe Logging**: The customized `safeLog` and `safeError` functions redact sensitive variables (keys, tokens, passwords) automatically before writing logs to stdout/stderr.

### 2. Multi-Layer Guardrail Pipeline
Every incoming request and outgoing response undergoes a strict sequence of checks:
1. **Input Sanitization**: Strips HTML tags and non-printable characters.
2. **Jailbreak/Prompt Injection Detection**: Uses hardened regex patterns to intercept and reject prompt injection attempts before they reach the LLM.
3. **Rate Limiting**: Restricts users to a maximum of 10 requests per minute to prevent API abuse.
4. **Output Content Filtering**: Scans generated text to block leaked credentials, AI refusal leakage ("I cannot help with that"), legal/medical advice, and system prompt echo attempts.
5. **Schema Validation**: Validates the JSON response format against strict TypeScript schemas.

### 3. Business Telemetry & Metrics
Telemetry is recorded to the `ai_metrics` table for every invocation:
* **Accuracy Score**: Calculated dynamically based on filled expected fields.
* **Time Saved**: Baseline of 45 minutes saved per meeting, adjusted for generation time.
* **Failure Audits**: Even if a request fails the output filter or schema check, it is written to `ai_metrics` with `guardrails_passed: false` to allow auditing and defense tuning.

---
*Built for Sales Saathi Platform.*

