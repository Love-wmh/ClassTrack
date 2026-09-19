# Android 桌面小工具显示接下来的课程

## Goal

为 ClassTrack Android 应用新增桌面小工具（App Widget），在桌面上直接回答「我接下来上什么课」：顶部突出显示最近的一节课（含进行中状态），下方列出今天剩余的课程。

核心难点不在 UI，而在数据通道：课表数据只存在于 Capacitor WebView 的 `localStorage`（Zustand persist key `class-track-storage`）里，小工具运行在原生进程，读不到 WebView 存储。本任务需要建立 Web → 原生的单向快照通道，并让原生侧在时间推进时自行重算「下一节」。

## Requirements

### 功能需求

- **R1 小工具内容**：显示「接下来」一节课（课程名、起止时间、教室、节次）+ 今日剩余课程列表（时间 + 课程名 + 教室）。
  - 「接下来」的选取规则：若当前有课正在进行，则显示该课并标记为进行中；否则显示今天第一个尚未开始的课；今天已无课时显示下一节有课的日期与课程名。
- **R2 数据来源**：Web 侧计算并把快照推送到原生；原生侧不再解析 `localStorage`，也不重新实现周次/单双周解析逻辑（导入后的 `Class.weeks` 已是权威展开结果）。
- **R3 刷新时机**（三类，全部需要）：
  - **数据变更即时刷新**：课程、当前周、学期、首周起始日期发生变化后立即推送并刷新小工具。
  - **定时刷新**：按快照中最近的时间边界调度一次刷新，使小工具在课程开始/结束时自动切换「接下来」。
  - **前台刷新**：App 回到前台时重新计算并推送，作为兜底。
- **R6 长期不打开 App 时的可用性**：快照必须覆盖到学期最后一周的最后一天（而不是固定天数），使小工具在用户长期不打开 App 时仍能按时间正确切换「接下来」；快照过期后必须显示同步引导态，绝不显示可能错误的课程。
- **R7 精度分层与可选精确模式**：课程切换的及时性必须按 design D4 的五层阶梯实现：
  - **默认（零权限）**：数据变更即时 + 跨零点/改时间/换时区即时（系统广播）+ 边界 WorkManager 任务 + 30 分钟系统兜底；
  - **可选精确模式**：用户在应用内知情后一键跳系统设置授予「闹钟与提醒」，启用后边界切换即使设备处于深度休眠也按点触发；
  - 未授权精确模式时功能完整可用，只是精度降级，且应用内必须如实标注当前等级。
- **R4 点击行为**：点击小工具打开 ClassTrack。若 `Intent` extra + JS 消费的链路能稳定验证，则直接跳转到课表页；否则按 design D8 的降级条款降级为「仅打开 App」并在检查阶段显式记录。
- **R5 尺寸适配**：至少支持 2x1（紧凑：仅接下来一节课）与 4x2（完整：接下来 + 今日剩余列表）两种尺寸，超出列表容量的部分截断而不是溢出。

### 非功能需求

- **N1 平台隔离**：Web/PWA、浏览器环境下所有新逻辑必须是安全 no-op；不得影响现有 PWA 路径。
- **N2 权限分层**：默认路径**不需要任何运行时权限**（数据变更推送 + 时间/日期/时区变更广播 + WorkManager 边界任务 + `updatePeriodMillis` 系统兜底）。作为**用户可选的精度增强**，允许声明 `SCHEDULE_EXACT_ALARM` 并由用户在系统设置中显式授予；**绝不**声明 `USE_EXACT_ALARM`。未授予时全部路径必须静默降级，不得崩溃、不得弹错误。
- **N2b 精度诚实**：应用内必须如实说明基础模式与精确模式的精度差异（见 design-appendix D12），不得把基础模式描述为实时。
- **N3 隐私**：快照只包含展示所需的课程字段（课程名、教室、时间、节次），不含教师工号、Cookie、URL、备注原文等；原生侧日志不得打印课程载荷。
- **N4 不回归**：`pnpm build` 产物、`android/app/src/main/assets/public`、APK `assets/public` 的字节一致性检查（`pnpm android:check-assets`）必须仍然通过；不得改动 `CourseImportShellUrl` 契约与导航/捕获 allowlist。
- **N5 可测试**：快照计算（TS）与快照解析/时间定位（Android）必须是纯函数，能用 vitest / JUnit 覆盖，包括时区与跨天边界。
- **N6 陈旧数据**：快照缺失或过期时，小工具显示引导文案（「请打开 ClassTrack 同步课表」/「暂无课表数据」），不得凭猜测渲染错误的课。
- **N7 无交互时的显示正确性边界**（必须在文档中显式声明，不得声称无限期有效）：
  - **保证**：快照覆盖窗口内，即使从不打开 App，课程开始/结束时的自动切换仍然正确；窗口外显示同步引导态。
  - **保证**：任何情况下都不显示「猜出来」的课程 —— 宁可显示引导态。
  - **不保证（方案固有边界，写入 design-appendix D11）**：从未打开过 App 时没有任何数据；学校临时调课/停课、用户修改课程或学期起始日期后不打开 App，快照不会自动更新；用户手动「强制停止」App 后 Android 会阻止广播投递，widget 可能停更直到再次打开 App。

