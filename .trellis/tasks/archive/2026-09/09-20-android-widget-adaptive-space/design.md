# 设计：小工具体量自适应与平板适配

> 本文件只承载技术设计与取舍。需求与验收标准见 [prd.md](./prd.md)；执行顺序与门禁见 [implement.md](./implement.md)；
> 本机构建/模拟器环境见 [env-setup.md](./env-setup.md)。
> 上一个 widget 任务（`09-19-android-home-widget`）的 D1..D17 仍然有效，本文件只在 D16 上做**收窄式修订**（见 D2）。

## D1. 度量模型：连续缩放 + 双重下限/上限

**决策**：新增纯 Java 类 `WidgetLayoutMetrics`，输入格子尺寸（dp），输出一套 dp/sp 数值；Kotlin 渲染层只负责把数值转成 `Dp`/`sp` 并套用。渲染层不再保留任何写死的字号、内边距、列宽常量。

```
wRef, hRef = 手机 4×3 实测格子尺寸（标定常量，见下表）
scale   = clamp(min(width/wRef, height/hRef), 1.0, maxScale)
padScale= sqrt(scale)          // 内边距/圆角比字号更保守，避免大格子被内边距吃掉
```

- **取 `min` 而不是 `max` 或均值**：纸面上限由两个维度里更紧的那个决定。只要有一个维度还是手机尺寸，就不放大 —— 这直接挡住「横长竖矮的格子上把字放大到纵向溢出」。
- **下限 1.0 而不是 0.8**：现有绝对值就是「小格子上已经验证过的答案」。下限锁定后，手机 2×2 与 4×3 的输出与今天**逐值相同**，R5 不回归不是靠人肉比对，而是构造上成立（A1 用 JUnit 断言这一点）。
- **上限 `maxScale` 是可标定常量，不是拍脑袋值**：先量平板真实格子尺寸再定（见 D10 阶段 P1）。初值 2.0。平板 4×3 与 6×4 会顶到上限，这是预期行为；若真机截图显示内容仍明显偏小，就调这个常量，并附平板前后对比截图作为依据。**禁止**用「按尺寸选档位」或「尺寸阈值决定显示/隐藏某区块」的方式实现（D16 与 PRD 约束）。
- 缩放是连续函数 → 用户把格子拖大一点点，字号就跟着涨一点点，不存在「跳档」。

度量表（左边是今天的常量，右边是新值）：

| 项 | 今天 | 新值 |
|---|---|---|
| 标题字号 | `16.sp` | `16 * scale` |
| 正文字号 | `13.sp` | `13 * scale` |
| 说明字号 | `11.sp` | `11 * scale` |
| 横向内边距 | `14.dp` | `14 * padScale` |
| 纵向内边距 | `12.dp` | `12 * padScale` |
| 卡片圆角 | `20.dp` | `20 * padScale` |
| 首行行距 | `6.dp` | `6 * scale` |
| 行距 | `4.dp` | `4 * scale` |
| hero 后间距 | `6.dp` | `6 * scale` |
| 时间列宽 | `44.dp` | `44 * scale` |
| 标记列宽 | `12.dp` | `12 * scale` |
| 「样式」入口左内边距 | `8.dp` | `8 * padScale` |

**为什么 `sizeMode` 保持 `Exact`、为什么仍然不声明候选尺寸**：与 D16 相同。`Responsive(档位)` 会让「真实渲染用哪一档」和「配置页拿到的格子尺寸」变成两件事，历史上已经因此出过「预览列三行、桌面只剩 hero」的缺陷。本设计只让**度量**随真实尺寸变化，布局结构仍由内容与可用空间决定。
### D1.1 标定记录（2026-09-20 实测，两个 AVD）

以 Glance 回报的真实渲染尺寸（`phase=widget_sized`）为准，并与 `uiautomator` 的节点 bounds 互相印证（同一实例的另一种 `widget_sized` 是宿主侧预览画布，不能当成桌面尺寸）：

| 设备 / 尺寸 | 真实渲染 dp | 来源 |
|---|---|---|
| 手机 2×2（最小） | 179 × 210 | `widget_sized` + bounds `[50,384][521,936]` |
| 手机 3×2 | 276 × 210 | `widget_sized` |
| 手机 4×3（放置默认） | 373 × 321 | `widget_sized` + bounds `[50,384][776,1227]` |
| 平板 4×3（放置默认） | 733 × 419 | `widget_sized` + bounds `[281,592][1564,1326]` |

