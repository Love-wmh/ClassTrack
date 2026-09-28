#!/usr/bin/env bash
# AC-E1 视觉复核：在真实应用里灌入覆盖全部格型的夹具（含已上 / 缺勤 / 只写备注 / 非本周），
# 读每个课程格的实际计算样式（探针见 visual-check-eval.js），并截图。
#
# 用法：bash run-visual-check.sh [视口宽] [视口高] [输出文件名]
# 前置：/tmp/classtrack-tmp/seed-all.js（seed-schedule-fixture.js + 出勤/显示两个开关的 setItem）
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
cd "$ROOT_DIR" || exit 1
export XDG_RUNTIME_DIR=/tmp/classtrack-tmp TMPDIR=/tmp/classtrack-tmp

# 注意：脚本之间用文件传参，不要把 heredoc 写在 $(...) 里 —— 本机 bash 5.2 会把
# 首行以定界符开头的正文行误判成定界符（`JSON.stringify` 被吃掉开头的 `JS`）。
SEED_B64="$(base64 -w0 /tmp/classtrack-tmp/seed-all.js)"
PROBE_B64="$(base64 -w0 "$SCRIPT_DIR/visual-check-eval.js")"
VIEWPORT_W="${1:-360}"
VIEWPORT_H="${2:-794}"
OUT_NAME="${3:-after-${VIEWPORT_W}x${VIEWPORT_H}-absent-ring.png}"

(pnpm dev > /tmp/classtrack-tmp/dev-visual.log 2>&1 &)
for _ in $(seq 1 60); do
  code=$(curl -s --noproxy '*' -o /dev/null -w '%{http_code}' http://127.0.0.1:5173/ 2>/dev/null)
  [ "$code" = "200" ] && break
  sleep 1
done
echo "dev http=$code"

agent-browser batch \
  "set viewport $VIEWPORT_W $VIEWPORT_H" \
  'open http://localhost:5173/' \
  "eval -b $SEED_B64" \
  'reload' \
  'wait [data-course-cell]' \
  'wait 2000' \
  'get count [data-course-cell]' \
  "eval -b $PROBE_B64" \
  "screenshot $SCRIPT_DIR/$OUT_NAME" 2>&1 | tail -180
