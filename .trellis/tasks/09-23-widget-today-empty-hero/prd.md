# 小组件 hero 空课态 + 加桌后二次引导 + 更新通知默认关闭

> 本文是**轻量规划**的唯一产物（用户 2026-09-23 口径：只写 `prd.md`，不写 `design.md` / `implement.md`）。
> 「技术前提与决策」一节因此也放在这里，实现前必须先把这一节点读完。
>
> 本任务包含三支改动（用户 2026-09-23 明确要求并进同一个任务，按此顺序做）：
> **A 小组件 hero 空课态**（含 A2 快照补「今日日期」字段）→ **B「发现新版本时发通知」默认关闭** →
> **C 加桌完成后的二次引导（去个人中心）**。三支互不依赖，各自有独立可验证的验收项。

## Goal

**A. 小组件 hero 不再把明天的课当作今天的课**

今天没有可上的课（本来就没课，或今天的课已经上完）时，hero 不再显示明天的课
（现状：「接下来 · 10月8日 周四」+ 明天的课名 / 时间 / 教室），改为三行「今天的空课态」：
**日期行（今天的日期）→ 醒目行（今天无课 / 今天已无课）→ 次要行（一句轻松的话）**。
明天的课仍由汇总行（`明天 周四 · 共 N 节`）与课表呈现，信息一条都不丢。

**A2. 快照补「今日日期」字段**

上面那一行「10月8日 周三」是**今天**的日期（用户口径），而原生侧不做任何日期运算
（既有契约：`dayEndEpochMs` 是原生判断「今天是第几天」的唯一依据），所以由 Web 侧快照多带一个
预格式化的今日日期字段。

**B. 更新通知默认关闭**

「发现新版本时发通知」的默认值由**开**改为**关**：首次安装 / 从未写过该设置的设备不再发系统通知，
新版本仍在应用内提示；用户可自行打开。「自动检查更新」的默认值保持**开**。

**C. 加桌引导之后再引导一次：去个人中心**

第一段加桌引导（`WidgetGuideDialog`）关闭后，再弹一段一次性引导，提示可以前往**个人中心**
做更多设置，按钮是 **「前往」** 与 **「暂时不用」**。点「去添加」时加桌面板会随即打开，第二段引导
**等面板关闭后再出现**，不叠在面板上。

## 背景与现状事实

