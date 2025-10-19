import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { adminClient } from '../../../../src/lib/supabaseServer'

export const runtime = 'nodejs'
export const maxDuration = 60 // Increased for complex scraping

// ============ TYPES & INTERFACES ============
interface ScrapeOut {
  name?: string
  website?: string
  phone?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  services?: string | null
  logo_url?: string | null
  description?: string | null
  social_links?: string[] | null
  hours?: string | null
  confidence_score?: number
  category?: string | null
}

interface ScrapeResult {
  url: string
  title?: string
  description?: string | null
  logo?: string | null
  phones: string[]
  emails: string[]
  addr: Partial<ScrapeOut>
  htmlLower: string
  socialLinks?: string[]
  hours?: string | null
  category?: string | null
}

interface ScrapeConfig {
  mode: 'single' | 'directory' | 'pagination'
  maxPages: number
  maxDepth: number
  followPagination: boolean
  extractFromLinks: boolean
  directorySelectors?: string[]
  paginationSelectors?: string[]
}

// ============ CONFIG & CONSTANTS ============
const DEFAULT_CONFIG: ScrapeConfig = {
  mode: 'single',
  maxPages: 10,
  maxDepth: 2,
  followPagination: true,
  extractFromLinks: true,
  directorySelectors: [
    '.practice-list', '.provider-grid', '.directory', 
    '.results', '.listing', '.card', '.item',
    'a[href*="practice"]', 'a[href*="provider"]',
    'a[href*="location"]', 'a[href*="doctor"]'
  ],
  paginationSelectors: [
    '.pagination', '.pager', '.next', '.load-more',
    'a[rel="next"]', 'a:contains("Next")', 'a:contains("More")',
    '.page-numbers', '.pagination-links'
  ]
}

const SCRAPE_CONFIG = {
  timeout: 15000,
  maxRedirects: 5,
  userAgent: 'Mozilla/5.0 (compatible; BusinessScraper/2.0; +https://github.com/your-repo)',
  delayBetweenRequests: 1000 // Be respectful
} as const

const SERVICE_KEYWORDS = [
  'home care', 'home health', 'assisted living', 'memory care', 'dementia care',
  'skilled nursing', 'rehab', 'respite', 'hospice', 'caregiver', 'companionship',
  'elder care', 'senior care', 'nursing home', 'retirement home'
] as const

const SOCIAL_DOMAINS = [
  'facebook.com', 'twitter.com', 'linkedin.com', 'instagram.com',
  'youtube.com', 'tiktok.com', 'pinterest.com'
] as const

// ============ UTILITY FUNCTIONS ============
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const normUrl = (url: string): string => {
  if (!url?.trim()) return ''
  const cleanUrl = url.trim().toLowerCase()
  return /^https?:\/\//i.test(cleanUrl) ? cleanUrl : `https://${cleanUrl}`
}

const abs = (base: string, maybe?: string | null): string | undefined => {
  if (!maybe) return undefined
  try {
    return new URL(maybe, base).toString()
  } catch {
    return undefined
  }
}

const pick = <T extends object>(obj: T, keys: (keyof T)[]): Partial<T> => {
  const out: Partial<T> = {}
  keys.forEach(k => { 
    if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k] 
  })
  return out
}

const normalizePhone = (phone: string): string => {
  return phone.replace(/\D/g, '').replace(/^1?(\d{10})$/, '$1')
}

const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

const isSameDomain = (baseUrl: string, testUrl: string): boolean => {
  try {
    const baseDomain = new URL(baseUrl).hostname
    const testDomain = new URL(testUrl).hostname
    return baseDomain === testDomain
  } catch {
    return false
  }
}

// ============ CORE SCRAPING FUNCTIONS ============
async function fetchWithTimeout(url: string, timeout: number = SCRAPE_CONFIG.timeout) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': SCRAPE_CONFIG.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return await response.text()
  } finally {
    clearTimeout(timeoutId)
  }
}

