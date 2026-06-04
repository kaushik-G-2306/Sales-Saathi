# Frontend Architecture

**Sales Saathi v0.1**

---

## Overview

The Sales Saathi frontend is a **Vite 5 Multi-Page Application (MPA)**. Each page is a self-contained HTML file that loads a shared JavaScript entry point (`src/main.js`) via a `<script type="module">` tag. There is no client-side routing — navigation is standard browser `<a href>` links and programmatic `window.location.href` redirects.

UI reactivity is provided by **Alpine.js** (loaded from CDN), which manages authentication state and data binding across all protected pages. Styles are **Vanilla CSS** with no CSS framework dependency.

---

## Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Build Tool | Vite | ^5.0.0 |
| Reactivity | Alpine.js | CDN (latest) |
| Styling | Vanilla CSS | — |
| Auth / DB Client | @supabase/supabase-js | ^2.106.2 |
| Runtime | Browser | ES Modules |

---

## Directory Structure

```
salessaathi/
├── src/
│   ├── main.js          # Module entry point — imports db, auth, css
│   ├── auth.js          # Alpine.js auth store (full session lifecycle)
│   ├── db.js            # DB abstraction layer (Supabase + mock fallback)
│   └── styles.css       # Global CSS
│
├── archive/
│   └── deprecated/
│       ├── mockApi.js   # Archived: dashboard-level mock API (unused)
│       └── mockData.js  # Archived: static fixture data (unused)
│
├── supabase/
│   ├── config.toml
│   └── functions/
│       ├── _shared/cors.ts
│       └── generate-brief/index.ts
│
├── solutions/           # Role-specific solution pages
│   ├── account-executives.html
│   ├── revenue-operations.html
│   └── sales-leaders.html
│
├── index.html           # Marketing landing page
├── auth.html            # Authentication page
├── dashboard.html       # Main application (brief generation)
├── brief-result.html    # AI brief display
├── brief-history.html   # Brief history list
├── onboarding.html      # Post-signup onboarding
├── settings.html        # User profile settings
├── features.html        # Feature showcase
├── pricing.html         # Pricing plans
├── solutions.html       # Solutions overview
├── contact.html         # Contact form
├── resources.html       # Resources / blog
├── workflow.html        # Workflow visualisation
├── social-proof.html    # Testimonials
├── header.html          # Navigation component
│
├── vite.config.js       # Vite MPA configuration
├── package.json         # Dependencies and scripts
├── schema.sql           # Supabase DB schema
└── .env                 # Environment variables (not committed)
```

---

## Page Inventory

| Page | File | Auth Required | Description |
|---|---|---|---|
| Landing | `index.html` | No | Marketing homepage |
| Auth | `auth.html` | No | Sign In / Sign Up / OTP / Google |
| Dashboard | `dashboard.html` | **Yes** | Brief generation form + recent briefs |
| Brief Result | `brief-result.html` | **Yes** | Rendered AI brief (all 13 sections) |
| Brief History | `brief-history.html` | **Yes** | Historical list of generated briefs |
| Onboarding | `onboarding.html` | **Yes** | Post-signup setup flow |
| Settings | `settings.html` | **Yes** | User profile management |
| Features | `features.html` | No | Feature showcase |
| Pricing | `pricing.html` | No | Subscription plans |
| Solutions | `solutions.html` | No | Solutions overview |
| Account Executives | `solutions/account-executives.html` | No | AE-specific value proposition |
| Revenue Operations | `solutions/revenue-operations.html` | No | RevOps-specific value proposition |
| Sales Leaders | `solutions/sales-leaders.html` | No | Sales leader-specific value proposition |
| Contact | `contact.html` | No | Contact / demo request |
| Resources | `resources.html` | No | Blog and resources |
| Workflow | `workflow.html` | No | Visual workflow diagram |

---

## JavaScript Module Entry Point

`src/main.js` is the single import target referenced by all pages that require auth/DB functionality:

```javascript
import './db.js';    // Initialises Supabase client, exports db, supabase, isSupabaseConfigured
import './auth.js';  // Registers Alpine.js auth store, calls auth.init()
import './styles.css';
```

Pages include this via:

```html
<script type="module" src="./src/main.js"></script>
```

---

## Alpine.js Auth Store

The `auth` store (registered as `Alpine.store('auth', ...)`) provides:

| Property / Method | Type | Description |
|---|---|---|
| `isLoggedIn` | `boolean` | Whether a valid session exists |
| `user` | `object \| null` | Current user record from `public.Users` |
| `loading` | `boolean` | True during initial session resolution |
| `init()` | `async` | Called on `alpine:init` — resolves session, sets up listener |
| `signUpEmail(name, email, password)` | `async` | Email/password registration |
| `signInEmail(email, password)` | `async` | Email/password login |
| `signInOTP(email)` | `async` | Sends Magic Link OTP |
| `verifyOTP(email, token)` | `async` | Verifies OTP token |
| `signInGoogle()` | `async` | Google OAuth redirect |
| `signOut()` | `async` | Clears session, redirects to auth |

Alpine templates access store values as `$store.auth.isLoggedIn`, `$store.auth.user.name`, etc.

---

## Route Protection

Route protection is enforced in `auth.js` `init()`:

```javascript
const isProtectedPage = path.includes('dashboard') || 
                        path.includes('brief-') || 
                        path.includes('settings') || 
                        path.includes('onboarding');

if (!this.isLoggedIn && isProtectedPage && !isAuthCallback) {
    window.location.href = 'auth.html';
}
```

Auth callback detection prevents redirect loops on Magic Link / OAuth returns:

```javascript
const isAuthCallback = window.location.hash.includes('access_token=') || 
                       window.location.hash.includes('error=') ||
                       window.location.search.includes('code=');
```

---

## Mock / Offline Mode

When `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are empty, `isSupabaseConfigured = false` and the application falls back to a `localStorage`-backed mock:

- Auth operations use a `sales_saathi_mock_session` key
- DB operations use a `sales_saathi_mock_db` key (JSON object with `users[]` and `briefs[]`)
- All CRUD operations are synchronous and scoped to the current browser tab

This mode is suitable for **local development and demonstrations** only.

---

## Build Pipeline

`vite.config.js` defines all HTML entry points for production build:

```javascript
rollupOptions: {
  input: {
    main:              'index.html',
    auth:              'auth.html',
    contact:           'contact.html',
    dashboard:         'dashboard.html',
    features:          'features.html',
    pricing:           'pricing.html',
    resources:         'resources.html',
    settings:          'settings.html',
    solutions:         'solutions.html',
    account_executives:'solutions/account-executives.html',
    revenue_operations:'solutions/revenue-operations.html',
    sales_leaders:     'solutions/sales-leaders.html'
  }
}
```

Build commands:

```bash
npm run dev      # Start local dev server (default port 3000, auto-increments)
npm run build    # Production build → dist/
npm run preview  # Preview production build locally
```

---

## Debug Mode

Set `VITE_DEBUG_MODE=true` in `.env` to enable `[DEBUG]`-prefixed console logs in `auth.js`. This flag is evaluated at build time via `import.meta.env.VITE_DEBUG_MODE`.

---

## Globals Exposed for Development

`src/db.js` exposes the following on `window` for browser console debugging:

```javascript
window.db = db;
window.supabase = supabase;
window.isSupabaseConfigured = isSupabaseConfigured;
```

These are intentional development conveniences and do not affect production behaviour.
