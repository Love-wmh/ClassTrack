# 设计：小工具维护面收缩到两档（3×2 接下来 / 1×2 紧凑）

## 0. 一句话

新增 3×2 与 1×2 两个 provider 作为**维护档**；在注册表里给每档打「是否维护」标记，
启动时把**非维护档的 receiver 组件禁用**（拾取器里自然只剩两档，代码与清单全留）；
同时删掉「按尺寸匹配样式」这条路径、把配置页的非核心选项收进默认折叠的二级区。

## 1. 涉及层与文件（现状 → 目标）

| 层 | 文件 | 改动 |
|---|---|---|
| 注册表（纯数据） | `WidgetProviderRegistry.java` | 7 档 Entry，新增 `maintained` 标记 + `maintainedEntries()` / `retiredEntries()` / `isMaintained()` |
| 组件启停 | **新增** `WidgetProviderScope.java`（纯判决）、`WidgetProviderScopeGate.java`（Android 执行） | `plan()` 决定「写什么/要不要写」，Gate 在 `MainActivity.onCreate` 收敛一次 |
| 桥接 | `WidgetProviders.java` | 新增 `componentFor(className)`；`renderers()`/`allAppWidgetIds()` 语义不变（仍覆盖 7 档，供归属校验与差集用） |
| 样式解析 | `WidgetStyleResolver.java` | 删掉尺寸最近邻匹配；`AUTO` 解析为「provider 预设的样式」；删掉宽高两个入参 |
| 预设表 | `WidgetPreset.java` | 新增 `ID_CELL_3X2` / `ID_CELL_1X2` 两档（各带标定样本）；删除 `match()` 与样本距离计算（samples 只留 pin 尺寸提示用途） |
| 样式默认值 | `WidgetStyleConfig.java` | `DEFAULT_LAYOUT_STYLE` 由 `AUTO` 改为 `NEXT_UP`；枚举与解析保持（`AUTO`/`TWO_COLUMN` 保留） |
| pin 判决 | `WidgetPinConfirmation.java` | 改为写入**预设的** `layoutStyle`（不再写 `AUTO`） |
| provider 资源 | 新增 `Cell3x2WidgetReceiver.kt` / `Cell1x2WidgetReceiver.kt`、`res/xml/widget_info_3x2.xml` / `widget_info_1x2.xml`、`strings.xml` 两条标签 | 与既有五档同构 |
| 配置页 | `activity_widget_config.xml`、`WidgetConfigActivity.kt` | 一级只留「接下来」；新增可折叠「更多设置」二级区；去掉「自动」「双栏」两项 |
| Web 面板 | `app/features/schedule/widgetPinPresets.ts`、`WidgetPinEntry.tsx`、`app/lib/native-widget-snapshot.ts` | 预设表只留两档；删 `needsWideCell` 与窄格提示；`WidgetPresetId` 收窄为两档 |
| 预览资产 | `scripts/generate-widget-preview-layouts.py`、`generate-widget-preview-images.py` | PROVIDERS 列表加 3×2 与 1×2 两档，重跑生成 4 个文件 |
| 门禁 | `scripts/check-android-assets.js`、`app/features/schedule/widgetPinPresets.test.ts`、`android/app/src/test/...` | 7 档 + 维护/收起两分；新增启动收敛调用点断言 |

## 2. 设计决策

### D1 注册表加「维护档」标记，作为唯一真相源

`Entry` 增加 `boolean maintained`；顺序改为**维护档在前**（3×2、1×2），随后是收起档
（`ClassTrackWidgetReceiver`(4×3)、2×2、2×3、4×2、6×3）。

- `entries()`：仍返回全部 7 档 —— 配置页归属校验（`isOurs`）、实例差集（`allAppWidgetIds`）都必须认全部，
  否则收起档的存量实例点「样式」会被我们自己拒掉。
- `retiredEntries()`：收起档 —— **只被启动收敛使用**。禁用清单由它推导，因此「清单完整」是构造性的，不靠人肉同步。
- 为什么用布尔标记而不是两份数组：一份表只有一个真相，测试与脚本可以同时断言两半。

