# 执行计划：小工具体量自适应与平板适配

> 需求见 [prd.md](./prd.md)，技术取舍见 [design.md](./design.md)，本机构建/模拟器环境见 [env-setup.md](./env-setup.md)。
> 分支：`feat/widget-adaptive-space`（基于 `master`，已建）。

## 阶段总览

| 阶段 | 内容 | 完成判据 | 回滚点 |
|---|---|---|---|
| P0 基线 | 环境自检 + 改动前全绿基线 + **改动前截图** | 单测全绿；手机/平板各 4 张基线截图落盘 | 无（未改代码） |
| P1 量尺 | 量真实格子尺寸，标定 `wRef/hRef/maxScale` | 三个常量写进 design 的标定记录 | 无（未改代码） |
| P2 纯逻辑 | Java 度量 / 行判决 / 第三键 + 单测 | `testDebugUnitTest` 全绿（A1/A2/A3/A8 的 JVM 部分） | `git revert` P2 提交 |
| P3 渲染层 | Kotlin 套用度量、行判决改为只画、双栏结构、日志 | 手机 AVD 不回归（A6 初步）；构建通过 | `git revert` P3 提交 |
| P4 配置页 | 第三组选项 + 诚实提示 + 预览重渲 | 配置页闭环（A8） | `git revert` P4 提交 |
| P5 文档 | spec 的 D16 修订、strings、静态 mock 注释 | spec 与实现一致 | — |
| P6 验收 | T1..T4 全部取证 | A5/A6/A7/A9 有截图 + 日志 | — |
| P7 收尾 | 会话日志、spec 更新、提交、归档 | 任务归档 | — |

## P0 基线（必须先做，否则没有「前」可对比）

1. 环境自检（沙盒开启时按 [env-setup.md](./env-setup.md) 的绕法；沙盒关闭时可直接跑）：
   ```bash
   ls -la /dev/kvm && ~/Android/Sdk/emulator/emulator -accel-check   # 期望 accel: 0 KVM usable
   ```
2. 改动前全绿基线：
   ```bash
   cd "/media/yetongy/64E8E38AE8E358B65/CodeFiles/SleepDown课程表/ClassTrack"
   ./android/gradlew -p android testDebugUnitTest      # 期望 71 用例全绿（含既有 widget 用例）
   pnpm lint && pnpm typecheck && pnpm test            # Web 侧未改动，作为「没碰坏别的」的对照
   ```
3. 构建并安装改动前 APK，取**基线截图**（这一步的产物是 A6 的对照组，改完代码后无法再取）：
   ```bash
   pnpm cap:build:android
   adb install -r -t android/app/build/outputs/apk/debug/app-debug.apk
   ```
   - 手机 AVD（`Medium_Phone`）：放置实例 → 缩到最小（2×2）截图；拖到 4×3 截图。
   - 平板 AVD（`Medium_Tablet`）：4×3、6×4 各截图。
   - 每种尺寸下切一遍三种布局样式并截图。
   - 截图命名 `baseline-<device>-<cells>-<style>.png`，落在任务目录 `research/` 下；放置/缩放手法见 spec 的 adb 手法一节与 [env-setup.md](./env-setup.md)。
4. 记录 `phase=widget_sized` 的实测数值（P1 要用）。

## P1 量尺（决定 `maxScale`，不许拍脑袋）

1. 从 P0 日志读出手机与平板在 2×2 / 4×3 / 6×4 下的真实格子 dp 尺寸。
2. 定三个常量并写进 [design.md](./design.md) D1 的标定记录（含实测来源）：
   - `wRef/hRef` = **手机 4×3** 的实测尺寸（这是「今天的绝对值答案所在之处」，取它才能保证 4×3 逐值不变）。
   - `maxScale` 初值 2.0：看平板 4×3 / 6×4 顶到上限后内容是否仍明显偏小，偏小就上调并附截图依据。
