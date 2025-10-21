// app/api/scrape/multi/route.ts
import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { adminClient } from '../../../../src/lib/supabaseServer'

export const runtime = 'nodejs'
export const maxDuration = 120 // seconds

// ---------------- Types ----------------
type ModeScope = 'both' | 'practices' | 'clinicians'

type Practice = {
  slug: string
  name: string | null
  website: string
  phone?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  logo_url?: string | null
  description?: string | null
  services?: string | null
  source?: 'crawl' | 'single'
}

type Clinician = {
  practice_slug: string
  slug: string
  name: string
  role?: string | null
  profile_url: string
  photo_url?: string | null
  specialties?: string[] | null
  languages?: string[] | null
  accepting_new_patients?: boolean | null
  booking_url?: string | null
  education_training?: string[] | null
  source_url?: string | null
  last_seen_at?: string | null
}

type CrawlResult = { practices: Practice[]; clinicians: Clinician[] }

// ---------------- Utils ----------------
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 CareContactBot/1.0'

const normUrl = (u: string) => {
  if (!u?.trim()) return ''
  return /^https?:\/\//i.test(u) ? u.trim() : `https://${u.trim()}`
}

const slugify = (s: string) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

const abs = (base: string, maybe?: string | null) => {
  if (!maybe) return undefined
  try {
    return new URL(maybe, base).toString()
  } catch {
    return undefined
  }
}

const cleanTitle = (t?: string | null) =>
  t ? t.replace(/\s+•\s+Community Care Physicians.*$/i, '').trim() : null

const SERVICE_KEYS = [
  'home care','home health','assisted living','memory care','dementia care',
  'skilled nursing','rehab','respite','hospice','caregiver','companionship',
  'elder care','senior care','nursing home'
]

function inferServices(htmlLower: string) {
  const found = SERVICE_KEYS.filter(k => htmlLower.includes(k))
  return found.length ? found.join('|') : null
}

function sparsify<T extends object>(o: T): Partial<T> {
  const x: any = {}
  for (const [k, v] of Object.entries(o)) {
    if (v !== null && v !== undefined && String(v).trim() !== '') x[k] = v
  }
  return x
}

function uniqueBy<T>(arr: T[], keyFn: (t: T) => string) {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of arr) {
    const k = keyFn(item)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(item)
  }
  return out
}

function upgradeWpThumb(url?: string | null) {
  if (!url) return null
  return url.replace(/-\d+x\d+(?=\.(jpg|jpeg|png|webp)$)/i, '')
}

function normalizePhoneText(text: string) {
  const digits = (text || '').replace(/\D/g, '')
  if (!digits) return null
  return digits.replace(/^1?(\d{10})$/, '$1')
}

function pullFirstPhone($: cheerio.CheerioAPI) {
  const tel = $('a[href^="tel:"]').first().attr('href') || ''
  const t1 = normalizePhoneText(tel.replace(/^tel:/, ''))
  if (t1) return t1
  const text = $('body').text().replace(/\s+/g, ' ')
  const m = text.match(/(\+?1[-\s.]*)?\(?\d{3}\)?[-\s.]*\d{3}[-\s.]*\d{4}/)
  return m ? normalizePhoneText(m[0]) : null
}

async function fetchWithTimeout(url: string, timeout = 12000) {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA },
      redirect: 'follow'
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
    return await res.text()
  } finally {
    clearTimeout(id)
  }
}

// ---------- page classifiers ----------
function isPracticeDetailPath(pathname: string) {
  // allow /practices/<slug> and /practices/<slug>/<sub>
  if (!pathname.toLowerCase().startsWith('/practices/')) return false
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length < 2) return false // just /practices
  if (/(about|insurance|billing|financial|privacy|terms|news|blog|careers|contact|doctors?|providers?)$/i.test(parts[parts.length - 1])) {
    return false
  }
  return parts.length <= 3
}

function looksLikePracticePage(url: URL, $: cheerio.CheerioAPI) {
  const body = $('body').text().replace(/\s+/g, ' ')
  const h1 = $('h1').first().text().trim().toLowerCase()
  const hasPhone =
    $('a[href^="tel:"]').length > 0 || /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(body)
  const okTitle = h1 && !/find a (doctor|practice)/.test(h1)
  return isPracticeDetailPath(url.pathname) && (hasPhone || okTitle)
}