function extractPhones($: cheerio.CheerioAPI): string[] {
  const phoneSet = new Set<string>()
  
  // Extract from tel: links
  $('a[href^="tel:"]').each((_, element) => {
    const href = $(element).attr('href') || ''
    const phone = href.replace(/^tel:/, '').trim()
    if (phone) phoneSet.add(normalizePhone(phone))
  })

  // Extract from text content
  const text = $('body').text().replace(/\s+/g, ' ')
  const phonePatterns = [
    /(\+?1[-\s.]*)?\(?\d{3}\)?[-\s.]*\d{3}[-\s.]*\d{4}/g,
    /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g,
  ]

  phonePatterns.forEach(pattern => {
    const matches = text.match(pattern)
    matches?.forEach(phone => phoneSet.add(normalizePhone(phone)))
  })

  return Array.from(phoneSet).slice(0, 5)
}

function extractEmails(html: string): string[] {
  const emailSet = new Set<string>()
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  const matches = html.match(emailRegex)
  
  matches?.forEach(email => {
    if (isValidEmail(email)) {
      emailSet.add(email.toLowerCase())
    }
  })

  return Array.from(emailSet).slice(0, 5)
}

function extractJsonLdData($: cheerio.CheerioAPI): Partial<ScrapeOut> {
  const result: Partial<ScrapeOut> = {}
  
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const rawText = $(element).contents().text().trim()
      const jsonData = JSON.parse(rawText)
      const entities = Array.isArray(jsonData) ? jsonData : [jsonData]

      for (const entity of entities) {
        const address = entity.address || entity.location?.address
        if (address) {
          result.address = [address.streetAddress, address.addressLine2]
            .filter(Boolean).join(' ').trim() || result.address
          result.city = address.addressLocality || result.city
          result.state = address.addressRegion || result.state
          result.zip = address.postalCode || result.zip
        }

        if (!result.phone && entity.telephone) {
          result.phone = normalizePhone(String(entity.telephone))
        }
        if (!result.email && entity.email && isValidEmail(entity.email)) {
          result.email = String(entity.email).toLowerCase()
        }

        if (!result.hours && entity.openingHours) {
          result.hours = Array.isArray(entity.openingHours) 
            ? entity.openingHours.join(', ')
            : String(entity.openingHours)
        }
      }
    } catch (error) {
      // Silent fail for invalid JSON
    }
  })

  return result
}

function extractSocialLinks($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const socialLinks = new Set<string>()
  
  $('a[href]').each((_, element) => {
    const href = $(element).attr('href')
    if (!href) return

    try {
      const url = new URL(href, baseUrl)
      SOCIAL_DOMAINS.forEach(domain => {
        if (url.hostname.includes(domain)) {
          socialLinks.add(url.toString())
        }
      })
    } catch {
      // Invalid URL, skip
    }
  })

  return Array.from(socialLinks)
}

function extractMetaData($: cheerio.CheerioAPI, baseUrl: string) {
  const title = (
    $('meta[property="og:site_name"]').attr('content') ||
    $('meta[property="og:title"]').attr('content') ||
    $('title').first().text() ||
    $('meta[name="title"]').attr('content')
  )?.trim()

  const description = (
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content')
  )?.trim() || null

  const logoSources = [
    $('meta[property="og:logo"]').attr('content'),
    $('link[rel="apple-touch-icon"][sizes="180x180"]').attr('href'),
    $('link[rel="icon"][sizes="32x32"]').attr('href'),
    $('link[rel="icon"][sizes="16x16"]').attr('href'),
    $('link[rel="apple-touch-icon"]').attr('href'),
    $('link[rel="icon"]').attr('href'),
    '/favicon.ico'
  ]

  const logo = logoSources.map(src => abs(baseUrl, src)).find(Boolean)

  return { title, description, logo }
}

function extractHours($: cheerio.CheerioAPI): string | null {
  const hoursSelectors = [
    '[class*="hours"]', '[class*="time"]', '[id*="hours"]', '[id*="time"]',
    '.business-hours', '.opening-hours', '.hours-of-operation'
  ]

  for (const selector of hoursSelectors) {
    const hoursText = $(selector).first().text().trim()
    if (hoursText && hoursText.length < 500) {
      return hoursText.replace(/\s+/g, ' ').substring(0, 200)
    }
  }

  return null
}

