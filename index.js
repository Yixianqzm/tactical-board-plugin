/**
 * 战术大屏 —— DSH 插件入口
 * 1) 板子挂在 /api/neural-board 下，/live 代理到本机数据服务（127.0.0.1:7800）
 * 2) /env 检测环境，/fix 一键补齐（找 DSH 客户端 + 重启数据服务）
 */
import { fileURLToPath } from 'node:url'
import { dirname, join, extname, normalize } from 'node:path'
import { existsSync, readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'

export const name = 'neural-board'
export const inject = ['webServer']

const HERE = dirname(fileURLToPath(import.meta.url))
const BOARD = join(HERE, 'board')
const SERVE = join(BOARD, 'serve.mjs')
const CFG_PATH = join(HERE, 'config.json')
const LIVE_URL = 'http://127.0.0.1:7800/'
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml',
}

const readCfg = () => { try { return JSON.parse(readFileSync(CFG_PATH, 'utf8')) } catch { return {} } }
const saveCfg = (o) => writeFileSync(CFG_PATH, JSON.stringify(o, null, 2) + '\n')

async function alive() {
  try { const r = await fetch('http://127.0.0.1:7800/api/live', { signal: AbortSignal.timeout(1200) }); return r.ok } catch { return false }
}

async function ensureServe() {
  if (await alive()) return true
  try { spawn(process.execPath, [SERVE], { detached: true, stdio: 'ignore', windowsHide: true, cwd: BOARD }).unref() } catch { return false }
  for (let i = 0; i < 25; i++) { await new Promise((r) => setTimeout(r, 400)); if (await alive()) return true }
  return false
}

function findClientDir() {
  const cfg = readCfg()
  const cands = []
  if (process.env.DSH_CLIENT_DIR) cands.push(process.env.DSH_CLIENT_DIR)
  if (cfg.clientDir) cands.push(cfg.clientDir)
  const home = homedir()
  cands.push(join(home, 'Tools', 'qqbridge', 'qq-bridge-main', 'src'))
  for (const root of [join(home, '.dsh', 'plugins'), join(home, 'Documents', 'deepseek-harness')]) {
    try {
      for (const d of readdirSync(root)) {
        cands.push(join(root, d, 'src'))
        cands.push(join(root, d, 'qq-bridge-main', 'src'))
      }
    } catch {}
  }
  return cands.find((d) => d && existsSync(join(d, 'dsh-client.js'))) || ''
}

function currentClientDir() {
  const cfg = readCfg()
  return process.env.DSH_CLIENT_DIR || cfg.clientDir || join(homedir(), 'Tools', 'qqbridge', 'qq-bridge-main', 'src')
}

async function envReport() {
  const dir = currentClientDir()
  const hasClient = existsSync(join(dir, 'dsh-client.js'))
  const hasPrices = existsSync(join(dir, 'model-prices.js'))
  const service = await alive()
  return {
    ok: hasClient && service,
    items: [
      { key: 'board', name: '大屏文件', ok: existsSync(join(BOARD, 'index.html')), detail: join(BOARD, 'index.html') },
      { key: 'node', name: 'Node 运行时', ok: existsSync(process.execPath), detail: process.execPath },
      { key: 'client', name: 'DSH 客户端库', ok: hasClient, detail: hasClient ? dir : '缺少 dsh-client.js（qq-bridge 里那份）' },
      { key: 'prices', name: '价目表（可选）', ok: hasPrices, detail: hasPrices ? dir : '没有 model-prices.js，花费不可用' },
      { key: 'service', name: '数据服务 7800', ok: service, detail: service ? 'http://127.0.0.1:7800/' : '没起来' },
    ],
  }
}

async function fixEnv() {
  const log = []
  const dir = findClientDir()
  if (!dir) log.push('没找到 dsh-client.js，请先装 qq-bridge，或设 DSH_CLIENT_DIR 指向它的 src 目录')
  else {
    const cfg = readCfg()
    if (cfg.clientDir !== dir) { cfg.clientDir = dir; saveCfg(cfg); log.push('已记住客户端路径：' + dir) }
    else log.push('客户端路径已就绪：' + dir)
  }
  if (await alive()) log.push('数据服务已在跑')
  else log.push((await ensureServe()) ? '数据服务已拉起' : '数据服务没起来，手动跑 node board/serve.mjs 看看报错')
  return log
}

const HTML_BOOT = '<head><script>window.__BOARD_API__ = "/api/neural-board/live"</script>'

export function apply(ctx) {
  ensureServe().catch(() => {})

  ctx.webServer.register({
    kind: 'prefix',
    path: '/api/neural-board',
    handler: async (req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1')
      const p = decodeURIComponent(u.pathname.replace(/^\/api\/neural-board/, '')) || '/'
      const json = (code, body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)) }

      if (p === '/url') return json(200, { ok: true, url: LIVE_URL })
      if (p === '/env') { try { return json(200, await envReport()) } catch (e) { return json(500, { ok: false, error: String(e?.message || e) }) } }
      if (p === '/fix') { try { return json(200, { ok: true, log: await fixEnv() }) } catch (e) { return json(500, { ok: false, error: String(e?.message || e) }) } }

      if (p === '/live') {
        try {
          const r = await fetch('http://127.0.0.1:7800/api/live', { signal: AbortSignal.timeout(4000) })
          const body = await r.text()
          res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          return res.end(body)
        } catch { return json(503, { ok: false, error: 'board server not ready' }) }
      }

      const rel = p === '/' ? '/index.html' : p
      const file = normalize(join(BOARD, rel))
      if (!file.startsWith(normalize(BOARD))) { res.writeHead(403); return res.end('forbidden') }
      if (!existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found') }
      let body = readFileSync(file)
      if (rel === '/index.html') body = Buffer.from(String(body).replace('<head>', HTML_BOOT))
      res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' })
      res.end(body)
    },
  })
}
