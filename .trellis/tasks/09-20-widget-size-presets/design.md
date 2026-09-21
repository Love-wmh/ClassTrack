# 技术设计：预设模型 + 连续填充 + 应用内 pin 入口

> 配套 [prd.md](./prd.md)。本文只写「怎么做」与「为什么这么选」，含被否方案。

## D1. 字号模型（2026-09-20 产品负责人真机反馈后重定）

**决策：参考格子从「手机 4×3（373×321dp）」改成「2×2 最小格（179×210dp）」，让「格子越大字号越大」成为
默认事实**，字号是**自变量**，内容量是**因变量**。

```
sizeScale = clamp(min(w / 179, h / 210), 1.0, 2.0)      // 尺寸驱动，格子越大越大
fitScale  = 解「内容刚好放下」的绝对字号系数（≤ sizeScale，下界 0.6）   // 只用于不可滚动的区域
fontScale = min(sizeScale, fitScale)
```

实测（纸面验算，`research/generate-preset-mock.py`）：

| 预设 | 格子 | sizeScale | 实际字号系数 | 内容占比 |
|---|---|---|---|---|
| 手机 2×2 | 179×210 | 1.00 | ×1.00 | 85%（含课名换行 + 下一节） |
| 手机 4×2 | 373×210 | 1.00 | ×1.00 | 109%（溢出滚动） |
| 手机 4×3 | 373×321 | 1.53 | ×1.53 | 99% |
| 平板 4×3 双栏 | 733×419 | 2.00 | ×1.61（被 fitScale 收） | 100% |
| 平板 6×3 宽屏 | 1142×419 | 2.00 | ×1.61 | 100% |

- **为什么还要 fitScale**：直接把字号顶到 `sizeScale` 会在平板上溢出（实测 119%），列表第 4 行被裁、左卡
  课名被挤出卡片。`fitScale` 把字号停在「刚好放下」的位置 —— 既不留白也不裁切。
- **课名按宽度自动换行**（不再硬截断）：手机预设 2 行、双栏左卡 2 行、宽屏右栏 2 行。换行是**同一段文字的
  排版**，不增删信息，因此不触碰 D16「按尺寸决定显示什么内容」的禁令。
- **手机 4×3 会变**（字号 16sp → 24.5sp）：这是产品要求的直接结果，R5 的不回归口径同步收窄为「2×2 逐像素
  不变、4×3 允许变化」。

## D1.1 预设模型：预设 = 样式 + 大格子表现 + 行项形态

**决策**：预设**不是**尺寸查表，而是三件东西的打包：

```java
public final class WidgetPreset {
    public enum Id { PHONE_MINIMAL, PHONE_STANDARD, TABLET_DUAL, TABLET_WIDE }
    // 内容组合（决定渲染哪几天、画哪些行）
    public enum Content { TODAY, TODAY_AND_TOMORROW }
    Id id; Content content; LayoutStyle style; WideLayout wide; boolean allowFontBoost; String targetCell;
}
```

- 首批四个预设（id / 内容 / 样式 / 大格子表现 / 允许放大字号 / 目标格子）：

| id | 内容 | 样式 | 表现 | 字号放大 | 目标格子 |
|---|---|---|---|---|---|
| `PHONE_MINIMAL` | `compact` | `adaptive` | false | 单行行项 | 2×2 |
| `PHONE_STANDARD` | `next_up` | `adaptive` | false | 单行行项 | 4×3 |
| `PHONE_WIDE` | `next_up` | `adaptive` | false | 单行行项 | 4×2 |
| `TABLET_DUAL` | `next_up` | `two_column` | true | **双行行项 + 富内容** | 4×3 |
| `TABLET_WIDE` | `next_up` | `two_column` | true | **双行行项 + 富内容** | 6×3 |

**不再有「内容组合」维度**：全部预设只渲染今天（原 `TODAY_AND_TOMORROW` 已否）。预设的差异收敛成
「样式 + 大格子表现 + 行项形态 + 是否允许放大字号」。

**为什么不做「预设尺寸 → 度量目标」的查表**：查表要按尺寸插值（2D 尺寸空间里两个预设点之间的插值很难解释），
而且本质是「用尺寸档位决定度量」——离 D16 的禁令只差一步。改成「填充是一条连续规则（见 D2），预设只决定
内容组合与是否允许放大字号」之后：

- 内容组合由**用户选择的预设**固定 → 同一预设任意尺寸渲染同一份行序列（D16 要求的那条）✓
- 填充是连续函数 → 预设内自动铺满、预设外连续尽力，**不需要为预设写特例** ✓
- `allowFontBoost=false` 的预设（手机两个）在构造上不可能改字号 → A6「手机 2×2 逐像素不变」是必然，不是巧合 ✓