function extractDirectoryLinks($: cheerio.CheerioAPI, baseUrl: string, selectors: string[]): string[] {
  const links = new Set<string>()
  
  selectors.forEach(selector => {
    $(selector).each((_, element) => {
      const href = $(element).attr('href')
      if (href) {
        const absoluteUrl = abs(baseUrl, href)
        if (absoluteUrl && isSameDomain(baseUrl, absoluteUrl)) {
          links.add(absoluteUrl)
        }
      }
    })
  })

  return Array.from(links)
}

function extractPaginationLinks($: cheerio.CheerioAPI, baseUrl: string, selectors: string[]): string[] {
  const nextPages = new Set<string>()
  
  selectors.forEach(selector => {
    $(selector).each((_, element) => {
      const href = $(element).attr('href')
      if (href) {
        const absoluteUrl = abs(baseUrl, href)
        if (absoluteUrl && isSameDomain(baseUrl, absoluteUrl)) {
          nextPages.add(absoluteUrl)
        }
      }
    })
  })

  return Array.from(nextPages)
}

function extractProviderCards($: cheerio.CheerioAPI, baseUrl: string): Array<Partial<ScrapeOut>> {
  const providers: Array<Partial<ScrapeOut>> = []
  
  // Common card/directory item selectors
  const cardSelectors = [
    '.card', '.listing', '.item', '.provider', '.practice',
    '.location', '.result', '.entry', '.post'
  ]

  cardSelectors.forEach(selector => {
    $(selector).each((_, element) => {
      const $card = $(element)
      const provider: Partial<ScrapeOut> = {}
      
      // Extract name from common patterns
      provider.name = (
        $card.find('h1, h2, h3, h4').first().text() ||
        $card.find('[class*="name"], [class*="title"]').first().text()
      )?.trim()

      // Extract phone
      const phoneText = $card.text()
      const phoneMatches = phoneText.match(/(\+?1[-\s.]*)?\(?\d{3}\)?[-\s.]*\d{3}[-\s.]*\d{4}/)
      if (phoneMatches) {
        provider.phone = normalizePhone(phoneMatches[0])
      }

      // Extract address information
      const addressText = $card.find('[class*="address"], [class*="location"]').text()
      if (addressText) {
        provider.address = addressText.replace(/\s+/g, ' ').trim().substring(0, 200)
      }

      if (provider.name && (provider.phone || provider.address)) {
        providers.push(provider)
      }
    })
  })

  return providers
}

// ============ ADVANCED SCRAPING MODES ============
async function scrapePage(url: string): Promise<ScrapeResult> {
  try {
    await sleep(SCRAPE_CONFIG.delayBetweenRequests)
    const html = await fetchWithTimeout(url)
    const $ = cheerio.load(html)

    const { title, description, logo } = extractMetaData($, url)
    const phones = extractPhones($)
    const emails = extractEmails(html)
    const addr = extractJsonLdData($)
    const socialLinks = extractSocialLinks($, url)
    const hours = extractHours($)

    return {
      url,
      title,
      description,
      logo,
      phones,
      emails,
      addr,
      socialLinks,
      hours,
      htmlLower: html.toLowerCase()
    }
  } catch (error) {
    console.error(`Failed to scrape ${url}:`, error)
    throw error
  }
}

async function scrapeWithPagination(startUrl: string, maxPages: number = 5): Promise<ScrapeResult[]> {
  const results: ScrapeResult[] = []
  const visited = new Set<string>()
  let currentUrl: string | null = startUrl
  let pageCount = 0

  while (currentUrl && pageCount < maxPages && !visited.has(currentUrl)) {
    try {
      console.log(`Scraping pagination page ${pageCount + 1}: ${currentUrl}`)
      const result = await scrapePage(currentUrl)
      results.push(result)
      visited.add(currentUrl)
      pageCount++

      // Find next page
      const $ = cheerio.load(await fetchWithTimeout(currentUrl))
      const nextPages = extractPaginationLinks($, currentUrl, DEFAULT_CONFIG.paginationSelectors!)
      
      currentUrl = nextPages.find(url => !visited.has(url)) || null
      
      if (currentUrl) {
        await sleep(SCRAPE_CONFIG.delayBetweenRequests)
      }
    } catch (error) {
      console.error(`Failed to scrape pagination page ${currentUrl}:`, error)
      currentUrl = null
    }
  }

  return results
}

