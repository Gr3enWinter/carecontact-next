'use client'

import { useState } from 'react'

type Mode = 'single' | 'directory' | 'pagination'
type ScrapePick = 'both' | 'practices' | 'clinicians'

interface ScrapeConfig {
  url: string
  mode: Mode
  maxPages: number
  maxDepth: number
  insert: boolean
  token: string
  scrape: ScrapePick
}

interface Meta {
  mode?: Mode
  scrape?: ScrapePick
  practices?: number
  clinicians?: number
  confidence?: number
  timestamp?: string
}

interface OkPayload {
  ok: true
  saved?: boolean
  data?: any
  meta?: Meta
}

interface ErrPayload {
  ok: false
  error: string
}

type ApiResult = OkPayload | ErrPayload

export default function ScrapeAdmin() {
  const [config, setConfig] = useState<ScrapeConfig>({
    url: '',
    mode: 'directory',
    maxPages: 10,
    maxDepth: 2,
    insert: false,
    token: '',
    scrape: 'both',
  })

  const [result, setResult] = useState<ApiResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<ScrapeConfig[]>([])

  async function handleScrape() {
    if (!config.url) { alert('Please enter a URL'); return }

    setLoading(true)
    setResult(null)

    try {
      const params = new URLSearchParams({
        url: config.url,
        mode: config.mode,
        maxPages: String(config.maxPages),
        maxDepth: String(config.maxDepth),
        insert: String(config.insert),
        scrape: config.scrape,
      })

      const resp = await fetch(`/api/scrape/multi?${params.toString()}`, {
        headers: config.insert ? { 'x-admin-token': config.token } : undefined,
      })

      const ct = resp.headers.get('content-type') || ''
      if (!ct.includes('application/json')) {
        const txt = await resp.text()
        setResult({ ok: false, error: `Non-JSON response (${resp.status}). First bytes: ${txt.slice(0,120)}` })
        return
      }

      const data: ApiResult = await resp.json()
      setResult(data)

      if (data.ok) {
        setHistory(prev => [config, ...prev.slice(0, 9)]) // keep last 10
      }
    } catch (err: any) {
      setResult({ ok: false, error: err?.message || 'Unknown error' })
    } finally {
      setLoading(false)
    }
  }

  const presetExamples = [
    {
      name: 'Single Provider',
      config: {
        url: 'https://example-senior-care.com',
        mode: 'single' as Mode,
        maxPages: 1,
        maxDepth: 1,
        insert: false,
        token: '',
        scrape: 'both' as ScrapePick,
      }
    },
    {
      name: 'Provider Directory',
      config: {
        url: 'https://communitycare.com/practices/',
        mode: 'directory' as Mode,
        maxPages: 5,
        maxDepth: 2,
        insert: false,
        token: '',
        scrape: 'both' as ScrapePick,
      }
    },
    {
      name: 'Paginated List',
      config: {
        url: 'https://homehealth-agencies.com/list',
        mode: 'pagination' as Mode,
        maxPages: 3,
        maxDepth: 1,
        insert: false,
        token: '',
        scrape: 'both' as ScrapePick,
      }
    }
  ]

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Website Scraper Admin</h1>
          <p className="text-gray-600 mt-2">Extract practices and clinicians from websites. Choose preview or save to database.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Scraping Configuration</h2>

              {/* URL */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Website URL *</label>
                <input
                  type="url"
                  value={config.url}
                  onChange={(e) => setConfig(p => ({ ...p, url: e.target.value }))}
                  placeholder="https://example.com/practices/"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Mode */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Scraping Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'single', label: 'Single Page', desc: 'One website' },
                    { value: 'directory', label: 'Directory', desc: 'Multiple providers' },
                    { value: 'pagination', label: 'Pagination', desc: 'Multi-page lists' },
                  ].map(m => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setConfig(p => ({ ...p, mode: m.value as Mode }))}
                      className={`p-3 border rounded-md text-left ${
                        config.mode === m.value ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="font-medium">{m.label}</div>
                      <div className="text-sm text-gray-500">{m.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* What to scrape */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">What to scrape</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['both','practices','clinicians'] as ScrapePick[]).map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setConfig(p => ({ ...p, scrape: v }))}
                      className={`p-3 border rounded-md capitalize ${
                        config.scrape === v ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Advanced numbers */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Max Pages</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={config.maxPages}
                    onChange={(e) => setConfig(p => ({ ...p, maxPages: parseInt(e.target.value) || 1 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Max Depth</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={config.maxDepth}
                    onChange={(e) => setConfig(p => ({ ...p, maxDepth: parseInt(e.target.value) || 1 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Save / token */}
              <div className="mb-6">
                <div className="flex items-center mb-4">
                  <input
                    id="insert"
                    type="checkbox"
                    checked={config.insert}
                    onChange={(e) => setConfig(p => ({ ...p, insert: e.target.checked }))}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="insert" className="ml-2 block text-sm text-gray-900">Save to database</label>
                </div>

                {config.insert && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Admin Token *</label>
                    <input
                      type="password"
                      value={config.token}
                      onChange={(e) => setConfig(p => ({ ...p, token: e.target.value }))}
                      placeholder="Enter NEXT_PUBLIC_ADMIN_TOKEN"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleScrape}
                  disabled={loading || !config.url}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Scraping…' : 'Start Scraping'}
                </button>

                <button
                  onClick={() =>
                    setConfig({
                      url: '',
                      mode: 'directory',
                      maxPages: 10,
                      maxDepth: 2,
                      insert: false,
                      token: '',
                      scrape: 'both',
                    })
                  }
                  className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Results */}
            {result && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">
                  {result.ok ? 'Results' : 'Scraping Error'}
                </h2>

                {!result.ok ? (
                  <div className="bg-red-50 border border-red-200 rounded-md p-4">
                    <div className="text-red-800 font-medium">Error</div>
                    <div className="text-red-600 mt-1">{result.error}</div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {result.saved && (
                      <div className="bg-green-50 border border-green-200 rounded-md p-4">
                        <div className="text-green-800 font-medium">Saved to database</div>
                      </div>
                    )}

                    <div className="border border-gray-200 rounded-md">
                      <pre className="p-4 overflow-auto max-h-96 text-sm">
                        {JSON.stringify(result.data ?? { meta: result.meta }, null, 2)}
                      </pre>
                    </div>

                    {result.meta && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="bg-gray-50 p-3 rounded">
                          <div className="text-gray-500">Mode</div>
                          <div className="font-medium capitalize">{result.meta.mode}</div>
                        </div>
                        <div className="bg-gray-50 p-3 rounded">
                          <div className="text-gray-500">Scrape</div>
                          <div className="font-medium capitalize">{result.meta.scrape}</div>
                        </div>
                        {'practices' in result.meta && (
                          <div className="bg-gray-50 p-3 rounded">
                            <div className="text-gray-500">Practices</div>
                            <div className="font-medium">{result.meta.practices}</div>
                          </div>
                        )}
                        {'clinicians' in result.meta && (
                          <div className="bg-gray-50 p-3 rounded">
                            <div className="text-gray-500">Clinicians</div>
                            <div className="font-medium">{result.meta.clinicians}</div>
                          </div>
                        )}
                        <div className="bg-gray-50 p-3 rounded">
                          <div className="text-gray-500">Time</div>
                          <div className="font-medium">{result.meta.timestamp ? new Date(result.meta.timestamp).toLocaleTimeString() : '-'}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Examples */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold mb-3">Quick Examples</h3>
              <div className="space-y-2">
                {presetExamples.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => setConfig(prev => ({ ...prev, ...ex.config }))}
                    className="w-full text-left p-3 border border-gray-200 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <div className="font-medium text-sm">{ex.name}</div>
                    <div className="text-xs text-gray-500 truncate">{ex.config.url}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* History */}
            {history.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="font-semibold mb-3">Recent Scrapes</h3>
                <div className="space-y-2">
                  {history.map((h, idx) => (
                    <button
                      key={idx}
                      onClick={() => setConfig(h)}
                      className="w-full text-left p-3 border border-gray-200 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <div className="font-medium text-sm truncate">{h.url}</div>
                      <div className="text-xs text-gray-500 capitalize">
                        {h.mode} • {h.maxPages} pages • {h.scrape}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tips */}
            <div className="bg-blue-50 rounded-lg p-6">
              <h3 className="font-semibold text-blue-900 mb-3">Scraping Tips</h3>
              <ul className="text-sm text-blue-800 space-y-2">
                <li>• <strong>Single</strong>: a single practice page.</li>
                <li>• <strong>Directory</strong>: listing page that links to individual practices.</li>
                <li>• <strong>Pagination</strong>: directory with “next” pages.</li>
                <li>• Use <strong>What to scrape</strong> to select practices, clinicians, or both.</li>
                <li>• Start with small pages/depth to test, then increase.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
