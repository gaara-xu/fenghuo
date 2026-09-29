import {spawn} from 'node:child_process'

export interface CommandOptions {cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; maxOutput?: number}
export type RunCommand = (command: string, args: string[], options?: CommandOptions) => Promise<string>
export const runCommand: RunCommand = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {cwd: options.cwd, env: options.env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32'})
  let output = '', errorOutput = '', failure: Error | undefined
  const kill = () => {try {if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL')} catch {}}
  const timer = setTimeout(() => {failure = Error('命令执行超时：' + command); kill()}, options.timeoutMs ?? 120000)
  const append = (chunk: Buffer, stderr: boolean) => {
    if (stderr) errorOutput = (errorOutput + chunk.toString()).slice(-8000)
    else output += chunk.toString()
    if (Buffer.byteLength(output) > (options.maxOutput ?? 8 * 1024 * 1024)) {failure = Error('命令输出过大：' + command); kill()}
  }
  child.stdout.on('data', chunk => append(chunk, false)); child.stderr.on('data', chunk => append(chunk, true))
  child.once('error', error => {clearTimeout(timer); reject(error)})
  child.once('close', code => {
    clearTimeout(timer)
    if (failure) reject(failure)
    else if (code !== 0) reject(Error(command + ' 执行失败：' + (errorOutput || output).slice(-2000)))
    else resolve(output)
  })
})
export function buildEnvironment(cache: string, temp: string): NodeJS.ProcessEnv {
  // Candidate tests/build scripts never inherit live database settings or the opt-in DB test flag.
  const env = {...process.env}
  for (const key of Object.keys(env)) if (/^(DB_|MYSQL_|SCHEDULER_|RUN_DB_TESTS$|NODE_OPTIONS$|NODE_ENV$|VITE_USER_NODE_ENV$|GIT_CONFIG_|GIT_SSH)/.test(key)) delete env[key]
  // Let Vitest choose test mode and Vite choose production mode. npm ci explicitly includes build dependencies.
  return {...env, RUN_DB_TESTS: '0', npm_config_cache: cache, TMPDIR: temp, GIT_TERMINAL_PROMPT: '0'}
}
