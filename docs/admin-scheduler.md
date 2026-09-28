# 独立管理后台与外部调度接口

## 页面入口

- `/`：游戏，只保留酒馆、我的英雄、天下、城防、包裹与只读图鉴。
- `/admin`：英雄/技能定义、品质、卡池、物品、掉落池、成长与世界控制。
- `/admin#tasks`：任务地址、说明、GET示例与最近成功时间。可修改“调度访问根地址”来生成内网或部署后的完整地址，此输入只用于拼接示例，不会修改服务器配置。

前后端共享存档，但使用独立的前端入口组件。管理表单不加载进游戏入口；游戏只读取 `/api/catalog/heroes` 与 `/api/catalog/skills`。
没有增加用户系统：`/admin` 是操作环境分离，不是登录/权限隔离，只能放在受信内网。
Vite 和生产服务均支持直接访问、刷新 `/admin` 和 `/admin/`；静态资源使用根路径 `/assets/`。

## 调度任务

以下路径均为 **GET**，不需要请求体；定时频率由用户自己的调度系统设置，应用不会自动按这些频率运行。

| 功能 | 路径 | 可选频率 |
| --- | --- | --- |
| 刷新据点 | `/api/admin/tasks/refresh-outposts/run` | 每小时 |
| 刷新野地 | `/api/admin/tasks/refresh-wilds/run` | 每2小时 |
| 刷新随机城池 | `/api/admin/tasks/refresh-random-cities/run` | 每6小时 |
| 刷新全部动态目标 | `/api/admin/tasks/refresh-map/run` | 每小时，与前三项择一 |
| 清理过期记录 | `/api/admin/tasks/cleanup-records/run` | 每天，可选 |

只读机器清单：`GET /api/admin/tasks`。
按用户要求，GET 直接执行任务，打开或刷新该地址都可能改变世界状态。后台仅提供只读文本与复制按钮，不自动访问执行地址。响应禁止缓存，明确标注的预取/预渲染/预览请求409且不执行；HEAD及POST返回405且不执行。未知任务404，非法参数400，启用令牌后缺失或错误令牌401，跨网站浏览器调用403，执行失败500。没有预取标识的普通GET无法与真实调度区分，勿将执行URL当作普通链接分享或访问。

本机例子：

```bash
curl --fail-with-body --request GET 'http://localhost:5173/api/admin/tasks/refresh-outposts/run'
```

本轮开发电脑内网地址在验证时为 `192.168.3.23`：若调度器位于服务器或其他电脑，应调用 `http://192.168.3.23:5173/api/admin/tasks/refresh-outposts/run`。它依赖开发电脑开机、网络地址不变且开发服务运行。
游戏尚未部署到 `192.168.3.110`，不要把数据库服务器当作已经运行游戏的服务器。
实际部署后改为 Nginx 的游戏访问根地址，或在游戏服务器本机调用 `http://127.0.0.1:18770` 下的相同API路径。未修改 Nginx。

## 可选令牌与重试

`.env` 中新增可选 `SCHEDULER_TOKEN`，至少24个字符；默认空，保持既有受信内网无登录行为。配置后重启服务，并在调度器中发送 `Authorization: Bearer <令牌>`。
令牌不放进URL，后台清单不返回令牌。此项仅保护上述任务执行API，不会保护其他既有管理接口或给后台增加登录。

调度器建议每个执行周期生成一次唯一编号，在URL追加 `?requestId=本轮唯一编号`；也支持 `Idempotency-Key` 请求头。网络超时重试使用同一编号，下周期用新编号；同时提供两种方式时必须一致。
不提供编号也可执行，但每次调用都会被视为新执行。

```bash
curl --fail-with-body --request GET 'http://localhost:5173/api/admin/tasks/refresh-outposts/run?requestId=outposts-20260915T140000'
```

成功返回 `{ "ok": true, "taskId": "refresh-outposts", "requestId": "...", "replayed": false, "completedAt": "...", "summary": "...", "generation": 123 }`。
若命中重试，返回原来的结果与 `replayed: true`。不要在不同周期复用上面的固定示例编号。

业务变更和成功记录同事务提交；失败整体回滚，不产生“已成功”记录。并发调用通过玩家行锁串行化。
每任务仅保留最近50条成功记录（包含去重编号），旧记录物理删除，因此去重只在这50条窗口内有效。后台显示最近成功，不展示无限增长的调度历史；失败信息由调度系统的HTTP结果和应用日志查看。

## 刷新和清理边界

- 分类刷新只修改对应类型，缺少时补足至少4个；在途/战斗/返城中的目标完全保留，也计入数量，不会因频繁调度无限增加目标。
- 据点最高20级；野地、随机城池仍为1—5级。副本和系统城不刷新。
- 清理保持主动战报最新50条，删除已完成普通行军和无引用0级据点；不清空全部战报，不删除被攻击战报及自动出征记录。
- 外部定时按调度系统的真实时间运行，不受游戏加速倍率影响。原有每2秒行军/刷野结算继续运行，不需要外部定时接管。

## 数据库与验证

新增版本 `0007_scheduled_tasks`，幂等升级脚本 `scripts/update-scheduled-tasks.ts` 已加入 `npm run db:update`。
唯一完整无业务数据结构 `database/schema.sql` 与增量DDL `database/migrations/0007_scheduled_tasks.sql` 同步。
仅访问 `fenghuo`；迁移只加表，不运行任何调度任务，不重置游戏存档。

`npm run check` 验证类型、单元测试和生产构建；`RUN_DB_TESTS=1 npm test -- tests/game-db.integration.test.ts` 在外层事务回滚验证分类刷新、保护在途目标、重试去重、有界存储和失败原子回滚。
