import {readFile, mkdtemp, lstat, rm, cp, access} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
import {UpdateStorage, directory, revision, type Release} from './storage.js'
import {CommandError, runCommand, buildEnvironment, type RunCommand} from './commands.js'
import {validateTree} from './source-tree.js'
import {GithubSnapshot, type SnapshotTransport} from './github-snapshot.js'
export {validateTree} from './source-tree.js'

export const GAME_REPOSITORY = 'https://github.com/gaara-xu/fenghuo.git'
export const RUNTIME_PROTOCOL = 3
export function retryableGitError(error: unknown) {
  if (error instanceof CommandError && error.kind !== 'exit') return error.kind === 'timeout'
  const message = error instanceof Error ? error.message : String(error)
  if (/authentication failed|permission denied|repository not found|could not read username|terminal prompts disabled|certificate|unable to get local issuer|couldn't find remote ref|not our ref|\.lock.*exists/i.test(message)) return false
  return /GnuTLS recv error|TLS connection was non-properly terminated|HTTP.?2.*(?:framing|stream)|curl (?:6|7|16|18|28|35|52|55|56|92)\b|early EOF|remote end hung up|connection (?:reset|timed out)|could not resolve host|failed to connect|requested URL returned error: (?:429|50[0234])\b/i.test(message)
}
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
export interface ReleaseSource {
  latest(signal?: AbortSignal, retry?: (message: string) => Promise<void>): Promise<string>
  prepare(sha: string, progress: (phase: 'fetching' | 'dependencies' | 'building', message: string) => Promise<void>, signal?: AbortSignal): Promise<Release>
}
export function verifyDependencyLock(pkg: any, lock: any) {
  if (!lock?.packages?.['']) throw Error('依赖锁文件缺少项目记录')
  const signature=(value: any)=>JSON.stringify(Object.entries(value??{}).sort(([a],[b])=>a.localeCompare(b)))
  for (const key of ['dependencies','devDependencies','optionalDependencies']) if(signature(pkg[key])!==signature(lock.packages[''][key]))throw Error('package.json 与依赖锁文件不一致，请修正代码后更新')
}
export class GitReleaseSource implements ReleaseSource {
  constructor(private store: UpdateStorage, private run: RunCommand = runCommand, private remote = GAME_REPOSITORY,
    private wait = (ms: number, signal?: AbortSignal) => delay(ms, undefined, {signal}),
    private snapshot: SnapshotTransport | null = remote === GAME_REPOSITORY ? new GithubSnapshot() : null) {}
  private git(args: string[], timeoutMs = 120000, signal?: AbortSignal) {
    signal?.throwIfAborted()
    return this.run('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'protocol.ext.allow=never', '-c', 'http.version=HTTP/1.1', '-c', 'http.lowSpeedLimit=1024', '-c', 'http.lowSpeedTime=30', ...args], {
      env: {...buildEnvironment(this.store.file('npm-cache'), this.store.file('tmp')), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null'}, timeoutMs, signal,
    })
  }
  private async networkGit(args: string[], timeoutMs: number, signal?: AbortSignal, retry?: (message: string) => Promise<void>) {
    for (let attempt = 1; ; attempt++) {
      signal?.throwIfAborted()
      try {return await this.git(args, timeoutMs, signal)} catch (error) {
        signal?.throwIfAborted()
        if (!retryableGitError(error)) throw error
        if (attempt === 3) throw Error('Git 网络连接连续3次失败，可重新点击更新；' + (error instanceof Error ? error.message : String(error)))
        const seconds = attempt * 2
        await retry?.(`Git 连接中断，${seconds}秒后重试（${attempt + 1}/3，HTTP/1.1）；旧游戏继续运行`)
        await this.wait(seconds * 1000, signal)
      }
    }
  }
  async latest(signal?: AbortSignal, retry?: (message: string) => Promise<void>) {
    if (this.snapshot) return this.snapshot.latest(signal, retry)
    const output = await this.networkGit(['ls-remote', '--exit-code', this.remote, 'refs/heads/main'], 30000, signal, retry)
    const match = /^([a-f0-9]{40})\trefs\/heads\/main\s*$/.exec(output)
    if (!match) throw Error('无法读取游戏主分支版本')
    return revision(match[1])
  }
  async prepare(sha: string, progress: Parameters<ReleaseSource['prepare']>[1], signal?: AbortSignal) {
    signal?.throwIfAborted()
    revision(sha)
    try {return await this.store.release(sha)} catch (error) {if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error as Error).message.includes('不完整')) throw error}
    await progress('fetching', '正在拉取固定版本源码，旧游戏继续运行')
    const work = await mkdtemp(path.join(this.store.file('work'), 'build-')), archive = path.join(work, 'source.tar')
    try {
      if (this.snapshot) await this.snapshot.extract(sha, work, message => progress('fetching', message), signal)
      else {
        const repo = this.store.file('repository.git')
        await directory(repo)
        await this.git(['init', '--bare', repo], 120000, signal)
        await this.networkGit(['--git-dir=' + repo, 'fetch', '--depth=1', '--no-tags', this.remote, sha], 180000, signal, message => progress('fetching', message))
        const actual = (await this.git(['--git-dir=' + repo, 'rev-parse', 'FETCH_HEAD'], 120000, signal)).trim()
        if (actual !== sha) throw Error('下载版本与检查结果不一致')
        validateTree(await this.git(['--git-dir=' + repo, 'ls-tree', '-rz', '--full-tree', sha], 120000, signal))
        await this.git(['--git-dir=' + repo, 'archive', '--format=tar', '--output=' + archive, sha], 120000, signal)
        await this.run('tar', ['-xf', archive, '-C', work], {timeoutMs: 120000, signal})
        await rm(archive)
      }
      const manifest = JSON.parse(await readFile(path.join(work, 'game-runtime.json'), 'utf8'))
      if (manifest.protocol !== RUNTIME_PROTOCOL || manifest.nodeMajor !== Number(process.versions.node.split('.')[0])) throw Error('新版要求升级运行环境，请先更新固定镜像；当前游戏未改动')
      const env = buildEnvironment(this.store.file('npm-cache'), this.store.file('tmp'))
      await progress('dependencies', '正在准备匹配当前版本的 Linux 依赖')
      verifyDependencyLock(JSON.parse(await readFile(path.join(work,'package.json'),'utf8')),JSON.parse(await readFile(path.join(work,'package-lock.json'),'utf8')))
      const sameLock = digest(await readFile(path.join(work, 'package-lock.json'))) === digest(await readFile(path.join(this.store.bundled.dir, 'package-lock.json')))
      if (sameLock) {
        await access(path.join(this.store.bundled.dir, 'node_modules/typescript'))
        // Each release owns its dependencies; a future base-image upgrade cannot change an old release underneath it.
        await cp(path.join(this.store.bundled.dir, 'node_modules'), path.join(work, 'node_modules'), {recursive:true,verbatimSymlinks:true,filter:()=>{signal?.throwIfAborted();return true}})
      } else await this.run('npm', ['ci', '--include=dev', '--no-audit', '--no-fund'], {cwd: work, env, timeoutMs: 900000, signal})
      await progress('building', '正在类型检查、测试和编译，未连接数据库')
      // Fixed commands, not an API-provided shell script. Real-DB tests stay disabled.
      await this.run('npm', ['run', 'check'], {cwd: work, env, timeoutMs: 900000, signal})
      signal?.throwIfAborted()
      for (const file of ['dist-server/server/index.js', 'dist-web/index.html']) if (!(await lstat(path.join(work, file))).isFile()) throw Error('编译产物缺失')
      return await this.store.publish(sha, work)
    } finally {await rm(work, {recursive: true, force: true})}
  }
}
