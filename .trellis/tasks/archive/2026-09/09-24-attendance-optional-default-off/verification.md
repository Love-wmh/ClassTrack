# 验收取证：出勤能力默认关闭并做成可选项

> 环境：本机 `pnpm dev` + agent-browser（Chromium，视口 **375×812**，模拟手机宽度）。
> 数据：归档夹具 `.trellis/tasks/archive/2026-09/09-20-mobile-schedule-week-grid/research/seed-schedule-fixture.js`
> （**schema v3 的旧数据**：标记里没有 `attendanceMarked` 字段）—— 顺带把「老账怎么处理」也验了。
> 截图全部在 `research/`，文件名与下表一一对应。

## 一、开关与默认值（A）

| 项 | 证据 | 结果 |
|---|---|---|
| A1 全新设备默认关闭 | 清空 `class-track-attendance` 后逐项截图：课表无色条/角标/批量按钮（`01`）、看板无出勤卡片（`03`） | ✅ |
| A2 默认值由单测钉住 | `app/lib/attendance/settings.test.ts`（5 例：默认 `false`、`undefined`/`null`/`{}`/`'true'`/`'false'`/`1`/`0` 全回落 `false`、`true` 保持） | ✅ |
| A3 开关可切换并持久化 | `scrollintoview` + 真实点击 `#attendance-enabled` → `localStorage.getItem('class-track-attendance')` = `{"state":{"enabled":true},"version":0}`；角标由「已关闭」（`04`）变「已开启」（`05`） | ✅ |
| A4 非法值按关闭处理 | 单测覆盖 `'yes'` / `1` / `0`；`merge` 走 `normalizeAttendanceSettings`，不做真假值转换 | ✅ |

## 二、课表侧（B）

| 项 | 证据 | 结果 |
|---|---|---|
| B1 关闭态课程格无出勤痕迹 | 全部课程格 `title` 只剩 `课程名，点击查看详情`（`…，已上/未上…` 命中数 **0**）；截图 `01` | ✅ |
| B2 关闭态顶栏无批量按钮、列数收窄 | `document.body.innerText` 不含「全部已上/全部未上」= `false`；截图 `01` 顶栏只剩 `‹` `›` + 添加到桌面；SSR 断言 `ScheduleHeader.test.ts` 同时钉住 `grid-cols-[2.25rem_2.25rem_2.25rem]` | ✅ |
| B3 关闭态弹窗无出勤按钮 | 打开「概率与统计（Python）」弹窗：含出勤切换 = `false`，「本次课程备注」= `true`；截图 `10` | ✅ |
| B4 备注与出勤解耦 | 关闭态弹窗备注框内容 = `只写了备注，没做出勤判断`（`10`）；双击放大到 `full` 档后课程格上备注可见（`11`）。**注**：手机端 1x/1.5x 本来就不显示备注（既有分级，见 `mobile-schedule-layout.md`），不是本次回归 | ✅ |
| B5 开启态逐项恢复 | 顶栏两个批量按钮都在 = `true`；首格 `title` = `毛泽东思想和中国特色社会主义理论体系概论，已上，点击查看详情`；截图 `06`（每格都有外圈/色条/角标） | ✅ |

## 三、看板侧（C）

| 项 | 证据 | 结果 |
|---|---|---|
| C1 关闭态无出勤卡片 | 卡片标题只剩 `星期分布 / 课程类别分析 / 课程性质分析 / 节次分布`；SSR 断言 `DashboardOverview.test.ts` 钉住 5 张出勤卡不渲染；`dashboardCopy.test.ts` 钉住副标题不含「完成度/缺勤」；`distributionCharts.test.ts` 钉住两张分布图只剩「总课次」系列 | ✅ |
| C2 提示卡 + 开启入口 | 页面含「出勤统计已关闭」= `true`、「去开启」= `true`；按钮跳 `/profile` | ✅ |
| C3 分布图只剩总课次 | `distributionCharts.test.ts`（关闭态系列 = `['总课次']` / `['total']`） | ✅ |
| C4 副标题/空态文案不越界 | `dashboardCopy.test.ts`；截图 `03` 副标题为「展示课程分布与课表结构分析。」 | ✅ |
| C5 开启态逐项恢复 | 卡片：`周趋势 / 风险课程 / 课程完成度排行 / 星期分布 / 课程类别分析 / 课程性质分析 / 节次分布`；指标：`截止今日完成度=5% / 截止今日缺勤率=2% / 标记覆盖率=6% / 未标记课次=60`；截图 `07` | ✅ |

> **开启态唯一一处刻意的文案变化**（design D10）：看板「未标记课次」卡的说明由「已发生但还没有记录状态」
> 改为「已发生但还没有标记是否上课」。原因是口径修正后「未标记」明确指「没做出勤判断」，旧文案在新口径下
> 会歧义。除这一句之外，开启态的卡片集合、顺序、网格列数与图表系列都与改动前逐项一致。

## 四、备注不再被当成缺勤（D / E）

