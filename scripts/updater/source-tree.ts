export function validateSourcePath(file: string) {
  const parts = file.split('/')
  if (file.includes('\\') || /[\x00-\x1f\x7f]/.test(file) || parts.some(p => !p || p === '.' || p === '..') || (parts[0].startsWith('.env') && file !== '.env.example') || ['.git', '.game-update', 'node_modules', 'dist-web', 'dist-server', '.fenghuo-release.json', 'source.tar'].includes(parts[0])) throw Error('源码含不安全的路径：' + file)
}
export function validateTree(tree: string) {
  const paths = new Set<string>()
  for (const entry of tree.split('\0').filter(Boolean)) {
    const match = /^(100644|100755) blob [a-f0-9]{40}\t(.+)$/s.exec(entry)
    if (!match) throw Error('源码含符号链接、子模块或不支持的文件类型')
    validateSourcePath(match[2]); paths.add(match[2])
  }
  for (const file of ['package.json', 'package-lock.json', 'game-runtime.json', 'server/index.ts']) if (!paths.has(file)) throw Error('源码缺少必要文件：' + file)
}
