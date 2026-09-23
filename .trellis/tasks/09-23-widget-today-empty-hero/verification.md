# 验证记录：小组件 hero 空课态 + 二次引导 + 更新通知默认关闭

> 任务：`.trellis/tasks/09-23-widget-today-empty-hero`（分支 `fix/widget-today-empty-hero`）
> 口径与决策见同目录 `prd.md`。本文只记录**实际跑过什么、结果如何**，以及**还没验的部分**。

## 1. 已通过（本机可复现）

| 命令 | 结果 |
|---|---|
| `pnpm test`（vitest 全量） | ✅ 27 个测试文件 / 226 个用例全绿 |
| `pnpm typecheck`（`react-router typegen && tsc`） | ✅ 无输出（通过） |
| `pnpm lint`（eslint `--max-warnings 0`） | ✅ 退出码 0（只有仓库既有的 `React version not specified` 警告） |
| `./android/gradlew -p android :app:testDebugUnitTest` | ✅ BUILD SUCCESSFUL，**259** 个用例全绿 |
| `python3 scripts/generate-widget-preview-layouts.py --check` | ✅ 退出码 0（拾取器 mock 与生成器一致；本次只改文案，没有动 mock） |
| `pnpm test:android-assets`（`scripts/check-android-assets.test.js`） | ✅ 全绿 |

本次新增/改写的用例：

- `WidgetLinePolicyTest`：空课态首行、两个 flag、`NEXT_OTHER` 补行判据、紧凑样式的后续课起点、双栏切分点；既有断言逐项未变（`heroIsToday == true`）。
- `WidgetSnapshotParserTest`：缺 `todayDayKey` / `todayWeekdayLabel` 的旧快照照常解析（回落到空串）、带字段时读得回来。
- `WidgetStateResolverTest`：今日日期只在 `READY` 状态带出。
- `app/lib/widget-snapshot.test.ts`：三种 `status` 都产出今日日期字段（本地时区、格式正确）。
- `app/lib/app-update/settings.test.ts`（新增）：`notify` 默认 `false`、`autoCheck` 默认 `true`；坏值逐字段回落到默认；已存过 `notify: true` 时原样保留。
- `app/lib/profile-guide.test.ts`（新增）：已读标记读写、只写自己的键、存储抛异常不抛、触发判定、文案口径，以及**源文件级接线守卫**（第一段关闭处触发 / `root.tsx` 挂载 / 显示条件含 `!widgetPinSheetOpen`）。
- `app/components/native-widget/ProfileGuideDialog.test.ts`（新增）：静态渲染出标题、说明与两个按钮。

### 跨层夹具

`android/app/src/test/resources/widget-snapshot-v1.json` 用 Web 侧真实 builder 重新生成（生成时刻 `2026-09-21 09:00 +08:00`、第一周 `2026-09-07`、20 周、高等数学周一 10:00-11:40、大学物理周三 13:30-15:10、三个敏感哨兵）。逐字段与旧夹具对比：**只多了 `todayDayKey` / `todayWeekdayLabel`**，其余（含 36 条 entries、126 天 `dayEndEpochMs`）完全一致；`WidgetSnapshotCrossLayerTest` 全绿。

### 本机环境备忘

- `$HOME/.gradle` 在本沙箱里是**只读**的，Gradle wrapper 无法建锁文件。绕法：把 `~/.gradle` 只读内容拷到 `/tmp/gh` 后
  `GRADLE_USER_HOME=/tmp/gh ./android/gradlew -p android :app:testDebugUnitTest --offline`（离线即可，依赖都在缓存里）。
- `node scripts/check-android-assets.js`（APK 同步资产比对）**在本机当前工作区就是失败的**：`build/client` 是 22:30 的构建产物，而 `android/app/src/main/assets/public` 是更早一次 `cap sync` 留下的（该目录被 gitignore，不进版本控制）。这与本次改动无关，重新 `pnpm cap:sync:android` 即一致。

## 2. 尚未验证（需要 KVM / 真机）

本沙箱 **没有 `/dev/kvm`**，且 `~/.android/avd` 只读，因此模拟器与真机都跑不了（与 spec 里
「本机可用：`/dev/kvm` 存在」的前提不符）。以下逐项 **⏳ 待验**，不要当成已通过：

- ⏳ 「今天没课、明天有课」：3×2「接下来」= `今天的日期 / 今天无课 / 享受你的美好时光吧`，下方 `明天 周四 · 共 N 节` + 明天课表；1×2「紧凑」= `今天的日期 / 今天无课 / 放松一下吧`，计数行 `明天 N 节`。
- ⏳ 「今天的课已上完（显示已上完）」：`今天已无课 / 今天的课上完啦，好好休息`，并出现 `下一节 · …` 行。
- ⏳ 长假（今天、明天都没课）：`今天无课 / 放松一下吧` + `下一节 · 10月8日 周四 08:00 高等数学`。
- ⏳ 「正在上 / 接下来」的普通状态与改动前逐像素一致（三种样式各一张截图）。
- ⏳ 双栏（大格子表现 = 双栏）左卡只有空课态三行，不残留明天的课名 / 时间 / 教室。
- ⏳ 配置页缩略图与桌面渲染一致。
- ⏳ 1×2 档的实际截断程度：预期日期行被截成 `10月8日 …`，且最窄的真实格子（5 列网格 ≈ 82dp 列宽、内容宽 ≈ 54dp）里醒目行「今天已无课」（5 字 @16sp ≈ 80dp）也可能被截 —— 若真机上很难看，可考虑把 1×2 的醒目行降到 body 字号，但那属于新的一轮口径。
- ⏳ 导入成功 → 第一段引导点「知道了」→ 第二段立即出现；点「前往」→ 到个人中心。
- ⏳ 导入成功 → 点「去添加」→ 面板打开时**不**出现第二段 → 关掉面板 → 第二段出现。
- ⏳ 第二段出现一次后（标记已写）重进应用不再出现。
- ⏳ 更新设置页：新装设备「发现新版本时发通知」默认关；打开后能正常申请权限与发通知。
- ⏳ 旧快照（没有今日日期字段）在真机上只少一行日期，不出现「请同步」。

取证手法沿用 spec 的《用 adb 驱动 launcher 的两个可复用手法》一节；hero 与文案类结论**必须**以截图为准
（渲染层没有 JVM 单测，这是本任务的既定口径 D18）。
