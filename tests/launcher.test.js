import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {execFileSync,spawnSync} from 'node:child_process'
import {isProjectCommand,project} from '../scripts/game-launcher.mjs'

describe('本地游戏启动器',()=>{
  it.each([
    '/opt/homebrew/bin/node '+project+'/node_modules/vite/bin/vite.js --host 0.0.0.0 --port 5173 --strictPort',
    '/opt/homebrew/bin/node '+project+'/node_modules/tsx/dist/cli.mjs watch server/index.ts',
    '/opt/homebrew/bin/node '+project+'/node_modules/tsx/dist/cli.mjs server/index.ts',
    'node '+project+'/node_modules/.bin/concurrently -k -n web,server',
    'npm run dev',
    'sh -c vite --host 0.0.0.0',
  ])('识别游戏服务命令：%s',command=>expect(isProjectCommand(command)).toBe(true))

  it.each(['node unrelated-app.mjs','python3 -m http.server 5173','/bin/zsh','mysqld','nginx: master process','npm install','node scripts/game-launcher.mjs status'])('不将其他命令当作游戏进程：%s',command=>expect(isProjectCommand(command)).toBe(false))

  it('两个入口均通过 Bash 语法检查，支持明确的命令行帮助',()=>{
    for(const file of ['游戏启动器.sh','游戏启动器.command'])expect(()=>execFileSync('/bin/bash',['-n',file],{cwd:project})).not.toThrow()
    const help=execFileSync('/bin/bash',['游戏启动器.sh','--help'],{cwd:project,encoding:'utf8'})
    expect(help).toContain('start|stop|restart|status')
    expect(help).toContain('不会打开浏览器')
  })

  it('无效命令拒绝执行，导入模块不启动游戏',()=>{
    const r=spawnSync(process.execPath,['scripts/game-launcher.mjs','invalid'],{cwd:project,encoding:'utf8'})
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('仅支持')
  })

  it('可视化菜单四项齐全；双击入口始终转交主脚本',()=>{
    const shell=readFileSync('游戏启动器.sh','utf8'),entry=readFileSync('游戏启动器.command','utf8')
    for(const label of ['启动游戏','关闭游戏','重启游戏','查看状态'])expect(shell).toContain(label)
    expect(shell).toContain('choose from list')
    expect(shell).toContain('cancel button "取消"')
    expect(entry).toContain('exec /bin/bash "$FENGHUO_DIR/游戏启动器.sh" "$@"')
  })
})