| 事实 | 出处 | 后果 |
|---|---|---|
| hero 是「第一条 `endEpochMs > now` 的课」，可以落在明天；`HeroState.UPCOMING_OTHER_DAY` 标记这种情况 | `WidgetStateResolver.resolve`（84–110 行） | `heroLabel` 把明天的课写成「接下来 · 10月8日 周四」，课名 / 时间 / 教室整块画在 hero 位 |
| 今天没课、明天有课 → 列明天，汇总行写「明天 周四 · 共 N 节」 | `WidgetDayPlan.resolve`（R11，2026-09-20 用户口径） | 明天的课本就在卡上，hero 再画一次是**同一节课说两遍** |
| hero 行只存在于 `next_up`（接下来，默认样式）与 `compact`（紧凑）两种样式；`day_list` 没有 hero 行 | `WidgetLinePolicy.resolve` | `day_list` 不受 A 影响（下一节由 `NEXT_OTHER` 行表达） |
| 行序列由纯 Java `WidgetLinePolicy.resolve(config, plan, dualColumn)` 判决、`WidgetLinePolicyTest` 钉住；渲染层只画结果 | 同上 | 新形态必须走判决层，不能在渲染层临时判断 |
| 高度估算按行种类折算文本行数（`bodyTextLines` / `headerTextLines`），漏算一行会把字号撑大、文字互挤 | `ClassTrackWidget.kt` 405–470 行 | 新行种类必须同时补两处估算 |
| 字号**不随小格子缩小**（`MIN_SCALE = 1.0`），caption 11sp、body 13sp、title 16sp 是下限 | `WidgetLayoutMetrics` | 文案长度要按最窄的 1×2 档算：内容宽约 54–69dp（5 列网格实测 82dp 列宽）≈ **5 个汉字** |
| hero 顶部标签行与「样式」入口同排；汇总行 / 计数行也各挂一个「样式」入口 | `HeroHeading` / `SummaryRow` / `CounterRow` | compact 的标签行再挂入口会在 1×2 里和日期抢宽度（计数行已有入口） |
| 配置页两种样式的说明写着「突出正在进行或接下来的一节课」 | `widget_config_layout_next_up_desc` / `widget_config_layout_compact_desc` / `app/features/schedule/widgetPinPresets.ts` | 行为改了，这三处会变成不实描述 |
| 快照契约里没有「今天」的日期 / 星期：只有每条课程带 `dayKey` + `weekdayLabel`，以及 `dayEndEpochMs` | `app/lib/widget-snapshot.ts` / `WidgetSnapshot.java` | 今天没课时 `todayItems` 为空，原生**拿不到**今天的日期 → 需要 A2 的字段 |
| 解析器对诊断类字段用 `optString(key, "")`，缺失不影响整份快照 | `WidgetSnapshotParser` | A2 可按**可选字段**加，不必推翻 `schemaVersion = 1` |
| 跨层夹具 `android/app/src/test/resources/widget-snapshot-v1.json` 由 Web 侧 `buildWidgetSnapshot` 真实产出 | `WidgetSnapshotCrossLayerTest` 头注释 | A2 改了产出就必须重新生成夹具 |
| 「发现新版本时发通知」默认值 | `app/store/updateStore.ts`: `SETTINGS_DEFAULTS.notify = true` | 首装即发通知 |
| 该设置落在 localStorage（key `class-track-update`），读取走 `merge()` 的逐字段白名单 | 同上 | 改默认值只影响「存储里没有该字段」的设备，已存过 `true` 的不受影响（期望行为） |
| 第一段引导：三条导入成功路径触发（`useImportFlow` 里 3 处 `maybeShowWidgetGuide()`），挂载在 `root.tsx`，已读标记 `class-track-widget-guide-seen`（设备本地、不进备份） | `app/lib/widget-guide.ts` + `WidgetGuideDialog.tsx` + `widget-guide.test.ts` | 第二段照同一套约定做，才不会被守卫测试或备份迁移搞乱 |
| 加桌面板是**受控** Sheet（`widgetPinSheetOpen`），成功信号是 `useWidgetPin` 的 `outcome = 'added'`（系统回调）/ `'added_observed'`（无回调复核） | `WidgetPinEntry.tsx` / `useWidgetPin.ts` | 「去添加」路径可以靠 `widgetPinSheetOpen` 归位来判断面板已关（用户口径不需要等加桌成功） |
| 个人中心是 layout 内的 `profile` 路由（`app/features/profile/ProfilePage.tsx`） | `app/routes.ts` | 「前往」= `navigate('/profile')` |

## 口径确认记录（2026-09-23，用户）

| 问题 | 确认结果 |
|---|---|
| 任务流程 | 轻量规划：只写 `prd.md`；三支改动**并进同一个任务** |
| 执行顺序 | **A（hero 空课态）→ B（通知默认值）→ C（二次引导）** |
| 「今天没课」时 hero 画成什么样 | 三行：顶部**今天的日期**、醒目行 `今天无课`、次要行一句轻松的话（不是只写四个字，也不要显示明天的课名/时间/教室） |
| 「今天的课全上完了」算不算没课 | **算**：醒目行 `今天已无课`，与 `今天无课` 区分 |
| hero 顶部那一行 | **保留**（不删行），但**去掉「接下来」**，改为写**今天的日期**，格式与现有一致（`10月8日 周三`） |
| 次要行文案长度 | **分档两套**：按**样式**分（紧凑 1×2 → 短句；接下来 3×2 → 长句），不是按尺寸阈值 |
| 具体句子 | 3×2：`享受你的美好时光吧`（今天无课）/ `今天的课上完啦，好好休息`（已上完）<br>1×2：`放松一下吧` / `课上完啦` |
| 空课文案用词 | **都写「今天」**（沿用现有 `今天无课` / `今天已无课`），不引入「今日」 |
| 改哪个默认值 | 只改「发现新版本时发通知」→ 关；「自动检查更新」保持开 |
| 第二段引导何时弹 | **第一段引导关闭时就弹**；「去添加」那条路径由于面板随即打开，**延后到面板关闭后**再弹 |
| 第二段引导弹几次 | **一次性**（独立设备本地标记） |
| 分支 | 沿用本任务的分支 `fix/widget-today-empty-hero`（从 `feat/nav-scroll-hint` 开出） |

