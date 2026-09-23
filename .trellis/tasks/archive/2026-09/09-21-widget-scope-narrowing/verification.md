# 验收记录：小工具维护面收缩到 3×2「接下来」+ 1×2「紧凑」

环境：`emulator-5554`（1080×2400 @420dpi，NexusLauncher 5 列网格）、`com.classtrack.app` debug 包。
证据目录：`.trellis/tasks/09-21-widget-scope-narrowing/evidence/`。

## 门禁（最后一次全跑）

| 命令 | 结果 |
|---|---|
| `CI=true pnpm test` | 14 files / **92 tests** 全绿 |
| `pnpm lint` | 通过（仅 eslint-plugin-react 的 React 版本 warning） |
| `pnpm typecheck` | 通过 |
| `pnpm format:check` | 通过 |
| `pnpm android:check-assets` | 245 assets / 26 index refs 通过 |
| `pnpm test:android-assets` | 4 pass / 0 fail |
| `./android/gradlew -p android testDebugUnitTest` | **196 tests** 全绿 |
| `python3 scripts/generate-widget-preview-layouts.py --check` | 通过（7 份布局 mock 与生成结果一致） |

## A1 两档 provider 落地

- 清单 7 条 `APPWIDGET_UPDATE` receiver；`ClassTrackWidgetReceiver`（旧类名）仍在；两档各带
  `widget_info_3x2.xml` / `widget_info_1x2.xml` 与生成的两份 `previewLayout` + `previewImage`。
- 门禁断言：`check-android-assets.js` 的 `WIDGET_PROVIDER_CELLS`（7 档）+ `MAINTAINED_WIDGET_CELLS`（3x2/1x2）
  + `widgetPinPresets.test.ts` 的清单/metadata/注册表一致性。

## A2 收起生效（真机）

- 首启：`phase=scope_converged retired=5 written=5`；二次启动：`retired=5 written=0`（幂等）。
- `dumpsys package com.classtrack.app` 的 `disabledComponents`：正好
  `Cell2x2WidgetReceiver` / `Cell2x3WidgetReceiver` / `Cell4x2WidgetReceiver` / `Cell6x3WidgetReceiver` /
  `ClassTrackWidgetReceiver`（旧 4×3 档）五个；两个维护档未被禁用。
- 拾取器（搜索 `Class`）只剩两条：`课表`（跨度 `3 × 2`）与 `课表`（跨度 `1 × 2`）
  —— 证据 `02-picker.png`、`03-picker-search.png`、`04-picker-expanded.png`、`07-picker-ke-biao.png`。

## A3 / A4 样式不再随尺寸变 + pin 带样式

- `WidgetPreset` 的 `match()` / `distanceTo()` / `isPreferableTo()` 已删；`WidgetStyleResolver.effective(config, providerPreset)`
  对未显式选择样式的实例返回 provider 预设（3×2 → 接下来，1×2 → 紧凑）；存量 `auto` / `two_column` 解析不抛异常。
- `WidgetStyleState.read()` 对「从未写过的样式键」返回 `auto`，使 provider 预设默认样式对「从拾取器拖进来」的实例生效。
- 单测：`WidgetStyleResolverTest`、`WidgetStyleStateTest`、`WidgetPinConfirmationTest`（断言写入的是预设样式）。

## A5 UI 收起

- 配置页一级只有「全天课表 / 接下来 / 紧凑」+ 可点「更多设置」（默认折叠）；二级区含「今天已上完的课 / 大格子表现」；
  页面里不存在「自动（按尺寸）」与「双栏」两项。
- 落到二级区的样式（含 1×2 预设的「紧凑」）会自动展开二级区 —— 证据 `08-drop-compact.png`
  （1×2 拖放后配置页选中「紧凑」且「更多设置」已展开）。
- 应用内面板只有 `cell_3x2` / `cell_1x2` 两张卡。

## A6 真机验收（放置 / 尺寸 / 教室）

| 观测 | 结果 |
|---|---|
| 1×2 拖放 | `phase=widget_sized widget=15 w=82 h=210`（82dp = 5 列网格的一列宽），放置后自动拉起配置页 |
| 配置页确认 | `phase=style_configured style=compact finished=show_dim wide=adaptive` |
| 桌面实例 | 教室单独成行（「教二105」），即 hero 明细拆行生效 —— `09-compact-on-home.png`、`12-compact-v2-home.png` |
| 3×2 拾取器预览 | 明细一行带教室「14:00 - 15:35 · C305」，汇总行 + 两行课程 —— `14-picker-compact-v2.png` |
| 3×2 拖放 | `phase=widget_sized widget=16 w=276 h=210`；配置页一级选中「接下来」且「更多设置」默认折叠（与 1×2 的自动展开互为对照）；确认后 `phase=style_configured style=next_up` —— `15-drop-3x2.png` |
| 3×2 桌面实例 | 「接下来 · 9月27日 周日 / 高等数学 / 08:40 - 09:20 · 教二105 / 下一节 …」：宽格样式明细仍是一行且带教室 —— `16-3x2-on-home.png` |
| 分辨率敏感性 | `wm size 1080x2376`（用户给的常见机型尺寸）后仍是 82dp/列、渲染一致 —— `10-compact-1080x2376.png` |
| `wm density 320` 对照 | 列宽变宽后文案不再被裁（同一份布局）—— `11-compact-density320.png` |

