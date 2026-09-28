#!/usr/bin/env bash
set -euo pipefail
# Run on the Docker/MySQL server. Repeat the same command to fast-forward and deploy again.
FENGHUO_REPO='https://github.com/gaara-xu/fenghuo.git'
FENGHUO_DIR="${FENGHUO_DIR:-/gaara/fenghuo}"
fail(){ printf '%s\n' "$*" >&2; exit 1; }
command -v git >/dev/null || fail '服务器需要 git'
command -v docker >/dev/null || fail '服务器需要 Docker'
docker compose version >/dev/null || fail '服务器需要 Docker Compose V2'
case "$FENGHUO_DIR" in /*) ;; *) fail 'FENGHUO_DIR 必须是绝对路径';; esac
[[ "$FENGHUO_DIR" != / && ! -L "$FENGHUO_DIR" ]] || fail '部署目录无效或为符号链接'
if [[ -d "$FENGHUO_DIR/.git" ]]; then
  [[ "$(git -C "$FENGHUO_DIR" remote get-url origin)" == "$FENGHUO_REPO" ]] || fail '部署目录指向其他仓库，未修改'
  [[ "$(git -C "$FENGHUO_DIR" branch --show-current)" == main ]] || fail '部署目录不在 main 分支，未切换分支'
  [[ -z "$(git -C "$FENGHUO_DIR" status --porcelain)" ]] || fail '部署目录有未提交改动，未覆盖'
  git -C "$FENGHUO_DIR" pull --ff-only origin main
elif [[ -e "$FENGHUO_DIR" ]]; then
  fail '部署目录已经存在但不是本项目仓库，未覆盖；请指定另一个 FENGHUO_DIR'
else
  git clone --branch main --single-branch "$FENGHUO_REPO" "$FENGHUO_DIR"
fi
exec bash "$FENGHUO_DIR/deploy.sh"