## 技术前提与决策

| 编号 | 决策 | 理由 / 影响 |
|---|---|---|
| D1 | 触发条件**不新增任何时间比较**：hero 不在今天 ⟺ `state.heroState == HeroState.UPCOMING_OTHER_DAY`（由 `hero.dayOffset != currentDayOffset` 决定） | 渲染层只读状态，判据仍只在 `WidgetStateResolver` 里算 |
| D2 | 行判决新增入参 `heroIsToday`（渲染层传 `state.heroState != UPCOMING_OTHER_DAY`）与新的 `WidgetBodyLine.Kind.HERO_EMPTY`：`heroIsToday == false` 时用它替换 `HERO` | 「画哪些行」的判决归判决层；`when` 穷尽性保证渲染与两处估算漏改就编译不过 |
| D3 | `HERO_EMPTY` 行自带两个 flag：`todayHadClasses`（醒目行用 `今天无课` 还是 `今天已无课`）与 `shortCopy`（次要行用短句还是长句）。短句档由**样式**决定（`COMPACT` → 短句） | 文案分档按样式而不是按尺寸，避免引入「按尺寸选内容」这类被契约禁止的阈值 |
| D4 | 顶部行写**今天的日期**：`WidgetDateLabel.withWeekday(今天的 dayKey, 今天的 weekdayLabel)` → `10月8日 周三`。数据来自 D5 的新快照字段；字段缺失（旧快照）时该行不显示日期，**不回落**到「接下来」、不崩 | 原生不做日期运算（既有硬约束），所以必须由 Web 侧带上 |
| D5 | 快照**可选**新增 `todayDayKey` / `todayWeekdayLabel`（Web 侧预格式化：`formatLocalDayKey(today)` + `WEEKDAY_LABELS`，无新增运算）；解析器用 `optString(key, "")` 读，`schemaVersion` **保持 1** | 同一 APK 内 Web 与原生一起发布，唯一的时间差场景是「旧版本写入的快照被新原生读到」；可选字段让这种情形只是少一行日期，而不是整张卡变「请同步」 |
| D6 | `next_up` / `compact` 在「今天的课已上完、今天仍有可见行（`plan.source == TODAY`）」时**补一行 `NEXT_OTHER`**（`day_list` 现状不变） | hero 不再承担「下一节在哪天」；不补这一行，`next_up` 在这个状态下整张卡都看不到下一节课 |
| D7 | 双栏（`two_column`）左卡在 `HERO_EMPTY` 时：只画空课态三行，**不画**课名、不画「时间 · 教室」、不画底部「今天还有 N 节」；三行在左卡里垂直居中（上下一份等权 `Spacer`） | 左卡是「一节课的信息」，今天没课时它没有课可讲；中缝本来就为空（`upcomingAfterHero` 在 hero 不属于今天时恒为空） |
| D8 | `compact` 的 `HERO_EMPTY` 顶部行**不挂**「样式」入口（只写日期） | 1×2 内容宽约 54–69dp，日期 + 入口必然挤掉日期；计数行本来就有入口（`CounterRow` 一直挂） |
| D9 | 高度估算（`bodyTextLines` / `headerTextLines`）为 `HERO_EMPTY` 加分支：**3 行**（日期行 caption + 醒目行 title + 次要行 body），长度取各自真实文案 | 与渲染一一对应；漏算会让填充率虚高、字号被撑大（上一轮真机裁字就是这么来的） |
| D9b | 紧凑样式的课程行在空课态下改成从「第一条还没上的课」起列（而不是 `firstRowAfterHero` 的「第一条还没上的课 + 1」） | 空课态下没有主课可跳过；沿用旧口径会把明天第一节静默吞掉（那一节本来是 hero）。已上完的行仍然不列 —— 紧凑样式从不显示已上完的课 |
| D10 | 删除 `widget_hero_upcoming_other_day`（「接下来 · %1$s」）：改完之后运行期不可能再产生这行文案 | 留着会变成下一个「mock 说得出、运行期说不出」的坑 |
| D11 | 空课文案**沿用现有字符串**：`widget_day_empty`（今天无课）、`widget_day_no_class`（今天已无课），hero / 汇总行 / 计数行三处共用同一对；**不引入「今日」**（用户 2026-09-23 明确：都写「今天」）。汇总行 `今天 周四 · 共 N 节` 与 `明天 周四 · 共 N 节` 对称，也不动 | 不为一个同义词新增字符串，也不让同一张卡里出现两种写法 |
| D12 | 配置页与 app 内面板的样式说明同步改：不再写「突出接下来的一节课」，改成说明「今天没课时显示今天的日期与空课提示，课表接明天的课」 | 说明与真实行为必须一致（`widgetPinPresets.test.ts` 只校验描述长度 > 8，改文案不破测） |
| D13 | B 只改 `SETTINGS_DEFAULTS.notify: true → false` | 持久化读取（`merge` 逐字段校验）、权限申请、「权限被拒回退为关」的逻辑都不动；已存过 `notify: true` 的设备保持不变 |
| D14 | C 的第二段引导做成独立组件 `ProfileGuideDialog`，与第一段并列挂在 `root.tsx`；纯逻辑（已读标记 / 该不该弹 / 文案）放 `app/lib/profile-guide.ts`，用 vitest 钉住 | 与第一段引导同构，守卫测试也能照抄同一套「读真实源码」的做法 |
| D15 | C 的显示条件 = `showProfileGuide && !widgetPinSheetOpen`（`uiSlice` 里新增 `showProfileGuide`，不持久化）。第一段引导关闭那一刻：`markProfileGuideSeen()` + `setShowProfileGuide(true)` | 「点『去添加』时面板随即打开、第二段延后到面板关闭后」不需要额外的 pending 标志 —— 用面板的开合状态直接表达，面板一关第二段自然出现 |
| D16 | C 的已读标记是独立的设备本地键 `class-track-profile-guide-seen`（不进 Zustand `partialize`、不进备份 JSON），**在决定要弹的那一刻写**（与第一段的约定一致） | 中途被杀 / 崩溃不会导致下次再打扰一次；换设备后该弹还能弹 |
| D17 | C 的「前往」= 关闭第二段 + `navigate('/profile')`；「暂时不用」= 只关闭，不做任何跳转 | 与第一段的主/次按钮语义同构 |
| D18 | A 的 hero 形态（Kotlin/Glance 渲染）**不做**截图单测：验收靠 `WidgetLinePolicyTest` 新增用例 + 模拟器/真机截图 | 与既有做法一致（渲染层无 JVM 测试，见 spec 的 Validation 一节） |

