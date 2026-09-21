# 实施计划：小工具维护面收缩到两档

依据：`prd.md`（需求与验收 A1–A8）、`design.md`（D1–D8）。每阶段末尾的命令是**该阶段的完成定义**，
不跑绿不进下一阶段。

## 阶段总览

| 阶段 | 产出 | 门禁 | 回滚点 |
|---|---|---|---|
| P1 原生数据与判决 | 注册表 7 档 + 维护标记、两档预设、样式解析新语义、pin 判决、`WidgetProviderScope` | `testDebugUnitTest`（含新增/改编的单测） | 单文件粒度：注册表 / 解析器 / 判决 各自可回退 |
| P2 两档 provider 资源 | 两个 receiver、两份 metadata、两条标签、两档预览资产 | `android:check-assets` + `test:android-assets` | 删掉两个新 receiver 与两份 metadata 即回到五档 |
| P3 启动收敛 | `WidgetProviderScopeGate` + `MainActivity` 调用点 + 诊断日志 | `testDebugUnitTest` + 源码级调用点断言 | 撤掉调用点即停止收敛（须同步一次性写回 `DEFAULT`，见 design §4） |
| P4 配置页二级菜单 | 布局 + Activity 交互 + 自动展开判据 | `testDebugUnitTest`（`needsAdvancedSection`） | 单个布局/Activity 文件回退 |
| P5 Web 面板收敛 | 预设表两档、类型收窄、删宽格分支、面板文案 | `pnpm test`、`pnpm typecheck`、`pnpm lint` | 预设表与组件各自可回退 |
| P6 门禁与跨层断言 | 7 档断言 + 禁用清单完整性 + 调用点断言 | 全部五条命令 | 断言文件回退 |
| P7 真机验收与标定 | 真机证据、1×2 标定回填 | 项目 skill `classtrack-android-widget-device-verify` 的检查项 | 标定值可回退到估算值 |
| P8 spec 同步 | `android-home-widget.md` 更新 | 人工核对 spec 与实现无矛盾 | — |

## P1 原生数据与判决（纯逻辑，先行）

- [ ] `WidgetProviderRegistry.Entry` 加 `boolean maintained`；条目顺序：`cell_3x2`、`cell_1x2`（维护）
      后接 `ClassTrackWidgetReceiver`(4×3)、`Cell2x2`、`Cell2x3`、`Cell4x2`、`Cell6x3`（收起）。
      新增 `maintainedEntries()` / `retiredEntries()` / `isMaintained(className)`；`entries()` 语义不变（全量）。
- [ ] `WidgetPreset`：新增 `ID_CELL_3X2`（3×2、`NEXT_UP`、`ADAPTIVE`、样本 276×210）、
      `ID_CELL_1X2`（1×2、`COMPACT`、`ADAPTIVE`、样本 97×210）；删除 `match()` / `distanceTo()` / `isPreferableTo()`。
- [ ] `WidgetStyleConfig`：`DEFAULT_LAYOUT_STYLE = NEXT_UP`；新增 `needsAdvancedSection()`（样式不是「接下来」，
      或已上完 / 大格子表现不是默认值 → true）。
- [ ] `WidgetStyleResolver.effective(config, providerPreset)`：删宽高入参、删 `matchPreset`；`AUTO` → provider 预设，缺失回默认。
- [ ] `WidgetPinConfirmation.planFor()`：写入预设的 `layoutStyle`（保留预设的 `wideLayout` 与默认已上完策略）。
- [ ] 新增 `WidgetProviderScope`（纯）：`NO_WRITE = -1`、`ENABLED/DISABLED` 常量与 `plan(maintained, currentState)`。
- [ ] 单测：`WidgetProviderRegistryTest`（7 档 / 2 维护）、`WidgetPresetTest`（删 match 段、加两档）、
      `WidgetStyleResolverTest`（新语义 + 存量 `auto`）、`WidgetPinConfirmationTest`（写预设样式）、
      `WidgetStyleConfigTest`（新默认值 + `needsAdvancedSection`）、新增 `WidgetProviderScopeTest`（两个方向的幂等）。

```bash
./android/gradlew -p android testDebugUnitTest
```

## P2 两档 provider 资源