**回退**：预设 id 非法/缺失 → 一律按「未选预设」处理（等价于今天的默认行为：不放大字号、内容只今天），
绝不抛异常、绝不空白。

## D2. 填充算法：解析式算内容高度，只把余量交给「不承载文本」的量

### D2.1 行高系数必须**实测标定**，不许再猜（上一轮裁字的根因）

上一轮用「字号 × 1.45」估算主卡高度，真机上估算值小于实际行盒高度，hero 首行被裁掉。所以 P0 先做一次
**标定实验**：在手机 4×3 上渲染已知行序列，截图量测「文本行带」的像素高度与行间空档，得到
`LINE_HEIGHT_FACTOR` 的实测值（含 `includeFontPadding` 的影响）。

- 编码时取 `LINE_HEIGHT_FACTOR_CALIBRATED × 1.05` 作为估算系数（安全余量），并把实测原始数据写进本文件。
- 任何时候估算值只用于**「还能放多少余量」**，不用于「把内容压进固定高度」——这是上一轮踩坑的直接教训。

### D2.2 余量分配（连续、有上限）

```
available = heightDp - 2 * verticalPadding                            // 内容可用高
content   = Σ(行高估算) + Σ(行间距)                                    // 解析式，见 D2.1
slack     = available - content                                        // 可正可负
share     = clamp(slack / (lineCount + 1), 0, MAX_EXTRA_PER_GAP_DP)    // 每份最多 +8dp
rowGapDP  = rowGapBase + share                                         // 行间距
vPadDP    = verticalPaddingBase + share / 2                            // 首尾留白各加半份
```

- **只放大间距**：间距不承载文本，放大它永远不会裁字（这是「不裁切」这一条 A2 断言的来源）。
- 上限 `MAX_EXTRA_PER_GAP_DP = 8`：超过这个数，4 行的课表会变成一张「稀疏表格」，可扫读性反而下降。
- `slack < 0`（内容装不下）时不分配，交给既有 `LazyColumn` 滚动 —— 与今天的口径一致。

### D2.3 字号（按 D1 求解，不再是「填不满时的补偿」）

- 求解方式：在 `[0.6, sizeScale]` 上二分找最大的绝对字号系数，使内容高度 ≤ 可用高度 × 0.98。
- 上界是 `sizeScale`（尺寸驱动），下界 0.6 是兜底；`sqrt` 那套启发式已删除（它永远到不了"刚好放下"）。
- 求解顺序：先定字号 → 再把零头给行距（≤8dp）→ 两者不会同时拉满。

### D2.4 各预设的验收目标（纸面验算 + 截图量测）

纸面小样（`research/generate-preset-mock.py`，行高系数用实测 1.42 × 安全系数 1.05）算出来的数字：

| 预设 | 现状占比 | 目标占比 | 行距 | 字号放大 |
|---|---|---|---|---|
| `PHONE_MINIMAL` 2×2 | 46% | 53% | 12dp | ×1.00 |
| `PHONE_STANDARD` 4×3 | 60% | **75%** | 12dp | ×1.00 |
| `PHONE_WIDE` 4×2 | **97%** | 99% | 5dp | ×1.00 |
| `TABLET_DUAL` 4×3 | 79%（含富内容） | **98%** | 11.5dp | ×1.13 |
| `TABLET_WIDE` 6×3 | 79% | **98%** | 11.5dp | ×1.13 |

注意两个反直觉的结论：

- **只放大字号填不满**：平板 4×3 上字号顶到全局上限 ×1.60 也只有 66%；把行距上限从 8dp 放到 16dp 能到 75%，
  但右栏会变成「稀疏表格」（小样实拍可对比）。
- **富内容反而让字号放大变得温和**：加上静态富内容后内容本来就到 79%，`sqrt` 规则只给出 ×1.13 ——
  比靠字号硬撑健康得多。

## D3. 静态富内容（填充的主力，取代「接明天」）

- 行序列（双栏预设）：`hero` → `summary(两行)` → 课程行 ×N（**双行行项**，正在进行那行加高）→ `footer(今天最后一节)`。
- 左卡：`HeroHeading(标签 + 两行课名)` / **中缝两行**（「下一节 16:00 线性代数 D402」+「第 1 周 / 共 20 周」）/ `HeroDetail`。
- 全部字段来自快照已有数据，**不新增刷新、不新增契约字段**；行数在渲染前已知，这是 D2.2 解析式计算的前提。
- 双行行项是**预设属性**（`Preset.rowTwoLines`），手机两个预设保持单行 —— 手机不回归由构造保证。
- 被否方案与理由（都要留在 spec 的「不要重做」清单里）：
  - **接明天**：产品否（预设语义会变成两天视图，且与 R11「今天有课只列今天」的口径打架）。
  - **倒计时 / 进度条**：Glance 没有 Chronometer 这类自走控件（已核对 1.2.0 jar：`LinearProgressIndicator`
    存在且不是实验性 API，但它的值只在合成时刻有效），显示的分钟数会随刷新间隔陈旧；用户明确「不能实时就算了」。

