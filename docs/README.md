# Sales Saathi — Documentation Index

**Version:** 0.1.0  
**Last Updated:** 2026-06-04

---

## Release & Strategy Documents

| Document | Description |
|---|---|
| [CHANGELOG.md](../CHANGELOG.md) | Full version history and change log |
| [RELEASE_NOTES_v0.1.md](../RELEASE_NOTES_v0.1.md) | v0.1 Stable release notes, features, limitations |
| [competitor_analysis.md](competitor_analysis.md) | Competitor positioning, MVP feature scoping, product roadmap, and backend integrations |

---

## Architecture Documentation

| Document | Description |
|---|---|
| [FRONTEND.md](architecture/FRONTEND.md) | Vite MPA, Alpine.js stores, page inventory, route protection, build pipeline |
| [SUPABASE.md](architecture/SUPABASE.md) | Supabase config, auth providers, rate limits, client initialisation |
| [EDGE_FUNCTIONS.md](architecture/EDGE_FUNCTIONS.md) | `generate-brief` function — request spec, execution flow, CORS, deployment |
| [GEMINI_INTEGRATION.md](architecture/GEMINI_INTEGRATION.md) | Gemini 2.5 Flash — model, prompt, schema, response parsing, error handling |
| [DATABASE_SCHEMA.md](architecture/DATABASE_SCHEMA.md) | Tables, columns, RLS policies, ERD, migration instructions |

---

## Operations Documentation

| Document | Description |
|---|---|
| [BACKUP_INSTRUCTIONS.md](BACKUP_INSTRUCTIONS.md) | Git tagging, pg_dump, env var backup, disaster recovery |
| [DEPLOYMENT_INSTRUCTIONS.md](DEPLOYMENT_INSTRUCTIONS.md) | Supabase setup, edge function deploy, Vercel/Netlify/AWS deploy |

---

## Quick Reference

### Start Local Dev Server
```bash
npm run dev
# → http://localhost:3000 (or next available port)
```

### Enable Debug Logging
```env
# .env (frontend)
VITE_DEBUG_MODE=true

# Supabase edge function secret
DEBUG_MODE=true
```

### Apply Missing Schema Column
```sql
ALTER TABLE public."PreMeetingBriefs" ADD COLUMN generation_time_ms INTEGER;
```

### Deploy Edge Function
```bash
supabase functions deploy generate-brief
supabase secrets set GEMINI_API_KEY=<your-key>
```
