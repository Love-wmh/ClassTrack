# 实施计划：预设模型 + 连续填充 + 应用内 pin 入口

> 配套 [prd.md](./prd.md) 与 [design.md](./design.md)。命令里的路径都以仓库根为基准。

## 阶段总览

| 阶段 | 内容 | 完成判据 | 回滚点 |
|---|---|---|---|
| P0 spike | ① 行高系数标定 ② pin 尺寸提示实测 | 两个数落进 design.md；结论决定 D2.1/D5.1 的写法 | 无（不改产品代码） |
| P1 预设与填充（Java） | `WidgetPreset` / `WidgetBodyPlan` 内容组合 / 填充算法 | `testDebugUnitTest` 全绿（A1/A2/A3 的 JVM 部分） | `git revert` P1 提交 |
| P2 渲染层接入 | 度量套用填充结果、双栏左卡三段分布、`layout_fill` 日志 | 手机 2×2 逐像素不变（A6）；平板出现铺满效果 | `git revert` P2 提交 |
| P3 静态富内容 | 双行行项、汇总两行、底部最后一节、左卡中缝两行、正在进行行加高 | 行序列单测（A3）；平板 4×3/6×3 截图 | `git revert` P3 提交 |
| P4 原生 pin | `requestPinWidget` 插件方法 + pendingPreset + 配置页预填 | 端到端可用（A8）；`phase=pin_*` 齐全 | `git revert` P4 提交 |
| P5 Web 入口 | 顶栏紧凑化 + 入口 + 预设面板 + hook/测试 | A9；`pnpm test` 相关用例通过 | `git revert` P5 提交（独立于小工具） |
| P6 设备验收 | 四个预设尺寸截图 + 量测占比 | A5/A6/A7 证据落 `verification.md` | — |
| P7 收尾 | spec 更新、会话日志、提交、归档 | 任务归档 | — |

## P0 spike（先做，否则 P1/P4 的写法是猜的）

1. **行高系数标定**
   - 在手机 4×3 上渲染一份已知行序列（现有种子数据即可），截图后用「文本行带」量测：
     每行行带的像素高度、行间距、以及同一字号下两个不同字号的比值。
   - 产出：`LINE_HEIGHT_FACTOR` 实测值（含 `includeFontPadding` 的影响）+ 安全系数 1.05，写进 design D2.1，
     原始截图与量测脚本放 `research/`。
2. **pin 尺寸提示实测**
   - 先用一个**临时**入口（临时按钮或 `adb` 触发的调试方法，不进最终代码）调两次 `requestPinAppWidget`：
     一次 `extras=null`，一次带上 `OPTION_APPWIDGET_MIN_WIDTH/HEIGHT`（平板 6×3 的 dp 值）。
   - 用 `uiautomator dump` 读 pin 出来的实例 bounds，比较两次结果。
   - 产出：结论写进 design D5.1 + 决定卡片文案（「将按 6×3 放置」还是「推荐 6×3，请拖到该尺寸」）。

## P1 预设与填充（Java，可 JUnit 覆盖）

- 新增 `WidgetPreset`（`Id` / `Content` / 样式 / 表现 / `allowFontBoost` / `targetCell`，含 `parse` 与回退）。
- `WidgetLinePolicy` 按 `preset.content` 生成行序列：`TODAY` 与 `TODAY_AND_TOMORROW`（后者在今天的行之后插入
  明天汇总行 + 明天各行；复用 `nextDayItems` 与既有文案）。
- `WidgetLayoutMetrics` 增补填充计算：`getFillSlackDp(lineCount)`、`getRowGapDp(lineCount)`、
  `getVerticalPaddingDp(lineCount)`、`getFontBoost(lineCount)`（全部纯函数，可测）。
  - **不要**把「行数」换成「测量高度」：行数来自 `WidgetBodyPlan`，是渲染前就已知的整数。
- `WidgetDiagnostics` 增补 `layoutFill(preset, slackDp, gapDp, boostPermille)`、`pinRequested/pinResult/presetApplied`。
- 单测：预设表解析与回退、目标尺寸上的度量取值、间距上限、字号上限、`slack < 0` 不分配、
  **估算内容高 ≤ 可用高**（A2「不裁切」的直接断言）、三种样式 × 三种策略行序列不变（A3）。

命令：`./android/gradlew -p android testDebugUnitTest`

## P2 渲染层接入

- `ClassTrackWidget.kt`：把 `metrics.rowGapDp` / `verticalPaddingDp` 换成带行数参数的版本（行数取自
  `WidgetBodyPlan`）；`HeroCard` 改为三段分布（顶部块 / `Spacer(weight 1)` / 中缝「下一节」行 / `Spacer(weight 1)` /
  底部块），中缝行由 `WidgetBodyLine` 的新 kind 提供。
- 新增中缝行的数据来源：hero 之后第一个 `UPCOMING`（没有就不画）。
- 手机两个预设 `allowFontBoost=false` → 字号路径与上一轮完全一致（A6 的构造性保证）。
- 验证：`cap:build:android` + 两端安装 + 手机 2×2 逐像素比对 + 平板 4×3 截图。

