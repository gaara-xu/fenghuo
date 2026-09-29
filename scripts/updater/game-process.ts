import {spawn, type ChildProcess} from 'node:child_process'
import {setTimeout as delay} from 'node:timers/promises'
import path from 'node:path'
import type {Release} from './storage.js'
import type {GameProcess} from './manager.js'

export class LocalGameProcess implements GameProcess {
  private child?: ChildProcess
  private exit?: Promise<void>
  private healthy = false
  private stopping = false
  onUnexpectedExit?: () => void
  constructor(readonly port: number, private env: NodeJS.ProcessEnv = process.env, private healthTimeout = 60000, private stopTimeout = 60000) {}
  isRunning() {return Boolean(this.child && this.child.exitCode === null && this.child.signalCode === null)}
  async start(release: Release, signal?: AbortSignal) {
    signal?.throwIfAborted()
    if (this.isRunning()) throw Error('旧游戏尚未停止，拒绝同时运行两个游戏进程')
    this.stopping = false; this.healthy = false
    const child = spawn(process.execPath, [path.join(release.dir, 'dist-server/server/index.js')], {
      cwd: release.dir, env: {...this.env, HOST: '127.0.0.1', PORT: String(this.port), NODE_ENV: 'production', FENGHUO_APP_REVISION: release.revision}, stdio: 'inherit',
    })
    this.child = child
    let launchError: Error | undefined
    this.exit = new Promise(resolve => {
      child.once('error', error => {launchError = error; resolve()})
      child.once('exit', () => {resolve(); if (this.healthy && !this.stopping) this.onUnexpectedExit?.()})
    })
    const deadline = Date.now() + this.healthTimeout
    while (Date.now() < deadline) {
      signal?.throwIfAborted()
      if (launchError) throw launchError
      if (!this.isRunning()) throw Error('游戏进程启动后退出，请查看容器日志')
      try {
        const response = await fetch(`http://127.0.0.1:${this.port}/api/health`, {signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(1500)]) : AbortSignal.timeout(1500)})
        const result = await response.json() as {ok?: boolean; revision?: string}
        if (response.ok && result.ok && result.revision === release.revision) {this.healthy = true; return}
      } catch {}
      await delay(300, undefined, {signal})
    }
    throw Error('新版服务启动检查超时')
  }
  async stop() {
    if (!this.child || !this.isRunning()) return
    this.stopping = true; this.healthy = false
    this.child.kill('SIGTERM')
    const ended = await Promise.race([this.exit!.then(() => true), delay(this.stopTimeout,false,{ref:false})])
    if (!ended) {
      this.child.kill('SIGKILL')
      if (!await Promise.race([this.exit!.then(() => true), delay(5000,false,{ref:false})])) throw Error('旧游戏无法停止，已阻止新版启动')
    }
  }
}
