import {spawn} from 'node:child_process'

export interface CommandOptions {cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; maxOutput?: number; signal?: AbortSignal}
export class CommandError extends Error {
  constructor(message: string, readonly kind: 'exit' | 'timeout' | 'output' | 'aborted') {super(message)}
}
export type RunCommand = (command: string, args: string[], options?: CommandOptions) => Promise<string>
export const runCommand: RunCommand = (command, args, options = {}) => new Promise((resolve, reject) => {
  if (options.signal?.aborted) return reject(new CommandError('命令已取消：' + command, 'aborted'))
  const child = spawn(command, args, {cwd: options.cwd, env: options.env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32'})
  let output = '', errorOutput = '', failure: Error | undefined, settled = false
  let hardKill: ReturnType<typeof setTimeout> | undefined, drain: ReturnType<typeof setTimeout> | undefined
  const kill = (signal: NodeJS.Signals) => {try {if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal); else child.kill(signal)} catch {}}
  const finish = (error?: Error) => {
    if (settled) return; settled = true
    clearTimeout(timer); clearTimeout(hardKill); clearTimeout(drain); options.signal?.removeEventListener('abort', abort)
    if (error) reject(error); else resolve(output)
  }
  const terminate = (error: Error) => {
    if (failure || settled) return; failure = error
    // Give Git a chance to release lock files, then kill the entire build/fetch process group.
    kill('SIGTERM')
    hardKill = setTimeout(() => {
      kill('SIGKILL')
      // A leaked inherited pipe must never keep the updater's busy flag set indefinitely.
      drain = setTimeout(() => {child.stdout.destroy(); child.stderr.destroy(); finish(error)}, 1000)
    }, 1000)
  }
  const timer = setTimeout(() => terminate(new CommandError('命令执行超时：' + command, 'timeout')), options.timeoutMs ?? 120000)
  const abort = () => terminate(new CommandError('命令已取消：' + command, 'aborted'))
  options.signal?.addEventListener('abort', abort, {once: true})
  if (options.signal?.aborted) abort()
  const append = (chunk: Buffer, stderr: boolean) => {
    if (failure || settled) return
    if (stderr) errorOutput = (errorOutput + chunk.toString()).slice(-8000)
    else output += chunk.toString()
    if (Buffer.byteLength(output) > (options.maxOutput ?? 8 * 1024 * 1024)) terminate(new CommandError('命令输出过大：' + command, 'output'))
  }
  child.stdout.on('data', chunk => append(chunk, false)); child.stderr.on('data', chunk => append(chunk, true))
  child.once('error', error => finish(failure ?? error))
  child.once('close', code => {
    if (failure || code !== 0) kill('SIGKILL')
    finish(failure ?? (code !== 0 ? new CommandError(command + ' 执行失败：' + (errorOutput || output).slice(-2000), 'exit') : undefined))
  })
})
export function buildEnvironment(cache: string, temp: string): NodeJS.ProcessEnv {
  // Candidate tests/build scripts never inherit live database settings or the opt-in DB test flag.
  const env = {...process.env}
  for (const key of Object.keys(env)) if (/^(DB_|MYSQL_|SCHEDULER_|RUN_DB_TESTS$|NODE_OPTIONS$|NODE_ENV$|VITE_USER_NODE_ENV$|GIT_CONFIG_|GIT_SSH|GIT_SSL_NO_VERIFY$)/.test(key)) delete env[key]
  // Let Vitest choose test mode and Vite choose production mode. npm ci explicitly includes build dependencies.
  return {...env, RUN_DB_TESTS: '0', npm_config_cache: cache, TMPDIR: temp, GIT_TERMINAL_PROMPT: '0'}
}
