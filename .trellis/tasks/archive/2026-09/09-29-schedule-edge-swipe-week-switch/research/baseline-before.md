# 基线（改动前，2026-09-29）

采集方式：`pnpm dev` + `agent-browser`（视口 412×915，dpr 2）+ 归档任务的种子数据
（`storage local set class-track-storage` → 立即 `reload`），探针脚本 `baseline-probe.js`。

**环境坑（本沙盒）**：`XDG_RUNTIME_DIR` 默认是只读的 `/run/user/1000`，必须先 `export XDG_RUNTIME_DIR=/tmp/ab-runtime`（**不能**把 export 与 `pnpm dev &` 写在同一条 `&&` 链里 —— 整条链会被 `&` 一起放进子 shell，export 不生效，表现为 `Failed to create socket directory: Read-only file system`）。dev server 也不能跨 bash 调用存活，必须与浏览器操作在同一次调用内完成。

## 数字

```json
{
  "courseCells": 18,
  "scroll": {
    "clientWidth": 379,
    "clientHeight": 732,
    "scrollWidth": 379,
    "scrollLeft": 0,
    "touchAction": "pan-x pan-y",
    "overflowX": "auto",
    "transform": "none",
    "opacity": "1",
    "parentClass": "relative flex min-h-0 flex-1 flex-col",
    "parentTag": "DIV"
  },
  "grid": {
    "clientWidth": 379,
    "scrollWidth": 379,
    "gridTemplateColumns": "32px 49.5625px 49.5781px 49.5625px 49.5781px 49.5625px 49.5781px 49.5781px",
    "zoomLevel": "1",
    "zoomTier": "compact"
  },
  "firstCellFont": { "fontSize": "10.1108px", "lineHeight": "11.6274px" },
  "firstCellRect": { "w": 47, "h": 121 },
  "zoomControlInDom": true,
  "weekBadge": null
}
```

## 复核对齐点（改动后必须逐项相同）

| 项 | 基线 |
|---|---|
| `data-schedule-scroll` 的 `clientWidth / clientHeight` | 379 / 732 |
| `data-schedule-scroll` 的 `scrollWidth` | 379（= `clientWidth` → 1x 无横向滚动，AC-15 的判据） |
| `data-schedule-scroll` 的 `touch-action` | `pan-x pan-y`（本任务**不改**） |
| `data-schedule-grid` 的 `gridTemplateColumns` | `32px 49.5625px 49.5781px 49.5625px 49.5781px 49.5625px 49.5781px 49.5781px` |
| 首个 `[data-course-name]` 的 computed 字号 / 行高 | `10.1108px` / `11.6274px` |
| 首个 `[data-course-cell]` 的 `clientWidth/clientHeight` | 47 / 121 |
| `[data-course-cell]` 数量 | 18 |
| `[data-schedule-zoom-control]` 是否在 DOM | 是 |
| `data-schedule-scroll` 的父元素 class | `relative flex min-h-0 flex-1 flex-col`（改动后应变成新增的 stage 包装类，**尺寸数字必须不变**） |
| `data-week-swipe-state` | 不存在（本任务新增） |
| `data-current-week` | 不存在（本任务新增，`weekBadge` 为 null） |

## 关于 AC-12 的「修前症状」

「连续两次横滑被误判成双击 → 缩放被切换」的成因是**触摸**路径（`pointercancel`）：
桌面 Chrome 的 `doubleclick` 走鼠标分支、不覆盖该路径，因此在桌面浏览器里复现不出来。
改前症状以**代码路径 + 浏览器事实**（`research/gesture-feasibility.md` 的 R1）作为依据，
改后行为在 Android 模拟器上验（`implement.md` 5.6）。