// ---------- directory link discovery ----------
function collectPracticeLinksFromDirectory($: cheerio.CheerioAPI, base: string): string[] {
  const out = new Set<string>()
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href') || ''
    let u: URL | null = null
    try { u = new URL(href, base) } catch {}
    if (!u) return
    if (!/^https?:$/.test(u.protocol)) return
    if (!isPracticeDetailPath(u.pathname)) return
    if (u.hash) return
    out.add(u.toString())
  })
  return Array.from(out)
}

// ---------- meta & extraction ----------
function extractMeta($: cheerio.CheerioAPI, baseUrl: string) {
  const title =
    $('meta[property="og:site_name"]').attr('content') ||
    $('meta[property="og:title"]').attr('content') ||
    $('title').first().text() ||
    $('meta[name="title"]').attr('content') ||
    null

  const desc =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    null

  const email =
    $('a[href^="mailto:"]').first().attr('href')?.replace(/^mailto:/i, '').trim() || null

  const logoCandidates = [
    $('meta[property="og:image"]').attr('content'),
    $('link[rel="apple-touch-icon"][sizes="180x180"]').attr('href'),
    $('link[rel="icon"][sizes="192x192"]').attr('href'),
    $('link[rel="icon"][sizes="32x32"]').attr('href'),
    $('link[rel="icon"][sizes="16x16"]').attr('href'),
    $('link[rel="apple-touch-icon"]').attr('href'),
    $('link[rel="icon"]').attr('href')
  ].map((x) => abs(baseUrl, x))
  const logo = logoCandidates.find(Boolean) || null

  // JSON-LD
  let jsonldAddr: any = null
  let jsonldPhone: string | null = null
  let jsonldImage: string | null = null

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).contents().text().trim()
      const j = JSON.parse(raw)
      const entities = Array.isArray(j) ? j : [j]
      for (const e of entities) {
        const addr = e.address || e.location?.address
        if (addr && !jsonldAddr) jsonldAddr = addr
        if (e.telephone && !jsonldPhone) {
          const p = String(e.telephone).replace(/\D/g, '')
          jsonldPhone = p ? p.replace(/^1?(\d{10})$/, '$1') : null
        }
        if ((e.logo || e.image) && !jsonldImage) {
          const i = Array.isArray(e.image) ? e.image[0] : e.image
          jsonldImage = abs(baseUrl, e.logo || i) || null
        }
      }
    } catch {}
  })

  return {
    title: cleanTitle(title),
    description: desc,
    logo: jsonldImage || logo,
    addressBlock: jsonldAddr,
    phone: jsonldPhone,
    email
  }
}

function addrFromLD(addr: any) {
  if (!addr) return {} as { address?: string; city?: string; state?: string; zip?: string }
  const address = [addr.streetAddress, addr.addressLine2].filter(Boolean).join(' ').trim() || undefined
  const city = addr.addressLocality || undefined
  const state = addr.addressRegion || undefined
  const zip = addr.postalCode || undefined
  return { address, city, state, zip }
}

function cleanDescription(s?: string | null) {
  if (!s) return null
  const t = s.replace(/\s+/g, ' ').replace(/Learn more.*$/i, '').trim()
  return t.length > 300 ? t.slice(0, 300) + '…' : t
}

function qualityScore(p: Practice) {
  let score = 0
  if (p.phone) score += 25
  if (p.address && p.city && p.state) score += 35
  if (p.logo_url) score += 10
  if (p.description && p.description.length > 60) score += 15
  return score
}

function pickBestPerSlug(rows: Practice[]) {
  const bySlug = new Map<string, Practice>()
  for (const r of rows) {
    const prev = bySlug.get(r.slug)
    if (!prev || qualityScore(r) > qualityScore(prev)) bySlug.set(r.slug, r)
  }
  return Array.from(bySlug.values())
}