## D4. 双栏左卡中缝：两行「下一节 / 再下一节」+ 2:3 的余量分配

> 2026-09-20 实机迭代：中缝从一行变成**两行**，措辞按 hero 状态分档，余量按 2:3 落下（见下）。

- **措辞按 hero 状态分档**：hero 正在上 → 「下一节 / 再下一节」；hero 本身就是「接下来」那一节 →
  「再下一节 / 再之后」。否则会出现「接下来 大学物理 / 下一节 14:00 毛泽东思想」这种自相矛盾的读法（真机截图抓到）。
- **余量 2 : 3**：Glance 的 `defaultWeight()` 不支持自定义权重（只能等权），因此用**份数**表达比例
  （中缝上方 2 份、下方 3 份）—— 中缝略靠下，读起来像「顶部信息 + 下半部分」，而不是三块等距的孤岛。
- 仍然做不到「几何上填满」：中缝两行 + 底部两块只占可用高度的约 70%，剩下的空白只能靠**新内容**填，
  而今天可用的真信息已经用尽（下一节、再下一节、时间教室、当天计数、今天最后一节）。这条如实写进
  verification 的残余项。

## D4.0 双栏左卡中缝（原始设计）

- 现状：左卡 `SpaceBetween`（顶部块 / 一个弹性 Spacer / 底部块）→ 中缝 ≈195dp 全空。
- 改法：中缝改为**等权重的两段**，中间插入一行真信息：

```
Column(fillMaxSize)
├─ HeroHeading（标签 + 课名）
├─ Spacer(weight 1)
├─ 中缝行：「下一节 16:00 线性代数 D402」（当天还有 upcoming 时才画）
├─ Spacer(weight 1)
└─ HeroDetail（时间 · 教室）+「今天还有 N 节」
```

- 数据现成：`state.todayItems` 里 hero 之后第一个 `UPCOMING` 项；没有就整行不画（行序列在 Java 侧决定，
  **不依赖尺寸**）。
- **为什么不用「距离下课还有 N 分钟」进度条**（更炫的方案）：它要按分钟刷新才准，而既有刷新梯是
  「边界时刻 + 30 分钟广播」，要么进度条跳变、要么加刷新频率（耗电）。列为非目标，另开任务。
- 若真机看下来「三段均匀」仍显空，备选是同一行改放「明天第一节」；两者都只动一行文案，切换成本很低。

## D5. 应用内「添加到桌面」：pin 流程与待消费预设

```
Web（首页顶栏入口）
  └─ WidgetSnapshotPlugin.requestPinWidget({ preset })
       原生：
       1. supported = AppWidgetManager.isRequestPinAppWidgetSupported()
       2. 写 pendingPreset（含 preset id + 写入时刻，一次性槽位）
       3. requestPinAppWidget(provider, extras, callback)
          extras 里带 OPTION_APPWIDGET_MIN_WIDTH/HEIGHT（尺寸提示，见 D5.1）
       4. 返回 { supported, requested }
```

- **配置页预填**：`android:configure` 已声明，launcher 放上去后通常会拉起 `WidgetConfigActivity`；它读
  `pendingPreset`（一次性消费 + 超时 5 分钟），预选对应样式/表现，并显示「推荐格子 4×3」提示。用户改了就按
  用户改的存（预设只是推荐）。
- **待消费槽位**沿用 `WidgetPendingRoute` 的既有范式（同文件位置、同清理时机），避免再造一套「待处理状态」。
- **清理**：配置页消费即清；`onDeleted` 也清；超时视为失效。任何情况下都不能让一次 preset 影响之后的实例。

### D5.1 尺寸提示实测结论（已实测，2026-09-20）

**结论：launcher 不理会尺寸提示。** 请求 `tablet_wide`（6×3）时，系统 pin 面板上标注的是 **「4 × 3」**
（provider 的 `targetCellWidth/Height`），落位后的实例也是 4×3。因此：

- 预设卡片只承诺我们能控制的：**样式与「大格子表现」一键设好**；尺寸写「以桌面实际放下为准，可以自己拖动调整」。
- 绝不写「将按 6×3 放置」——那是对用户撒谎。这条也写进了 spec，避免下一个人再"顺手优化"文案。

### D5.2 渲染侧兜底：launcher 不拉配置页时预设也要落地（实测追加）

