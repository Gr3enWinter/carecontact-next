# v1.4 Directory Style + Admin Import
**Adds**
- `src/components/ProviderCard.tsx`: clean provider card UI.
- Styled `/find-providers` with filters (q, state, city, service).
- `/locations/[slug]` showing providers in that city/state.
- `/admin` simple token-gated CSV importer UI.
- `/api/providers/import` text/csv endpoint (expects header row).

**Env**
- `NEXT_PUBLIC_ADMIN_TOKEN` — set a secret string. Use this in /admin once to unlock import UI.

**CSV headers**
`name,phone,email,address,city,state,zip,website,services,featured`

**Apply**
1) Copy files into your project at same paths.
2) Set `NEXT_PUBLIC_ADMIN_TOKEN` in Vercel env.
3) Commit & push → Vercel redeploys.
4) Visit `/admin`, enter your token, upload `providers.csv`.
5) Use `/find-providers` and `/locations/<slug>` to see styled cards.

**Notes**
- The importer is simple (comma-split). If you need quoted CSV, we can swap in a robust parser later.
