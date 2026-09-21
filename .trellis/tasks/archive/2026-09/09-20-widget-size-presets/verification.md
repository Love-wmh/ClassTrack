# 验收证据（A1–A9）

> 逐条对应 [prd.md](./prd.md)。每条给「判据 + 命令 + 实测输出」，并单列**未验证项与残余风险**。
> 截图与脚本在 `research/`。构建指纹见文末（`apk sha256` 每次构建都会变，因此只固定 asset index）。

## A1 预设与度量纯函数有 JUnit 覆盖 ✅

命令：`./android/gradlew -p android testDebugUnitTest`（全量 **132** 用例通过；数字取自 `android/app/build/test-results/testDebugUnitTest/*.xml` 的 tests 求和）

| 断言点 | 用例 |
|---|---|
| 预设表解析、大小写容错、未知值回退「未选预设」 | `WidgetPresetTest`（3 个用例） |
| 待消费槽位：一次性、超时、原子领取、脏值不写入 | `WidgetPendingPresetTest`（6 个用例） |
| 基准格（2×2）逐值等于改动前字面量；手机 4×3 变为 24.5sp | `WidgetLayoutMetricsTest.smallCellsKeepEveryMetricExactlyAsBefore` / `phoneDefaultCellGrowsTypeWithTheCell` |
| 取两维更紧者、单调、上限封顶、非法尺寸退化、落网格 | 同文件另 5 个用例 |
| 双栏判据两侧、左卡宽度区间、左卡留白 | `dualColumnRequiresBothWidthAndAspectRatio` 等 |

## A2 填充算法的安全性有断言 ✅

`WidgetFillPlanTest`（7 个用例）的核心一条：**算出来的字号 + 行距，估算高度不超过可用高度**，
覆盖 2×2 / 4×3 / 4×2 / 平板 4×3 / 平板 6×3 × 单双行两种排版；底到下限（0.6）仍放不下时显式允许
「溢出滚动」这一合法结果，其余任何溢出都判失败。另有：字号只许收不许放、内容放得下时不动字号、
可滚动区不触发收缩、行距余量上限 8dp、退化输入不崩。

**它守护的是上一轮真机裁字的根因**：估算必须用与渲染层**同一个取整规则**（`WidgetLayoutMetrics.snappedSp`），
否则「估算 19.88sp、实际渲染 20sp」的系统性偏小会让内容放不下。这一条在实现中被抓过一次。

## A3 行序列与内容语义 ✅

`WidgetLinePolicyTest`：三种布局样式 × 三种「已上完」策略的行序列逐项钉住，另有本次新增的
`dualColumnAddsStaticRichLinesInFixedOrder`（双栏富内容顺序固定）、`singleColumnKeepsNoRichLines`
（单栏不出现富内容行）、`heroTitleLinesFollowTheStyleNotTheSize`（紧凑 1 行、其余 2 行，与尺寸无关）。

## A4 门禁全绿 ✅

```
$ ./android/gradlew -p android testDebugUnitTest   → BUILD SUCCESSFUL（Android 132 用例）
$ pnpm test -- --run                              → Test Files 14 passed / Tests 72 passed
$ pnpm lint                                       → 0 problems
$ pnpm cap:build:android                          → BUILD SUCCESSFUL + asset check 通过
$ git status --porcelain                          → 空（提交后）
```

C2（`@OptIn` 不增长）：`grep -rn "@OptIn" android/app/src/main/java/` 仍只有两处
（`ClassTrackWidget.kt` 的 `CourseList` 与 `WidgetPreviewRenderer.kt`）。

## A5 五个预设尺寸的设备证据 ✅（含两条如实标注）

| 预设 | 目标格子 | 实测 bounds（= 尺寸） | 日志 | 截图 |
|---|---|---|---|---|
| ① 手机 · 极简（紧凑） | 2×2 · 179×210dp | `[50,384][521,936]` | `widget_sized w=179 h=210` + `layout_metrics scale=100 dual=false` | `research/after-phone-2x2-compact.png` |
| ② 手机 · 宽横（接下来） | 4×2 · 373×210dp | `[50,384][1030,936]` | `widget_sized w=373 h=210` + `scale=100 dual=false` | `research/after-phone-4x2-next_up.png` |
| ③ 手机 · 标准（接下来） | 4×3 · 373×321dp | `[50,384][1030,1227]` | `widget_sized w=373 h=321` + `scale=153 dual=false` | `research/after-phone-4x3-next_up.png` |
| ④ 平板 · 双栏 | 4×3 · 733×419dp | `[281,338][1564,1072]` | `widget_sized w=733 h=419` + `scale=200 wide=two_column dual=true` + `layout_fill font=200 gap=8.0 fill=167 lines=15` | `research/after-tablet-4x3-two_column.png` |
| ⑤ 平板 · 宽屏 | 6×3 · 1142×419dp | `[281,338][2279,1072]` | `widget_sized w=1142 h=419` + `scale=200 wide=two_column dual=true` | `research/after-tablet-6x3-two_column.png` |