### A 的卡片形态（三行空课态）

`next_up`（3×2，内容宽约 248dp ≈ 22 个汉字）：

```
10月8日 周三                        样式
今天无课
享受你的美好时光吧
────────────────────────────────
明天 周四 · 共 4 节
08:00  高等数学              A101
10:00  线性代数              B203
```

`compact`（1×2，内容宽约 54–69dp ≈ 5 个汉字）：

```
10月8日 周三
今天无课
放松一下吧
──────────
明天 4 节
```

已上完那一支（醒目行 + 次要行）：`今天已无课` + `今天的课上完啦，好好休息`（3×2）/ `课上完啦`（1×2）。

- 顶部行写的是**今天**的日期（`10月8日 周三`），不再是下一节课的日期，也不再有「接下来」。
- 后缀一律不加：明天的课由汇总行（`明天 周四 · 共 4 节`）或计数行（`明天 4 节`）说，`NEXT_OTHER`
  行负责「下一节在哪天」（长假 / 今天已上完时出现）。
- 1×2 档的日期行会被截（`10月8日 …`）：那一档的标签行本来就要与「样式」入口挤一行，去掉入口后
  已是最省宽度的写法；这是该档既有的截断类别（现状的「接下来 · 第 3-4 节」同样被截），
  **不允许**为了它加「按尺寸换文案/隐内容」的分支（契约禁止尺寸阈值）。

## 功能需求

### F1 hero 空课态（`heroIsToday == false`）

