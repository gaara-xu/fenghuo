#!/bin/bash
# Finder双击入口，所有实际操作由同目录.sh脚本完成。
FENGHUO_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd -P)" || exit 1
exec /bin/bash "$FENGHUO_DIR/游戏启动器.sh" "$@"
