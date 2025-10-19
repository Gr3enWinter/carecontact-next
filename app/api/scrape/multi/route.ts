import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { adminClient } from '../../../../src/lib/supabaseServer'

export const runtime = 'nodejs'
export const maxDuration = 60

/* ---------- utils ---------- */
const norm = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`)
const abs  = (base: string, href?: string | null) => { try { return href ? new URL(href, base).toString() : undefined } catch { return } }
const canonical = (s?: string) => s?.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || undefined
async function fetchHtml(url: string) {
  const r = await fetch(url, { redirect: 'follow' })
  if (!r.ok) throw new Error(`GET ${r.status} ${url}`)
  return r.text()
}
function lastSeg(url: string) { try { const u = new URL(url); const p=u.pathname.split('/').filter(Boolean); return p[p.length-1] } catch { return '' } }

/* ---------- classify pages ---------- */
function isPracticeUrl(u: string) { return /\/practices\/[a-z0-9-]+\/?$/i.test(new URL(u).pathname) }
function isLikelyDirectory(u: string) { return /\/practices\/?$/i.test(new URL(u).pathname) }

/* ---------- scrape practice detail (your existing logic + small tidy) ---------- */
async function scrapePractice(url: string) {
  const html = await fetchHtml(url)
  const $ = cheerio.load(html)

  const title =
    $('meta[property="og:title"]').attr('content')?.trim()
    || $('h1').first().text().trim()
    || $('title').first().text().trim()
    || new URL(url).hostname.replace(/^www\./,'')

  const desc =
    $('meta[name="description"]').attr('content')?.trim()
    || $('meta[property="og:description"]').attr('content')?.trim()
    || null

  const phone = $('a[href^="tel:"]').first().attr('href')?.replace(/^tel:/,'').trim()
    ?? ($('body').text().match(/(\+?1[-\s.]*)?\(?\d{3}\)?[-\s.]*\d{3}[-\s.]*\d{4}/)?.[0] ?? null)

  const email = $('a[href^="mailto:"]').first().attr('href')?.replace(/^mailto:/,'').trim()
    ?? (html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null)

  let address: string | null = null, city: string | null = null, state: string | null = null, zip: string | null = null
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const j = JSON.parse($(el).contents().text())
      const arr = Array.isArray(j) ? j : [j]
      for (const n of arr) {
        const a = n?.address || n?.location?.address
        if (a) {
          address = address || [a.streetAddress, a.address2].filter(Boolean).join(' ') || null
          city    = city    || a.addressLocality || null
          state   = state   || a.addressRegion   || null
          zip     = zip     || a.postalCode      || null
        }
      }
    } catch {}
  })
  if (!address) {
    const t = $('address').first().text().trim() || $('[class*="address"],[id*="address"]').first().text().trim()
    if (t) address = t.replace(/\s+/g, ' ')
  }

  // logo
  const logo =
    $('meta[property="og:logo"]').attr('content')
    || $('link[rel="apple-touch-icon"][sizes]').attr('href')
    || $('link[rel="apple-touch-icon"]').attr('href')
    || $('link[rel="icon"][sizes]').attr('href')
    || $('link[rel="icon"]').attr('href')
    || '/favicon.ico'

  const practice = {
    slug: canonical(lastSeg(url)) || canonical(title) || canonical(url),
    name: title,
    website: url,
    phone: phone || null,
    email: email || null,
    address, city, state, zip,
    services: null,
    logo_url: abs(url, logo) || null,
    description: desc
  }

  const clinicians = extractClinicians(url, $)
  return { practice, clinicians }
}

/* ---------- extract roster from a practice page ---------- */
function extractClinicians(baseUrl: string, $: cheerio.CheerioAPI) {
  const out: Array<{
    slug: string
    name: string
    credentials?: string | null
    specialty?: string | null
    title?: string | null
    phone?: string | null
    email?: string | null
    profile_url?: string | null
    photo_url?: string | null
  }> = []

  // strategy A: card-like items
  $('.providers, .doctors, .team, .staff, [class*="provider"], [class*="doctor"]')
    .find('a, .card, .member, .item, li')
    .each((_, el) => {
      const node = $(el)
      // try to find a clickable profile first
      const a = node.is('a') ? node : node.find('a[href]').first()
      const href = a.attr('href') || undefined
      const profile = abs(baseUrl, href)

      // name: prefer things next to images/captions/headings
      const name =
        node.find('h3, h4, .name, .provider-name, .doctor-name').first().text().trim()
        || a.text().trim()
        || ''

      if (!name || name.length < 2) return

      const creds =
        node.find('.credentials, .cred').first().text().trim()
        || name.match(/\b(MD|DO|PhD|PA-?C|NP|FNP-?C|ANP-?C|RN|DNP|CNM|DC)\b/ig)?.join(', ') || null

      const photoRel =
        node.find('img').attr('src')
        || node.find('img').attr('data-src')
      const photo = photoRel ? abs(baseUrl, photoRel) : undefined

      const phone =
        node.find('a[href^="tel:"]').first().attr('href')?.replace(/^tel:/,'').trim()
        || null

      const email =
        node.find('a[href^="mailto:"]').first().attr('href')?.replace(/^mailto:/,'').trim()
        || null

      out.push({
        slug: canonical(name)!, name,
        credentials: creds || null,
        specialty: null,
        title: null,
        phone, email,
        profile_url: profile || null,
        photo_url: photo || null
      })
    })

  // Dedup by slug (some sites repeat a second time in mobile markup)
  const seen = new Set<string>()
  return out.filter(p => {
    if (seen.has(p.slug)) return false
    seen.add(p.slug)
    return true
  })
}

/* ---------- discover practice links and follow pagination ---------- */
async function collectPracticeLinks(startUrl: string, maxPages: number) {
  const seen = new Set<string>()
  let url = startUrl
  let pages = 0

  async function collectFrom(u: string) {
    const html = await fetchHtml(u)
    const $ = cheerio.load(html)

    // collect strict /practices/<slug>/ links (relative or absolute)
    $('a[href]').each((_, a) => {
      const href = ($(a).attr('href') || '').trim()
      const full = abs(u, href)
      if (!full) return
      try {
        const path = new URL(full).pathname
        if (/^\/practices\/[a-z0-9-]+\/?$/i.test(path)) seen.add(full)
      } catch {}
    })

    // try pagination
    const nextHref =
      $('link[rel="next"]').attr('href')
      || $('a[rel="next"]').attr('href')
      || $('a:contains("Next")').attr('href')
      || $('a:contains("›")').attr('href')
      || $('a:contains(">")').attr('href')

    const nextUrl = abs(u, nextHref)
    return nextUrl
  }

  if (isPracticeUrl(url)) {
    // single practice only
    seen.add(url)
  } else {
    // directory + pagination
    while (pages < maxPages && url) {
      const next = await collectFrom(url)
      pages++
      if (next && isLikelyDirectory(next)) url = next
      else break
    }
  }

  return Array.from(seen)
}

/* ---------- API ---------- */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const start = norm(searchParams.get('url') || '')
  const insert = (searchParams.get('insert') || 'false').toLowerCase() === 'true'
  const token  = req.headers.get('x-admin-token') || ''
  const maxPages = Math.max(1, Math.min(50, parseInt(searchParams.get('maxPages') || '10', 10)))

  if (!start) return NextResponse.json({ ok:false, error:'Missing url' }, { status: 400 })

  // discover practice URLs covering directory+pagination+single
  const practiceUrls = await collectPracticeLinks(start, maxPages)

  const practices: any[] = []
  const clinicians: any[] = []

  for (const u of practiceUrls) {
    try {
      const { practice, clinicians: roster } = await scrapePractice(u)
      practices.push(practice)
      roster.forEach(p => clinicians.push({ ...p, practice_slug: practice.slug }))
    } catch (e) {
      // ignore one-off failures
    }
  }

  // optional save
  if (insert && practices.length) {
    const expected = (process.env.NEXT_PUBLIC_ADMIN_TOKEN || '').trim()
    if (!expected || token !== expected) {
      return NextResponse.json({ ok:false, error:'Unauthorized' }, { status: 401 })
    }
    const supa = adminClient()

    // upsert practices (existing providers table, unique slug)
    const { error: pErr } = await supa.from('providers')
      .upsert(practices, { onConflict: 'slug', ignoreDuplicates: false })
    if (pErr) return NextResponse.json({ ok:false, error:pErr.message }, { status: 500 })

    // upsert clinicians per (practice_slug, slug)
    if (clinicians.length) {
      const { error: cErr } = await supa.from('clinicians')
        .upsert(clinicians, { onConflict: 'practice_slug,slug', ignoreDuplicates: false })
      if (cErr) return NextResponse.json({ ok:false, error:cErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({
    ok: true,
    data: { practices, clinicians },
    meta: {
      start,
      discovered: practiceUrls.length,
      practices: practices.length,
      clinicians: clinicians.length,
      timestamp: new Date().toISOString()
    }
  })
}