// ---------- clinicians ----------
function extractCliniciansFromPractice(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  practiceSlug: string
): Clinician[] {
  const people: Clinician[] = []

  const pushPerson = (name: string, href: string, photo?: string | null, role?: string | null) => {
    name = (name || '').trim().replace(/\s{2,}/g, ' ')
    if (!name || /find a doctor/i.test(name)) return
    let profile = ''
    try { profile = new URL(href, baseUrl).toString() } catch {}
    if (!profile) return

    let slug = ''
    try {
      const u = new URL(profile)
      const parts = u.pathname.split('/').filter(Boolean)
      slug = (parts[parts.length - 1] || name).toLowerCase().replace(/[^a-z0-9]+/g, '-')
    } catch {
      slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    }

    people.push({
      practice_slug: practiceSlug,
      slug,
      name,
      role: role || null,
      profile_url: profile,
      photo_url: upgradeWpThumb(photo),
      source_url: profile,
      last_seen_at: new Date().toISOString()
    })
  }

  $('a[href]').each((_, el) => {
    const $a = $(el)
    const href = $a.attr('href') || ''
    const t = ($a.text() || '').trim()
    if (!/doctor|provider|physician|md|np|pa|profile/i.test(href + ' ' + t)) return

    const card = $a.closest('article, .card, .provider, .team-member, li, .grid-item, .wp-block-column')
    const name = (card.find('h3,h4,.name').first().text() || t || '').trim()
    const role = (card.find('.role,.title,.specialty,.credentials').first().text() || '').trim() || null

    let photo: string | null = null
    const img = card.find('img').first()
    if (img.length) {
      const src = img.attr('data-src') || img.attr('src') || ''
      if (src) { try { photo = new URL(src, baseUrl).toString() } catch {} }
    }

    pushPerson(name, href, photo, role)
  })

  $('h2,h3').each((_, h) => {
    const txt = $(h).text().trim().toLowerCase()
    if (!/doctor|provider|advanced practice|team/.test(txt)) return
    const block = $(h).nextUntil('h2,h3')
    block.find('a[href]').each((__, a) => {
      const $a = $(a)
      const href = $a.attr('href') || ''
      const text = $a.text().trim()
      if (!text || /find a doctor/i.test(text)) return

      let photo: string | null = null
      const img = $a.find('img').first().length
        ? $a.find('img').first()
        : $a.closest('li,article,.card,.team-member').find('img').first()
      if (img.length) {
        const src = img.attr('data-src') || img.attr('src') || ''
        if (src) { try { photo = new URL(src, baseUrl).toString() } catch {} }
      }
      pushPerson(text, href, photo, null)
    })
  })

  return uniqueBy(people, (p) => `${p.practice_slug}::${p.slug}`)
}

async function enrichClinicianFromProfile(c: Clinician): Promise<Clinician> {
  try {
    const html = await fetchWithTimeout(c.profile_url, 10000)
    const $ = cheerio.load(html)

    const credsText =
      $('.credentials,.provider-credentials,.title,.role').first().text().trim() ||
      $('h1 + .subtitle, h1 + .meta').first().text().trim() ||
      c.role || null

    const spec = new Set<string>()
    $('[class*="specialt"], .specialties, .provider-specialties, li').each((_, el) => {
      const t = $(el).text().trim()
      if (/cardiology|pediatrics|family|internal|gastro|ob.?gyn|dermatology|orthopedic|endocrin|geriatr|primary/i.test(t)) {
        spec.add(t.replace(/\s+/g, ' '))
      }
    })

    const langs = new Set<string>()
    $('[class*="language"], .languages, .provider-languages').each((_, el) => {
      $(el).text().split(/[•,\/]/).forEach((s) => {
        const t = s.trim()
        if (/english|spanish|chinese|mandarin|cantonese|russian|arabic|french|hindi|italian|portuguese|korean|vietnamese/i.test(t)) {
          langs.add(t)
        }
      })
    })

    const accepting = /accepting\s+new\s+patients/i.test($('body').text())

    let booking: string | null = null
    $('a[href]').each((_, a) => {
      const href = $(a).attr('href') || ''
      const txt = $(a).text()
      if (/book|schedule|appointment|request/i.test(href + ' ' + txt)) {
        try { booking = new URL(href, c.profile_url).toString() } catch {}
      }
    })

    const edu: string[] = []
    $('h2,h3').each((_, h) => {
      const head = $(h).text().toLowerCase()
      if (/education|training|residenc|fellowship|board/.test(head)) {
        $(h).nextUntil('h2,h3').find('li,p').each((__, el) => {
          const t = $(el).text().trim()
          if (t && t.length < 500) edu.push(t)
        })
      }
    })

    return {
      ...c,
      role: credsText,
      photo_url: upgradeWpThumb(c.photo_url),
      specialties: Array.from(spec),
      languages: Array.from(langs),
      accepting_new_patients: accepting,
      booking_url: booking,
      education_training: edu.slice(0, 20),
      source_url: c.profile_url,
      last_seen_at: new Date().toISOString()
    }
  } catch {
    return {
      ...c,
      photo_url: upgradeWpThumb(c.photo_url),
      source_url: c.profile_url,
      last_seen_at: new Date().toISOString()
    }
  }
}