- 三行：今天的日期（caption、accent 色，右侧「样式」入口，仅非 `compact`）→ 醒目行（title 字号、加粗）
  → 次要行（body 字号、弱化色）。
- 不再画课名、时间、教室，也不再画下一节课的日期。
- 文案见上面两张卡片；短句/长句按样式分档。
- 旧快照（没有日期行所需字段）时：第一行只留「样式」入口，其余两行照常。

### F2 行序列

| 样式 | 今天的课已上完（`source == TODAY`，行可见） | 今天没课、明天有课（`source == TOMORROW`） | 今天与明天都没课（`source == NONE`） |
|---|---|---|---|
| `next_up` | `HERO_EMPTY` + `SUMMARY` + `COURSE…` + `NEXT_OTHER`（D6 新增） | `HERO_EMPTY` + `SUMMARY` + `COURSE…` | `HERO_EMPTY` + `SUMMARY` + `NEXT_OTHER` |
| `compact` | `HERO_EMPTY` + `COUNTER` + 后续课（D9b）+ `NEXT_OTHER`（D6 新增） | `HERO_EMPTY` + `COUNTER` + 后续课（D9b，即明天全部） | `HERO_EMPTY` + `COUNTER` + `NEXT_OTHER` |
| `day_list` | 与改动前完全一致（`SUMMARY` + `COURSE…` + `NEXT_OTHER`） | 与改动前一致 | 与改动前一致 |

- `heroIsToday == true`（正在上 / 今天接下来还有课）时，三种样式的行序列与改动前**逐项一致**。

### F3 明天课表与既有文案

- 「今天没课、明天有课 → 列明天并写明『明天』」这条 R11 决定保持不变（用户 2026-09-20 口径）。
- 汇总行 / 计数行 / `NEXT_OTHER` 的判据与文案都不变（空课文案本来就写「今天无课 / 今天已无课」）。

### F4 更新通知默认关闭

- 首次安装（localStorage 里没有 `class-track-update`）：`notify === false`，应用内模态框照旧提示，
  不发系统通知、不申请通知权限。
- 用户手动打开开关后行为与现状完全一致（申请权限；被拒则开关回退为关并给引导）。
- 存储里已有 `notify` 值（含 `true`）的设备**不受影响**。

### F5 第二段引导（去个人中心）

- 触发：第一段加桌引导**关闭**时（无论点的是「去添加」还是「知道了」）；只有安卓原生、且这台设备还没读过时。
- 显示时机：`showProfileGuide && !widgetPinSheetOpen` —— 点「去添加」时面板先打开，第二段等面板
  关闭后再出现；点「知道了」时立刻出现。
- 内容：标题、一句说明（指向个人中心里真实存在的设置）、主按钮「前往」、次按钮「暂时不用」。
- 「前往」→ 关闭 + 跳到个人中心；「暂时不用」→ 只关闭。
- 一次性：已读标记在第一段关闭那一刻写入（D16），之后这台设备不再弹。
- 浏览器 / PWA / iOS：两段引导都不出现（沿用 `isNativeWidgetSnapshotAvailable()`）。

### F6 一致性文案

- `widget_config_layout_next_up_desc` / `widget_config_layout_compact_desc`（原生）与
  `WIDGET_PIN_PRESETS` 的两条 `description`（Web 面板）同步改为与真实行为一致的说明。

## 边界与不做的事

- **不改 hero 的选取算法**：`WidgetStateResolver.firstNotEnded` 仍是「第一条没结束的课」；刷新阶梯（L1–L5）、
  边界闹钟、双栏几何判据、填充估算公式、provider 与拾取器都不动。
- 不改「今天没课、明天有课列明天」这条产品决定；不给 `day_list` 加 hero 行。
- 不把「今天没课」做成新的 `WidgetDisplayState.Type`；状态机（MISSING/UNAVAILABLE/EMPTY/STALE/NO_UPCOMING/READY）不变。
- 不做「按尺寸选文案 / 隐内容」的分支（尺寸阈值被契约禁止）；1×2 的日期行截断按已知限制接受。
- 不为 Kotlin 渲染层引入单测 / 截图测试基础设施。
- B 不动「自动检查更新」「更新通道」「检查间隔」「跳过此版本」的默认值与语义，也不动更新源与通道播种规则。
- C 不改第一段引导的触发点、文案与按钮语义（三条导入路径仍然各触发一次），也不新增第二段引导的
  「已读」以外的持久化状态；不做「按加桌是否成功」的分支（用户口径：第一段一关就弹）。