- ③ 的 `scale=153` 就是「参考格子改成 2×2」的直接证据：手机 4×3 的字号从 16sp 变成 24.5sp。
- ④⑤ 的 `fill=167` 表示估算内容**超过**可用高度（167%）→ 列表滚动，因此底部不再是空白。
- **标注 1（日志配对）**：`layout_fill` 有时会先出现宿主侧**预览/缩放代理**的那一条（同样带
  `widget_sized`，尺寸是代理画布而非桌面格子）。本表引用的都是与桌面 `bounds` 量测互相印证过的那一条。
- **标注 2（未量测到小数点级的像素占比）**：PRD 写的「量测内容纵向占比」在设备上是以
  `layout_fill` 的估算值 + 截图目视为准，没有做像素级的自动化量测（左卡中缝那块空白本来就量不出「满」，
  见残余风险）。这条如实降级记录。

## A6 手机 2×2 逐像素不变 ✅

判据：把设备时钟拨回 `2026-09-20 09:00 Asia/Shanghai`，并通过 WebView CDP **重灌同一份种子课表**
（否则快照会丢掉「生成时已结束」的课，两次截图的内容本身就不同、比对会假阳性），然后把实例拖到
`[50,384][521,936]`（= 2×2），与上一轮基线 `baseline-phone-2x2-compact.png` 同区域比对：

```
>>> 差异包围盒: None        # ImageChops.difference(...).getbbox() 返回 None，即零差异
```

- 这条在**本次改完渲染层之后**跑过两次（一次是 `接下来` 样式的 2×2、一次是预设 ① 的 `紧凑` 样式），
  两次都是 `None`。
- **如实说明**：`research/after-phone-2x2-compact.png` 后来被一次设备摆位变化（`am force-stop` 让 launcher
  把实例按默认尺寸重摆）覆盖成了非 2×2 的截图，因此该文件本身不再能复现 `None`；结论以本节的运行输出为准。
  复现步骤：拨时钟 → CDP 灌种子 → 拖到 2×2 → 截图 → 与基线做 `ImageChops.difference`。

## A7 pin 尺寸提示实测有结论 ✅

- **结论：launcher 不理会尺寸提示**。请求 `tablet_wide`（目标 6×3）时，系统 pin 面板上标注的是
  **「4 × 3」**（provider 的 `targetCellWidth/Height`），落位后的实例也是 4×3。截图：`pin-dialog`（见
  `/tmp/看-添加小工具流程.png` 第 ③ 格）。
- 因此预设卡片的文案只承诺「样式与大格子表现一键设好」，尺寸写「以桌面实际放下为准，可以自己拖动调整」，
  并给「平板 · 双栏 / 宽屏」加「需宽格」标记 + 一句「当前格子不够宽，会先按单栏显示」。
- `isRequestPinAppWidgetSupported()` 为假时：原生不发起请求、**清空待消费槽位**、返回
  `{supported:false}`，Web 侧展示「长按桌面空白处 → 小工具 → 课表」的手动步骤（`WIDGET_PIN_MANUAL_HINT`）。

## A8 预设落到新实例 ✅

实测链路（手机 AVD，`appWidgetId` 新实例）：

```
phase=pin_requested preset=phone_minimal
phase=pin_result supported=true requested=true
phase=preset_applied preset=phone_minimal      # 恰好一次
```

- 落位后的实例渲染成**紧凑样式**（hero + 今天还有 N 节，无列表）→ 预设生效（截图见
  `/tmp/看-添加小工具流程.png` 第 ④ 格）。
- **原设计的路径走不通**：`android:configure` 存在时本应拉起配置页，实测 AOSP Launcher3 的 pin 流程
  直接按默认配置落位、`preset_applied` 一次都没触发。于是加了渲染侧兜底（`provideGlance` 里
  `applyPendingPreset`），三条铁律：只写给从未配置过的实例、原子 `claim()` 领取、一次性 + 5 分钟超时。