### D2 组件启停：判决是纯函数，执行只做机械写入

`WidgetProviderScope`（纯 Java，不 import Android）：

```
NO_WRITE = -1
plan(boolean maintained, int currentState) -> int
  maintained  : currentState == DISABLED ? ENABLED : NO_WRITE
  retired     : currentState == DISABLED ? NO_WRITE : DISABLED
```

- **幂等**：已经收敛就返回 `NO_WRITE`，重复启动不反复写（0 次 Binder 写，只有 5 次读）。
- 维护档只「从禁用恢复」，**绝不主动 enable**：不覆盖系统/用户的显式状态，避免我们成为组件状态的第二个主人。
- `WidgetProviderScopeGate.apply(context)`：遍历 `retiredEntries()` → `WidgetProviders.componentFor()` 解析类 →
  `getComponentEnabledSetting` 读当前态 → `plan` → 不一致才 `setComponentEnabledSetting(component, state, DONT_KILL_APP)`。
- 调用点：`MainActivity.onCreate`（已有 `WidgetSnapshotPlugin` 注册的地方），**每次启动都收敛**，
  因此重装 / 清数据后仍然成立。放在这里而不是 widget 侧的原因：这是「应用级范围」而不是某个实例的事，
  且不需要任何 widget 存在即可生效。
- 日志：`WidgetDiagnostics.scopeConverged(retiredCount, writtenCount)`（只含数字，无用户数据）。

### D3 样式解析：删掉尺寸匹配，保留「未显式选择」这一档

`WidgetStyleResolver.effective(config, providerPreset)`（宽高入参删除）：

1. 用户显式选择（`NEXT_UP` / `DAY_LIST` / `COMPACT`）→ 原样返回；
2. `AUTO`（存量存储值或从未配置）→ 用 **provider 那档预设**的 `layoutStyle` + `wideLayout`；
3. provider 预设缺失 → 默认（接下来 + 跟随尺寸）。

- 为什么保留 2 而不是直接落到默认：1×2 的维护档默认样式是「紧凑」。pin 时已经会显式写入（D4），
  但**存量/异常路径**（槽位超时、写入失败）仍能靠它落回正确样式，成本只有一个查表。
- 删掉 `WidgetPreset.match()`、`distanceTo()` 与「并列裁决」逻辑；`samples` 只服务
  `getWidthDp()/getHeightDp()`（pin 尺寸提示）。少了这条路径就少一套「尺寸阈值/近邻」的隐性行为。

### D4 pin 判决写预设样式

`WidgetPinConfirmation.planFor()` 改为
`new WidgetStyleConfig(preset.getLayoutStyle(), defaults().getFinishedPolicy(), preset.getWideLayout())`。

- 语义依据：用户在面板上点的是「一张有具体摆法的卡」，这就是他的显式选择；
  上一轮写 `AUTO` 是因为尺寸匹配能兜住，匹配删掉后必须显式写，否则 1×2 会渲染成「接下来」。
- 「已上完的课」仍沿用默认值（预设从没表达过这一项）。

### D5 Web 侧只留两档，并删掉宽格分支

- `WIDGET_PIN_PRESETS` 只留 `cell_3x2`（`接下来 3×2`）与 `cell_1x2`（`紧凑 1×2`）。
- 删 `needsWideCell` 字段、`WIDGET_PIN_NARROW_CELL_HINT` 常量与 `WidgetPinEntry.tsx` 里的两个分支：
  两档都不是宽格，留着就是死字段 + 死 UI（"需宽格"徽标永远不会出现）。
- `WidgetPresetId` 收窄为 `'cell_3x2' | 'cell_1x2'`：Web 侧**不可能**再发出收起档的 id（类型层面挡住）。
  原生 `WidgetPreset.parse()` 仍接受 7 个 id（存量槽位/日志兼容），不做收窄。

### D6 配置页二级菜单