由此定下三个常量：`wRef = 373`、`hRef = 321`（＝手机 4×3，也就是「今天的绝对值答案所在之处」），`maxScale = 2.0`。

换算结果（floor 1.0 生效后）：

| 尺寸 | `min(w/wRef, h/hRef)` | 最终 scale |
|---|---|---|
| 手机 2×2 | 0.48 | **1.0（不变）** |
| 手机 3×2 | 0.65 | **1.0（不变）** |
| 手机 4×3 | 1.00 | **1.0（不变）** |
| 平板 4×3 | 1.31 | **1.31** |

两点必须留在记录里：

1. **平板受高度而非宽度约束**：平板 4×3 宽度是手机的 1.97 倍，高度只有 1.31 倍。`min()` 取小的结果是 1.31 —— 这是刻意的：字号由高度决定才不会把行挤出卡片。平板多出来的**宽度**由用户可选的「信息加密 / 双栏」去利用（PRD R2），默认样式不去猜。
2. `maxScale = 2.0` 在本次实测的两个档位上都**没有生效**（需要高度 ≥ 642dp 才触顶），它只是防失控的上限。若后续真机上出现「大格子把字放得过大」，先怀疑上限没设对；若出现「大格子仍然字小」，先怀疑 `hRef` 定得太小 —— 两个方向都只动常量，不动结构。
## D2. 与 D16 的关系（收窄式修订，必须同步进 spec）

D16 原文禁止的是两件事：①`SizeMode.Responsive(档位)`；②`if (height < N.dp) 不显示某区块` 这类阈值。它没有、也不应该禁止「度量随真实尺寸连续变化」。本任务按下面措辞修订 D16，并同步 `.trellis/spec/frontend/android-home-widget.md`：

- **仍然禁止**：`SizeMode.Responsive` 或任何「按宿主挑中的档位」渲染；任何用尺寸阈值决定「显示 / 不显示某个区块」的分支；任何用尺寸阈值决定列表读哪一天、读几行。
- **新增允许**：度量（字号 / 内边距 / 行距 / 列宽 / 圆角）由 `LocalSize` 经**连续函数**导出，函数形如 `clamp(min(w/wRef, h/hRef), 1.0, maxScale)`，且有 JUnit 覆盖。
- **新增允许**：在用户显式选择「双栏」时，按**几何比值**（不是设备类型）决定正文分栏；两种排布必须包含**同一份行序列**，不得增删信息。

第二条允许之所以安全：分栏不改变「显示什么内容」，只改变「同一批内容怎么排」，因此不会回到 D16 要防的那类缺陷（内容随档位漂移、预览与桌面不一致）。

## D3. 「显示哪些行」的判决下沉到 Java（可 JUnit 覆盖）

**现状**：行序列 `bodyLines(...)` 是 `ClassTrackWidget.kt` 里的私有 Kotlin 函数，`BodyLine` 是私有 sealed interface。它们纯逻辑、不碰 Android API，却完全在 JVM 测试之外 —— 上一轮的真机缺陷（4×2 只剩 hero、下面 45% 全白）正是这一类判决出错。

**决策**：把「显示哪些行、每行要什么额外信息」搬到纯 Java，与既有 `WidgetDayPlan` / `WidgetDayListPolicy` 并列：

```java
public enum Kind { HERO, SUMMARY, COUNTER, COLLAPSED, NEXT_OTHER, COURSE }

public final class WidgetBodyLine {
    private final Kind kind;
    private final WidgetDayItem item;      // 仅 COURSE 非空
    private final int index;               // 仅 COURSE：首行留更多间距
    private final int titleMaxLines;       // 仅 HERO：1（默认）或 2（信息加密）
    private final boolean showCounts;      // 仅 SUMMARY：信息加密时补当天计数
    private final boolean showSections;    // 仅 COURSE：信息加密时补节次
}

public final class WidgetBodyPlan {
    private final List<WidgetBodyLine> lines;
    private final int headerLineCount;     // 双栏时归入左栏的行数
}

public final class WidgetLinePolicy {
    public static WidgetBodyPlan resolve(WidgetDisplayState state, WidgetStyleConfig config, WidgetDayPlan plan);
}
```

