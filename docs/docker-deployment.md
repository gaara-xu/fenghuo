# 110 服务器一键 Docker 部署

游戏和现有 MySQL 在同一台 `192.168.3.110`。只部署游戏容器，不新建 MySQL，不重置存档。容器连接 `192.168.3.110:3306/fenghuo`；容器自己的 `127.0.0.1` 不是宿主机 MySQL。

## 一条命令

把代码下载或克隆到 **110 服务器**，解压后进入包含 `deploy.sh` 的项目目录，只执行：

```bash
bash deploy.sh
```

数据库参数已预置：地址 `192.168.3.110`、端口 `3306`、库 `fenghuo`、账号 `root`、密码 `root`。**不需要输入任何参数、不需要复制或编辑环境文件，也不需要额外运行安装依赖、构建镜像或启动容器命令。** 脚本会一次完成这些步骤并等待健康检查。

支持ZIP下载解压，在源码所在目录就地构建；不要求源码目录是Git仓库，也不要求宿主机安装Node、npm、git或curl。服务器只需已有Docker、Compose V2以及可用的镜像仓库/npm网络。以后下载新代码后执行相同命令即可重新部署，已有 `.env.docker` 保留。

如果还没有下载代码，也可使用可选的在线安装入口（这个入口另需git、curl和GitHub网络）：

```bash
curl -fsSL https://raw.githubusercontent.com/gaara-xu/fenghuo/main/scripts/install-docker.sh | bash
```

在线入口默认使用 `/gaara/fenghuo`，重复执行会快进拉取main并部署；不会覆盖本地代码改动或其他仓库。下载源码后的 `bash deploy.sh` 不拉取代码，不需要GitHub网络。

访问：

- 游戏：`http://192.168.3.110:5173/`
- 管理后台：`http://192.168.3.110:5173/admin`
- 调度接口清单：`http://192.168.3.110:5173/admin#tasks`

前台、后台和 API 同端口，不需要 Nginx。按原设计没有登录，仅在受信内网使用，不做公网端口映射。Docker 发布 TCP 5173；若服务器有额外防火墙/ACL，需要允许内网访问此端口，脚本不修改整机防火墙。

## 存档及迁移

首次自动生成 `.env.docker`（权限600），数据库地址110、端口3306、账号root、密码root、库fenghuo、玩家1；无需手工操作。只有想偏离默认配置时才需要修改它。该运行配置不提交Git，也不进入Docker镜像；默认连接参数已写在脚本及Compose中。没有数据库容器或数据库卷，删游戏容器不会删除MySQL存档。

**切换前关闭Mac上的本地游戏服务**：在本地项目目录执行 `bash 游戏启动器.sh stop`。两套服务不要同时长期连接同一个单人存档，特别是酒馆关闭记录时，候选只存在各自进程内存。浏览器关闭不等于服务关闭；切换服务时内存酒馆候选会丢失，已领取的物品和英雄不受影响。

部署先构建镜像（包含全部离线测试）、验证已有 `fenghuo` 数据库和玩家存在，再停止旧游戏容器，执行与 `npm run db:update` 相同的已版本化增量更新，最后启动并等待健康检查。构建/连接预检失败不会停止旧容器；增量更新或健康检查失败则明确失败，不报告部署成功。增量DDL不能整体回滚，重要存档建议先由你现有备份系统备份fenghuo；脚本不会自动执行种子初始化、背包清空或废弃物品清理。

本命令针对你现有数据库。空库会拒绝启动，而不会擅自建库/生成新存档；全新安装的初始化方法见README本地安装部分。

## 日常命令

```bash
# 在你下载的项目目录中执行
bash deploy.sh status   # 状态
bash deploy.sh logs     # 最近100行并跟随日志，Ctrl+C退出日志
bash deploy.sh stop     # 只停止游戏，保留存档和MySQL
bash deploy.sh          # 按当前本地代码重新部署
bash deploy.sh check    # 仅构建和数据库连接验证，不启动游戏、不运行增量更新
```

日志自动轮换，最多3份，每份10MB。容器以非root用户运行，服务器重启后Docker按 `unless-stopped` 恢复游戏。

自定义配置后，直接运行 `bash deploy.sh`。需要更改基础镜像来源时可指定 `NODE_IMAGE=你的镜像代理/node:22-bookworm-slim bash deploy.sh`，不会更改数据库地址；请仅使用可信镜像来源。

## 常见故障

- 拉取镜像或安装依赖超时：检查服务器到Docker镜像仓库/npm的网络或已有镜像代理，不能用“部署完成”代替失败。
- MySQL拒绝连接：确认现有MySQL监听110网卡地址，账号允许Docker容器网络连接；只授予fenghuo权限即可。不要把DB_HOST改为容器的localhost。
- 5173端口已占用：保留现有服务并检查占用者，不按端口强杀进程；可调整 `.env.docker` 的 `FENGHUO_PORT`。
- 有遗留 `.deploy/lock`：先确认没有部署进程在运行，再移除该空目录重试。
- 镜像构建失败：旧容器不停止。增量更新失败：先查看终端错误及当前数据库迁移记录，修复后重试，不重跑初始种子。

实现参考：[Compose环境变量规则](https://docs.docker.com/compose/how-tos/environment-variables/envvars-precedence/)、[Compose启动与健康等待](https://docs.docker.com/reference/cli/docker/compose/up/)。
