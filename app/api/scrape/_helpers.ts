// app/api/scrape/_helpers.ts
import * as cheerio from 'cheerio'

/** Basic fetch with timeout */
export async function fetchWithTimeout(url: string, timeout = 12000): Promise<string> {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; CCD-Scraper/1.0; +https://carecontactdirectory.com)'
      }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
    return await res.text()
  } finally {
    clearTimeout(id)
  }
}

export function abs(base: string, maybe?: string | null) {
  if (!maybe) return undefined
  try { return new URL(maybe, base).toString() } catch { return undefined }
}

export function normalizeSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export function normalizePhone(raw?: string | null) {
  if (!raw) return null
  const d = raw.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) return d.slice(1)
  if (d.length === 10) return d
  return null
}

/** Heuristic: is a practice details page? */
export function isPracticePage(url: URL, $: cheerio.CheerioAPI): boolean {
  const p = url.pathname.toLowerCase()

  const looksLikePracticePath =
    p.startsWith('/practices/') &&
    p.split('/').filter(Boolean).length >= 2 &&
    !/\/(about|insurance|billing|financial|privacy|terms|news|blog|careers|contact|doctors?|providers?)\/?$/.test(p)

  const body = $('body').text().replace(/\s+/g, ' ')
  const hasPhone =
    $('a[href^="tel:"]').length > 0 || /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(body)

  const hasAddress =
    $('[itemtype*="PostalAddress"]').length > 0 ||
    /\b[A-Z][a-zA-Z]+,\s?[A-Z]{2},?\s?\d{5}(?:-\d{4})?\b/.test(body)

  const h1 = $('h1').first().text().trim().toLowerCase()
  const hasReasonableTitle = h1.length >= 4 && !/find a (doctor|practice)/.test(h1)

  return looksLikePracticePath && (hasPhone || hasAddress || hasReasonableTitle)
}

/** Directory page? (contains many practice links) */
export function isDirectoryPage(url: URL, $: cheerio.CheerioAPI) {
  const p = url.pathname.toLowerCase()
  const manyPracticeLinks =
    $('a[href*="/practices/"]')
      .filter((_, a) => (a.attribs?.href || '').split('/').filter(Boolean).length >= 2)
      .length >= 8
  return p.includes('/practices') && manyPracticeLinks
}

export function extractLogo($: cheerio.CheerioAPI, base: string) {
  const cands = [
    $('meta[property="og:image"]').attr('content'),
    $('link[rel="apple-touch-icon"][sizes="180x180"]').attr('href'),
    $('link[rel="icon"][sizes="192x192"]').attr('href'),
    $('link[rel="icon"][sizes="32x32"]').attr('href'),
    $('link[rel="icon"]').attr('href')
  ].filter(Boolean) as string[]

  for (const href of cands) {
    const u = abs(base, href)
    if (u) return u
  }
  const hero = $('header img[src], .site-branding img[src], .hero img[src]')
    .first()
    .attr('src')
  return abs(base, hero || undefined) || null
}

export function extractAddressPhoneEmail($: cheerio.CheerioAPI) {
  const out: any = {}

  // Prefer JSON-LD
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).contents().text())
      const arr = Array.isArray(data) ? data : [data]
      for (const n of arr) {
        const a = n?.address || n?.location?.address
        if (a) {
          out.address =
            [a.streetAddress, a.addressLine2].filter(Boolean).join(' ') || out.address
          out.city = a.addressLocality || out.city
          out.state = a.addressRegion || out.state
          out.zip = a.postalCode || out.zip
        }
        if (!out.phone && n.telephone) out.phone = normalizePhone(String(n.telephone))
        if (!out.email && n.email) out.email = String(n.email).toLowerCase()
      }
    } catch {}
  })

  // Light fallback
  const text = $('body').text().replace(/\s+/g, ' ')
  if (!out.phone) {
    const m = text.match(/\(?\d{3}\)?[.\-\s]?\d{3}[.\-\s]?\d{4}/)
    if (m) out.phone = normalizePhone(m[0])
  }
  if (!out.city || !out.state) {
    const m = text.match(
      /\b([A-Z][a-zA-Z]+),\s?([A-Z]{2}),?\s?\d{5}(?:-\d{4})?\b/
    )
    if (m) {
      out.city = out.city || m[1]
      out.state = out.state || m[2]
    }
  }
  return out
}

export function cleanDescription(s?: string | null) {
  if (!s) return null
  const t = s.replace(/\s+/g, ' ').replace(/Learn more.*$/i, '').trim()
  return t.length > 300 ? t.slice(0, 300) + '…' : t
}

export function inferServices(htmlLower: string) {
  const keys = [
    'home care',
    'home health',
    'assisted living',
    'memory care',
    'dementia care',
    'skilled nursing',
    'rehab',
    'respite',
    'hospice',
    'caregiver',
    'companionship',
    'elder care',
    'senior care',
    'nursing home'
  ]
  const found = keys.filter(k => htmlLower.includes(k))
  return found.length ? found.join('|') : null
}

export function qualityScore(p: {
  address?: string | null
  city?: string | null
  state?: string | null
  phone?: string | null
  description?: string | null
  logo_url?: string | null
}) {
  let score = 0
  if (p.phone) score += 25
  if (p.address && p.city && p.state) score += 35
  if (p.logo_url) score += 10
  if (p.description && p.description.length > 60) score += 15
  return score
}

export function pickBestPerSlug(rows: any[]) {
  const bySlug = new Map<string, any>()
  for (const r of rows) {
    const slug =
      r.slug ||
      normalizeSlug(r.name || new URL(r.website).pathname || String(Math.random()))
    r.slug = slug
    const prev = bySlug.get(slug)
    if (!prev || qualityScore(r) > qualityScore(prev)) bySlug.set(slug, r)
  }
  return Array.from(bySlug.values())
}

/** Remove null/empty so we don’t overwrite good DB fields with blanks */
export function sparsify<T extends object>(o: T): Partial<T> {
  const x: any = {}
  for (const [k, v] of Object.entries(o)) {
    if (v !== null && v !== undefined && String(v).trim() !== '') x[k] = v
  }
  return x
}
