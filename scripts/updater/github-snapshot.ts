import {createReadStream, createWriteStream} from 'node:fs'
import {mkdir, mkdtemp, open, rm} from 'node:fs/promises'
import {createGunzip} from 'node:zlib'
import {pipeline} from 'node:stream/promises'
import {setTimeout as delay} from 'node:timers/promises'
import path from 'node:path'
import {revision} from './storage.js'
import {validateSourcePath, validateTree} from './source-tree.js'

const API = 'https://api.github.com/repos/gaara-xu/fenghuo/git/ref/heads/main'
const ARCHIVE = 'https://codeload.github.com/gaara-xu/fenghuo/tar.gz/'
const MAX_ARCHIVE = 512 * 1024 * 1024, MAX_TAR = 1024 * 1024 * 1024
type Progress = (message: string) => Promise<void>
export interface SnapshotTransport {
  latest(signal?: AbortSignal, progress?: Progress): Promise<string>
  extract(sha: string, work: string, progress: Progress, signal?: AbortSignal): Promise<void>
}
class NetworkFailure extends Error {}

// Deliberately support only GitHub's regular-file/dir tar format and global commit comment.
// Validate the complete archive before writing any source file; never hand untrusted paths to tar.
export async function extractSnapshot(tar: string, work: string, sha: string, signal?: AbortSignal) {
  revision(sha)
  const handle = await open(tar, 'r'), prefix = `fenghuo-${sha}/`
  const entries: Array<{file: string; offset: number; size: number; mode: number; dir: boolean}> = []
  const seen = new Set<string>(), decoder = new TextDecoder('utf-8', {fatal: true})
  let offset = 0, commit = '', ended = false
  const read = async (size: number, position: number) => {
    const buffer = Buffer.alloc(size); let done = 0
    while (done < size) {signal?.throwIfAborted();const r = await handle.read(buffer, done, size - done, position + done); if (!r.bytesRead) throw Error('源码包被截断'); done += r.bytesRead}
    return buffer
  }
  const number = (buffer: Buffer) => {const value = buffer.toString('ascii').replace(/\0.*$/s, '').trim(); if (!/^[0-7]+$/.test(value)) throw Error('源码包数字字段无效'); return parseInt(value, 8)}
  const text = (buffer: Buffer) => decoder.decode(buffer.subarray(0, buffer.indexOf(0) < 0 ? buffer.length : buffer.indexOf(0)))
  try {
    const total = (await handle.stat()).size
    if (total > MAX_TAR || total % 512) throw Error('源码包大小无效')
    while (offset < total) {
      const header = await read(512, offset); offset += 512
      if (header.every(b => b === 0)) {ended = true; continue}
      if (ended) throw Error('源码包结束标记后仍有内容')
      const checksum = number(header.subarray(148, 156))
      if (header.reduce((sum, b, i) => sum + (i >= 148 && i < 156 ? 32 : b), 0) !== checksum || text(header.subarray(257, 263)).trim() !== 'ustar') throw Error('源码包头校验失败')
      const size = number(header.subarray(124, 136)), type = header[156], start = offset
      offset += Math.ceil(size / 512) * 512
      if (offset > total) throw Error('源码包被截断')
      if (type === 103) {
        if (commit || entries.length || size > 1024) throw Error('源码包提交标记无效')
        const pax = await read(size, start), match = /^(\d+) comment=([a-f0-9]{40})\n$/.exec(pax.toString('utf8'))
        if (!match || Number(match[1]) !== pax.length || match[2] !== sha) throw Error('下载版本与检查结果不一致')
        commit = match[2]; continue
      }
      if (type !== 0 && type !== 48 && type !== 53 || text(header.subarray(157, 257))) throw Error('源码包含链接或不支持的文件类型')
      const dir = type === 53, p = text(header.subarray(345, 500)), name = (p ? p + '/' : '') + text(header.subarray(0, 100))
      if (!name.startsWith(prefix)) throw Error('源码包路径越界')
      const file = name.slice(prefix.length).replace(dir ? /\/$/ : /$^/, '')
      if (!file && dir && size === 0) continue
      validateSourcePath(file)
      if (seen.has(file) || dir && size !== 0 || seen.size >= 20000) throw Error('源码包条目重复或无效')
      seen.add(file); entries.push({file, offset: start, size, mode: number(header.subarray(100, 108)) & 0o111 ? 0o755 : 0o644, dir})
    }
    if (!ended || commit !== sha) throw Error('源码包缺少结束或提交标记')
    validateTree(entries.filter(e => !e.dir).map(e => `100644 blob ${sha}\t${e.file}\0`).join(''))
    for (const entry of entries) {
      signal?.throwIfAborted()
      const target = path.join(work, entry.file)
      await mkdir(entry.dir ? target : path.dirname(target), {recursive: true})
      if (entry.dir) continue
      if (entry.size) await pipeline(createReadStream(tar, {start: entry.offset, end: entry.offset + entry.size - 1}), createWriteStream(target, {flags: 'wx', mode: entry.mode}), {signal})
      else {const empty = await open(target, 'wx', entry.mode); await empty.close()}
    }
  } finally {await handle.close()}
}

