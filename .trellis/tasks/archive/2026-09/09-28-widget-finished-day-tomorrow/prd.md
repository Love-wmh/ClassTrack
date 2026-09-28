# 小工具「今天已无课」档重做：列明天课表 + 「下次上课」块 + 修快照丢弃当天已上完课

> 本文是**轻量规划**的唯一产物（用户 2026-09-28 口径：先把表现定下来，再动手；只写 `prd.md`）。
> 「技术前提与决策」一节是实现前必读 —— 三支改动互相咬合，写之前必须先把这一节读完。
>
> 三支改动同属一个任务（同一张卡、同一条数据链，分开改会互相打脸）：
> **A 今天已无课时列明天课表** → **B 明天也没课时换成「下次上课」块** → **C 修掉快照丢弃当天已上完课**。
> C 是 A/B 的数据前提：C 不修，`todayFinishedCount` 恒为 0、`WidgetDayPlan` 也分不清「今天本来没课」与「今天已上完」。

## Goal

**A. 今天已无课（今天没课，或今天的课已上完）且明天有课 → 非 hero 区域直接列明天的课表。**
现状是：hero 换成空课态之后，整张卡上唯一的课程信息只剩列表底部一行 caption 小字
（`下一节 · 9月28日 周一 08:00 毛泽东思想和中国特…`，必然被省略号截）。用户诉求（2026-09-28）：
这一档应当像「今天没课、明天有课」那样，**直接把明天的课表列出来**（汇总行写明「明天」），
三种「已上完」策略都切。

**B. 今天已无课、明天也没课（周末 / 长假）→ 不列下一个有课日的课表，但换成「下次上课」块。**
用户 2026-09-28 明确：这一档**不**列下一个有课日的课表（保持 2026-09-20「长假不列课表」口径），
但也**不能**维持现状 —— 现在是「一行、caption 小字、无样式、内容还被省略」。
改成两块：主体标题（title 字号）`下次上课` + 次要行（body 字号、accent）`9月28日 周一 08:00`。

**C. 修掉 Web 侧快照生成丢弃「当天已上完」条目。**
症状（用户 2026-09-28 报）：上完课切到前台后，今天已上完的课全都不显示了。
根因见 D8：`buildWidgetSnapshot` 会丢掉 `endEpochMs <= 生成时刻` 的 occurrence；而覆盖窗口从
**今天**开始，所以这条过滤只能删掉「今天已上完」的课。它同时让 `WidgetDisplayState.todayFinishedCount`
恒为 0（「已上完 N 节」「已上完 N 节 · 还有 M 节」恒错），并让 `WidgetDayPlan` 把「今天」看成空课，
于是空课态错写成「今天无课」（本该「今天已无课」）。

## 背景与现状事实

