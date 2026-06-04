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

---
*Built for Sales Saathi Platform.*