- 结构：一级区 = 「接下来」单选 + 它的实时预览（沿用 `widget_config_preview_next_up`）。
  新增一行可点的「更多设置」标题（自带展开/收起箭头文案）+ 一个包住二级内容的容器
  （`widget_config_advanced_group`，默认 `visibility="gone"`），二级内容 = 其馀两种样式的单选与预览、
  「已上完的课」区、「大格子表现」区。
- 从布局里**删除**「自动（按尺寸）」与「双栏」两个 `RadioButton` 及其说明串；`strings.xml` 里对应串按是否仍被引用决定去留
  （未被引用就删，避免留下会撒谎的文案）。
- 进页面时若实例的配置落在二级区（样式不是「接下来」，或已上完 / 大格子表现不是默认值）→ **自动展开**二级区，
  否则用户会以为设置丢了。判据写成纯函数放进 `WidgetStyleConfig`（如 `needsAdvancedSection()`），由单测钉住。
- 保存路径不变（仍写三个存储键），因此 `auto` / `two_column` 这类存量值不会被我们改写。

### D7 两个新档的 metadata 与标定值

| 档 | targetCell | 标定样本（dp） | minWidth | minHeight | label | previewLayout / Image | 生成脚本 shape |
|---|---|---|---|---|---|---|---|
| 3×2 | 3 × 2 | 276 × 210（09-20 真机实测） | 110dp | 110dp | `课表` | `widget_preview_3x2` | `single_tight` |
| 1×2 | 1 × 2 | 97 × 210（估算值；真机 5 列网格实测 82 × 210，见 D11） | **60dp** | 110dp | `课表` | `widget_preview_1x2` | `compact` |

- 1×2 的 `minWidth` 从最初的 90dp 改成 **60dp**（低于一列宽）：实测 launcher 把拾取器里的跨度算成
  `max(targetCell, minWidth/minHeight 推出的跨度)` —— 90dp 时它把这一档标成「2 × 2」（看起来像两列），
  60dp 之后才如实显示「1 × 2」。三条实测证据：①90dp → 标签「2 × 2」；②60dp → 标签「1 × 2」。
- 真机放置后的实际尺寸：`phase=widget_sized widget=15 w=82 h=210`（1080×2400 @420dpi、5 列网格 → 一列 82dp）。
- 两档都保持 `resizeMode="horizontal|vertical"`（自由拖动）、`widgetFeatures="reconfigurable"`、`configure` 指向配置页。
- 两个新 receiver 都是 19 行的同构壳（与既有 `Cell2x2WidgetReceiver` 等完全同形），渲染仍共用 `ClassTrackWidget`。

### D8 门禁：跨层断言 + 启动收敛调用点断言

- `check-android-assets.js`：`WIDGET_PROVIDER_CELLS` 扩到 7 档；`MAINTAINED_WIDGET_CELLS = ['3x2','1x2']`；
  `receiverCount` 期望 7；沿用「每档 metadata 的 targetCell 与预览指向正确」的断言。
- **新增断言**：从 `WidgetProviderRegistry.java` 解析出 `(receiver, preset, maintained)` 三元组
  （Entry 字面量结构与已有 `widgetPinPresets.test.ts` 的解析方式一致），并要求
  ①维护档恰好是那两档 ②每条非维护条目都能在清单里找到对应 receiver（禁用清单不可能漏档）。
- **新增断言**：`MainActivity` 里存在 `WidgetProviderScopeGate.apply(...)` 调用 —— 「判决正确」与「判决真的会被执行」
  是两件事，后者只能靠源码级断言兜住（没有它，注册表再正确拾取器也还是五档）。
- 原生单测：`WidgetProviderRegistryTest` 改成 7 档 + 两分；`WidgetPresetTest` 删 match 段、加两档；
  `WidgetStyleResolverTest` 改新语义；`WidgetPinConfirmationTest` 断言写入的是预设样式；新增 `WidgetProviderScopeTest`（幂等 + 两向）。