| 事实 | 出处 | 后果 |
|---|---|---|
| 行序列由纯 Java `WidgetLinePolicy.resolve(config, plan, heroIsToday, dualColumn)` 判决；`plan` 由 `WidgetDayPlan.resolve(todayItems, nextDayItems, policy)` 决定 | `WidgetLinePolicy.java` / `WidgetDayPlan.java` | 新形态必须走判决层，不能在渲染层临时判断 |
| 「今天有课但被策略全部裁掉」时**不回退**到明天，只给 `NEXT_OTHER` 一行 | `WidgetDayPlan.resolve`（2026-09-20 R11） | 就是本次 A 要改的那条判据 |
| 「今天与明天都没课」时一行课表都不列，只给 `NEXT_OTHER` | 同上（R11 第三条） | 保持；但 `NEXT_OTHER` 的表现要换成 B 的块 |
| hero 是「第一条 `endEpochMs > now` 的课」，可以落在别的日子；`HeroState.UPCOMING_OTHER_DAY` 标记这种情况 | `WidgetStateResolver.resolve` | `heroIsToday == false` 时 hero 位置画 `HERO_EMPTY`（2026-09-23 口径，本次不动） |
| `NEXT_OTHER` 现在渲染成一行 `captionStyle(metrics, widget_accent)`，文案 `下一节 · %1$s %2$s %3$s`（日期 时刻 课名） | `ClassTrackWidget.nextOtherDayLine` + `strings.xml: widget_next_other_day_line` | 1×2 与 3×2 都会把课名截成省略号 |
| `compact` 样式在该档还有第二处重复：计数行文案的 `Source.NONE` 分支就是 `emptyDayText`，与 hero 醒目行同为「今天无课」 | `compactCounterText` | 1×2 上同一句话出现两遍 |
| 高度估算按行种类折算文本行数（`bodyTextLines` / `headerTextLines`），漏算会让填充率虚高、字号被撑大 | `ClassTrackWidget.kt` | 新形态两处估算都要跟着改 |
| 字号**不随小格子缩小**（`MIN_SCALE = 1.0`）：caption 11sp / body 13sp / title 16sp 是下限；1×2 内容宽约 54–69dp ≈ 5 个汉字宽 | `WidgetLayoutMetrics` | 窄档文案要按 5 个汉字算；尺寸阈值被契约禁止，分档只按**样式** |
| `WidgetDateLabel.monthDay(dayKey)` = `9月28日`；`WidgetDateLabel.withWeekday(dayKey, weekdayLabel)` = `9月28日 周一` | `WidgetDateLabel` | B 的两行文案不用新增日期运算 |
| 快照 builder 丢弃 `endEpochMs <= generatedAtEpochMs` 的 occurrence（注释称「可以显著缩小 payload」） | `app/lib/widget-snapshot.ts` | 覆盖窗口从今天起 → 该过滤**只**删「今天已上完」的课，未来日子一条都删不掉：省不下体积，只制造缺陷 |
| 该行为被 Web 单测钉住 | `app/lib/widget-snapshot.test.ts:138`「已结束的课程被丢弃，但当天边界信息仍然保留」 | 修它是把这条断言反过来 |
| App 回前台会重推快照 | `useWidgetSnapshotSync.ts`（`addWidgetSnapshotResumedListener(push)`）+ 原生 `WidgetSnapshotPlugin.handleOnResume()` 的 `resumed` | 每次回前台都重生成快照 → 今天已上完的课被删（用户看到的时序） |
| 跨层夹具 `android/app/src/test/resources/widget-snapshot-v1.json` 由 Web builder 真实产出 | `WidgetSnapshotCrossLayerTest` 头注释 | 夹具 `generatedAt = 2026-09-21T09:00+08:00`，当天唯一一节 10:00–11:40 尚未结束 → **本改动不改变夹具字节**，无需重生成（见 D11） |

## 口径确认记录（2026-09-28，用户）

| 问题 | 确认结果 |
|---|---|
| 今天已无课时非 hero 区域列什么 | **列明天的课表**；三种「已上完」设置（显示已上完 / 不显示 / 折叠）**都切**到明天 |
| hero 区域（空课态三行）怎么处理 | **保留**，不改回「接下来 · 某日」；明天的课交给下面的列表 |
| 明天也没课（周末/长假）时 | **不**列下一个有课日的课表（保持 2026-09-20 口径）；但现状「一行 caption 小字 + 被省略号截」不可接受，要给出像样的表现 |
| 该档表现的形态 | 两行：主体标题 + 日期时刻的次要行（不是我提的「明天也没有课」大白话版） |
| 主体标题文案 | **`下次上课`**（不写否定句，用卡上既有的极简标签风；与「今天无课」「明天 周日 · 共 4 节」同级） |
| 次要行文案 | `9月28日 周一 08:00`（日期 + 星期 + 开始时刻）；**去掉课名**（课名就是被省略号截掉的那段） |
| 上完课切前台后已上完的课消失 | 确认是问题，**根因要一起修**（本次 C） |
| 分支 / 工作树 | 新建分支 + 独立工作树实施：`fix/widget-today-done-show-tomorrow`，工作树 `../ClassTrack-wt/widget-today-done-show-tomorrow`（从 `master` 7bd194f 开出） |

## 技术前提与决策