// ---------- practice extraction ----------
function extractPractice(practiceUrl: string, $: cheerio.CheerioAPI): Practice {
  const meta = extractMeta($, practiceUrl)
  const slug =
    slugify(new URL(practiceUrl).pathname.split('/').filter(Boolean).slice(-1)[0] || meta.title || practiceUrl)

  const name = cleanTitle(meta.title) || null
  const phone = meta.phone || pullFirstPhone($)
  const { address, city, state, zip } = addrFromLD(meta.addressBlock)
  const desc = cleanDescription(meta.description)
  const services = inferServices($.root().text().toLowerCase())

  return {
    slug,
    name,
    website: practiceUrl,
    phone: phone || null,
    email: meta.email || null,
    address: address || null,
    city: city || null,
    state: state || null,
    zip: zip || null,
    logo_url: meta.logo || null,
    description: desc || null,
    services: services || null,
    source: 'crawl'
  }
}

async function parsePracticePage(practiceUrl: string) {
  const html = await fetchWithTimeout(practiceUrl)
  const $ = cheerio.load(html)
  const u = new URL(practiceUrl)
  if (!looksLikePracticePage(u, $)) {
    return { practice: null as Practice | null, clinicians: [] as Clinician[] }
  }
  const practice = extractPractice(practiceUrl, $)
  const cliniciansRaw = extractCliniciansFromPractice($, practiceUrl, practice.slug)
  const clinicians = await Promise.all(cliniciansRaw.map(enrichClinicianFromProfile))
  return { practice, clinicians }
}

// ---------------- Handler ----------------
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const baseUrl = normUrl(searchParams.get('url') || '')
  const maxPages = Math.max(1, Math.min(100, Number(searchParams.get('maxPages') || 25)))
  const insert = (searchParams.get('insert') || 'false').toLowerCase() === 'true'
  const scope: ModeScope = (searchParams.get('scope') as ModeScope) || 'both'

  if (!baseUrl) return NextResponse.json({ ok: false, error: 'Missing url' }, { status: 400 })

  if (insert) {
    const token = req.headers.get('x-admin-token') || ''
    const expected = (process.env.NEXT_PUBLIC_ADMIN_TOKEN || '').trim()
    if (!expected || token !== expected) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const dirHtml = await fetchWithTimeout(baseUrl)
    const $dir = cheerio.load(dirHtml)
    const practiceLinks = collectPracticeLinksFromDirectory($dir, baseUrl).slice(0, maxPages)

    const results: CrawlResult = { practices: [], clinicians: [] }

    for (const link of practiceLinks) {
      const { practice, clinicians } = await parsePracticePage(link)
      if (practice) {
        if (scope !== 'clinicians') results.practices.push(practice)
        if (scope !== 'practices') results.clinicians.push(...clinicians)
      }
    }

    // de-dupe + choose best by quality
    let practices = pickBestPerSlug(results.practices)
    practices = practices.filter(
      r => !/find a doctor|insurance|financial policy|privacy|terms/i.test(r.name || '')
    )
    results.practices = practices
    results.clinicians = uniqueBy(results.clinicians, (c) => `${c.practice_slug}::${c.slug}`)

    // -------- Non-destructive upserts --------
    if (insert) {
      const supa = adminClient()

      if (scope !== 'clinicians' && results.practices.length) {
        const payload = results.practices.map(p => sparsify({
          slug: p.slug,
          name: p.name,
          website: p.website,
          phone: p.phone,
          email: p.email,
          address: p.address,
          city: p.city,
          state: p.state,
          zip: p.zip,
          logo_url: p.logo_url,
          description: p.description,
          services: p.services,
          updated_at: new Date().toISOString()
        }))
        const { error } = await supa.from('providers').upsert(payload, { onConflict: 'slug' })
        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      }

      if (scope !== 'practices' && results.clinicians.length) {
        const payloadC = results.clinicians.map(c => sparsify({
          practice_slug: c.practice_slug,
          slug: c.slug,
          name: c.name,
          role: c.role,
          profile_url: c.profile_url,
          photo_url: c.photo_url,
          specialties: c.specialties,
          languages: c.languages,
          accepting_new_patients: c.accepting_new_patients,
          booking_url: c.booking_url,
          education_training: c.education_training,
          source_url: c.source_url,
          last_seen_at: c.last_seen_at || new Date().toISOString()
        }))
        const { error: e2 } = await supa.from('clinicians').upsert(payloadC, {
          onConflict: 'practice_slug,slug'
        })
        if (e2) return NextResponse.json({ ok: false, error: e2.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      ok: true,
      data: results,
      meta: {
        mode: 'multi',
        scope,
        counts: {
          practices: results.practices.length,
          clinicians: results.clinicians.length
        },
        timestamp: new Date().toISOString()
      }
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Scrape failed' }, { status: 500 })
  }
}