async function scrapeDirectory(startUrl: string, maxDepth: number = 2): Promise<ScrapeOut[]> {
  const allProviders: ScrapeOut[] = []
  const queue: { url: string; depth: number }[] = [{ url: startUrl, depth: 0 }]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const { url, depth } = queue.shift()!
    
    if (visited.has(url) || depth > maxDepth) continue
    
    visited.add(url)
    console.log(`Scraping directory at depth ${depth}: ${url}`)

    try {
      await sleep(SCRAPE_CONFIG.delayBetweenRequests)
      const html = await fetchWithTimeout(url)
      const $ = cheerio.load(html)

      // Extract provider cards from this page
      const cardProviders = extractProviderCards($, url)
      cardProviders.forEach(provider => {
        if (provider.name) {
          allProviders.push({
            ...provider,
            website: url,
            confidence_score: calculateConfidence(provider)
          } as ScrapeOut)
        }
      })

      // Follow directory links for next level
      if (depth < maxDepth) {
        const directoryLinks = extractDirectoryLinks($, url, DEFAULT_CONFIG.directorySelectors!)
        directoryLinks.forEach(link => {
          if (!visited.has(link)) {
            queue.push({ url: link, depth: depth + 1 })
          }
        })

        // Also follow pagination at same depth
        const paginationLinks = extractPaginationLinks($, url, DEFAULT_CONFIG.paginationSelectors!)
        paginationLinks.forEach(link => {
          if (!visited.has(link)) {
            queue.push({ url: link, depth }) // Same depth for pagination
          }
        })
      }
    } catch (error) {
      console.error(`Failed to scrape directory page ${url}:`, error)
    }
  }

  return allProviders
}

// ============ ENHANCED MAIN SCRAPING LOGIC ============
function calculateServices(htmlLower: string): string | null {
  const foundServices = SERVICE_KEYWORDS.filter(keyword => 
    htmlLower.includes(keyword)
  )
  return foundServices.length > 0 ? foundServices.join('|') : null
}

function calculateConfidence(data: Partial<ScrapeOut>): number {
  let score = 0
  if (data.name) score += 20
  if (data.phone) score += 20
  if (data.email) score += 15
  if (data.address) score += 15
  if (data.services) score += 10
  if (data.logo_url) score += 10
  if (data.description) score += 10
  return Math.min(score, 100)
}

async function scrapeWebsite(website: string, config: Partial<ScrapeConfig> = {}): Promise<ScrapeOut | ScrapeOut[]> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config }
  
  if (fullConfig.mode === 'directory') {
    return await scrapeDirectory(website, fullConfig.maxDepth)
  }

  // Single or pagination mode
  let results: ScrapeResult[]
  
  if (fullConfig.followPagination) {
    results = await scrapeWithPagination(website, fullConfig.maxPages)
  } else {
    results = [await scrapePage(website)]
  }

  // Merge data from all pages
  const allHtml = results.map(r => r.htmlLower).join(' ')
  const primaryResult = results[0]

  const merged: ScrapeOut = {
    name: primaryResult.title || new URL(website).hostname.replace(/^www\./, ''),
    website,
    phone: results.find(r => r.phones.length)?.phones[0] || primaryResult.addr.phone || null,
    email: results.find(r => r.emails.length)?.emails[0] || primaryResult.addr.email || null,
    address: results.find(r => r.addr.address)?.addr.address || null,
    city: results.find(r => r.addr.city)?.addr.city || null,
    state: results.find(r => r.addr.state)?.addr.state || null,
    zip: results.find(r => r.addr.zip)?.addr.zip || null,
    services: calculateServices(allHtml),
    logo_url: primaryResult.logo || null,
    description: primaryResult.description || null,
    social_links: results.flatMap(r => r.socialLinks || []).slice(0, 10) || null,
    hours: results.find(r => r.hours)?.hours || primaryResult.addr.hours || null,
    confidence_score: 0
  }

  merged.confidence_score = calculateConfidence(merged)
  return merged
}