| 编号 | 决策 | 理由 / 影响 |
|---|---|---|
| D1 | 回退判据从「今天的可见行为空」改成「**今天没有还没上完的课**」：`clipped.getRows()` 里不存在 `Phase != FINISHED` 的行 | 用户要求三种「已上完」设置都切。`HIDE`/`COLLAPSE` 下 `clipped` 行本来就只剩未上完的，判据等价、行为不变；`SHOW_DIM` 下今天就只剩灰课，这是本次唯一的行为变化 |
| D2 | `Source.TOMORROW` 的 `todayHadClasses` 改为跟随**今天原本有没有课**（`!today.isEmpty()`），不再恒为 `false` | 否则「今天上完了」这一档的 hero 醒目行会写成「今天无课」，与事实相反 |
| D3 | 回退到明天时保留今天的 `collapsedFinishedCount`（`WidgetDayPlan` 把 `clipped.getCollapsedFinishedCount()` 一起带进 `TOMORROW` 分支） | 「折叠」是用户显式选的策略：今天已上完的节数不该因为列表切到明天就消失。`WidgetBodyLine.collapsed()` 的文案本来就写「已上完 N 节」（不写「今天」），落在这张卡上不会被读成「明天已上完」 |
| D4 | `Source.NONE` 的 `weekdayLabel` 保持既有语义：今天原本有课 → `weekdayOf(today)`，今天本来就空 → `""` | 该字段只在「列某一天」时有意义；`NONE` 下没有任何消费方（文案走 `emptyDayText`），保持原样避免连带改动 |
| D5 | B 的块**复用** `WidgetBodyLine.Kind.NEXT_OTHER`，按 `WidgetBodyPlan.RowForm` 分两种形态：宽档（`next_up` / `day_list`）= 标题行 + 次要行；窄档（`compact`）= 单行短文案 | 与既有「课名的宽/窄两种行形态」「文案分档按样式」同构；不新增 Kind 就不用再动 `when` 的穷尽性与左栏切分点 |
| D6 | 宽档两行的字号：标题 `titleStyle`（粗体、`widget_text_primary`），次要行 `bodyStyle(widget_accent)`；文案 `下次上课` + `9月28日 周一 08:00` | 与 hero 空课态的「醒目行 title + 次要行 body」同一套层级，块本身不引入新字号 |
| D7 | 窄档（1×2）用短文案，并且**修掉重复**：计数行 `compactCounterText` 的 `NONE` 分支从 `emptyDayText` 改成 `下次上课`（带「样式」入口），`NEXT_OTHER` 短档改成 `WidgetDateLabel.monthDay(hero.dayKey)` = `9月28日` | 1×2 的内容宽约 5 个汉字：`下次上课`（4 字）与 `9月28日`（数字窄，约 3.5 字宽）都放得下，而 `9月28日 周一 08:00` 与 `毛泽东思想和中国特…` 放不下。行数不变（都是 5 行），不引入滚动 |
| D8 | 快照**不再丢弃任何 occurrence**：删掉 `endEpochMs > generatedAtEpochMs` 这条过滤（等价于只保留「当天」的已上完课，因为窗口从今天起、未来日子不可能已结束） | 该过滤只删「今天已上完」的课，省不下体积；而 `SHOW_DIM` / `COLLAPSE` / `todayFinishedCount` / 「今天已无课 vs 今天无课」全都依赖这些条目 |
| D9 | 删除字符串 `widget_next_other_day_line`（`下一节 · %1$s %2$s %3$s`），新增 `widget_next_class_label`（`下次上课`）与 `widget_next_class_when`（`%1$s %2$s` = 日期 时刻） | 改完后运行期不可能再产生旧文案，留着就是下一个「mock 说得出、运行期说不出」的坑（同 2026-09-23 的 D10） |
| D10 | 两处高度估算同步：`bodyTextLines` 给 `NEXT_OTHER` 加显式分支（宽档 2 行 / 窄档 1 行，长度取真实文案），`headerTextLines` 同样加分支（`day_list` + 双栏时该行落在左栏） | 与渲染一一对应；漏算会让填充率虚高、字号被撑大（真机裁字就是这么来的） |
| D11 | 跨层夹具不重新生成：`generatedAt = 2026-09-21T09:00+08:00`，当天唯一一节 10:00–11:40 的 `endEpochMs > generatedAt`，即该过滤在夹具上**从未生效** | 逐字段推演：D8 只可能改变「当天且已结束」的条目，夹具当天没有这种条目 → 字节不变；实施后用 `WidgetSnapshotCrossLayerTest` 全绿作为证据（不靠推断） |
| D12 | 双栏（`two_column`）左卡不做改动 | 空课态左卡已经是「三行居中、不画课名/时间/今天还有 N 节」（2026-09-23 D7）；B 的块落在右栏（列表区），与「列表内容归右栏」一致 |
| D13 | 不做截图单测；渲染层的验收靠模拟器截图 + `WidgetLinePolicyTest` / `WidgetDayPlanTest` 的行序断言 | 与既有做法一致（渲染层无 JVM 测试） |

### A/B 的卡片形态

`next_up`（3×2）今天已上完、明天有课（**A**）：

```
10月8日 周四                    样式      ← hero 空课态
今天已无课
今天的课上完啦，好好休息
──────────────────────────────
明天 周五 · 共 4 节                       ← 汇总行（source = TOMORROW）
08:00  高等数学              A101
10:00  线性代数              B203
```

`next_up`（3×2）今天已上完（或今天没课）、明天也没课（**B**）：

