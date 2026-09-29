import {lstat, mkdir, readFile, writeFile, rename, readdir, rm, realpath} from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'

export const revisionPattern = /^[a-f0-9]{40}$/
export function revision(value: string) {
  if (!revisionPattern.test(value)) throw Error('版本编号无效')
  return value
}
export async function directory(dir: string) {
  await mkdir(dir, {recursive: true, mode: 0o700})
  const stat = await lstat(dir)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('更新目录不能是符号链接')
}
export async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    if ((await lstat(file)).isSymbolicLink()) throw Error('更新状态文件不能是符号链接')
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
}
export async function atomicJson(file: string, value: unknown) {
  const temp = file + '.' + randomUUID() + '.tmp'
  try { await writeFile(temp, JSON.stringify(value), {mode: 0o600, flag: 'wx'}); await rename(temp, file) }
  finally { await rm(temp, {force: true}) }
}
export interface Release {key: string | null; revision: string; dir: string}
interface Pointer {current: string | null; previous: string | null}
export class UpdateStorage {
  constructor(readonly root: string, readonly bundled: Release) {}
  file(name: string) { return path.join(this.root, name) }
  async init() {
    await directory(this.root)
    for (const name of ['releases', 'work', 'npm-cache', 'tmp']) await directory(this.file(name))
  }
  async pointer(): Promise<Pointer> { return await readJson<Pointer>(this.file('active.json')) ?? {current: null, previous: null} }
  async activate(current: string | null, previous: string | null) {
    if (current !== null) revision(current)
    if (previous !== null) revision(previous)
    await atomicJson(this.file('active.json'), {current, previous})
  }
  async release(key: string | null): Promise<Release> {
    if (key === null) return this.bundled
    const dir = this.releasePath(key), meta = await readJson<{revision: string; ready: boolean}>(path.join(dir, '.fenghuo-release.json'))
    if (meta?.revision !== key || !meta.ready || await realpath(dir) !== dir) throw Error('已保存版本不完整，请重新更新')
    return {key, revision: key, dir}
  }
  releasePath(key: string) { return path.resolve(this.file('releases'), revision(key)) }
  async publish(key: string, work: string): Promise<Release> {
    const parent = path.resolve(this.file('work'))
    if (path.dirname(work) !== parent || await realpath(work) !== work) throw Error('构建目录越界')
    await atomicJson(path.join(work, '.fenghuo-release.json'), {revision: key, ready: true})
    const target = this.releasePath(key)
    try { await lstat(target); return await this.release(key) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    await rename(work, target)
    return this.release(key)
  }
  async prune(keep: Array<string | null>) {
    // Only updater-owned, exact SHA directories with our completion marker may be removed.
    for (const item of await readdir(this.file('releases'), {withFileTypes: true})) {
      if (!item.isDirectory() || !revisionPattern.test(item.name) || keep.includes(item.name)) continue
      const release = await this.release(item.name)
      await rm(release.dir, {recursive: true})
    }
  }
}
