import type {GameUpdateStatus, UpdatePhase} from '../../shared/game-update.js'
import {UpdateStorage, atomicJson, readJson, type Release} from './storage.js'
import type {ReleaseSource} from './git-release.js'

export interface GameProcess {start(release: Release, signal?: AbortSignal): Promise<void>; stop(): Promise<void>; isRunning?(): boolean}
export class UpdateManager {
  status: GameUpdateStatus
  current: Release
  private task?: Promise<void>
  private closing = false
  private running = false
  private controller?: AbortController
  constructor(readonly store: UpdateStorage, readonly source: ReleaseSource, readonly game: GameProcess) {
    this.current = store.bundled
    this.status = {supported: true, busy: false, available: false, currentRevision: this.current.revision, phase: 'idle', message: '可以检查并更新游戏', updatedAt: new Date().toISOString(), events: []}
  }
  private async save(phase: UpdatePhase, message: string) {
    const at = new Date().toISOString()
    this.status = {...this.status, phase, message: message.slice(0, 2000), updatedAt: at, currentRevision: this.current.revision,
      events: [...this.status.events, {at, message: message.slice(0, 2000)}].slice(-24)}
    await atomicJson(this.store.file('status.json'), this.status)
  }
  async init() {
    this.status.busy = true
    await this.store.init()
    const stored = await readJson<GameUpdateStatus>(this.store.file('status.json')), pointer = await this.store.pointer()
    if (stored) this.status = {...stored, supported: true, busy: true}
    // A crash during cutover must not silently boot a candidate whose health was never confirmed.
    const interrupted = stored?.busy && ['switching', 'verifying', 'recovering'].includes(stored.phase)
    const key = interrupted ? stored.previousKey ?? null : pointer.current
    this.current = await this.store.release(key)
    if (interrupted) await this.store.activate(key, pointer.previous)
    await this.game.start(this.current)
    this.status.busy = false
    await this.save(stored?.busy ? 'failed' : 'idle', stored?.busy ? '上次更新被中断，已启动原版本，可重新更新' : '游戏已启动，可以一键更新')
  }
  snapshot(): GameUpdateStatus {return structuredClone(this.status)}
  async idle() {await this.task}
  request(kind: 'check' | 'run', requestId: string) {
    if (this.closing) throw Error('服务正在停止')
    if (this.running || this.status.busy || this.status.requestId === requestId) return this.snapshot()
    this.running = true
    this.controller = new AbortController()
    this.status = {...this.status, busy: true, phase: 'checking', requestId, message: '正在检查游戏版本', updatedAt: new Date().toISOString(), events: [], previousKey: this.current.key}
    this.task = this.execute(kind, this.controller.signal).catch(async error => {
      this.status.busy = false
      await this.save('failed', error instanceof Error ? error.message : '更新失败').catch(console.error)
    }).finally(()=>{this.running=false;this.status.busy=false;this.controller=undefined})
    return this.snapshot()
  }
  private async execute(kind: 'check' | 'run', signal: AbortSignal) {
    const before = this.current
    let switched = false
    try {
      await this.save('checking', '正在检查 GitHub 主分支版本')
      const latest = await this.source.latest(signal, message => this.save('checking', message))
      signal.throwIfAborted()
      this.status.latestRevision = latest; this.status.checkedAt = new Date().toISOString(); this.status.available = latest !== before.revision
      if (kind === 'check' || !this.status.available) {
        if(kind==='run' && this.game.isRunning && !this.game.isRunning())await this.game.start(before)
        this.status.busy = false
        await this.save('idle', this.status.available ? '发现新版本，点击更新游戏即可安装' : '当前已是最新版本')
        return
      }
      const candidate = await this.source.prepare(latest, (phase, message) => this.save(phase, message), signal)
      if (this.closing) throw Error('服务停止，已取消版本切换')
      await this.save('switching', '编译测试通过，正在等待旧游戏安全退出')
      // No database backup/migration/seed commands are part of this update pipeline.
      switched = true
      await this.game.stop()
      await this.store.activate(candidate.key, before.key)
      await this.save('verifying', '正在启动新版并检查服务状态')
      await this.game.start(candidate, signal)
      this.current = candidate; this.status.busy = false; this.status.available = false
      await this.save('succeeded', '更新完成，游戏已恢复')
      await this.store.prune([candidate.key, before.key]).catch(error => console.error('旧版本清理未完成', error))
    } catch (error) {
      let message = error instanceof Error ? error.message : '更新失败'
      if (switched) {
        try {
          await this.save('recovering', '新版未能正常启动，正在恢复原版本')
          await this.game.stop(); await this.store.activate(before.key, null)
          if (!this.closing) await this.game.start(before)
          this.current = before; message += this.closing ? '；已保留原版本供下次启动恢复' : '；已恢复原版本'
        } catch (recovery) {message += '；原版本恢复失败：' + String(recovery)}
      } else message += '；原游戏未切换'
      this.status.busy = false
      await this.save('failed', message)
    }
  }
  async close() {
    this.closing = true
    this.controller?.abort(Error('服务正在停止，已取消更新'))
    await this.task
    await this.game.stop()
  }
}