```
9月26日 周六                    样式
今天无课
享受你的美好时光吧
──────────────────────────────
下次上课                                  ← title（粗体、正文色）
9月28日 周一 08:00                        ← body（accent）
```

`compact`（1×2）同一档（**B** 窄档；行数不变，只是把重复的「今天无课」换成「下次上课」）：

```
9月26日 周六
今天无课
放松一下吧
下次上课                          样式     ← 计数行（短档，带「样式」入口）
9月28日                                   ← NEXT_OTHER 短档
```

`day_list`（全天课表）同一档：`今天无课`（汇总行）+ 上面的两行块（左栏切分点不变）。

## 功能需求

### F1 今天已无课 → 列明天（A）

- 今天没有「还没上完」的课（今天本来没课，或今天的课都已上完），且明天有课 → `Source.TOMORROW`，
  行为与既有的「今天没课、明天有课」完全一致：汇总行 `明天 %1$s · 共 %2$d 节` + 明天全部课程行。
- 三种「已上完」策略都切到明天：`SHOW_DIM` 下今天的灰课表不再出现（差异见 D1）。
- hero 保持空课态；「今天原本有课」时醒目行必须是 `今天已无课`，否则 `今天无课`。
- 该档**不**补 `NEXT_OTHER`（汇总行已经写明「明天」，补了就是把同一节课说两遍）。

### F2 明天也没课 → 「下次上课」块（B）

- 触发：今天没有未上完的课，且明天也没有课（周末 / 长假 / 学期尾声）；此时一行课表都不列。
- 宽档（`next_up` / `day_list`）：
  - 第一行 `下次上课`，`titleStyle`（粗体、`widget_text_primary`）。
  - 第二行 `9月28日 周一 08:00`，`bodyStyle(widget_accent)`；日期取 `WidgetDateLabel.withWeekday(hero.dayKey, hero.weekdayLabel)`，
    时刻取 `hero.startLabel`。**不写课名**（课名是唯一会被省略的那段）。
- 窄档（`compact`）：计数行 `下次上课`（`compactCounterText` 的 `NONE` 分支，仍带「样式」入口）+
  `NEXT_OTHER` 行 `9月28日`（`WidgetDateLabel.monthDay(hero.dayKey)`）。
- 数据来源只有 `hero`（下一条没结束的课），**不需要任何 Web 侧新字段**。
- 该档不列下一个有课日的课表（用户口径）：除了 `hero` 的日期与时刻，不出现任何课程行/节数。

### F3 快照保留当天已上完的课（C）

- `buildWidgetSnapshot` 不再按 `endEpochMs <= generatedAtEpochMs` 丢弃 occurrence；今天的课（含已上完）全部进入 `entries`。
- 连带恢复：`todayFinishedCount` 正确 → 「已上完 N 节」（折叠）与双栏「已上完 N 节 · 还有 M 节」正确；
  `SHOW_DIM` 的灰课表在 App 回前台后仍然存在；空课态醒目行在「今天上完了」时说 `今天已无课`。
- 覆盖窗口、`dayEndEpochMs`、`validUntilEpochMs`、`WIDGET_MAX_ENTRIES` 截断规则、`schemaVersion = 1` 一律不动。
- 夹具字节不变（D11）。

### F4 文案与资源

- 新增 `widget_next_class_label` = `下次上课`、`widget_next_class_when` = `%1$s %2$s`。
- 删除 `widget_next_other_day_line`（D9）；`strings.xml` 里不允许留下无引用字符串。
- 1×2 上不再出现同一句话两遍（「今天无课」只由 hero 醒目行说一次）。

### F5 双栏与其它样式

- 双栏左卡不变（空课态三行居中）；B 的块出现在右栏。
- `day_list` 无 hero 行：`NONE` 档为「汇总行 `今天无课` + 两行块」，与 `next_up` 的信息量一致。
- 「正在上 / 接下来」的普通状态：三种样式的行序列与改动前**逐项一致**（只允许 B 影响的 `NONE` 档变化）。

## 边界与不做的事

- **不改 hero 的选取算法**（`firstNotEnded` 仍是「第一条没结束的课」）、不改刷新阶梯（L1–L5）、边界闹钟、
  双栏几何判据、填充估算公式、provider 与拾取器。
- **不把「今天已上完」做成新的 `WidgetDisplayState.Type`**；状态机（MISSING / UNAVAILABLE / EMPTY / STALE /
  NO_UPCOMING / READY）不变。
- **不列下一个有课日的课表**（用户 2026-09-28 明确）：长假档只给日期与时刻，不给课表、不给「共 N 节」。
  因此本任务**不需要** Web 侧快照多带几天数据。
