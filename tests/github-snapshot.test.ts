import {afterEach, describe, expect, it, vi} from 'vitest'
import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises'
import {gzipSync} from 'node:zlib'
import path from 'node:path'
import {GithubSnapshot, extractSnapshot} from '../scripts/updater/github-snapshot'
import {GitReleaseSource, RUNTIME_PROTOCOL} from '../scripts/updater/git-release'
import {UpdateStorage} from '../scripts/updater/storage'
import {UpdateManager} from '../scripts/updater/manager'
import {runCommand} from '../scripts/updater/commands'

const sha = 'b'.repeat(40), roots: string[] = []
async function fixture() {
  await mkdir('.runtime', {recursive: true}); const root = await mkdtemp(path.resolve('.runtime/snapshot-test-')); roots.push(root)
  const store = new UpdateStorage(path.join(root, 'state'), {key: null, revision: 'a'.repeat(40), dir: root}); await store.init()
  const work = await mkdtemp(path.join(store.file('work'), 'build-'))
  return {root, store, work}
}
afterEach(async () => {for (const root of roots.splice(0)) await rm(root, {recursive: true, force: true})})
function entry(name: string, data = '', type = '0') {
  const content = Buffer.from(data), header = Buffer.alloc(512)
  header.write(name); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116)
  header.write(content.length.toString(8).padStart(11, '0') + '\0', 124); header.write('00000000000\0', 136)
  header.fill(32, 148, 156); header.write(type, 156); header.write('ustar\0', 257); header.write('00', 263)
  header.write(header.reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148)
  return Buffer.concat([header, content, Buffer.alloc((512 - content.length % 512) % 512)])
}
const files = () => ({'package.json': '{}', 'package-lock.json': '{"packages":{"":{}}}', 'game-runtime.json': JSON.stringify({protocol: RUNTIME_PROTOCOL, nodeMajor: Number(process.versions.node.split('.')[0])}), 'server/index.ts': '//fixture'})
function archive(extra: Buffer[] = [], commit = sha) {
  const comment = '52 comment=' + commit + '\n'
  return Buffer.concat([entry('pax_global_header', comment, 'g'), ...Object.entries(files()).map(([file, data]) => entry(`fenghuo-${sha}/${file}`, data)), ...extra, Buffer.alloc(1024)])
}
const ref = () => new Response(JSON.stringify({ref: 'refs/heads/main', object: {type: 'commit', sha}}))
function requestFor(bytes = archive()) {return vi.fn(async (url: any) => String(url).includes('api.github.com') ? ref() : new Response(gzipSync(bytes)))}