// ============ ROBOTS.TXT CHECK ============
async function checkRobotsTxt(website: string): Promise<boolean> {
  try {
    const robotsUrl = new URL('/robots.txt', website).toString()
    const robotsText = await fetchWithTimeout(robotsUrl, 5000)
    
    const blocksAll = /^\s*User-agent:\s*\*\s*[^]*?Disallow:\s*\/\s*$/im.test(robotsText)
    return !blocksAll
  } catch {
    return true // If we can't fetch robots.txt, assume it's allowed
  }
}

// ============ API HANDLER ============
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const websiteParam = searchParams.get('url')
  const insert = searchParams.get('insert')?.toLowerCase() === 'true'
  const token = req.headers.get('x-admin-token') || ''
  const mode = searchParams.get('mode') as 'single' | 'directory' | 'pagination' || 'single'
  const maxPages = parseInt(searchParams.get('maxPages') || '10')
  const maxDepth = parseInt(searchParams.get('maxDepth') || '2')

  if (!websiteParam) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  const website = normUrl(websiteParam)

  try {
    // Validate URL
    new URL(website)

    // Check robots.txt
    const isAllowed = await checkRobotsTxt(website)
    if (!isAllowed) {
      return NextResponse.json({ error: 'Blocked by robots.txt' }, { status: 451 })
    }

    const config: Partial<ScrapeConfig> = {
      mode,
      maxPages,
      maxDepth,
      followPagination: mode !== 'single'
    }

    const scrapedData = await scrapeWebsite(website, config)

    // Handle directory mode (returns array)
    if (mode === 'directory') {
      const providers = scrapedData as ScrapeOut[]
      
      if (!insert) {
        return NextResponse.json({ 
          ok: true, 
          data: providers,
          meta: {
            count: providers.length,
            mode: 'directory',
            timestamp: new Date().toISOString()
          }
        })
      }

      // Bulk insert for directory mode
      const expectedToken = (process.env.NEXT_PUBLIC_ADMIN_TOKEN || '').trim()
      if (!expectedToken || token !== expectedToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const supa = adminClient()
      const { error } = await supa.from('providers').insert(
        providers.map(provider => pick(provider, [
          'name', 'website', 'phone', 'email', 'address', 'city', 
          'state', 'zip', 'services', 'logo_url', 'description',
          'social_links', 'hours'
        ]))
      )

      if (error) {
        console.error('Database insert error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ 
        ok: true, 
        saved: true, 
        data: providers,
        meta: {
          count: providers.length,
          mode: 'directory',
          timestamp: new Date().toISOString()
        }
      })
    }

    // Single provider mode (existing logic)
    const singleData = scrapedData as ScrapeOut

    if (!insert) {
      return NextResponse.json({ 
        ok: true, 
        data: singleData,
        meta: {
          confidence: singleData.confidence_score,
          mode: 'single',
          timestamp: new Date().toISOString()
        }
      })
    }

    // Single insert
    const expectedToken = (process.env.NEXT_PUBLIC_ADMIN_TOKEN || '').trim()
    if (!expectedToken || token !== expectedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supa = adminClient()
    const { error } = await supa.from('providers').insert(
      pick(singleData, [
        'name', 'website', 'phone', 'email', 'address', 'city', 
        'state', 'zip', 'services', 'logo_url', 'description',
        'social_links', 'hours'
      ])
    )

    if (error) {
      console.error('Database insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ 
      ok: true, 
      saved: true, 
      data: singleData,
      meta: {
        confidence: singleData.confidence_score,
        mode: 'single',
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('Scraping error:', error)
    
    if (error instanceof TypeError && error.message.includes('Invalid URL')) {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
    }

    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Scraping failed' 
    }, { status: 500 })
  }
}