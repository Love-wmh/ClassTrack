# 验收报告：前台课表缺勤改为实色红框

任务：`.trellis/tasks/09-28-schedule-absent-solid-red-ring/`（分支 `feat/schedule-absent-solid-red-ring`）

## 1. 自动化门禁

| 门禁 | 结果 |
| --- | --- |
| `pnpm test` | 36 文件 / **294 用例全绿**（其中 `app/features/schedule/` 88 例） |
| `pnpm typecheck` | 通过（`react-router typegen && tsc`） |
| `pnpm lint` | 通过（`--max-warnings 0`，0 problems） |
| `pnpm format:check` | 通过（`All matched files use Prettier code style!`） |
| `pnpm build` | 通过 |

### Tailwind 是否真的生成了新描边规则

`pnpm build` 后检查产物 CSS（`build/client/assets/root-*.css`）——任意值类名必须被字面量扫描到，
否则会静默不生成：

```
1  inset 0 0 0 var(--cc-ring) #ef4444
1  inset 0 0 0 var(--cc-ring) #ef4444,0 0 0 2px var(--ring)
1  inset 0 0 0 var(--cc-ring) #ffffff8c
1  inset 0 0 0 var(--cc-ring) #ffffff8c,0 0 0 2px var(--ring)
```

即：缺勤描边是**不透明** `#ef4444`，常态白描边仍是 `#ffffff8c`（alpha 0.55），两条都带
`focus-visible` 变体。

## 2. 真实应用验收（AC-E1）

夹具 `09-24-schedule-responsive-sizing/research/seed-schedule-fixture.js` +
出勤 / 显示两个开关，跑 `research/run-visual-check.sh`（`agent-browser` 驱动真实应用，
探针见 `research/visual-check-eval.js`），读**每个课程格的实际计算样式**：

| 课程格 | 夹具状态 | `title` | computed `box-shadow` | 角标 | `opacity` / `filter` |
| --- | --- | --- | --- | --- | --- |
| 毛泽东…概论（周一 1-2） | 已上 | …**，已上**，点击查看详情 | `rgba(255,255,255,0.55) 0 0 0 2px inset` | `circle-check` | `1` / `none` |
| **数据结构（周四 1-2）** | **缺勤**（未上 + 备注） | …**，未上**，点击查看详情 | **`rgb(239,68,68) 0 0 0 2px inset`** | `circle-alert` | `1` / `none` |
| 计算机组成与结构（周二 1-2） | 只写备注（`attendanceMarked: false`） | …，点击查看详情 | `rgba(255,255,255,0.55) …` | 无 | `1` / `none` |
| 其余 9 格 | 无标记 | …，点击查看详情 | `rgba(255,255,255,0.55) …` | 无 | `1` / `none` |
| 形势与政策（周二 5-6） | 非本周 | …**，非本周**，点击查看详情 | `rgba(255,255,255,0.55) …` | 无 | `1` / `none`（底色 `rgb(184,214,209)` = 淡化色） |

结论（360×794 与 1024×900 两档一致）：

- 缺勤格**不再变淡**（`opacity` 恒为 `1`、`filter` 为 `none`；改动前是 `0.6` / `saturate(0.5)`），改为 **2px 实色红描边** + 保留警示角标；
- 未标记 / 只写备注的格子**完全中性**（改动前它们会被判成「未上」并整卡变淡）；
- 非本周格仍是「整卡淡化色 + 无任何出勤痕迹」，与缺勤格在形状上不再雷同。

截图：`after-360x794-absent-ring.png`（手机档）、`after-1024x900-absent-ring.png`（桌面档）。

## 3. 复核方式（可重跑）

```bash
# 1) 生成种子（夹具 + 两个开关）
node -e '
const fs=require("fs");
const fixture=fs.readFileSync(".trellis/tasks/09-24-schedule-responsive-sizing/research/seed-schedule-fixture.js","utf8");
const extra=[
  "localStorage.setItem(\"class-track-attendance\", JSON.stringify({state:{enabled:true},version:0}))",
  "localStorage.setItem(\"class-track-schedule-display\", JSON.stringify({state:{showAttendanceStatus:true,showOutOfWeekCourses:true,collapseEmptyWeekdayColumns:false},version:0}))",
].join("\n");
fs.writeFileSync("/tmp/classtrack-tmp/seed-all.js", fixture+"\n"+extra+"\n")'
# 2) 起 dev + 灌种子 + 读计算样式 + 截图（一条命令内完成：后台进程不跨调用存活）
bash .trellis/tasks/09-28-schedule-absent-solid-red-ring/research/run-visual-check.sh 360 794
```

环境坑（都踩过）：

- `agent-browser` 需要可写的 `XDG_RUNTIME_DIR`（本机默认 `/run/user/1000` 在沙箱里只读 → `Failed to create socket directory`），脚本里已设成 `/tmp/classtrack-tmp`；
- `pnpm` 需要可写的 `TMPDIR`（默认 `/tmp/claude` 不存在 → `ENOENT: lstat '/tmp/claude'`）；
- 后台进程不跨 bash 调用存活，必须「起服务 + 跑浏览器」在同一次调用里；
- 不要在 `$(...)` 里写 heredoc：本机 bash 5.2.21 会把正文首行开头的 `JS`（`JSON.stringify`）当成定界符吃掉，报 `here-document … delimited by end-of-file`。JS 一律走文件 + `base64 -w0` 传给 `eval -b`。