- [ ] `Cell3x2WidgetReceiver.kt` / `Cell1x2WidgetReceiver.kt`（与 `Cell2x2WidgetReceiver.kt` 同构的 19 行壳）。
- [ ] `res/xml/widget_info_3x2.xml`（targetCell 3×2、minWidth/minHeight 110dp）与
      `widget_info_1x2.xml`（targetCell 1×2、minWidth **90dp**、minHeight 110dp）；两者 preview 指向各自的 layout/drawable。
- [ ] 清单新增两条 receiver（`exported="true"`、`android:label`、`APPWIDGET_UPDATE` intent-filter、metadata 指向各自 xml）。
- [ ] `strings.xml` 新增 `widget_label_3x2`（`课表 · 接下来 3×2`）、`widget_label_1x2`（`课表 · 紧凑 1×2`）。
- [ ] 两个生成脚本的 PROVIDERS 列表加 `3x2`（276×210，shape `single`）与 `1x2`（97×210，shape `compact`），
      跑生成并提交 4 个新文件（2 个 previewLayout + 2 个 previewImage）。

```bash
python3 scripts/generate-widget-preview-layouts.py && python3 scripts/generate-widget-preview-images.py
pnpm android:check-assets && pnpm test:android-assets
```

## P3 启动收敛（禁用收起档）

- [ ] `WidgetProviders.componentFor(String className)`（复用既有的 `Class.forName` 容错解析）。
- [ ] `WidgetProviderScopeGate.apply(Context)`：遍历 `retiredEntries()` → 读状态 → `plan` → 仅在需要时写。
- [ ] `MainActivity.onCreate` 调用 Gate（每次启动收敛），`WidgetDiagnostics.scopeConverged(retired, written)`。
- [ ] 确认 `renderers()` / `allAppWidgetIds()` 语义未变（仍覆盖 7 档，供归属校验与差集）。

```bash
./android/gradlew -p android testDebugUnitTest
node --test scripts/check-android-assets.test.js
```

## P4 配置页二级菜单

- [ ] `activity_widget_config.xml`：删除「自动（按尺寸）」「双栏」两个 `RadioButton` 及其说明 `TextView`；
      新增可点的「更多设置」标题行 + `widget_config_advanced_group`（默认 `gone`）包住其余样式 / 已上完 / 大格子表现。
- [ ] `WidgetConfigActivity.kt`：一级只回显「接下来」；二级区可展开/收起；`restoreSelection()` 时按
      `needsAdvancedSection()` 自动展开并回显选中项；`updateFinishedSectionState()` / `updateWideSectionState()`
      与新结构对齐（灰显说明不得指向已删掉的「自动」）。
- [ ] `strings.xml`：无用掉的「自动」「双栏」文案删除，新增「更多设置」标题与展开/收起提示。

```bash
./android/gradlew -p android testDebugUnitTest
```

## P5 Web 面板收敛

- [ ] `widgetPinPresets.ts`：`WIDGET_PIN_PRESETS` → 两档（`cell_3x2`「接下来 3×2」、`cell_1x2`「紧凑 1×2」，
      描述与提示按各自样式重写）；删 `needsWideCell` 与 `WIDGET_PIN_NARROW_CELL_HINT`；手动步骤文案自动收敛到两档。
- [ ] `WidgetPinEntry.tsx`：删「需宽格」徽标与窄格提示分支；文案继续不承诺尺寸。
- [ ] `app/lib/native-widget-snapshot.ts`：`WidgetPresetId` 收窄为 `'cell_3x2' | 'cell_1x2'`。

```bash
pnpm test && pnpm typecheck && pnpm lint
```

## P6 门禁与跨层断言

- [ ] `check-android-assets.js`：`WIDGET_PROVIDER_CELLS` 扩到 7 档、`receiverCount` 期望 7；
      注册表解析出 `(receiver, preset, maintained)` 并断言维护档恰为两档、非维护档在清单里都有对应 receiver；
      断言 `MainActivity` 里存在 `WidgetProviderScopeGate.apply(`。
