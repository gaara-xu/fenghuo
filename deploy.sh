#!/usr/bin/env bash
set -euo pipefail
FENGHUO_PROJECT="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$FENGHUO_PROJECT"
fail(){ printf '%s\n' "$*" >&2; exit 1; }
if [[ "${1:-}" == --help ]]; then
  printf '%s\n' '用法：DB_PASSWORD=数据库密码 bash deploy.sh [deploy|check|status|logs|stop]' '首次生成 .env.docker，之后保留此配置；deploy 不拉取代码，不初始化或清空数据库。'
  exit 0
fi
action="${1:-deploy}"
case "$action" in deploy|check|status|logs|stop) ;; *) fail '不支持的操作';; esac
command -v docker >/dev/null || fail '请先安装 Docker 和 Docker Compose V2'
docker compose version >/dev/null || fail '需要 Docker Compose V2（docker compose）'
docker info >/dev/null || fail 'Docker 服务不可用，或当前用户没有 Docker 权限'

[[ ! -L .env.docker ]] || fail '.env.docker 不能是符号链接'
if [[ ! -f .env.docker ]]; then
  [[ "$action" == deploy || "$action" == check ]] || fail '尚未部署，请先执行 deploy'
  [[ -n "${DB_PASSWORD:-}" ]] || fail '首次部署请传入 DB_PASSWORD，例如 DB_PASSWORD=你的密码 bash deploy.sh'
  umask 077
  # Compose dotenv single quotes preserve $, # and spaces without executing shell text.
  write_env(){ local value="$2"; [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || fail '部署参数不能包含换行'; value="${value//\'/\\\'}"; printf "%s='%s'\n" "$1" "$value"; }
  tmp="$(mktemp "$FENGHUO_PROJECT/.env.docker.tmp.XXXXXX")"
  trap '[[ -z "${tmp:-}" ]] || rm -f -- "$tmp"' EXIT
  {
    write_env DB_HOST "${DB_HOST:-192.168.3.110}"
    write_env DB_PORT "${DB_PORT:-3306}"
    write_env DB_NAME fenghuo
    write_env DB_USER "${DB_USER:-root}"
    write_env DB_PASSWORD "$DB_PASSWORD"
    write_env PLAYER_ID "${PLAYER_ID:-1}"
    write_env SCHEDULER_TOKEN "${SCHEDULER_TOKEN:-}"
    write_env FENGHUO_PORT "${FENGHUO_PORT:-5173}"
    write_env FENGHUO_BIND_IP "${FENGHUO_BIND_IP:-0.0.0.0}"
  } > "$tmp"
  mv -- "$tmp" .env.docker
  tmp=''
fi
# Existing server configuration is authoritative, not the invoking shell or local development .env.
unset DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD PLAYER_ID SCHEDULER_TOKEN FENGHUO_PORT FENGHUO_BIND_IP
compose(){ docker compose --project-name fenghuo --env-file "$FENGHUO_PROJECT/.env.docker" -f "$FENGHUO_PROJECT/docker-compose.yml" "$@"; }
compose config --quiet
case "$action" in
  status) compose ps; exit;;
  logs) compose logs --tail 100 -f fenghuo-app; exit;;
  stop) compose stop fenghuo-app; printf '%s\n' '游戏已停止，MySQL与存档保留。'; exit;;
esac
mkdir -p .deploy
mkdir .deploy/lock 2>/dev/null || fail '另一个部署正在进行；如上次被强制终止，请确认后移除 .deploy/lock'
trap '[[ -z "${tmp:-}" ]] || rm -f -- "$tmp"; rmdir "$FENGHUO_PROJECT/.deploy/lock"' EXIT
printf '%s\n' '构建生产镜像（包含类型检查、单元测试和网页构建）…'
compose build fenghuo-app
compose run --rm --no-deps -T fenghuo-app node dist-server/scripts/docker-db.js --check
[[ "$action" != check ]] || { printf '%s\n' '镜像和现有数据库检查通过，未启动服务、未更新数据库。'; exit; }
compose stop fenghuo-app
compose run --rm --no-deps -T fenghuo-app node dist-server/scripts/docker-db.js --update
compose up -d --no-build --wait --wait-timeout 120 fenghuo-app
printf '%s\n' '部署完成，默认访问：http://192.168.3.110:5173/  后台：http://192.168.3.110:5173/admin' '如自定义了端口/绑定地址，以以下实际映射为准：'
compose port fenghuo-app 18770