3. 判据：平板 4×3 上正文 sp 值应当接近手机 4×3 的 2 倍；若上限把 4×3 与 6×4 压成同一个观感而 6×4 仍大片空白，说明上限过低或需要靠「信息加密 / 双栏」补内容（此时在上限不变的前提下把结论写进 verification.md）。

## P2 纯逻辑（Java，可 JUnit 覆盖）

新增：

| 文件 | 内容 |
|---|---|
| `android/app/src/main/java/com/classtrack/app/WidgetLayoutMetrics.java` | `resolve(widthDp, heightDp)` → 度量集合 + `isDualColumn`；三个标定常量 |
| `android/app/src/main/java/com/classtrack/app/WidgetBodyLine.java` | 行种类枚举 + 该行的绘制参数（`titleMaxLines`/`showCounts`/`showSections`/`item`/`index`） |
| `android/app/src/main/java/com/classtrack/app/WidgetBodyPlan.java` | `lines` + `headerLineCount` |
| `android/app/src/main/java/com/classtrack/app/WidgetLinePolicy.java` | `resolve(state, config, plan)`：既有规则原样迁移 + 信息加密的 flag + 双栏切分点 |

改动：

- `WidgetStyleConfig.java`：`WideLayout` 枚举、`KEY_WIDE_LAYOUT`、`DEFAULT_WIDE_LAYOUT = ADAPTIVE`、3 参数构造（保留 2 参数委托）、`parse` 三值版本、`wideLayoutStorageValue()`、`isWideLayoutEffective()`。
- `WidgetDiagnostics.java`：`layoutMetrics(scalePercent, wideLayout, dual)` + `safeWideLayout` 白名单；`styleConfigured` 增加第三个参数。

新增测试：

- `WidgetLayoutMetricsTest`：下限锁定（2×2、4×3 输入 → 与今天的常量逐值相同）、宽高单调不减、上限封顶、一个维度不达标时不放大、双栏判据两侧。
- `WidgetLinePolicyTest`：三种样式 × 三种「已上完」策略的存量行序列（A2）+ 信息加密的 flag（A3）+ `COMPACT` 下不因新选项长出列表（C3）。
- `WidgetStyleConfigTest` 增补：第三键正常/脏值/缺键/大小写、`isWideLayoutEffective()`。

验证：

```bash
./android/gradlew -p android testDebugUnitTest
```

## P3 渲染层（Kotlin）

- `android/app/src/main/java/com/classtrack/app/widget/ClassTrackWidget.kt`：
  - 删除 `HORIZONTAL_PADDING` / `VERTICAL_PADDING` / `CARD_RADIUS` / `ROW_GAP*` / `HERO_GAP` 等硬编码常量与三级 `TextStyle` 的字号字面量，改为从 `WidgetLayoutMetrics.resolve(LocalSize)` 取。
  - 删除私有 `sealed interface BodyLine` 与 `bodyLines(...)`，改画 `WidgetBodyPlan`；`BodyLineView` 按 `line.getKind()` 分派，hero 用 `line.getTitleMaxLines()`，课程行按 `showSections` 决定是否补节次，汇总行按 `showCounts` 决定是否追加计数。
  - 双栏结构（design D5）：`Row` + 两列 weight，右栏 `LazyColumn`；判据取 `metrics.isDualColumn && config.wideLayout == TWO_COLUMN`。点击挂在列表容器、每个 item、两个留白 item 上（存量教训，必须保留）。
  - `provideContent` 里打印 `phase=layout_metrics`。
- `WidgetPreviewRenderer.kt`：无需改结构；预览也走同一份度量与同一份行判决，因此 `preview=true` 分支要能拿到同一套度量（`LocalSize` 在预览合成里就是给定画布尺寸）。
- `res/values/strings.xml` 增补：
  - `widget_sections_suffix`（`第%1$s节`）
  - 配置页第三组：`widget_config_wide_section` / `_adaptive` / `_adaptive_desc` / `_dense` / `_dense_desc` / `_two_column` / `_two_column_desc` / `_hint`（双栏宽度条件与非生效说明）