- [ ] `widgetPinPresets.test.ts`：`WIDGET_CELLS` 扩到 7 档（注册表/metadata/清单断言）；
      预设表 ↔ 标签 ↔ 卡片名断言收敛到两档；删 `needsWideCell` 断言；手动步骤断言改为两档。

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm android:check-assets && pnpm test:android-assets
./android/gradlew -p android testDebugUnitTest
```

## P7 真机验收与 1×2 标定回填

按项目 skill `classtrack-android-widget-device-verify` 执行（模拟器 + AOSP launcher）：

- [x] 组件态：首启 `phase=scope_converged retired=5 written=5`，二启 `written=0`（幂等）；
      `dumpsys package` 的 `disabledComponents` 正好五个收起档；拾取器里只剩两条 ——A2
      （证据 `evidence/02-picker.png`、`03-picker-search.png`、`04-picker-expanded.png`）。
- [x] 1×2 拖放一次：真实尺寸 `phase=widget_sized w=82 h=210`，配置页自动展开「更多设置」并预选「紧凑」，
      确认后 `phase=style_configured style=compact`；桌面实例上教室「教二105」单独成行 ——A1/A4/A6
      （证据 `08-drop-compact.png`、`09-compact-on-home.png`、`12-compact-v2-home.png`）。
- [x] 3×2 拖放一次：`w=276 h=210`、配置页一级「接下来」+ 二级折叠、`phase=style_configured style=next_up`；
      桌面实例明细一行带教室 ——A1/A4/A6（证据 `15-drop-3x2.png`、`16-3x2-on-home.png`）。
- [ ] 拖动改尺寸（含最小尺寸）：无裁切、无溢出、日志有 `phase=widget_sized`——A6；`resizeMode` 自由。
- [ ] 存量收起档实例的现场行为记录（冻结/被清除与否）写进 `verification.md`，作为 D3 代价的实证。
- [x] 1×2 的真机实测 w/h：82 × 210dp（1080×2400 @420dpi、5 列网格）。
      `minWidth` 回填为 **60dp**（90dp 会被 launcher 抬成「2 × 2」，见 design D11）；
      标定样本保持 97dp（4 列机型的一列宽），生成资产已重跑 ——A6。
- [x] 两份 1×2 预览资产重跑（含 mock 单行化、文案与运行期一致、主课之后的课程行、窄卡行形态）——A10/A11。
- [ ] 两档放置后等一次自动刷新（边界闹钟 / Worker），确认 `updateAll` / `getGlanceIds` 在存在禁用组件的情况下正常。

## P7.5 追加需求落地（2026-09-21 用户追加 R8 / R9）

- [x] 标签收敛：两档 `android:label` = 「课表」；Web 预设名保留「接下来 / 紧凑」（面板必须能区分）；
      跨层测试改为「标签恒为课表」+「面板卡片名互不相同」——A9。
- [x] 紧凑内容：`WidgetLinePolicy` 紧凑分支 = hero（明细两行）+ 计数 + hero 之后的行；
      `firstRowAfterHero` 四种情形都有单测；`WidgetBodyPlan.RowForm.COMPACT` 行形态 + 高度估算同步——A10。
- [x] 预览 mock 诚实性：单行属性注入（只补缺失）、`widget_preview_hero_label` 与运行期一致、
      紧凑 mock 与运行期同形、`--check` 通过——A11。
- [x] 门禁全绿：`pnpm test`(92) / `lint` / `typecheck` / `format:check` / `android:check-assets` /
      `test:android-assets`(4) / `testDebugUnitTest`(196)。

## P8 spec 同步（Phase 3.3）

- [ ] `.trellis/spec/frontend/android-home-widget.md`：把「五个 provider」「AUTO 尺寸匹配」「双栏选项」
      三类条目改为「两档维护 + 五档收起（运行时禁用）」，并记录：禁用组件对存量实例的代价、
      `minWidth` 与格子宽度的关系、`needsAdvancedSection()` 的自动展开口径、新增的跨层断言位置。

## 回滚清单（无论从哪一步回退都适用）

1. 撤掉 `MainActivity` 里的 `WidgetProviderScopeGate.apply` 调用 → 停止收敛。
2. 若有版本已写过 `DISABLED`，回滚版本必须**一次性**把收起档写回 `COMPONENT_ENABLED_STATE_DEFAULT`，
   否则拾取器里永远看不到它们。
3. D3（删尺寸匹配）与 D4（写预设样式）**同进同退**；单独回退 D4 会让 1×2 渲染成「接下来」。
4. 1×2 的标定值回退到估算值不影响功能，只影响 pin 的尺寸提示与预览资产的一致性（须同时回退生成资产）。