- `widgetPinPresets.test.ts`：保留「全部 7 档」的注册表/metadata/清单一致性断言（`WIDGET_CELLS` 扩到 7 档），
  再把「预设表 ↔ 标签 ↔ 卡片名」的断言收敛到两档维护档。

### D9「紧凑」的内容与行形态（2026-09-21 用户追加 R9）

- **行序列**：`hero`（明细两行）→ `counter` → **hero 之后的行**。判定 `firstRowAfterHero(rows)`：
  第一个「未上完」的下标 + 1；全已上完（今天已无课、hero 落到别的日子）时返回 `rows.size()`，一行都不补。
  于是「已上完的课」在紧凑样式里天然不可达，配置页那句灰显说明的**原因**随之改写（结论不变）。
- **行形态**：`WidgetBodyPlan` 新增 `RowForm` 枚举（`STANDARD` / `TWO_LINE` / `COMPACT`）。
  紧凑用 `COMPACT`：课名一行、「时间 · 教室」一行，**不设时间列**。理由：82~105dp 的格宽里，
  时间一旦独占一列（+ 左侧标记列），课名只剩三十几 dp，「线性代数」被裁成「线性代…」；
  教室挤在同一行右侧则与课名重叠。双栏继续用 `TWO_LINE`（渲染侧显式指定，判决层保持 `STANDARD`）。
  高度估算同步：`RowForm != STANDARD` 的课程行按 2 行估（不然填充率虚高、字号被撑大）。
- **hero 明细拆行**：`WidgetBodyLine.hero(titleMaxLines, stackedDetail)`，紧凑传 `true` → 渲染成
  「14:00 - 15:35」+「C305」两行（`HeroDetail(stacked=)`）。同一件事在高度估算里也按两行算。
  不改「宽格样式」的一行形态：那里一行放得下，且改动会影响既有逐像素基线。

### D10 预览 mock 的诚实性（2026-09-21 用户追加 R8/R9）

- **文案必须与运行期一致**：`widget_preview_hero_label` 从「正在进行 · 第 3-4 节」改成「正在进行」
  （运行期 in-progress 的 hero 标签就是 `widget_hero_in_progress`，从没有「· 第 N 节」这种写法）。
- **mock 的文本一律单行**：生成脚本给每个 `TextView` 补 `maxLines=1` + `ellipsize=end`（只补缺失的，
  已有属性的行原样保留 —— 无脑插入会写出重复属性，aapt 以 `AttributeNSNotUnique` 拒绝编译）。
- **紧凑 mock 与运行期同形**：明细两行（时间 / 教室）+ 计数行 + 主课之后的两行课程（窄卡形态，含教室）。
  示例课程新增 16:00 线性代数 D401 / 18:00 体育 操场，与计数行「今天还有 2 节」对得上。
- `scripts/generate-widget-preview-layouts.py --check` 可校验布局 mock 与生成结果一致（门禁外的自查手段）。

### D11 机型/网格的数学（把「1×2 会不会裁字」讲清楚）

`一列宽(dp) = 屏宽 px ÷ (density ÷ 160) ÷ 列数`

| 机型/环境 | 屏宽 px / density | 总宽 dp | 桌面列数 | 一列宽 |
|---|---|---|---|---|
| AOSP 模拟器（Pixel 系默认） | 1080 / 420 | 411 | **5** | **82dp** |
| 一加 Ace 5 Pro（ColorOS 15，默认布局） | 1264 / ~450 | ~450 | **4**（ColorOS 默认 4×6） | ~105–112dp |
| 常见 4 列机型（360dp 总宽） | — | 360 | 4 | ~90dp |

- 所以「1×2 在模拟器上被裁成两三个字」是**5 列网格**这个边缘配置造成的，不是手机的问题；
  但 Google/Pixel 系默认就是 5 列，因此紧凑样式仍按 82dp 下限设计（D9 的窄卡行形态 + 明细拆行）。
- 分辨率（1080×2400 → 1080×2376）**不影响**列宽：只有 density 与列数影响（实测两次结果一致）。

