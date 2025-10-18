import type { MetadataRoute } from 'next'
import { adminClient } from '../src/lib/supabaseServer'
const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://carecontactdirectory.com'
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supa = adminClient()
  const urls: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${BASE}/locations`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE}/find-providers`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE}/blog`, changeFrequency: 'daily', priority: 0.6 },
  ]
  try {
    const { data: posts } = await supa.from('posts').select('slug, created_at').order('created_at', { ascending: false }).limit(2000)
    for (const p of posts || []) urls.push({ url: `${BASE}/blog/${p.slug}`, changeFrequency: 'weekly', priority: 0.5 })
  } catch {}
  try {
    const { data: cities } = await supa.from('cities').select('slug').limit(5000)
    for (const c of cities || []) urls.push({ url: `${BASE}/locations/${c.slug}`, changeFrequency: 'weekly', priority: 0.5 })
  } catch {}
  return urls
}
