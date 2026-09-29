import http, {type IncomingMessage, type ServerResponse} from 'node:http'
import {createReadStream} from 'node:fs'
import {stat} from 'node:fs/promises'
import {pipeline} from 'node:stream/promises'
import path from 'node:path'
import type {UpdateManager} from './manager.js'

const prefix = '/api/admin/game-update'
const json = (res: ServerResponse, status: number, value: unknown) => {
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'})
  res.end(JSON.stringify(value))
}
export function permittedUpdateRequest(req: IncomingMessage) {
  if (req.headers['x-fenghuo-update'] !== '1' || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) return false
  if (req.headers['sec-fetch-site'] === 'cross-site' || /prefetch|prerender|preview/i.test(String(req.headers['sec-purpose'] ?? req.headers.purpose ?? ''))) return false
  if (req.headers.origin) {try {if (new URL(req.headers.origin).host !== req.headers.host) return false} catch {return false}}
  return true
}
async function actionBody(req: IncomingMessage) {
  let raw = ''
  for await (const chunk of req) {raw += chunk.toString(); if (Buffer.byteLength(raw) > 1024) throw Error('更新请求过大')}
  const data = JSON.parse(raw)
  if (!data || Object.keys(data).length !== 1 || typeof data.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(data.requestId)) throw Error('只允许传入更新请求编号')
  return data.requestId as string
}
const mime: Record<string, string> = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'}
async function maintenancePage(req: IncomingMessage, res: ServerResponse, root: string) {
  if (!['GET', 'HEAD'].includes(req.method ?? '')) return json(res, 503, {error: '游戏正在切换版本，请稍后重试'})
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://game').pathname)
  const name = pathname === '/' || pathname === '/admin' || pathname === '/admin/' ? 'index.html' : pathname.slice(1)
  if (name !== 'index.html' && !/^(assets|art)\//.test(name)) return json(res, 503, {error: '游戏正在切换版本，请稍后重试'})
  const base = path.resolve(root, 'dist-web'), file = path.resolve(base, name)
  if (!file.startsWith(base + path.sep)) return json(res, 404, {error: '资源不存在'})
  try {
    const info = await stat(file); if (!info.isFile()) throw Error('not a file')
    res.writeHead(200, {'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store'})
    if (req.method === 'HEAD') res.end(); else await pipeline(createReadStream(file), res)
  } catch {if (!res.headersSent) json(res, 404, {error: '资源不存在'})}
}
export function updateServer(manager: UpdateManager, appPort: number, serving: () => boolean) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://game')
      if (url.pathname === prefix || url.pathname.startsWith(prefix + '/')) {
        if (url.search) return json(res, 400, {error: '更新接口不接受URL参数'})
        if (url.pathname === prefix + '/status' && req.method === 'GET') return json(res, 200, manager.snapshot())
        if (!['/check', '/run'].some(suffix => url.pathname === prefix + suffix)) return json(res, 404, {error: '更新接口不存在'})
        if (req.method !== 'POST') {res.setHeader('Allow', 'POST'); return json(res, 405, {error: '更新操作仅允许POST'})}
        if (!permittedUpdateRequest(req)) return json(res, 403, {error: '请从本游戏管理后台执行更新'})
        let id: string
        try {id = await actionBody(req)} catch {return json(res, 400, {error: '更新请求格式无效'})}
        return json(res, 202, manager.request(url.pathname.endsWith('/run') ? 'run' : 'check', id))
      }
      if (!serving()) return await maintenancePage(req, res, manager.current.dir)
      // Only a fixed loopback app is proxied. The web process never receives a Docker socket or shell endpoint.
      const upstream = http.request({hostname: '127.0.0.1', port: appPort, method: req.method, path: req.url, headers: req.headers}, response => {
        res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res)
      })
      upstream.on('error', () => {if (!res.headersSent) json(res, 503, {error: '游戏正在重启，请稍后重试'}); else res.destroy()})
      upstream.setTimeout(120000, () => upstream.destroy())
      res.on('close', () => upstream.destroy()); req.pipe(upstream)
    } catch {if (!res.headersSent) json(res, 500, {error: '更新服务暂不可用'}); else res.destroy()}
  })
}