- 不做「按尺寸选文案 / 隐内容」的分支（尺寸阈值被契约禁止）；分档只跟着**样式**走。
- 不重做 hero 空课态三行（2026-09-23 已定稿），也不改它的两档短句/长句。
- 不引入任何新的持久化状态、不提升 `schemaVersion`、不改备份 JSON。
- 不为 Kotlin 渲染层引入单测 / 截图测试基础设施。

## 验收清单

**JVM 单测**（`GRADLE_USER_HOME=... ./android/gradlew -p android :app:testDebugUnitTest --offline`）

- [ ] `WidgetDayPlanTest`：今天有课但全被裁掉（`SHOW_DIM` / `HIDE` / `COLLAPSE` 三种）且明天有课 → `Source.TOMORROW`，
      且 `rows` = 明天的课、`weekdayLabel` = 明天的星期、`todayHadClasses == true`。
- [ ] `WidgetDayPlanTest`：今天已上完 + `COLLAPSE` → 回退到明天时 `collapsedFinishedCount` 仍是今天已上完的节数（D3）。
- [ ] `WidgetDayPlanTest`：今天仍有未上完的课 → `Source.TODAY`，三种策略的行与改动前逐项一致（回归）。
- [ ] `WidgetDayPlanTest`：今天没课 + 明天有课 → `Source.TOMORROW`、`todayHadClasses == false`（回归）。
- [ ] `WidgetDayPlanTest`：今天没课 + 明天没课 → `Source.NONE`、无课程行（回归）。
- [ ] `WidgetLinePolicyTest`：`heroIsToday == false` + 今天已上完 + 明天有课 → 首行 `HERO_EMPTY`、
      随后 `SUMMARY` + `COURSE…`，**不带** `NEXT_OTHER`（三种样式各一条）。
- [ ] `WidgetLinePolicyTest`：长假档（今天、明天都没课）→ `NEXT_OTHER` 仍在（`next_up` / `compact` / `day_list` 各一条）。
- [ ] `WidgetLinePolicyTest`：`heroIsToday == true` 时既有断言逐项不变。
- [ ] `WidgetSnapshotCrossLayerTest`：夹具未重新生成即全绿（证明 D11）。

**Web 单测**（`pnpm test`）

- [ ] `widget-snapshot.test.ts`：**今天已结束**的课仍留在 `entries` 里（`dayOffset == 0`，含 `endEpochMs <= now` 的那条）。
- [ ] `widget-snapshot.test.ts`：`dayEndEpochMs[0]` 仍覆盖今天、`entries` 仍按 `startEpochMs` 升序、
      「当天没课」的休息日仍没有 `dayOffset == 0` 的条目（回归）。
- [ ] 既有体积/条数上限、周次语义、星期标签、时区偏移用例全部通过。

**模拟器 / 真机**（小工具真实渲染 + 配置页预览）

- [ ] 「今天已上完（显示已上完）」：3×2 卡片上今天已上完的课**仍然灰显**，底部出现 `明天 … · 共 N 节` + 明天的课表。
- [ ] 「今天已上完（不显示已上完）」与「折叠」：同样列明天的课表；折叠档底部仍有 `已上完 N 节`。
- [ ] 长假档（今天、明天都没课）：3×2 = `今天无课 / 享受你的美好时光吧` + `下次上课`（title 字号）+ `9月28日 周一 08:00`；
      1×2 = `下次上课` + `9月28日`，两处都**不出现省略号**。
- [ ] 1×2 上「今天无课」只出现一次（计数行不再是同一句）。
- [ ] App 回前台（切后台再切回）后，上面两张卡的内容与回前台前一致（C 的现场验证）。
- [ ] 「正在上 / 接下来」的普通状态与改动前逐像素一致（三种样式各一张）。
- [ ] `adb logcat -s ClassTrack.Widget` 无 FATAL EXCEPTION / ActionException / InflateException。

**门禁**（工作树内）

- [ ] `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm test`、`pnpm build` 全绿。
- [ ] Android 单测全绿（命令见上）。
- [ ] `git diff --check` 无空白错误。

**留档**

- [ ] `verification.md` 记录：门禁命令与结果、模拟器截图路径、夹具未变的证据（或说明某项未覆盖及原因）。
- [ ] `.trellis/spec/frontend/android-home-widget.md` 同步：R11 选天规则改写、`NEXT_OTHER` 两种形态与文案分档、
      快照「必须保留当天已上完的条目」这条契约（含原因）。