- Kotlin 侧的 `sealed interface BodyLine` 与 `bodyLines(...)` 删除，`BodyLineView` 改为 `when (line.getKind())`，渲染层从此**只画判决结果**，不再自己判断该显示什么。这与 spec 里已确立的架构一致（`WidgetDayPlan` 决定列今天还是明天，渲染器只画）。
- 三种既有样式 × 三种「已上完」策略的**行为逐项保持**（A2）：迁移时把今天的规则原样搬过去，并用 JUnit 把迁移后的输出按行种类与顺序钉住。这顺带给存量行为补上一层回归网。
- **信息加密**的全部新增内容都表达成行上的 flag，不用渲染层做判断：
  - `HERO.titleMaxLines = 2`
  - `SUMMARY.showCounts = true` → 渲染器在「今天 周四 · 共 6 节」后追加「 · 已上完 2 节」（`todayFinishedCount > 0` 时）
  - `COURSE.showSections = true` → 时间列渲染成「08:00 · 第3-4节」
- **双栏的切分点**也在 Java：`headerLineCount` 恒为「左栏该放几行」——有 HERO 行时取 1（左栏 = hero），没有 HERO 行时取 1（左栏 = 汇总行），行序列为空时取 0。即左栏永远是「hero 或汇总」，右栏是其余全部行，因此分栏既不会漏内容，也不会把课程行留在左栏。

## D4. 新选项：第三组实例级配置

**决策**：`WidgetStyleConfig` 增加 `WideLayout { ADAPTIVE, DENSE, TWO_COLUMN }`，默认 `ADAPTIVE`。

- 存储键 `wide_layout`，值 `adaptive` / `dense` / `two_column`；未知值、缺键、大小写不一致一律回退默认（沿用既有容错口径，绝不抛异常、绝不空白）。
- 保留 2 参数构造函数（委托给 `ADAPTIVE`），使既有调用点与存量单测不必改写；新增 3 参数构造。
- 新增 `isWideLayoutEffective()`：`layoutStyle != COMPACT`。与 `isFinishedPolicyEffective()` 同源 —— 「紧凑」不显示列表，双栏与信息加密里的课程行增强对它都无意义，配置页必须如实灰显并说明。
- `WidgetStyleState` 的 `read` / `write` / `clear` 同步第三键。`clear()` 必须删掉三个键：`appWidgetId` 会被系统复用，漏删一个键会让新实例继承旧样式。
- 为什么是「三选一」而不是「信息加密 + 双栏」可叠加：叠加会让配置页从 2 组变成组合矩阵，也让真机验收矩阵翻倍。本次先做互斥三选一，叠加留作后续可选项（PRD 已注明）。

## D5. 双栏的渲染结构（本次唯一有平台风险的点）

```
Column(fillMaxSize, horizontal padding, background, cornerRadius)      // 根：与今天相同
├─ 未就绪 → 提示文案（不变）
└─ 就绪
   ├─ 单栏（默认）→ 今天的 LazyColumn（不变）
   └─ 双栏        → Row(fillMaxWidth().defaultWeight())
                    ├─ Box(width = dualHeaderWidthDp, fillMaxHeight)
                    │    └─ HeroCard：表面 + 圆角 + 内边距 + 两端对齐的上下两块
                    ├─ Spacer(width = dualGapDp)
                    └─ Column(defaultWeight(), fillMaxHeight) → 右栏：其余行装进 LazyColumn
```

左栏宽度是**固定舒适宽度**（`getDualHeaderWidthDp()`：正文宽的 36%，夹在 220~360dp），不是按权重分配 —— 权重会让课名在超宽卡片上被拉成一整行长文，也会在窄双栏里挤压右栏的教室列。

- 判据（纯函数，落在 `WidgetLayoutMetrics`）：`width >= 320dp && width >= height * 1.25`。320dp 是「两栏各自还读得通」的最小宽度，1.25 是横宽比要求。**两个都是布局可行性下限，不是内容可见性阈值**（D2 的分界）。
  - **1.25 是实测标定出来的，不是拍的**：先前写 1.15，结果手机 4×3 的真实宽高比是 373/321 ≈ 1.162，默认格子也会满足判据 —— 「双栏只在宽格子上生效」就名存实亡。1.25 把手机 4×3 挡在外面，同时平板 4×3（≈1.75）与平板 6×4（≈1.97）都在里面。这条被 `WidgetLayoutMetricsTest.dualColumnRequiresBothWidthAndAspectRatio` 的两侧断言钉住（PRD A7 要求的正是「判据两侧都有证据」）。