- **槽位不污染**：`WidgetPendingPresetTest.claimIsAtomicAndOneShot` 断言第二次领取为空；真机上重新放置
  第二个实例时没有再出现第二条 `preset_applied`（首版「先 peek 再 consume」时确实出现过两条，已修）。

## A9 入口与顶栏 ✅

- 顶栏紧凑化：`h-10` → `h-9`、图标 `size-5` → `size-4`；`uiautomator dump` 与 DOM 查询确认四个既有控件
  都在（可访问性标签 `上一周` / `下一周` / `全部已上` / `全部未上` 原样保留），新入口为第 5 个按钮
  （`aria-label="添加到桌面"`）。
- 入口只在 Android 原生渲染：`isNativeWidgetSnapshotAvailable()` 在浏览器返回 false
  （`app/lib/native-widget-snapshot.test.ts` 的既有用例覆盖），Web 兜底实现
  `requestPinWidget` 如实返回 `{supported:false, requested:false}`，不是静默成功。
- 预设面板：五个预设各带目标格子徽标 + 说明 + 「适合」，`needsWideCell` 的两个带「需宽格」标记
  + 退化成单栏的说明（`widgetPinPresets.test.ts` 断言）。

## 过程发现（都已在实现中修掉，值得记进 spec）

| 发现 | 根因 | 修法 |
|---|---|---|
| 平板右栏**滚动条回归** | Glance 1.2.0 在 API 33+ 用 `res/layout-v33/glance_list_*.xml`（11 个变体），上一轮只覆盖了基础版 `glance_list.xml` | 改为覆盖库里那个**空的** `Glance.AppWidget.List` 样式（一处覆盖基础版 + 全部变体），删掉布局覆盖 |
| 手机 2×2 **字变小**（回归） | 我给可滚动的列表也开了 `allowFit`，内容略超就让字号被收 | `allowFit` 只给不可滚动的双栏左卡；列表负责滚动 |
| 课程行**少了 2dp** | 用「列表位置」判定首行而不是「课程序号」（列表第 0 项是汇总行） | 改用 `line.index`；靠与基线逐像素比对抓出来的 |
| 全卡**多 4dp** | 给非课程行也加了行距 | 单栏只在课程行加（双栏才每段都加） |
| 填充率**虚高** | 单栏下课程行按双行估算（实际只渲染一行） | 估算跟着渲染走：双栏才多算一行 |
| 两条 `preset_applied` | 待消费槽位「先 peek 再 consume」非原子 | 改 `claim()` 原子领取 |
| 左卡**字号被自己的折行撑爆** | 估算没考虑「字号变大 → 折行变多」 | `WidgetFillPlan.TextLine` 带文字长度与可用宽度，按行数估算，并对**允许多行**的文字设「不被截断」的字号上界 |

## 未验证项 / 残余风险

| 项 | 说明 |
|---|---|
| 左卡中缝仍有约 90dp 空白 | 几何上填不满：今天可用的真信息已用尽（下一节、再下一节、时间教室、当天计数、今天最后一节）。要么加新内容（接明天/倒计时已被否），要么允许课名折 3 行把字号再推大 |
| 6×4 与更宽的平板档 | 本 AVD 桌面第一行被系统时钟 widget 占用，小工具最多 3 行；宽档用 6×3 覆盖 |
| 具体 OEM launcher | pin 的尺寸提示、是否拉起配置页、`isRequestPinAppWidgetSupported()` 都因 launcher 而异；本机结论来自 AOSP Launcher3（API 37 模拟器） |
| `fontScale ≥ 1.5` 无障碍放大 | 未测。字号全走 sp，但大字号下的换行与溢出没有实测证据 |
| pin 面板的「长按拖动」变体 | 本机 pin 面板是「Add to home screen」按钮形态；部分 launcher 是拖放形态，未覆盖 |
| 像素级占比量测 | 见 A5 标注 2：以 `layout_fill` 估算 + 截图目视为主，没有做自动化像素量测 |

## 构建指纹

```
$ pnpm cap:build:android
  BUILD SUCCESSFUL
  Android asset check passed: 246 assets, 27 index references,
  index sha256=a97b2c39be496170065a3c3c2c2a9d3d1805ba13cd673f545f8afc0b0b1cc2f9
```

（`apk sha256` 每次构建都会变，这里只固定 asset index；逐次的值见各次提交的构建输出。）
