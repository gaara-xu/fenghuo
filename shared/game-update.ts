export const updatePhases = {
  idle: '等待更新', checking: '检查版本', fetching: '拉取代码', dependencies: '准备依赖',
  building: '编译与测试', switching: '切换版本', verifying: '检查启动',
  succeeded: '更新完成', failed: '更新失败', recovering: '恢复服务',
} as const
export type UpdatePhase = keyof typeof updatePhases
export interface GameUpdateStatus {
  supported: boolean
  busy: boolean
  available: boolean
  currentRevision: string
  latestRevision?: string
  requestId?: string
  phase: UpdatePhase
  message: string
  updatedAt: string
  checkedAt?: string
  previousKey?: string | null
  events: Array<{at: string; message: string}>
}
export const unsupportedUpdate = (): GameUpdateStatus => ({
  supported: false, busy: false, available: false, currentRevision: '本地开发版', phase: 'idle',
  message: '当前不是一键更新运行环境；服务器首次使用新版 deploy.sh 启用，之后直接点击更新游戏。',
  updatedAt: new Date().toISOString(), events: [],
})
