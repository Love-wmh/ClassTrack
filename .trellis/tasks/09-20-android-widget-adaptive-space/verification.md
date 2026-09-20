# 验收证据（A1–A9）

> 逐条对应 [prd.md](./prd.md) 的 Acceptance Criteria。每条都给「判据 + 命令 + 实测输出」，
> 并单列**未验证项**。截图与脚本见 `research/`，取证的踩坑见 [env-setup.md](./env-setup.md) E6。
>
> 终版构建：`apk sha256=84627cef51df099db13a046668bfe782207d210bfceab075ad112f0fb5b6f26a`（`pnpm cap:build:android`）。

## A1 度量纯函数有 JUnit 覆盖 ✅

命令：`./android/gradlew -p android testDebugUnitTest`（全量 111 用例通过）

| 断言点 | 用例 |
|---|---|
| 下限锁定（2×2 / 3×2 / 4×3 / 250×180 逐值等于改动前常量） | `WidgetLayoutMetricsTest.smallCellsKeepEveryMetricExactlyAsBefore` |
| 两个维度取小（单维度不达标不放大） | `aSingleSmallDimensionKeepsTheWholeCardAtBaseline` |
| 对宽高单调不减 | `scaleIsMonotonicInBothDimensions` |
| 上限封顶 | `scaleIsCappedAtTheCalibrationCeiling` |
| 非法尺寸退化 | `unusableSizesFallBackToBaselineMetrics` |
| 度量落网格（字号 0.5sp / 余量 1dp） | `everyMetricFallsOnAGrid` |
| 双栏判据两侧 + 左卡宽度区间 + 左卡留白 | `dualColumnRequiresBothWidthAndAspectRatio` / `dualHeaderKeepsAComfortableWidth` / `dualCardKeepsInnerPaddingConservative` |

## A2 未选新选项时内容不变 ✅

- `WidgetLinePolicyTest`：三种布局样式 × 三种「已上完」策略的行序列（行种类 + 顺序）逐项钉住；第三组的默认值就是「跟随尺寸」，行序列与判决前完全一致。
- 源码级复核（`git diff master -- .../widget/ClassTrackWidget.kt` 只看字符串引用）：被删除的 `R.string.*` 只有 `widget_time_range` / `widget_time_and_room` 两处**因搬进共用块而重新出现**，新增引用只有 `widget_sections_suffix`（节次）、`widget_finished_count`（计数）、`widget_today_remaining_count`（双栏左卡底部）三处。**没有任何既有文案被删除或改写。**

## A3 「信息加密」的新内容有断言与像素证据 ✅

- 断言：`WidgetLinePolicyTest` 覆盖 `titleMaxLines`（1 → 2）、课程行 `showSections`、汇总行 `showCounts` 三个 flag 的开关矩阵；`WidgetStyleConfigTest` 覆盖第三键解析。
- 像素：`research/after-tablet-4x3-dense.png` —— 每行左侧出现「第 3-4 节」「第 5-6 节」…（最长的「第 9-10 节」完整显示，未截断），汇总行出现「今天 周日 · 共 4 节 · 已上完 1 节」。

## A4 门禁全绿 ✅

```
$ ./android/gradlew -p android testDebugUnitTest     → BUILD SUCCESSFUL（111 用例）
$ pnpm cap:build:android                             → BUILD SUCCESSFUL
  Android asset check passed: 247 assets, 28 index references,
  index sha256=c0b593889dd41fb6aa562f74504b9369072778918bbb464124e6e158896d1c37
$ git status --porcelain | grep -vE '^(\?\?| M) (android/|\.trellis/)'   → 空
```

Web 侧零改动（`src/`、`electron/`、`scripts/`、`package.json` 均无改动；asset index sha256 与改动前一致）。

C2（`@OptIn` 数量不增长）：全模块 `grep -rn "@OptIn" android/app/src/main/java/` 只剩两处 ——
`ClassTrackWidget.kt` 的 `CourseList`（`ExperimentalGlanceApi`）与 `WidgetPreviewRenderer.kt`
（`ExperimentalGlanceRemoteViewsApi`）。双栏右栏与单栏列表共用同一个 `CourseList` 包装，因此
双栏没有引入第二份 opt-in，点击挂载规则也只在那一处实现。

## A5 平板实测有据 ✅（含一处环境性偏差，见下）