- 两个阈值都不是设备判断：手机 6×3（宽矮）也可能满足，这是刻意的 —— 用户显式选了双栏，就按几何给结果。
- 点击仍然同时挂在 `LazyColumn`、每个 item 和两个留白 item 上（真机回归教训），左栏整块也可点。
- **风险**：`LazyColumn` 放进 `Row` 的 `weight` 子列是本项目没用过的组合（Glance 编译成 `RemoteViews` 集合时，宿主需要给集合一个有界高度）。缓解：先按上面的结构实现，用平板 AVD + 手机 AVD 双端实测；若宿主给不出有界高度（表现为右栏空列表或整卡空白），回退方案是双栏右侧改用普通 `Column` + 高度截断（spec 里已记录「不能承载集合型 widget 的罕见 launcher 也应按截断渲染」）。**这条只在双栏选项下生效，默认样式不受影响**，因此最坏情况是「双栏在个别 launcher 上退化成截断列表」，不会伤到默认路径。

## D6. 配置页

- 新增第三组 `RadioGroup`「大格子表现」：跟随尺寸（默认）/ 信息加密 / 双栏，每组选中项与今日既有两组同样实时重渲三张真实渲染预览（复用 `requestPreviews()`）。
- 「双栏」在「紧凑」样式下无效 → 沿用「已上完策略」的既有做法：整组/单项降透明度 + 禁用点击 + 一行说明（`updateWideSectionState()`），不做沉默忽略。
- 文案里如实写明双栏的宽度条件（约「平板横向 4×3 以上」），并说明不满足时自动保持单栏。
- 保存路径 `WidgetConfigBridge.save` 与 `WidgetDiagnostics.styleConfigured` 同步带上第三个值（走白名单枚举）。

## D7. 诊断日志

- 新增 `WidgetDiagnostics.layoutMetrics(scalePercent, wideLayout, dual)`：`phase=layout_metrics scale=142 wide=two_column dual=true`。只含数值与白名单枚举，`wide` 经新的 `safeWideLayout`（白名单 `adaptive`/`dense`/`two_column`），与既有 `safeStyle` 同构。`dual` 让「选了双栏但没分栏」在日志里一眼可见，避免只能靠截图判断是阈值没到还是渲染坏了。
- 这条日志是 A5/A7 的取证手段之一（与 `phase=widget_sized`、`phase=preview_sized` 配合）。
- 不改动既有 phase 的字段，避免沿用旧脚本的取证步骤失效。

## D8. 静态选择器预览（`previewLayout` / `previewImage`）不动

`widget_preview_next_up.xml` 与 `scripts/generate-widget-preview.py` 描述的是**默认样式在约 4×3 尺寸下**的长相。因为缩放下限是 1.0 且 4×3 就是标定基准，`scale` 在 4×3 上恒为 1.0，所以这份 mock 与真实渲染仍然一致，不需要重画。

**但要加一句注释**：如果将来改了 `wRef/hRef`（标定基准）或把下限降到 1.0 以下，这份 mock 就会撒谎，必须同步重画。把「什么时候会失效」写在文件里，比让下一个人自己推更可靠。

## D9. 兼容性与回滚

| 项 | 处理 |
|---|---|
| 存量实例（未写过 `wide_layout`） | 缺键回退 `ADAPTIVE`：内容与今天完全一致，只有度量按新规则随尺寸变化（这正是本任务的目的） |
| 存量实例的观感 | 手机 2×2 与 4×3 逐值不变（下限 1.0 + 基准即 4×3）；平板变大是本任务的目标变化 |
| 快照契约 | 不动（`schemaVersion = 1`，Web 侧零改动） |
| 回滚代码 | 直接 revert 提交即可；第三个存储键是**新增**的，旧代码的 `parse` 忽略未知键，`clear()` 不会删它 —— 这在回滚后可能让复用的 `appWidgetId` 残留一个 `wide_layout` 值。已知、可接受（旧代码不读它），但要在回滚说明里写清 |
| 度量拍不准 | 只调 `wRef/hRef/maxScale` 三个常量，结构不动；调常量必须附平板前后对比截图 |

## D10. 验证策略