原设计假设「`android:configure` 会让 launcher 放置后拉起配置页」，**实测 AOSP Launcher3 的 pin 流程不拉**
——实例直接按默认配置落位，`preset_applied` 一次都没有。因此加了渲染侧兜底：`provideGlance` 里
`applyPendingPreset(...)`，三条铁律（见 spec 的对应条目）：只写给**从未配置过**的实例、用**原子** `claim()`
领取槽位（避免两个实例同时套用）、槽位一次性 + 5 分钟超时。实测：`pin_requested preset=phone_minimal` →
`pin_result supported=true requested=true` → `preset_applied preset=phone_minimal` **恰好一次**，桌面实例
渲染成紧凑样式。

## D6. Web 侧：顶栏紧凑化 + 入口 + 预设面板

- **顶栏紧凑化**（`app/features/schedule/ScheduleHeader.tsx`）：`h-10` → `h-9`，图标 `size-5` → `size-4`，
  文案按钮收窄；**不改变任何行为**，只改尺寸。约束 C4：触控目标仍有 36px，但既有 spec 里的移动端口径是
  44px 列宽（针对网格），按钮侧取 `h-9`（36px）与 shadcn 的 `size="sm"` 对齐 —— 若真机测下来难按，回退到
  `h-10` 并把新入口做成图标按钮挤进同一行。
- **入口**：新增图标按钮（`Plus`/`LayoutGrid`）打开 `Sheet`（移动端）列出四个预设卡片；卡片 = 名称 + 目标
  格子 + 一句话 + 「添加到桌面」按钮。
- **仅 Android 生效**：沿用 `isNativeWidgetSnapshotAvailable()`（它已经做了 `Capacitor.getPlatform() === 'android'`
  的平台判断），非 Android 时**不渲染入口**。
- **不用错误码表达「不支持/取消」**：`requestPinWidget` 返回 `{supported, requested}` 两个布尔
  （原生侧同样按值返回），因为「launcher 不支持」和「用户在系统弹窗上取消」都不是异常。只有预设标识非法
  才 `reject INVALID_PAYLOAD`（复用既有错误码，不再新增）。
- 测试：项目没有 testing-library，因此测**纯逻辑**——`widgetPinPresets.test.ts` 守住「预设标识与原生白名单
  逐字一致」（跨层契约）+ 卡片字段完整 + 手动兜底文案；`native-widget-snapshot.test.ts` 断言 Web 兜底
  如实返回 `{supported:false}` 而不是假装成功。

## D7. 诊断日志（只含 phase 名与白名单枚举）

| phase | 字段 |
|---|---|
| `pin_requested` | `preset=<adaptive 白名单：phone_minimal/phone_standard/tablet_dual/tablet_wide>` |
| `pin_result` | `supported=<bool> requested=<bool>`（`supported=false` = 系统/launcher 不支持；`requested=false` = 支持但没发起，通常是用户在系统弹窗上取消） |
| `preset_applied` | `preset=<同上>`（配置页预填、或渲染侧兜底套用成功时各记一次） |
| `layout_fill` | `preset=<同上或 none> slack=<dp> gap=<dp> boost=<permille>`（铺满算法的观测点，A5 取证用） |

## D8. 兼容性与回滚

| 项 | 处理 |
|---|---|
| 存量实例（无 preset 键） | 按「未选预设」渲染：不放大字号、内容只今天 → 与上一轮行为一致（手机 4×3 的余量均摊除外） |
| 快照契约 | 不动（`schemaVersion = 1`） |
| 回滚代码 | `git revert` 即可；新增的 pendingPreset 键是新增项，旧代码不读它；为安全起见 `onDeleted` 与配置页消费都会清 |
| 回滚顶栏 | 顶栏紧凑化是独立提交，可单独 revert 而不影响小工具 |

## D9. 验证策略

- **P0 两个 spike（先做，结论决定后面怎么写）**：
  1. **行高系数标定**：手机 4×3 渲染已知行序列 → 截图量测行带高度（D2.1）。
  2. **pin 尺寸提示实测**：临时入口触发 `requestPinAppWidget`（带/不带尺寸提示各一次），量测实例尺寸（D5.1）。
- **T1 JVM 单测**：预设解析与回退、填充算法（内容高估算 / 上限 / 不裁切断言）、行序列不变。
- **T2 手机回归**：2×2 逐像素（A6）；4×3 前后对比截图（允许变化）。
- **T3 平板四预设**：4×3 与 6×3 各一张 + `phase=layout_fill` 与 `phase=layout_metrics`；量测内容占比达标（D2.4）。
- **T4 端到端**：应用内添加 → 配置页预填 → 保存 → 桌面实例符合预设；`phase=pin_*` / `preset_applied` 齐全。
- **已知限制**：pin 的最终尺寸由 launcher 决定；不同 OEM launcher 对 `requestPinAppWidget` 的支持度不同（`isRequestPinAppWidgetSupported()` 为假时走降级文案）。