**1×2 的尺寸结论**：标定样本保持 **97dp**（4 列机型的一列宽，也正是 ColorOS 默认 4×6 布局下一加 Ace 5 Pro
（1264×2780px、~450dpi → ~105–112dp/列）的邻域），`minWidth` 定 **60dp**。

## A9 标签收敛

- 两个维护档 `android:label` 都是「课表」；`strings.xml` 注释写明「不带样式也不带尺寸」及原因。
- 拾取器实测两条同名，靠 launcher 自己打的跨度标签区分 —— `07-picker-ke-biao.png`。
- 跨层测试改为：维护档标签恒为 `课表` + 面板卡片名互不相同（`widgetPinPresets.test.ts`）。

## A10 紧凑内容（主课之后的课 + 教室不省）

- `WidgetLinePolicy` 紧凑分支 = hero（明细两行）+ 计数 + `rows[firstRowAfterHero..]`；`firstRowAfterHero` 由纯函数判定
  （正在进行 / 无正在进行 / 列明天 / 全天已上完 四种情形各有单测：`compactListsTheClassesAfterTheHero`、
  `compactSkipsTheHeroItselfWhenNothingIsInProgress`、`compactListsTheRestOfTomorrowWhenTodayHasNoClasses`、
  `compactAddsNoRowsWhenEveryRowIsFinished`）。
- 行形态 `WidgetBodyPlan.RowForm.COMPACT`（课名一行、「时间 · 教室」一行），单测 `compactRowsUseTheNarrowRowForm`。
- 两份 1×2 预览资产重跑：`widget_preview_1x2.xml`（布局 mock）+ `widget_preview_1x2.png`（194×420），
  内容 = 主课（明细两行）+ 计数 + 16:00 线性代数 D401 / 18:00 体育 操场。
- 配置页两句「对紧凑样式无效果」的说明按**真实原因**改写（已上完的行排在主课之前，天然进不来）。

## A11 预览诚实性

- `widget_preview_hero_label` 从「正在进行 · 第 3-4 节」改为「正在进行」——运行期 in-progress 的 hero 标签本就只有这一个词。
- 生成器给每个 `TextView` 只补**缺失**的 `maxLines="1"` + `ellipsize="end"`（无脑插入会写出重复属性，
  aapt 报 `AttributeNSNotUnique` 拒绝编译；这条已在门禁里拦住一次）。
- 效果对照：修前 1×2 预览在 82dp 格里把状态标签折成 5 行（`04-picker-expanded.png`），修后单行省略号。

## 现场行为与已知限制（记录下来，不在本轮修）

1. **拾取器预览框比真实尺寸矮**：Launcher3 给 1×2 那一条的预览框约 73×84dp（真实放置是 82×210dp），
   因此预览只露出上半段（主课）。桌面实例与生成资产才是全貌。
2. **分辨率不改变列宽**：只有 density 与桌面列数影响（1080×2400 → 1080×2376 实测一致）。
   5 列网格（AOSP/Pixel 默认）下一列 82dp，是紧凑样式「最窄」的常见场景；4 列机型约 90–112dp。
3. **存量的五个收起档实例会冻结**（产品已接受）：本轮不做迁移、不做提示；回滚必须一次性把组件状态写回
   `COMPONENT_ENABLED_STATE_DEFAULT`。
4. 模拟器时间停在 22:5x，今天的课都已上完，因此桌面上那个 1×2 实例展示的是「今天已无课 + 主课落到明天」这一态
   （按设计不补后续课程行）。「主课之后有课」这一态由单测 + 生成预览覆盖；真机看到该态需要一个白天时刻。

## 未完成 / 下一轮

- [x] 3×2 重新拖放一次 —— 见上表（`15-drop-3x2.png` / `16-3x2-on-home.png`）。
- [ ] 拖动改尺寸（含最小尺寸）后不裁切、不空荡的截图证据（本轮未做：改尺寸路径本轮只改了行形态与 hero 明细，
      且两者都按尺寸连续生效；证据缺口记在这里，不做推测性结论）。
- [ ] 存在禁用组件时的一次自动刷新（边界闹钟 / Worker）实测记录。