## 验收清单

**JVM 单测**（`./android/gradlew -p android :app:testDebugUnitTest`）

- [ ] `heroIsToday == false` 时 `next_up` / `compact` 首行是 `HERO_EMPTY` 而非 `HERO`；`day_list` 行序不变。
- [ ] `HERO_EMPTY` 的两个 flag：`todayHadClasses` 跟着 `plan.isTodayHadClasses`；`shortCopy` 只在 `compact` 为真。
- [ ] `heroIsToday == false` 且今天全部上完（`source == TODAY`、有可见行）时补 `NEXT_OTHER`；`source == TOMORROW` 时不补。
- [ ] `heroIsToday == true` 时既有断言逐项不变（三种样式 × 三种「已上完」策略）。
- [ ] 解析器：缺 `todayDayKey` / `todayWeekdayLabel` 的旧快照照常解析（字段为空串），带字段时进入 `WidgetDisplayState`。
- [ ] 跨层夹具重新生成后 `WidgetSnapshotCrossLayerTest` 全绿（含敏感哨兵不出现、42 天后仍选对那节课）。

**Web 单测**（`pnpm test`）

- [ ] `buildWidgetSnapshot` 产出今天的日期字段（本地时区、内容为 `YYYY-MM-DD` + `周X`），`empty` / `unavailable` 状态也带上。
- [ ] `updateStore` 默认值：`notify === false`、`autoCheck === true`；字段缺失或值非法时仍逐字段回落到默认。
- [ ] 第二段引导纯逻辑：没标记 → 该弹；标记后 → 不弹；只写自己的键；存储抛异常时不抛。
- [ ] 第二段引导接线守卫（读真实源码）：挂在 `root.tsx`、由第一段关闭处触发、显示条件含 `!widgetPinSheetOpen`。
- [ ] `widgetPinPresets.test.ts`（描述长度约束）与 app-update 既有用例全部通过。

**模拟器 / 真机**（Android：小工具真实渲染 + 配置页预览 + 引导链路）

- [ ] 「今天没课、明天有课」：3×2「接下来」= `今天的日期 / 今天无课 / 享受你的美好时光吧`，下方 `明天 周四 · 共 N 节` + 明天课表；1×2「紧凑」= `今天的日期 / 今天无课 / 放松一下吧` + 计数行 `明天 N 节`。
- [ ] 「今天的课已上完（显示已上完）」：`今天已无课 / 今天的课上完啦，好好休息`，并出现 `下一节 · …` 行。
- [ ] 长假（今天、明天都没课）：`今天无课 / 放松一下吧`（按档）+ `下一节 · 10月8日 周四 08:00 高等数学`。
- [ ] 「正在上 / 接下来」的普通状态与改动前逐像素一致（三种样式各一张）。
- [ ] 双栏（大格子表现 = 双栏）左卡只有空课态三行，不残留明天的课名 / 时间 / 教室。
- [ ] 配置页缩略图与桌面渲染一致（同一份行序列）。
- [ ] 导入成功 → 第一段引导点「知道了」→ 第二段立刻出现；点「前往」→ 到个人中心。
- [ ] 导入成功 → 点「去添加」→ 面板打开时**不**出现第二段 → 关掉面板 → 第二段出现。
- [ ] 第二段出现一次后（标记已写）重进应用不再出现；两个「样式」入口在 3×2 上仍与现状一致。
- [ ] 更新设置页：新装设备「发现新版本时发通知」默认关；打开后能正常申请权限与发通知。

## 已定夺（2026-09-23 本轮问答）

- 空课文案一律写「今天」（沿用现有两条字符串），不引入「今日」；汇总行句式不动。
- 第二段引导文案按本文 F5 的措辞实现：标题「去个人中心看看」、说明「桌面卡片已经放好了。学期、样式、更新与数据备份这些设置都在个人中心。」、按钮「前往」/「暂时不用」；改词只需改 `app/lib/profile-guide.ts` 一处常量。
