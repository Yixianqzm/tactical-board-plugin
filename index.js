/**
 * 战术大屏 —— DSH 插件入口
 * 1) 把 board/index.html 挂在 /api/neural-board 下
 * 2) /api/neural-board/live 代理到板子自己的数据服务（127.0.0.1:7800）
 * 3) 插件启动时顺手把那个数据服务拉起来（独立进程，DSH 关了它也不影响已开的页面）
 */
import { fileURLToPath } from 'node:url'
import { dirname, join, extname, normalize } from 'node:path'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { spawn } from 'node:child_process'

export const name = 'neural-board'
export const inject = ['webServer']

const HERE = dirname(fileURLToPath(import.meta.url))
const BOARD = join(HERE, 'board')
const SERVE = join(BOARD, 'serve.mjs')
const LIVE_URL = 'http://127.0.0.1:7800/'
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

async function alive() {
  try {
    const r = await fetch('http://127.0.0.1:7800/api/live', { signal: AbortSignal.timeout(900) })
    return r.ok
  } catch { return false }
}

async function ensureServe() {
  if (await alive()) return true
  try {
    spawn(process.execPath, [SERVE], { detached: true, stdio: 'ignore', windowsHide: true, cwd: BOARD }).unref()
  } catch { return false }
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 400))
    if (await alive()) return true
  }
  return false
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

      if (p === '/url') {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        return res.end(JSON.stringify({ ok: true, url: LIVE_URL }))
      }

      if (p === '/live') {
        try {
          const r = await fetch('http://127.0.0.1:7800/api/live', { signal: AbortSignal.timeout(4000) })
          const body = await r.text()
          res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          return res.end(body)
        } catch {
          res.writeHead(503, { 'content-type': 'application/json; charset=utf-8' })
          return res.end(JSON.stringify({ ok: false, error: 'board server not ready' }))
        }
      }

      const rel = p === '/' ? '/index.html' : p
      const file = normalize(join(BOARD, rel))
      if (!file.startsWith(normalize(BOARD))) {
        res.writeHead(403); return res.end('forbidden')
      }
      if (!existsSync(file) || statSync(file).isDirectory()) {
        res.writeHead(404); return res.end('not found')
      }
      let body = readFileSync(file)
      if (rel === '/index.html') body = Buffer.from(String(body).replace('<head>', HTML_BOOT))
      res.writeHead(200, {
        'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
      })
      res.end(body)
    },
  })
}