- 若右栏 `LazyColumn` 得不到有界高度（真机表现为空列表/空白卡），按 design D5 的回退方案改右栏为普通 `Column` + 截断，并在 verification.md 记录触发条件。

验证：`pnpm cap:build:android` → 装 APK → 手机 AVD 2×2 / 4×3 与 P0 基线截图并排比对（A6）。

## P4 配置页

- `res/layout/activity_widget_config.xml`：新增第三组 `RadioGroup` + 标题 + 说明 TextView（沿用既有 section 结构）。
- `WidgetConfigActivity.kt`：绑定第三组与提示；`updateWideSectionState()`（`COMPACT` 时灰显禁用 + 说明）；`finishedGroup` 与新的 `wideGroup` 的选中变化都要触发 `requestPreviews()`；`saveAndFinish()` 带上新选项；`restoreSelection()` 回显。
- `WidgetConfigBridge.kt`：保存时把第三个值透传给 `WidgetDiagnostics.styleConfigured`。
- 诚实提示：双栏在「紧凑」样式下无效要说清；双栏在窄格子上自动保持单栏也要说清。

验证：A8（保存 → 重开回显 → 预览随选项变化）。

## P5 文档

- `.trellis/spec/frontend/android-home-widget.md`：按 design D2 修订「响应式」那一条，补上第三组选项、`phase=layout_metrics`、双栏的几何判据与回退。
- `res/layout/widget_preview_next_up.xml`：加一句注释说明「标定基准或缩放下限变了就必须重画这份 mock」（design D8）。

## P6 验收（证据落 `verification.md` + `research/` 截图）

| 项 | 手段 |
|---|---|
| A1/A2/A3 | `./android/gradlew -p android testDebugUnitTest` 输出 |
| A4 | `pnpm cap:build:android` + `pnpm android:check-assets` 退出码 |
| A5 | 平板 AVD：4×3 / 6×4 × 3 样式 × 3「大格子表现」截图 + `layout_metrics` / `widget_sized` 日志 |
| A6 | 手机 AVD 2×2 / 4×3 截图与 `baseline-*.png` 并排 |
| A7 | 手机 4×3（不启用）与平板 4×3（启用）的 `dual=` 日志 + 截图 |
| A8 | 配置页保存/重开回显 + 三张预览截图 |
| A9 | `adb logcat -d -s ClassTrack.Widget` 全文检索确认不含课程名/教室 |

未验证项必须显式列出（例如：具体 OEM 平板 ROM、`fontScale ≥ 1.5`、双栏在不能承载集合型 widget 的 launcher 上的行为）。

## P7 收尾

- 会话日志：`python3 ./.trellis/scripts/add_session.py ...`
- 提交：每个阶段一次提交，主题中文（`commitlint.config.cjs` 强制）。
- 归档：`python3 ./.trellis/scripts/task.py archive android-widget-adaptive-space`

## 风险与对策

| 风险 | 对策 |
|---|---|
| `LazyColumn` 放进 `Row` 的 weight 子列在宿主上拿不到有界高度 | 双栏限定在用户显式选择时；回退为普通 `Column` + 截断；默认样式不受影响（design D5） |
| 上限定得过大 → 大格子上文字过粗、行数变少 | 上限是标定常量；调整必须附平板前后对比截图（design D1/D9） |
| 平板 AVD 与真实 OEM 平板网格不同 | 记录为已知限制；验收口径是「同一样式在同一 dp 尺寸下手机/平板观感一致」，不是「与某个 ROM 一致」 |
| 迁移行判决时改坏存量行为 | 迁移前后都用 JUnit 钉住三种样式 × 三种策略的行序列（A2） |