用**真实 UI** 给一节从未标记过的课（第 3 周「概率与统计（Python）」）写备注并保存，然后读存储与看板：

| 步骤 | 观察值 |
|---|---|
| 保存备注后的标记 | `{"classId":"p1","week":3,"isAttended":false,"attendanceMarked":false,"note":"只写了备注，没做出勤判断"}` |
| 看板（只写了备注） | 截止今日缺勤率 **2%**、未标记课次 **60** —— 与写备注前一致（截图 `08`） |
| 对照：同一条标记只把 `attendanceMarked` 改成 `true` | 截止今日缺勤率 **3%**、未标记课次 **59**（截图 `09`） |

**结论**：两条标记的 `isAttended` 都是 `false`，唯一差别是新字段 —— 旧口径（等价于 `attendanceMarked: true`）会把它算成缺勤，新口径把它算成未标记。这正是本次要修掉的老账。

| 项 | 证据 | 结果 |
|---|---|---|
| E1 只写备注 = 未标记，不算缺勤 | 见上表前两行 | ✅ |
| E2 做出勤判断的课次照旧按已上/缺勤计 | 见上表第三行；`dashboard/utils.test.ts` 的「做出勤判断的课次按已上/缺勤计数」 | ✅ |
| E3 导入自动补标 = 已判断·已上 | `app/store/utils.test.ts`「自动补标的课次记为「已做出勤判断」」；代码 `createPastClassMarks` 写 `attendanceMarked: true` | ✅（单测） |
| E4 旧数据口径零变化 | 夹具是 schema v3 且不带新字段：载入后 `version` 由 3 → 4，`classMarks['d1-3'].attendanceMarked` = `true`；`migrations.test.ts` 另钉住「显式 `false` 原样保留」「非对象条目丢弃」「空数据仍等于 `createEmptyAppData()`」 | ✅ |
| E5 三个判据单一来源 | `useDashboardStats.ts` 的 6 处与 `groupByName` 的 3 处全部改用 `isAttendedSession` / `isAbsentSession` / `isUnmarkedSession`；仓库内已无 `mark && !mark.isAttended` 形式的过滤 | ✅ |

## 五、数据与备份（D1–D4）

| 项 | 证据 | 结果 |
|---|---|---|
| D1 关闭不等于删数据 | 关闭态点「导出」：`agent-browser download` 得到 `backup.json`（26 KB），其中出现 `classMarks` 且包含 `attendanceMarked`；本地存储 `classMarks` 条数 5（4 条旧标记 + 1 条只写备注） | ✅ |
| D2 计数行随开关出现/消失 | 关闭态 /profile 含「已标记课程」= `false`（`04`）；开启态出现该行（`05`）；数据管理页同一处理 | ✅ |
| D3 五项门禁 | `pnpm typecheck` / `pnpm lint` / `pnpm format:check` / `pnpm test`（33 文件 254 例）/ `pnpm build` 全部 exit 0；另跑 `pnpm cap:sync:android` 成功（同步产物已 gitignore，不入库） | ✅ |
| D4 视觉证据 | `01`–`11` 共 11 张截图，覆盖课表/看板/个人中心/弹窗的开关两态 | ✅ |

## 六、明确未验证

| 项 | 原因 |
|---|---|
| Android WebView / 真机上的外观 | 本次是纯 Web 层改动，已用 375×812 浏览器验证；模拟器未起（`adb devices` 为空），WebView 内的同款布局**未验证** |
| ≥768px 桌面宽度布局 | 本次只在 375px 宽度取过证；`sm:flex` / `xl:grid-cols-*` 分支**未取视觉证据**（SSR 断言只钉住类名，未钉住像素） |
| 旧备份（改动前导出的 JSON）导入后的完整回归 | 用夹具验证了「schema v3 数据载入后口径不变」，但没有拿一份**真实导出文件**走一遍导入流程 |

## 七、复现命令（关键步骤）

```bash
# 1. 五项门禁
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build

# 2. 两态视觉证据（浏览器 375×812）
pnpm dev                 # 另开一个终端
# 首次跑要先灌夹具：把 seed-schedule-fixture.js 的内容在页面上 eval 一次，再 reload
# 之后：课表页 → 截图；/dashboard → 截图；/profile → 点 #attendance-enabled → 截图
#       再回课表页 / 看板各截一张（开启态）

# 3. 只写备注 vs 明确未上 的对照
#    在课表页点开一节未标记的课 → 填备注 → 保存 → /dashboard 记录缺勤率与未标记数
#    再把该标记的 attendanceMarked 改成 true → reload → 数字变化（2%/60 → 3%/59）
```

> 环境备注：本会话的 shell 处于 netns 隔离的沙箱里，**每次命令调用是独立网络命名空间**，
> 因此 `pnpm dev` 与 agent-browser 必须在**同一次调用**内启动；另外 `agent-browser` 需要把
> `HOME`/`XDG_*` 指到可写目录，并对 localhost 关掉代理（`--no-proxy-server`）。这几条已写进 `implement.md` 的备注。
