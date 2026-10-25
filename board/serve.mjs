// 战术大屏数据源：静态托管大屏 + /api/live（数据来自本机 DSH）
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = HERE
const PORT = Number(process.env.LIVE_PORT || 7800)

// DSH 的 API 客户端复用 qq-bridge 那份实现（它会自己铸造鉴权 Cookie）。
// 位置：环境变量 DSH_CLIENT_DIR > 插件 config.json 的 clientDir > 默认路径。
const CFG_PATH = path.join(HERE, '..', 'config.json')
const CFG = (() => { try { return JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')) } catch { return {} } })()
const CLIENT_DIR = process.env.DSH_CLIENT_DIR || CFG.clientDir || 'C:/Users/Administrator/Tools/qqbridge/qq-bridge-main/src'
const { NodeApiClient } = await import('file:///' + CLIENT_DIR + '/dsh-client.js')
let ratesAt = null
try { ({ ratesAt } = await import('file:///' + CLIENT_DIR + '/model-prices.js')) } catch {}

/* ---------- 找 DSH 当前端口 ---------- */
let found = { base: '', at: 0 }
function dshPorts() {
  let out = '', csv = ''
  try { out = execSync('netstat -ano', { encoding: 'latin1', maxBuffer: 8 << 20 }) } catch { return [] }
  try { csv = execSync('tasklist /FI "IMAGENAME eq DeepSeek Harness.exe" /FO CSV /NH', { encoding: 'latin1' }) } catch { return [] }
  const pids = [...new Set([...csv.matchAll(/"[^"]*","(\d+)"/g)].map((m) => m[1]))]
  const ports = []
  for (const line of out.split('\n')) {
    const m = line.match(/127\.0\.0\.1:(\d+)\s+0\.0\.0\.0:0\s+LISTENING\s+(\d+)/)
    if (m && pids.includes(m[2]) && !ports.includes(+m[1])) ports.push(+m[1])
  }
  return ports
}
async function isDsh(p) {
  try { const r = await fetch('http://127.0.0.1:' + p + '/api/', { signal: AbortSignal.timeout(700) }); return r.status === 401 } catch { return false }
}
async function discover() {
  if (found.base && Date.now() - found.at < 20000) return found.base
  for (const p of dshPorts()) if (await isDsh(p)) { found = { base: 'http://127.0.0.1:' + p, at: Date.now() }; return found.base }
  found = { base: '', at: Date.now() }
  return ''
}
let client = null, clientBase = ''
async function api() {
  const base = await discover()
  if (!base) throw new Error('DSH not found')
  if (base !== clientBase) { client = new NodeApiClient(base); clientBase = base }
  return client
}

/* ---------- 数据 ---------- */
let cache = { at: 0, data: null }
let think = { sid: '', base: 0, turns: -1 }   // 当前这一轮已经思考了多久
let meta = { at: 0, providers: [], presets: [] }
async function readMeta(c) {
  if (Date.now() - meta.at < 30000 && meta.providers.length) return meta
  try {
    const mc = await c.callUnary('session/modelCatalog', {})
    const v = mc?.result?.value || {}
    meta.providers = (v.groups || []).map((g) => ({ id: g.id, name: g.name || g.id, models: (g.models || []).length }))
  } catch {}
  try {
    const ap = await c.callUnary('agentPresets.list', {})
    meta.presets = (ap?.result?.value?.presets || []).map((p) => p.id)
  } catch {}
  meta.at = Date.now()
  return meta
}

async function readLive() {
  const now = Date.now()
  if (cache.data && now - cache.at < 1200) return cache.data
  const c = await api()
  const m = await readMeta(c)
  const r = await c.callUnary('session/list', {})
  const items = r?.result?.value?.items || []

  const rows = items.map((it) => {
    const v = it.projections?.values || {}
    const u = v.tokenUsage || {}
    const tIn = (u.uncachedInputTokens || 0) + (u.cacheReadTokens || 0) + (u.cacheWriteTokens || 0)
    const tOut = u.outputTokens || 0
    return {
      id: it.sessionId,
      title: v.title || '(无标题)',
      running: !!it.running,
      cwd: it.cwd || '',
      updatedAt: it.updatedAt || 0,
      blank: !!it.blank,
      agentAvailable: !!it.agentAvailable,
      tokens: { in: tIn, out: tOut, cacheRead: u.cacheReadTokens || 0, uncached: u.uncachedInputTokens || 0, total: tIn + tOut },
      turns: v.sessionStats?.turns || 0,
      llmMs: v.sessionStats?.llmMs || 0,
      steps: v.sessionStats?.steps || 0,
      ctx: v.contextPressure?.pressureTokens || 0,
      ctxWindow: v.contextPressure?.contextWindow || 0,
    }
  })
  rows.sort((a, b) => b.updatedAt - a.updatedAt)

  const recentTurns = []
  for (const it of items) {
    const v = it.projections?.values || {}
    for (const t of (v.turnOutline || []).slice(-3)) {
      recentTurns.push({
        sid: it.sessionId,
        title: v.title || '(无标题)',
        turn: t.turn,
        seq: t.seq,
        prompt: String(t.prompt || '').replace(/\s+/g, ' ').slice(0, 60),
        response: String(t.response || '').replace(/\s+/g, ' ').slice(0, 60),
        at: it.updatedAt || 0,
      })
    }
  }
  recentTurns.sort((a, b) => (b.at - a.at) || (b.seq - a.seq))

  const d0 = new Date(); d0.setHours(0, 0, 0, 0)
  const today = rows.filter((r) => r.updatedAt >= d0.getTime())
  const sum = (k) => today.reduce((n, r) => n + (r.tokens?.[k] || 0), 0)
  const tIn = sum('in'), tOut = sum('out'), cacheRead = sum('cacheRead'), uncached = sum('uncached')
  const data = {
    ok: true,
    at: now,
    total: rows.length,
    running: rows.filter((x) => x.running).length,
    tokens: { in: tIn, out: tOut, total: tIn + tOut, cacheHit: cacheRead + uncached > 0 ? cacheRead / (cacheRead + uncached) : 0, sessions: today.length },
    turns: today.reduce((n, r) => n + (r.turns || 0), 0),
    allTokens: rows.reduce((n, r) => n + (r.tokens?.total || 0), 0),
    cost: (() => { try { if (!ratesAt) return null; const rt = ratesAt('deepseek-flash', Date.now()); const u = today.reduce((a, r) => a + (r.tokens?.uncached || 0), 0); const c = today.reduce((a, r) => a + (r.tokens?.cacheRead || 0), 0); const o = today.reduce((a, r) => a + (r.tokens?.out || 0), 0); return (u * rt.cacheMiss + c * rt.cacheHit + o * rt.output) / 1e6 } catch { return null } })(),
    peak: (() => { try { return ratesAt ? ratesAt('deepseek-flash', Date.now()).tier === 'peak' : null } catch { return null } })(),
    curSteps: ((rows.find((r) => r.running) || rows[0] || {}).steps || 0),
    curCtx: ((rows.find((r) => r.running) || rows[0] || {}).ctx || 0),
    curReply: (() => { const cur = rows.find((r) => r.running) || rows[0]; if (!cur) return ""; const t = recentTurns.find((x) => x.sid === cur.id); return t ? String(t.response || "").slice(0, 160) : "" })(),
    curRunning: !!rows.find((r) => r.running),
    llmSec: Math.round(((rows.find((r) => r.running) || rows[0] || {}).llmMs || 0) / 1000),
    curTurns: ((rows.find((r) => r.running) || rows[0] || {}).turns || 0),
    thinkingMs: (() => {
      const cur = rows.find((r) => r.running) || rows[0]
      if (!cur) return 0
      if (!cur.running) { think = { sid: cur.id, base: cur.llmMs || 0, turns: cur.turns || 0 }; return 0 }
      if (think.sid !== cur.id || think.turns !== (cur.turns || 0)) { think = { sid: cur.id, base: cur.llmMs || 0, turns: cur.turns || 0 }; return 0 }
      return Math.max(0, (cur.llmMs || 0) - think.base)
    })(),
    curTitle: (rows.find((r) => r.running) || rows[0] || {}).title || "",
    steps: today.reduce((n, r) => n + (r.steps || 0), 0),
    providers: m.providers,
    presets: m.presets,
    recentTurns: recentTurns.slice(0, 24),
    sessions: rows.slice(0, 20),
  }
  cache = { at: now, data }
  return data
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' }

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1')
  if (u.pathname === '/api/live') {
    try {
      const d = await readLive()
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' })
      return res.end(JSON.stringify(d))
    } catch (e) {
      res.writeHead(503, { 'content-type': 'application/json; charset=utf-8' })
      return res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }))
    }
  }
  let p = decodeURIComponent(u.pathname)
  if (p === '/') p = '/index.html'
  const file = path.join(ROOT, p)
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end('not found')
  }
  const isHtml = path.extname(file).toLowerCase() === '.html'
  let body = fs.readFileSync(file)
  if (isHtml) body = Buffer.from(String(body).replace(String.fromCharCode(60) + "head" + String.fromCharCode(62), "<head><script>window.__BOARD_API__ = '/api/live'</script>"))
  res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' })
  res.end(body)
}).listen(PORT, '127.0.0.1', () => console.log('board on http://127.0.0.1:' + PORT))
