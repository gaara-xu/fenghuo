#!/bin/bash
# 无参数：macOS可视化菜单；命令行：start / stop / restart / status。
set -u
FENGHUO_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd -P)" || exit 1
cd "$FENGHUO_DIR" || exit 1

find_node() {
  if command -v node >/dev/null 2>&1; then command -v node; return; fi
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -x "$candidate" ]; then printf '%s\n' "$candidate"; return; fi
  done
  return 1
}

show_message() {
  if [ "$(uname -s)" = Darwin ] && [ -x /usr/bin/osascript ]; then
    /usr/bin/osascript - "$1" <<'APPLESCRIPT'
on run argv
  display dialog (item 1 of argv) with title "烽火战国 · 游戏启动器" buttons {"好"} default button "好"
end run
APPLESCRIPT
  else
    printf '%s\n' "$1"
  fi
}

if ! FENGHUO_NODE="$(find_node)"; then
  show_message '未找到 Node.js。请先安装 Node.js 22.12 或更新版本，再运行本脚本。'
  exit 1
fi

if [ "${1:-}" = '--help' ] || [ "${1:-}" = '-h' ]; then
  printf '%s\n' '用法：bash 游戏启动器.sh [start|stop|restart|status]' '不传参数时显示操作菜单；不会打开浏览器，也不会修改数据库结构。'
  exit 0
fi

if [ "$#" -gt 0 ]; then
  exec "$FENGHUO_NODE" "$FENGHUO_DIR/scripts/game-launcher.mjs" "$@"
fi

while true; do
  if [ "$(uname -s)" = Darwin ] && [ -x /usr/bin/osascript ]; then
    if ! FENGHUO_CHOICE="$(/usr/bin/osascript <<'APPLESCRIPT'
set choice to choose from list {"启动游戏", "关闭游戏", "重启游戏", "查看状态"} with title "烽火战国 · 游戏启动器" with prompt "请选择操作。关闭菜单不会关闭游戏。" default items {"启动游戏"} OK button name "执行" cancel button name "退出" multiple selections allowed false empty selection allowed false
if choice is false then
  return "退出"
else
  return item 1 of choice
end if
APPLESCRIPT
    )"; then exit 0; fi
  else
    printf '\n%s\n' '烽火战国：1 启动 / 2 关闭 / 3 重启 / 4 状态 / 0 退出'
    IFS= read -r FENGHUO_CHOICE || exit 0
  fi

  case "$FENGHUO_CHOICE" in
    '启动游戏'|1) FENGHUO_ACTION=start ;;
    '关闭游戏'|2) FENGHUO_ACTION=stop ;;
    '重启游戏'|3) FENGHUO_ACTION=restart ;;
    '查看状态'|4) FENGHUO_ACTION=status ;;
    '退出'|0|'') exit 0 ;;
    *) continue ;;
  esac
  if [ "$FENGHUO_ACTION" = stop ] || [ "$FENGHUO_ACTION" = restart ]; then
    if [ "$(uname -s)" = Darwin ]; then
      if ! /usr/bin/osascript <<'APPLESCRIPT' >/dev/null 2>&1
display dialog "确定停止当前游戏服务？\n\n不会删除存档或停止MySQL。关闭期间调度URL不可访问，行军与自动出征会在下次启动后按经过的游戏时间补结算。" with title "确认停止烽火战国" buttons {"取消", "继续"} default button "取消" cancel button "取消"
APPLESCRIPT
      then continue; fi
    fi
  fi
  if FENGHUO_RESULT="$("$FENGHUO_NODE" "$FENGHUO_DIR/scripts/game-launcher.mjs" "$FENGHUO_ACTION" 2>&1)"; then
    show_message "$FENGHUO_RESULT" >/dev/null
  else
    show_message "操作未完成：
$FENGHUO_RESULT" >/dev/null
  fi
done