describe('GitHub源码包更新通路', () => {
  it('默认检查使用有超时的GitHub API，不启动Git；下载固定SHA并构建，不继承数据库凭据', async () => {
    const f = await fixture(), request = requestFor(), progress = vi.fn(async () => {})
    await writeFile(path.join(f.root, 'package-lock.json'), files()['package-lock.json']); await mkdir(path.join(f.root, 'node_modules/typescript'), {recursive: true})
    const run = vi.fn(async (command: string, args: string[], options: any) => {
      expect(command).toBe('npm'); expect(args).toEqual(['run', 'check']); expect(options.env.RUN_DB_TESTS).toBe('0'); expect(options.env.DB_PASSWORD).toBeUndefined()
      await mkdir(path.join(options.cwd, 'dist-server/server'), {recursive: true}); await mkdir(path.join(options.cwd, 'dist-web'))
      await writeFile(path.join(options.cwd, 'dist-server/server/index.js'), '//built'); await writeFile(path.join(options.cwd, 'dist-web/index.html'), 'built'); return ''
    })
    const source = new GitReleaseSource(f.store, run, undefined, undefined, new GithubSnapshot(request))
    expect(await source.latest()).toBe(sha)
    const release = await source.prepare(sha, progress)
    expect(await readFile(path.join(release.dir, 'server/index.ts'), 'utf8')).toBe('//fixture')
    expect(request.mock.calls.map(c => c[0])).toEqual(['https://api.github.com/repos/gaara-xu/fenghuo/git/ref/heads/main', 'https://codeload.github.com/gaara-xu/fenghuo/tar.gz/' + sha])
    expect(run).toHaveBeenCalledOnce(); expect((await readdir(f.store.file('work'))).some(n => n.startsWith('snapshot-'))).toBe(false)
  })
  it('真实Git生成的tar可以安全解包，支持空文件、中文、空格和可执行模式', async () => {
    const f = await fixture(), repo = path.join(f.root, 'repo'); await mkdir(path.join(repo, 'server'), {recursive: true})
    for (const [file, data] of Object.entries(files())) await writeFile(path.join(repo, file), data)
    await writeFile(path.join(repo, '中文 empty.sh'), '', {mode: 0o755})
    await runCommand('git', ['init', '-b', 'main', repo]); await runCommand('git', ['-C', repo, 'add', '.'])
    await runCommand('git', ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture'])
    const commit = (await runCommand('git', ['-C', repo, 'rev-parse', 'HEAD'])).trim(), tar = path.join(f.root, 'real.tar')
    await runCommand('git', ['-C', repo, 'archive', '--format=tar', '--prefix=fenghuo-' + commit + '/', '--output=' + tar, commit])
    await extractSnapshot(tar, f.work, commit); expect(await readFile(path.join(f.work, '中文 empty.sh'), 'utf8')).toBe('')
  })
  it('检查超时最多两次后释放忙碌状态，旧游戏不中断，再点检查能恢复', async () => {
    const f = await fixture(), request = vi.fn((_url: any, options: any) => new Promise<Response>((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), {once: true})))
    const source = new GitReleaseSource(f.store, undefined, undefined, undefined, new GithubSnapshot(request, async () => {}, 20))
    const game = {start: vi.fn(async () => {}), stop: vi.fn(async () => {})}, manager = new UpdateManager(f.store, source, game); await manager.init()
    manager.request('check', 'timeout-check'); await manager.idle()
    expect(request).toHaveBeenCalledTimes(2); expect(manager.snapshot()).toMatchObject({busy: false, phase: 'failed'}); expect(game.stop).not.toHaveBeenCalled()
    request.mockImplementation(async () => ref()); manager.request('check', 'retry-check'); await manager.idle()
    expect(manager.snapshot()).toMatchObject({busy: false, phase: 'idle', available: true, latestRevision: sha})
  })
  it.each([403, 404])('HTTP %s 不重试，不启动Git备用长等待', async status => {
    const request = vi.fn(async () => new Response('', {status})), source = new GithubSnapshot(request)
    await expect(source.latest()).rejects.toThrow('HTTP ' + status); expect(request).toHaveBeenCalledOnce()
  })
  it('临时断网和503允许一次重试；证书错误不重试', async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response('', {status: 503})).mockResolvedValueOnce(ref()), progress = vi.fn(async () => {})
    expect(await new GithubSnapshot(request, async () => {}).latest(undefined, progress)).toBe(sha); expect(progress).toHaveBeenCalledOnce()
    request.mockReset().mockRejectedValue(new TypeError('fetch failed', {cause: {code: 'CERT_HAS_EXPIRED'}}))
    await expect(new GithubSnapshot(request).latest()).rejects.toThrow('fetch failed'); expect(request).toHaveBeenCalledOnce()
  })
  it('中断的下载重试覆盖残包；明确取消不会重试，并清理暂存文件', async () => {
    const f = await fixture(), request = requestFor(), progress = vi.fn(async () => {})
    request.mockRejectedValueOnce(new TypeError('fetch failed'))
    await new GithubSnapshot(request, async () => {}).extract(sha, f.work, progress); expect(request).toHaveBeenCalledTimes(2)
    const controller = new AbortController(); controller.abort(Error('停止更新'))
    request.mockClear(); await expect(new GithubSnapshot(request).extract(sha, f.work, progress, controller.signal)).rejects.toThrow('停止更新')
    expect(request).not.toHaveBeenCalled(); expect((await readdir(f.store.file('work'))).filter(n => n.startsWith('snapshot-'))).toEqual([])
  })
  it.each([
    ['穿越', () => archive([entry(`fenghuo-${sha}/../escaped`, 'bad')])],
    ['绝对路径', () => archive([entry('/outside', 'bad')])],
    ['软链接', () => archive([entry(`fenghuo-${sha}/link`, '', '2')])],
    ['硬链接', () => archive([entry(`fenghuo-${sha}/link`, '', '1')])],
    ['PAX覆盖路径', () => archive([entry('override', 'path=../bad', 'x')])],
    ['重复文件', () => archive([entry(`fenghuo-${sha}/package.json`, 'bad')])],
    ['环境文件', () => archive([entry(`fenghuo-${sha}/.env`, 'secret')])],
    ['预置依赖', () => archive([entry(`fenghuo-${sha}/node_modules/bad`, '')])],
    ['错误提交', () => archive([], 'c'.repeat(40))],
    ['截断', () => archive().subarray(0, 1000)],
    ['错误校验和', () => {const bytes = archive(); bytes[1] = 1; return bytes}],
  ] as const)('拒绝%s，在校验完成前不写入源码', async (_label, bytes) => {
    const f = await fixture(), tar = path.join(f.root, 'bad.tar'); await writeFile(tar, bytes())
    await expect(extractSnapshot(tar, f.work, sha)).rejects.toThrow(); expect(await readdir(f.work)).toEqual([])
  })
  it('损坏的gzip失败并清理临时文件', async () => {
    const f = await fixture(), request = vi.fn(async () => new Response('broken'))
    await expect(new GithubSnapshot(request).extract(sha, f.work, async () => {})).rejects.toThrow()
    expect((await readdir(f.store.file('work'))).filter(n => n.startsWith('snapshot-'))).toEqual([])
  })
})