平板 4×3（`bounds=[281,338][1564,1072]` = 733×419dp），三档各一张，每张都配同一时刻的日志：

| 大格子表现 | 日志（`adb logcat -d -s ClassTrack.Widget`） | 截图 |
|---|---|---|
| 跟随尺寸（默认） | `phase=widget_sized w=733 h=419` + `phase=layout_metrics scale=131 wide=adaptive dual=false` | `research/after-tablet-4x3-adaptive.png` |
| 信息加密 | 同上 + `scale=131 wide=dense dual=false` | `research/after-tablet-4x3-dense.png` |
| 双栏 | 同上 + `scale=131 wide=two_column dual=true` | `research/after-tablet-4x3-two_column.png` |

- 配置页预览与桌面尺寸一致：`preview_sized` 与 `widget_sized` 的差在 launcher 内缩范围内（同上一任务的既有结论）。
- 无 `FATAL EXCEPTION` / `ActionException` / `InflateException`（压测见下「过程发现」）。
- **宽档偏差（如实记录）**：PRD 写的是 4×3 与 6×4 两档，但本 AVD 桌面第一行被系统时钟 widget 占用，小工具最多只能到 3 行，6×4 拖不出来（两次拖手柄尝试，几何无变化）。宽档证据改用 **6×3**（1142×419dp，宽高比 2.7）覆盖：`research/after-tablet-6x3-{adaptive,dense,two_column}.png`，日志 `phase=widget_sized w=1142 h=419` + `scale=131`（**高度受限**，`maxScale=2.0` 未被顶到）。高度方向的余量由单测在 733×419 / 733×800 / 2000×900 三组尺寸上覆盖。

## A6 手机对照组无回归 ✅

| 尺寸 | 判据 | 结果 |
|---|---|---|
| 2×2（179×210dp） | 与 `research/baseline-phone-2x2-next_up.png` 同区域（`[50,384][521,936]`）**逐像素**比对 | **差异包围盒 `None`**（`ImageChops.difference(...).getbbox()` 返回 `None`，即零差异） |
| 4×3（373×321dp） | `bounds=[50,384][1030,1227]` + `phase=widget_sized w=373 h=321` + `layout_metrics scale=100` | 字号/行距/列宽/内边距与改动前一致（见下方证据链） |

比对前提：把设备时钟拨回基线那次数据对应的时刻（`cmd alarm set-time`，2026-09-20 09:00 Asia/Shanghai）并重灌同一份种子课表，否则两次截图的**内容**本身不同（快照会丢掉生成时已结束的课），比对会假阳性。首次比对就是因为数据不同而失败，重灌后才得到零差异。

**4×3 为什么用证据链而不是直接叠加截图**：`baseline-phone-4x3-next_up.png` 拍摄时该实例的落点与尺寸与现在不同（约 960×720 设备像素 vs 现在的 980×843），两张图无法按同一坐标裁剪；强行缩放比对会引入重采样误差。因此 4×3 由三件事共同钉住：

1. `smallCellsKeepEveryMetricExactlyAsBefore` 断言 373×321 上**每一个度量**都等于改动前写死在渲染层里的字面量（`scale = padScale = 1.0`）；
2. 单栏渲染路径就是改动前那段内容块（`HeroSection` + 同行序列），源码级复核见 A2；
3. 同一条代码路径的 2×2 已逐像素一致。

## A7 双栏判据两侧都有证据 ✅

| 情形 | 证据 |
|---|---|
| 手机 4×3（373×321dp，宽高比 1.162）**不启用** | `phase=layout_metrics scale=100 wide=two_column dual=false`（选「双栏」也不分栏）+ 单测 `dualColumnRequiresBothWidthAndAspectRatio` 的 `assertFalse` |
| 平板 4×3（733×419dp，宽高比 1.75）**启用** | `phase=layout_metrics scale=131 wide=two_column dual=true` + 截图左卡/右栏都在 |
| 阈值本身 | 320dp 与 1.25 各有一侧断言（正好 320dp 且够横 → 启用；320dp 以下或不够横 → 不启用） |

## A8 配置页第三组选项闭环 ✅