### 约束

- Android 侧当前是纯 Java 模块（无 Kotlin 插件、无 Compose、无 desugaring），本任务需要引入 Kotlin 以使用 Glance。Glance 版本固定为稳定版 `1.2.0`。
- `minSdk 24` / `compileSdk 36` / `targetSdk 36`、AGP 8.13.0、Gradle 8.14.3、JDK 21 不得变更。
- 既有五项 Web 门禁（`pnpm typecheck`、`pnpm build`、`pnpm lint`、`pnpm format:check`、`pnpm test`）必须全绿。
- 新增 Android 纯逻辑测试遵循现有 JUnit 4 约定（`android/app/src/test/java/com/classtrack/app/`）。
- UI 文案与复杂逻辑注释使用中文。

## Acceptance Criteria

### A. Web 侧快照与推送

- [ ] A1 `app/lib/widget-snapshot.ts` 提供纯函数，从 `{classes, currentWeek, firstWeekStartDate}` 计算出含绝对本地时间的「接下来」与「今日剩余」；覆盖窗口从当天延伸到学期最后一周的最后一天；`firstWeekStartDate` 为 `null` 时返回 `unavailable` 状态与空窗口，而不是错误日期。
- [ ] A2 快照 JSON 带 `schemaVersion`、`generatedAt`（含偏移的 ISO 8601）与 `timezone`，字段与 design D2 完全一致。
- [ ] A3 vitest 覆盖：正常上课日、进行中课程、今日已无课、休息日、`firstWeekStartDate` 缺失、跨周与跨天边界；日期断言显式传入 `now`，不依赖 `new Date()` 当前时刻。
- [ ] A4 新增 Capacitor 插件封装遵循 `app/lib/native-course-import.ts` 模式（`registerPlugin` + Web no-op 实现 + 具名错误码），在 Web 上不抛未捕获异常。
- [ ] A5 存在一处集中式同步钩子：订阅 store 变化（去抖）推送、App 回到前台推送、启动/水合后推送一次；全部仅在原生 Android 上生效。

### B. Android 小工具

- [ ] B1 桌面可添加小工具，`appwidget-provider` 元数据（标签、描述、尺寸、resizeMode）正确，出现在小工具选择器中。
- [ ] B2 4x2 尺寸下显示「接下来」卡片与今日剩余列表；2x1 尺寸下不溢出，至少显示课程名与时间。
- [ ] B3 进行中的课程被标记为进行中；课程结束后小工具自动切到下一节（无需打开 App）。
- [ ] B4 点击小工具打开 ClassTrack；课表页跳转为 best-effort，若降级需在检查阶段显式记录该降级。
- [ ] B5 深色/浅色主题下文字可读，无自定义字体依赖。

### C. 数据通道与刷新

