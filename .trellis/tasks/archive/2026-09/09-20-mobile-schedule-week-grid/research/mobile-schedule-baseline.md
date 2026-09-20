# 研究：移动端课表基线（改动前实测）

> 记录时间：2026-09-20。目的：为「移动端课表整周可见与信息密度优化」提供可复现的改动前基线，避免验收时凭印象争论。

## 复现环境

| 项 | 值 |
| --- | --- |
| 命令 | `pnpm dev`（react-router dev，`http://localhost:5173/`） |
| 截图工具 | `agent-browser`（Chrome via CDP） |
| 视口 | 412×915 DPR 2（主流安卓）/ 360×800 DPR 2（窄屏）/ 1440×900 DPR 1（桌面回归基线） |
| 数据 | `research/seed-schedule-fixture.js` 写入 `localStorage['class-track-storage']`（zustand persist 格式 `{ state, version: 3 }`），20 条 2026-2027-1 课程、第 3 周、`firstWeekStartDate = 2026-08-31` |

### 本机环境坑（不按此配置会直接失败）

1. `XDG_RUNTIME_DIR` 指向 `/run/user/1000`，本机该路径是 **ro 挂载**，`agent-browser` 建 socket 会报 `Failed to create socket directory: Read-only file system (os error 30)`。必须 `export XDG_RUNTIME_DIR=/tmp/claude/ab-runtime`。
2. `TMPDIR=/tmp/claude` 默认不存在，`pnpm` 启动时 `lstat '/tmp/claude'` 直接 ENOENT 崩溃。必须先 `mkdir -p /tmp/claude`。
3. 后台进程不能跨 bash 调用存活：dev server 与浏览器操作必须在**同一次 bash 调用**里完成（`setsid nohup pnpm dev &` 也一样）。
4. 写 localStorage 后必须重新 `open` 页面（zustand persist 只在模块初始化时读取）。

## 改动前实测数据

412×915 视口：

| 指标 | 值 | 说明 |
| --- | --- | --- |
| 课表滚容器 `clientWidth` | 388 | 412 - 页面 `px-3` 两侧 - 边框 |
| 课表滚容器 `scrollWidth` | 760 | 由内层网格 `min-w-[760px]` 撑开 |
| 横向滚动 | 需要（`scrollWidth > clientWidth`） | 一屏只能看到周一 ~ 周三后半，周四起需要横拖 |
| 单个日期列宽 | ≈100 | 760 - 56（节次列）/ 7 |
| 课名渲染 | `line-clamp-2` | `毛泽东思想和中国特色…` 被省略号截断 |
| 教室渲染 | 有（`truncate`） | 例：`28-A203` |
| 教师渲染 | **无** | DOM 中不存在 `course.teacher` 文本 |
| 节次列 | 只有 `1..12` | 没有任何时间 |
| 2 节课程块高度 | ≈130 | 由 `grid-rows: repeat(12, minmax(0,1fr))` 与视口高度决定 |
| 2 节课程块文字高度 | ≈45 | 只占块高约 1/3，其余为空白 |

桌面 1440×900（回归基线）：7 列全部可见、列宽 ≈ 170、课名 `line-clamp-2`、教室显示、教师不显示、无缩放控件。改动后必须与此一致。

## 基线截图

- `research/baseline-mobile-412.png`：412×915，手机端改动前（同时暴露横向滚动与截断）。
- `research/baseline-desktop-1440.png`：1440×900，桌面端回归基线。

## 关键结论（喂给设计）

1. **横向宽度是瓶颈，纵向不是**：块高 ≈130px 而 21 字课名在 50px 列宽下约需 90px，所以去掉 `min-w-[760px]` 后，2 节及以上的课程块本身就能放下完整课名。
2. **状态图标在抢宽度**：现状 `flex justify-between` 让 14px 图标占掉 100px 列宽的 14%、50px 列宽的 28%，必须移出文本行。
3. **节次时间只能推导**：解析器给的是块级 `KSSJ/JSSJ`（`KSJC=1 → JSJC=2`），数据里没有单节时间表，因此 `08:45/08:55` 这类节中空档无法还原（详见 `design.md` D5 已知限制）。
4. **缩放必须只改列宽**：任何等比缩放（`zoom` / `transform: scale`）都不增加信息量，换行位置不变，等于用户否掉的「纯放大镜」。