命令：`pnpm cap:build:android`，然后
`adb -s emulator-5556 install -r -t android/app/build/outputs/apk/debug/app-debug.apk`（平板同理）。

## P3 静态富内容（平板两个预设的填充主力）

- 课程行双行行项：第一行课名、第二行「第 3-4 节 · 教室」；正在进行那行加高并带左侧强调条（`Preset.rowTwoLines`
  与 `Preset.nowTaller` 是预设属性，手机预设为 false）。
- 汇总行两行：「今天 周日 · 共 4 节」+「已上完 1 节 · 还有 2 节」（`todayFinishedCount` / `todayRemainingCount`）。
- 列表底部一行：「今天最后一节 19:00 数据结构 A101」（当天最后一项）。
- 双栏左卡中缝两行：「下一节 …」+「第 N 周 / 共 M 周」（`currentWeek` / `maxWeek`）。
- 单测：行序列与行项形态的断言（同一预设同一尺寸下行序列固定；手机预设不出现双行行项）。
- 验收：平板 4×3 与 6×3 截图，按 design D2.4 量测占比（目标 ≥90%）。

## P4 原生 pin

- `WidgetSnapshotPlugin` 增 `requestPinWidget({ preset })`：校验 preset 白名单 → 写 pendingPreset（带时刻）→
  `isRequestPinAppWidgetSupported()` → `requestPinAppWidget`；返回 `{ supported, requested }`；错误码
  `PIN_UNSUPPORTED` / `PIN_FAILED`。
- `WidgetPendingPreset`（与 `WidgetPendingRoute` 同范式）：一次性读 + 5 分钟超时 + **原子 `claim()`**，
  另在 `provideGlance` 加渲染侧兜底（实测 launcher 不拉配置页，见 design D5.2）。
- `WidgetConfigActivity`：读 pendingPreset → 预选样式/表现 + 显示「推荐格子」提示条 + `phase=preset_applied`；
  用户改动照旧保存。
- 安全：preset 参数在白名单内才接受（与既有 `config_rejected` 口径一致），日志只记枚举。

## P5 Web 入口与顶栏

- `app/features/schedule/ScheduleHeader.tsx`：`h-10` → `h-9`、图标 `size-5` → `size-4`、文案按钮收窄（纯尺寸改动）；
  入口必须留在左侧动作组（塞进右侧网格会换行成第三行，顶栏反而变高——真机截图确认）。
- 新增入口按钮 + `Sheet` 预设面板（四个卡片）与 `useWidgetPin` hook；非 Android 不渲染。
- `native-widget-snapshot.ts`：新增 `requestPinWidget` 与错误码 `PIN_UNSUPPORTED` / `PIN_FAILED`。
- 测试：hook 单测 + 平台判断用例，`pnpm test` 跑相关文件。

## P6 设备验收（证据落 `verification.md` + `research/`）

| 项 | 判据 |
|---|---|
| A5 | 手机 2×2 / 手机 4×2 / 手机 4×3 / 平板 4×3 / 平板 6×3 各一张 + `phase=layout_fill preset=… slack=… gap=… boost=…`；量测内容占比达 design D2.4 |
| A6 | 手机 2×2 与上一轮基线逐像素比对，差异包围盒为空（时钟与数据先对齐，见上一轮 env-setup E6） |
| A7 | pin 尺寸提示结论（P0 已得）+ 两种文案在设备上的实际表现 |
| A8 | 应用内添加 → 配置页预填 → 保存 → 实例符合预设；再加一个实例验证槽位已消费 |
| A9 | 顶栏四个既有控件可用（触控目标、可访问性标签）+ 入口在无原生能力时隐藏 |

## P7 收尾

- spec：`android-home-widget.md`（预设、填充、两天视图与 R11 的边界、pin 入口与降级）、
  `mobile-schedule-layout.md`（顶栏紧凑化后的尺寸口径）。
- 会话日志：`python3 ./.trellis/scripts/add_session.py ...`
- 归档：`python3 ./.trellis/scripts/task.py archive widget-size-presets`

## 风险与对策

| 风险 | 对策 |
|---|---|
| 字号放大后 `LocalSize` 变化触发重排/抖动 | 字号只依赖 `LocalSize` 与行数，不依赖任何渲染结果 → 不存在回馈循环 |
| launcher 不理会 pin 尺寸提示 | P0 实测 + 降级文案（design D5.1）；预设的样式能力不依赖它 |
| pendingPreset 污染后续实例 | 一次性消费 + 超时 + `onDeleted` 清理；A8 用第二个实例验证 |
| 顶栏紧凑化伤到已验收的移动端布局 | 只改按钮尺寸、不改布局结构；spec 同步；真机确认触控目标 |
| 富内容把手机也改了 → 手机回归 | 双行行项/加高行是预设属性；手机两个预设为 false，且 `allowFontBoost=false` |
| 行高估算再次偏小 → 裁字 | P0 实测标定 + 1.05 安全系数；估算只用于分配余量，不用于压内容；A2 有断言 |