- **T1 JVM 单测（本机必跑）**：`WidgetLayoutMetricsTest`（下限锁定 / 单调性 / 上限封顶 / 取小 / 双栏判据两侧）、`WidgetLinePolicyTest`（三种样式 × 三种策略的存量行为钉住 + 信息加密的 flag）、`WidgetStyleConfigTest` 增补（第三个键的解析、脏值回退、有效性判定）。命令见 implement.md。
- **T2 手机 AVD 对照组**：`Medium_Phone`（1080×2400 @420dpi）上 2×2 与 4×3 截图，与**改动前基线截图**并排比对（基线在阶段 P0 先取）。
- **T3 平板 AVD 实测**：`Medium_Tablet`（2560×1600 @280dpi，landscape）上 4×3 与 6×4 两档 × 三种布局样式 × 三种「大格子表现」的截图；`phase=layout_metrics` 与 `phase=widget_sized` 对得上。
- **T4 配置页闭环**：第三组选项保存/重开回显；三张预览与当前选项一致；`preview_sized` 与桌面 `widget_sized` 对齐。
- **已知限制**：平板 AVD 是同一份 system image 上的平板**显示配置**（`ro.build.characteristics` 仍为 `emulator`，但屏幕 dp 尺寸 1462×914 触发 sw600dp，launcher 实测为平板布局并带底部 taskbar）。它验证的是「大格子上度量与小格子是否一致」，不能替代对具体 OEM 平板 ROM 的验证 —— 这一条要写进 verification.md 的未验证项。

## D11. 第三轮修订（真机比对后）：子卡片只存在于双栏

第二轮曾把「主卡化」做成通用机制：卡片比基准高时按 `fillFraction` 把余量交给 hero，让它长成一张有表面、
内容垂直居中的主卡，单栏与双栏都走这套。真机比对后产品负责人否掉了单栏那一半 —— **单栏凭空多出一个
框，只是把「空白」换成了「卡片内边距」**。本轮的最终口径：

| 局面 | 渲染 |
|---|---|
| 单栏（跟随尺寸 / 信息加密）与配置页预览 | `HeroSection`：标签行 + 课名 + 时间教室，末尾一段 `heroGap` 间距。**不加表面、不加固定高度** |
| 双栏左栏 | `HeroCard`：`fillMaxHeight` + 表面色 + 圆角 + 内边距，内部「顶部块 / 弹性空隙 / 底部块」 |

- **两端对齐的实现**：Glance 的 `Column` 没有 `verticalArrangement`（照 AndroidX Compose 的写法会直接
  编译不过），改用 `Spacer(GlanceModifier.fillMaxWidth().defaultWeight())` 吃掉余量 —— 顶部块贴顶、
  底部块贴底，余量全部落在中间。这条已在平板 4×3 真机确认（左卡底部出现「时间 · 教室」与「今天还有 2 节」）。
- **共用的内容块**：`HeroHeading`（标签行 + 课名）与 `HeroDetail`（时间 · 教室）被两个容器共用，双栏额外
  在底部块补一行「今天还有 N 节」（`remainingTodayText`，`state.todayRemainingCount > 0` 才画）。
  仍然满足「同一份行序列、同一套内容渲染」的既有约束：容器不同，内容来源唯一。
- **删掉的度量**：`getFillFraction()` / `getHeroHeightDp()` / `getHeroSurfaceAlpha()` 与其常量随本轮一起删除。
  它们只在「单栏主卡化」里成立，留着就是死代码。保留并改口径的是 `getHeroInnerPaddingDp()`
  （`14dp × padScale`，不再乘余量强度）与新增的 `getDualHeaderWidthDp` / `getDualGapDp`。
- **一处踩坑（值得记下来）**：第一版用「内容高度估算」（`字号 × 1.45 + 间距`）给主卡定高，加上外面还有一层
  `fillMaxHeight` 的 Box，形成「卡片套卡片 + 双层内边距」——手机上估算值小于真实行高，hero 顶部那行被裁掉。
  教训：Glance 拿不到文本测量结果，**不要给文本容器设估算高度**；让内容决定高度，只在能整块撑满的容器
  （双栏左卡，整列就是一张卡）里用弹性 Spacer 分配余量。
- **R5 如何仍然成立**：单栏路径重新变成「改动前那段内容块 + 度量取自 `WidgetLayoutMetrics`」，而在
  手机 2×2 / 4×3 上 `scale = padScale = 1.0`，度量逐值等于改动前的写死常量（`smallCellsKeepEveryMetricExactlyAsBefore`
  断言的就是这件事）。实测证据：2×2 与改动前基线截图**逐像素相同**（差异包围盒 `None`）。
- **代价（如实记录）**：单栏 + 少课时的大格子上，列表下方仍会留白。这是刻意接受的 —— 吸收纵向余量的手段
  现在是三件事：度量放大、信息加密（每行显示更多信息）、双栏（多一栏）。不做无表面的「伪主卡」。