export class GithubSnapshot implements SnapshotTransport {
  constructor(private request: typeof fetch = fetch, private wait = (ms: number, signal?: AbortSignal) => delay(ms, undefined, {signal}), private checkTimeout = 8000, private downloadTimeout = 120000) {}
  private async bounded<T>(ms: number, signal: AbortSignal | undefined, action: (s: AbortSignal) => Promise<T>) {
    const requestSignal = AbortSignal.any([AbortSignal.timeout(ms), ...(signal ? [signal] : [])])
    try {return await action(requestSignal)} catch (error) {requestSignal.throwIfAborted(); throw error}
  }
  private async retry<T>(action: () => Promise<T>, signal?: AbortSignal, progress?: Progress) {
    for (let attempt = 1; ; attempt++) {
      signal?.throwIfAborted()
      try {return await action()} catch (error) {
        signal?.throwIfAborted()
        const cause = (error as Error & {cause?: {code?: string}})?.cause?.code ?? ''
        const transient = error instanceof NetworkFailure || (error as Error).name === 'TimeoutError' || error instanceof TypeError && !/CERT|TLS|SSL/.test(cause)
        if (!transient) throw error
        if (attempt === 2) throw Error('GitHub 连接失败或超时，请重试；旧游戏继续运行：' + (error as Error).message)
        await progress?.('GitHub 连接中断，正在重试（2/2）；旧游戏继续运行')
        await this.wait(500, signal)
      }
    }
  }
  private async response(url: string, signal: AbortSignal) {
    const response = await this.request(url, {signal, redirect: 'error', headers: {'User-Agent': 'fenghuo-updater', Accept: 'application/vnd.github+json'}})
    if (!response.ok) {
      await response.body?.cancel()
      const message = `GitHub 返回 HTTP ${response.status}`
      if ([429, 500, 502, 503, 504].includes(response.status)) throw new NetworkFailure(message)
      throw Error(message)
    }
    if (!response.body) throw Error('GitHub 响应为空')
    return response
  }
  async latest(signal?: AbortSignal, progress?: Progress) {
    return this.retry(() => this.bounded(this.checkTimeout, signal, async requestSignal => {
      const response = await this.response(API, requestSignal)
      let body = ''
      for await (const chunk of response.body!) {body += Buffer.from(chunk).toString('utf8'); if (body.length > 65536) throw Error('版本响应过大')}
      const data = JSON.parse(body)
      if (data.ref !== 'refs/heads/main' || data.object?.type !== 'commit') throw Error('游戏主分支响应无效')
      return revision(data.object.sha)
    }), signal, progress)
  }
  async extract(sha: string, work: string, progress: Progress, signal?: AbortSignal) {
    revision(sha)
    const temp = await mkdtemp(path.join(path.dirname(work), 'snapshot-')), gzip = path.join(temp, 'source.gz'), tar = path.join(temp, 'source.tar')
    try {
      await this.retry(() => this.bounded(this.downloadTimeout, signal, async requestSignal => {
        const response = await this.response(ARCHIVE + sha, requestSignal)
        let received = 0, reported = 0
        await pipeline(response.body!, async function* (source) {
          for await (const chunk of source) {
            received += chunk.length
            if (received > MAX_ARCHIVE) throw Error('源码包超过大小限制')
            if (Date.now() - reported >= 2000) {reported = Date.now(); await progress(`正在下载固定版本源码：${(received / 1048576).toFixed(1)} MB；旧游戏继续运行`)}
            yield chunk
          }
        }, createWriteStream(gzip, {flags: 'w', mode: 0o600}), {signal: requestSignal})
      }), signal, progress)
      let unpacked = 0
      await pipeline(createReadStream(gzip), createGunzip(), async function* (source) {
        for await (const chunk of source) {signal?.throwIfAborted(); unpacked += chunk.length; if (unpacked > MAX_TAR) throw Error('解压源码超过大小限制'); yield chunk}
      }, createWriteStream(tar, {flags: 'wx', mode: 0o600}), {signal})
      await progress('源码下载完成，正在校验固定提交与文件安全')
      await extractSnapshot(tar, work, sha, signal)
    } finally {await rm(temp, {recursive: true, force: true})}
  }
}