## 3. 数据流

1. **启动收敛（R2）**：`MainActivity.onCreate` → `WidgetProviderScopeGate.apply` → 读 7 档组件状态 →
   `WidgetProviderScope.plan` → 仅对「收起档且未禁用」写 `DISABLED` → 日志。
2. **pin（R4）**：面板卡（`cell_3x2` / `cell_1x2`）→ `WidgetSnapshotPlugin.requestPin` →
   `WidgetProviders.rendererFor(preset)` → `WidgetPendingPreset.set` → 系统确认 →
   `WidgetPinResultReceiver` → `WidgetPinTargets.resolve`（差集兜底）→ `WidgetPinConfirmation.planFor`（写预设样式）
   → `WidgetStyleState` 落存储 → 刷新。
3. **渲染**：`ClassTrackWidget.provideGlance` → 读存储配置 → `WidgetStyleResolver.effective(config, providerPreset)`
   → 渲染；尺寸只影响度量与自适应填充（不再决定样式）。

## 4. 兼容性与回滚

- **存储兼容**：`auto` / `two_column` 仍可解析；默认值变更只影响「从未显式选择」的实例（存量 `auto` 实例按 D3 落到 provider 预设）。
- **存量实例**：收起档的桌面上实例在禁用后不再刷新，且应用更新时可能被系统清除（产品已接受，见 prd D3）。
  `ClassTrackWidgetReceiver` 类名、metadata、预览全部保留，禁用是**可逆**的（组件状态是运行时可变的）。
- **回滚**：撤掉 `MainActivity` 里的 Gate 调用即可停止收敛；但**已写过的 `DISABLED` 不会自动恢复**，
  所以回滚清单必须包含「一次性把收起档写回 `COMPONENT_ENABLED_STATE_DEFAULT`」这一步，否则拾取器里永远看不到它们。
- 回滚粒度：① 禁用（D2/D1）② 新增两档（D7）③ UI 收起（D5/D6）三块互不依赖，可分别回滚；
  D3（删尺寸匹配）与 D4（写预设样式）必须同进同退（单独回滚 D3 会让 1×2 变「接下来」）。

## 5. 风险与验证点

| 风险 | 验证手段 |
|---|---|
| 1×2 太窄：hero 课程名溢出 / 裁切 / 行项挤成一团 | 真机截图 + `WidgetLayoutMetricsTest` 的小格下限不得回归 + 生成预览目视 |
| 窄格里「教室」被裁掉（用户明确要求不许省） | 明细拆行 + 窄卡行形态（D9）；真机 82dp 实例截图（教室「教二105」单独成行） |
| 拾取器预览框比真实尺寸矮：`previewLayout` 被裁掉下半段 | 已知 launcher 行为（实测 1×2 预览框约 73×84dp，而真实放置是 82×210dp）；桌面实例与生成资产才是全貌，记入 verification |
| 1×2 的 dp 是估算值，pin 尺寸提示与实际不符 | 真机日志 `phase=widget_sized w=.. h=..` 量测后回填样本与预览资产（A6） |
| 禁用组件后 `GlanceAppWidgetManager.getGlanceIds` / `updateAll` 行为异常或影响两个维护档刷新 | 真机：放好两档后等一次自动刷新（边界闹钟/Worker），确认仍更新且无异常日志 |
| 二级区折叠让用户以为设置丢了 | `needsAdvancedSection()` 单测 + 真机把实例设成「全天课表」再进页面，二级区应自动展开并选中 |
| 拾取器里多出一条（禁用清单漏档） | D8 的跨层断言（注册表 ↔ 清单 ↔ metadata ↔ 标签） |

## 6. 不做的事

- 不删旧五档的类 / metadata / 预览 / 清单条目；不做存量实例迁移与提示。
- 不动快照同步链路、profile 页精度设置、pin 的三态状态机与快探针。
- 不引入「按尺寸自动切样式」的任何替代机制（R3 明确删掉）。