- 保存 → 重开回显：平板实例（`appWidgetId=5`）在选「双栏」并确定后重新打开配置页，`uiautomator dump` 显示 `text="双栏" checked="true"`；`phase=style_configured style=next_up finished=show_dim wide=two_column`。截图：`research/config-tablet-wide-two_column.png`。
- 旧实例（从未写过该键）回显默认值「跟随尺寸」：见 P3 阶段截图；`WidgetStyleConfigTest` 覆盖缺键/脏值/大小写回退。
- 诚实说明：页面在该组下方写明「左栏放当前或接下来的一节课，右栏放当天课表；格子不够宽时自动保持单栏。」，与「紧凑样式禁用已上完策略」同一套做法（不沉默忽略）。

## A9 诊断日志 ✅

```
phase=layout_metrics scale=131 wide=two_column dual=true
phase=style_configured style=next_up finished=show_dim wide=two_column
```

- 新增字段只有数值与白名单枚举：`wide` 经 `WidgetDiagnostics.safeWideLayout`（`adaptive` / `dense` / `two_column`，其余归 `unknown`），`dual` 是布尔。
- 内容泄漏检查：把两台设备 `ClassTrack.Widget` 的**全量**日志过一遍课程名/教室/时间白名单词，命中数 **0**。
- 本次日志的全部 phase 清单（两设备合计）：`widget_sized` / `layout_metrics` / `snapshot_read` / `preview_sized` / `refresh_requested` / `render_targets` / `widget_rendered` / `style_configured` / `snapshot_stored` / `preview_failed`（历史）/ `style_write_failed`（历史）/ `scheduling_cancelled` / `config_rejected` / `refresh_failed`（历史）/ `composition_failed`（历史）—— 括号里的历史项都发生在本次改动之前或来自早先任务的旧 APK，终版构建在压测中为 0。

## 过程发现（已修）：配置页并发快照冲突导致进程崩溃

取证时发现平板在 12:58 / 12:59 / 13:01 三次 `FATAL EXCEPTION`：

```
androidx.compose.runtime.snapshots.SnapshotApplyConflictException
  at WidgetRenderCache.publish(WidgetRenderCache.kt:70)
  at WidgetRefreshController.resolveCurrentState(WidgetRefreshController.kt:31)
  at WidgetConfigActivity$renderPreviews$state$1(WidgetConfigActivity.kt:225)
```

- **成因**：配置页每点一次选项就重渲三张真实预览（主线程在做 `RemoteViews.apply` 的真实合成），同时后台调度器上 `renderPreviews` → `resolveCurrentState` → `WidgetRenderCache.publish` 在用 `Snapshot.withMutableSnapshot` 写缓存；两者在 `Snapshot.apply()` 上撞车即抛异常，未捕获直接把进程带走 —— 用户会看到配置页崩掉、样式改不回来。第三个选项（多一组、多几次重渲）把这个既有竞态显著放大了。
- **修法**（`WidgetRenderCache.publishSafely`）：重试 3 次，仍失败退回普通赋值（普通赋值同样通知观察者，只是不参与事务合并；失败那次的可变快照已被丢弃，不留半写状态），并记一条 `phase=render_cache_conflict`（只有 phase 名）。
- **对比证据**：同一套触发方式（force-stop + 反复开配置页 + 连续切选项 ×6 轮，清空 logcat 后执行）在修复前 3 次 FATAL、修复后 **0 次 FATAL**；该压测同时得到 0 个 `preview_failed` / `composition_failed` / `refresh_failed`。

## 未验证项 / 残余风险

| 项 | 说明 |
|---|---|
| 具体 OEM 平板 ROM | 平板 AVD 是「同一份 system image 上的平板显示配置」（`sw600dp` 生效、launcher 为平板布局），不能替代具体厂商 ROM 的桌面行为 |
| 6×4 档 | 见 A5 的环境性偏差（本 AVD 桌面行数不足）；代码路径由 6×3 与单测覆盖 |
| `fontScale ≥ 1.5` 无障碍放大 | 未测。所有字号走 sp（尊重系统字体缩放），但大字号下 hero 与行高是否溢出没有实测证据 |
| 不能承载集合型 widget 的罕见 launcher | 未测（无此类设备）。spec 已写明此类 launcher 应按「高度截断 + `+N` 尾部」退化处理 |
| 多实例并存 | 只在单实例（手机 1 个、平板 1 个）上取证；`clear()` 删三个键的逻辑由单测覆盖，未做「同机多实例各自不同样式」的实测 |
