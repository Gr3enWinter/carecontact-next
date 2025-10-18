# CareContact Next — Seed Pack v1.1

Place the `seed/` folder at the project root, then run:

1) Ensure Supabase tables exist (run project `db/schema.sql`).
2) Export env:
   export SUPABASE_URL='https://YOUR-PROJECT.supabase.co'
   export SUPABASE_SERVICE_ROLE='YOUR_SERVICE_ROLE_KEY'
3) Install client lib:
   npm i @supabase/supabase-js
4) Seed:
   node seed/scripts/seed.js

Then open:
- /locations
- /find-providers
- /locations/albany-ny
