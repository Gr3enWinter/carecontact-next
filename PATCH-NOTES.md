# v1.2 Patch — SEO + safety + Pexels
Copy files into your project at the same paths, commit, and redeploy.

Add env:
- NEXT_PUBLIC_SITE_URL=https://carecontactdirectory.com
- PEXELS_API_KEY= (optional, for blog images)

Verify:
- /robots.txt
- /sitemap.xml
- Trigger /api/cron/autopost → image appears at top of the post
