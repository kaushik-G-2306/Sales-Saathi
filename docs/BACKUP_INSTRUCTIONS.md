# Backup Instructions

**Sales Saathi v0.1**

---

## Overview

This document covers all backup procedures for Sales Saathi: database, environment configuration, source code, and edge functions. Run full backups before any major deployment, migration, or schema change.

---

## 1. Source Code Backup (Git)

### Tag the Release

```bash
# Ensure all changes are committed
git add -A
git commit -m "chore: Release v0.1 Stable"

# Create an annotated tag
git tag -a v0.1.0 -m "Release v0.1 Stable — First stable release"

# Push to remote (GitHub, GitLab, etc.)
git push origin main
git push origin v0.1.0
```

### Verify the Tag

```bash
git tag -l
git show v0.1.0
```

### Create a GitHub Release (optional)

If using GitHub:
1. Navigate to **Releases → Draft a new release**
2. Select tag `v0.1.0`
3. Paste the content of `RELEASE_NOTES_v0.1.md` as the release body
4. Attach build artifacts if needed

---

## 2. Database Backup

### Method A — Supabase Dashboard (Recommended)

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to **Settings → Database → Backups**
4. Click **Download** to export the latest backup
5. Store the `.sql` or `.dump` file securely (encrypted cloud storage or local encrypted drive)

> Supabase Pro/Team plans include automatic daily backups with 7-day retention. Free plan users should perform manual backups regularly.

---

### Method B — pg_dump (CLI)

Requires the Supabase database connection string (find in Dashboard → Settings → Database).

```bash
# Set your connection string
DB_URL="postgresql://postgres:<password>@<host>:<port>/postgres"

# Full schema + data backup
pg_dump "$DB_URL" \
  --no-owner \
  --no-acl \
  --format=custom \
  --file="salessaathi_backup_$(date +%Y%m%d_%H%M%S).dump"

# Schema-only backup (no data)
pg_dump "$DB_URL" \
  --no-owner \
  --no-acl \
  --schema-only \
  --format=plain \
  --file="salessaathi_schema_$(date +%Y%m%d_%H%M%S).sql"

# Data-only backup (no schema)
pg_dump "$DB_URL" \
  --no-owner \
  --no-acl \
  --data-only \
  --format=custom \
  --file="salessaathi_data_$(date +%Y%m%d_%H%M%S).dump"
```

---

### Method C — Supabase CLI

```bash
# Link to your project (first time)
supabase link --project-ref <your-project-ref>

# Create a backup
supabase db dump -f salessaathi_backup_$(date +%Y%m%d).sql

# Backup with data
supabase db dump --data-only -f salessaathi_data_$(date +%Y%m%d).sql
```

---

### Restoring from a pg_dump Backup

```bash
# Restore to a fresh database
pg_restore \
  --no-owner \
  --no-acl \
  --dbname="$DB_URL" \
  salessaathi_backup_<timestamp>.dump

# For plain SQL format
psql "$DB_URL" -f salessaathi_backup_<timestamp>.sql
```

---

## 3. Environment Variables Backup

Environment variables contain sensitive credentials. **Never commit them to version control.**

### What to Back Up

| Variable | Where Used |
|---|---|
| `VITE_SUPABASE_URL` | Frontend `.env` |
| `VITE_SUPABASE_ANON_KEY` | Frontend `.env` |
| `GEMINI_API_KEY` | Supabase edge function secret |
| `DEBUG_MODE` | Supabase edge function secret (optional) |
| `VITE_DEBUG_MODE` | Frontend `.env` (optional) |

### Backup Method

**Option A — Password Manager (Recommended)**
Store all secrets in a team password manager (1Password, Bitwarden, Vault). Create a "Sales Saathi Production" vault entry with all variables.

**Option B — Encrypted File**
```bash
# Create a secrets file
cat > salessaathi_secrets.env << EOF
VITE_SUPABASE_URL=https://your-ref.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
GEMINI_API_KEY=...
EOF

# Encrypt it with GPG
gpg --symmetric --cipher-algo AES256 salessaathi_secrets.env

# Store salessaathi_secrets.env.gpg securely
# Delete the plaintext file
rm salessaathi_secrets.env
```

**Option C — Supabase Secrets Export**
```bash
# List all edge function secrets
supabase secrets list --project-ref <your-ref>
# (Note: values are not shown, only key names)
```

---

## 4. Supabase Project Configuration Backup

Back up all Supabase configuration that is not in source control:

### Auth Provider Credentials
- Google OAuth Client ID and Secret (from Google Cloud Console)
- Any other configured OAuth providers

### Storage Configuration
- Bucket names, policies, and CORS settings (if configured)

### Export via CLI

```bash
# Pull remote DB schema to local migration files
supabase db pull

# This creates migration files in supabase/migrations/
# Commit these files to source control
git add supabase/migrations/
git commit -m "chore: Pull remote schema migrations"
```

---

## 5. Backup Schedule Recommendation

| Backup Type | Frequency | Retention |
|---|---|---|
| Database (full) | Daily | 30 days |
| Database (schema) | Every release | Indefinitely |
| Environment variables | Every change | Latest version |
| Source code (git tag) | Every release | Indefinitely |
| Supabase config pull | Every schema change | Via git |

---

## 6. Backup Verification Checklist

Before marking a backup as complete, verify:

- [ ] Git tag `v0.1.0` exists and points to the correct commit
- [ ] Database backup file is non-zero in size
- [ ] Database backup file can be opened (test restore to a local DB)
- [ ] All secrets are recorded in the team password manager
- [ ] Supabase migrations folder is up to date and committed
- [ ] Backup files are stored in at least 2 separate locations

---

## 7. Disaster Recovery Procedure

In the event of complete data loss:

1. **Restore source code** from git tag `v0.1.0`
2. **Create new Supabase project** at app.supabase.com
3. **Apply schema** via SQL Editor using `schema.sql` + the `generation_time_ms` column fix
4. **Restore data** using pg_restore with the latest database backup
5. **Re-set edge function secrets** (GEMINI_API_KEY, DEBUG_MODE)
6. **Deploy edge function**: `supabase functions deploy generate-brief`
7. **Update hosting platform environment variables** with new Supabase URL and keys
8. **Redeploy frontend** with updated env vars
9. **Verify** auth flows, brief generation, and brief retrieval

Estimated recovery time: **2-4 hours** (assuming backups are current).
