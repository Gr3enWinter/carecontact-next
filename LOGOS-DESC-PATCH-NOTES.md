# v1.5 — Logos & Descriptions
**Adds**
- Provider fields: `logo_url`, `description`
- Importer now supports quoted CSV and these new columns
- Cards show a logo (or initials) and a description snippet

**Steps**
1) In Supabase SQL, run `SUPABASE-SQL-ADD-COLUMNS.sql`.
2) Commit & deploy these files.
3) Import `sample-providers-with-logos.csv` (or your own) via `/admin`.

**CSV header**
`name,phone,email,address,city,state,zip,website,services,featured,logo_url,description`