- [ ] C1 Web 推送后小工具在同一次推送内完成刷新（不依赖打开 App 以外的人工操作）。
- [ ] C2 快照写入是原子的：接收方不会读到半截 JSON；写入失败时插件 `reject` 明确错误码，不假装成功。
- [ ] C3 无快照时显示引导态；快照超过 TTL 时显示陈旧提示而不是展示可能错误的课程。
- [ ] C4 定时刷新使用最短权限方案，且在设备重启后仍能恢复（未申请 `RECEIVE_BOOT_COMPLETED`）。
- [ ] C5 `AndroidManifest.xml` 新增权限仅为方案所必需，`SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM` 未出现。
- [ ] C6 存在一条不依赖应用进程存活的系统级刷新路径（`appwidget-provider` 的 `updatePeriodMillis`），使小工具在应用长期未被打开时仍会周期性重新解析快照并重算状态。
- [ ] C7 存在自动化断言证明「长期不打开 App」的正确性：以远超覆盖起点的 `nowEpochMs` 调用原生 resolver，断言仍能从 14 天以后、跨周、跨月的快照中选出正确课程，而不是落到过期态。
- [ ] C8 跨零点 / 改时间 / 换时区由 manifest 声明的 `ACTION_DATE_CHANGED`、`ACTION_TIME_SET`、`ACTION_TIMEZONE_CHANGED` 接收器处理，且与 Worker 共用同一幂等重算入口（不复制第二套逻辑）。
- [ ] C9 存在用户可选的精确模式：`canScheduleExactAlarms()` 为真时使用 `setExactAndAllowWhileIdle`，为假时静默回退到 L4；授予/撤销状态变化有明确处理。
- [ ] C10 应用内「桌面小工具」设置节如实展示当前精度等级，并提供一键跳转系统设置授权的入口（不主动弹窗拦截）。
- [ ] C11 结构性保证有自动化断言：课程 `start < now < end` 时它仍是 hero 且状态为「正在进行」；仅当快照中不存在任何 `end > now` 的课程时才可能显示「无课」。

### D. 门禁与验证

- [ ] D1 `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm test`、`pnpm build` 五项全绿。
- [ ] D2 `pnpm cap:build:android` 成功产出 debug APK，且 `pnpm android:check-assets` 通过（Web 资源字节一致）。
- [ ] D3 新增 Android JUnit 测试通过（`./android/gradlew -p android :app:testDebugUnitTest`），覆盖快照解析、时间定位、陈旧/空快照分支。
- [ ] D4 模拟器或真机上完成一次端到端手工验证并留存截图：放置小工具 → 打开 App 导入/同步 → 桌面小工具显示正确课程。
- [ ] D5 `pnpm dev` 下浏览器访问不受影响（无原生插件时全部降级为 no-op），且无 console 报错。
- [ ] D6 「长期不打开 App」场景在设备上被验证：推送快照后不打开 App，把系统时间推进到覆盖窗口内的另一天/另一节课的时间点，确认小工具内容随之正确变化；再推进到超过覆盖窗口，确认进入同步引导态。该验证的证据（截图/命令输出）需在完成报告中给出，否则视为未验证。

## Notes

- 本任务判定为**单一交付物**（小工具的端到端可用性只能力整体验证），不拆分父子任务。Web 侧快照契约与 Android 侧消费契约在 `design.md` D2 冻结，两侧可并行实现。
- 相关既有契约：`.trellis/spec/frontend/native-course-import.md`（Capacitor 桥接与构建门禁）。
- 研究证据见 `research/`：
  - `research/internal-web-layer.md`、`research/internal-android-layer.md`（代码事实）
  - `research/external-glance-widget.md`（Glance 1.2.0、provider XML、调度取舍）
  - `research/widget-data-bridge.md`（SharedPreferences 通道、时区、陈旧策略）
- 「长期不打开 App」的保证与失效边界已显式声明于 R6 / N7 / design-appendix D11；任何实现或检查环节都不得把它表述为「无限期有效」。
- 原文需求由本次对话提出（2026-09-19），无 iCafe 卡片。

## Out of Scope

- iOS / WidgetKit 版本。
- 小工具的课表全周视图、周次切换交互。
- 上课提醒通知、角标（badge）、锁屏/息屏显示。
- 小工具内直接编辑或标记出勤。
- 把课表数据同步到云端或其它设备。
