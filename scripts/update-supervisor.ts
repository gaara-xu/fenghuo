import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {UpdateStorage} from './updater/storage.js'
import {GitReleaseSource} from './updater/git-release.js'
import {LocalGameProcess} from './updater/game-process.js'
import {UpdateManager} from './updater/manager.js'
import {updateServer} from './updater/http.js'

const bundled = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const store = new UpdateStorage('/state', {key: null, revision: process.env.FENGHUO_IMAGE_REVISION || 'bundled', dir: bundled})
const game = new LocalGameProcess(18771), manager = new UpdateManager(store, new GitReleaseSource(store), game)
let initialized = false, closing = false
const server = updateServer(manager, 18771, () => initialized && game.isRunning() && !['switching', 'verifying', 'recovering'].includes(manager.status.phase))
server.listen(Number(process.env.PORT || 18770), process.env.HOST || '0.0.0.0')
async function close(code: number) {
  if (closing) return; closing = true
  server.close(); server.closeIdleConnections()
  await manager.close().catch(console.error)
  process.exit(code)
}
process.once('SIGTERM', () => void close(0)); process.once('SIGINT', () => void close(0))
game.onUnexpectedExit = () => {console.error('游戏进程意外退出，将由容器重启恢复'); void close(1)}
try {await manager.init(); initialized = true}
catch (error) {
  console.error(error)
  manager.status = {...manager.status, busy: false, phase: 'failed', message: '启动失败：' + String(error)}
  // Keep the control plane and static admin UI available for a repair update.
  initialized = true
}
