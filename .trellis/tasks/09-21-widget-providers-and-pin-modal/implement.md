# 实施计划：多 provider + 快速失败探针 + 醒目标态框

> 配套 [prd.md](./prd.md) / [design.md](./design.md)。
> **实施方式**：主线程直接改（用户明确要求不使用子代理），不走 `trellis-implement` 派发。

## 阶段总览

| 阶段 | 内容 | 完成判据 | 回滚点 |
|---|---|---|---|
| P1 探针 | `PinAttempt`（纯 Java）+ `MainActivity.onPause` 上报 + 插件 `getPinAttempt()` | `PinAttemptTest` 全绿 | `git revert` P1 |
| P2 模态 | `useWidgetPin` 扩展状态机（`display` 字段）+ Radix Dialog + 文案纯函数 | vitest 全绿（含失败态含手动步骤） | `git revert` P2 |
| P3 多 provider | `WidgetProviders` + 四个新 receiver（2×2 / 2×3 / 4×2 / 6×3）+ 五份 info XML/预览 + 标签 | `WidgetProvidersTest` + 跨层标签测试 + 资产断言 | `git revert` P3 |
| P4 落样式 | 放置即带样式（provider → 默认）+ 配置页预填与 id 校验改多 provider | 单测 + 五档各放一个实例验证 | `git revert` P4 |
| P5 自动匹配 | `LayoutStyle.AUTO`（新默认）+ `WidgetPreset.match(w,h)` 最近邻 + 配置页「自动」选项 | `WidgetPresetMatchTest` + 手动优先不变式 | `git revert` P5 |
| P6 门禁 | `testDebugUnitTest` / `pnpm test` / `pnpm lint` / `cap:build:android`（含新资产断言） | 全绿 | — |
| P7 真机 | A6 四项（见下） | 证据落 `verification.md` | — |

## P1 快探针（原生）

- 新增 `PinAttempt.java`（纯逻辑，可测）：
  - `static final long PROBE_DELAY_MS = 2000L`
  - `static boolean shouldFailFast(long requestedAtMs, long nowMs, long backgroundedAtMs)`
    —— `nowMs >= requestedAtMs` 且 `nowMs - requestedAtMs >= PROBE_DELAY_MS` 且 `backgroundedAtMs == 0`。
  - 时钟回拨（`nowMs < requestedAtMs`）与负值一律返回 false（宁可多等，不误报）。
- 新增 `AppBackgroundState.java`：`recordBackgrounded(nowMs)` / `backgroundedAtMs()` / `clear()`；
  由 `MainActivity.onPause()` 调用（`onResume` 不清，因为要保留"请求期间退过后台"这一事实，
  清空时机 = 每次新的 pin 请求时）。
- `WidgetSnapshotPlugin`：
  - 请求时 `AppBackgroundState.clear()` 并记 `requestedAtMs`；
  - 新增 `getPinAttempt()` → `{ requestedAtMs, backgroundedAtMs }`（只含数值，符合日志/契约约束；不透传内容）。
- 单测 `PinAttemptTest`：未到时限、未退后台且过时限 → true；退过后台 → false；时钟回拨 / 负数 / 0 → false。

## P2 醒目标态框（Web）

- `widgetPinPresets.ts`：
  - 新增状态 `no_confirmation`；新增文案常量 `WIDGET_PIN_NO_CONFIRMATION_HINT`（含"系统没有弹出确认界面"+
    "如果你在桌面上看到了确认界面，请先把它点完"+ 按尺寸的手动步骤）；
  - 手动步骤文案改为**按尺寸指名**（复用 provider 标签常量 `WIDGET_PIN_TARGET_PHONE` / `..._TABLET`）。
- `useWidgetPin.ts`：
  - 状态增加 `modal: 'hidden' | 'requesting' | 'failed' | 'added'` 与 `attempt` 轮询（每 500ms 调 `getPinAttempt()`）；
  - 探针命中 → `no_confirmation`（模态切失败态，但**继续**轮询 `consumePinResult`）；
  - 回调到达 → `added`（模态短暂显示成功后自动关闭）；
  - 模态关闭不影响面板文案（同一 `outcome` 驱动两处）。
- `WidgetPinEntry.tsx`：接入 Radix `Dialog`；失败态含原因、手动步骤、"再试一次"、"知道了"。
- vitest：状态机与文案纯函数覆盖（含"失败态文案必须含按尺寸的手动步骤"、"requesting 不含『已添加』"）。

## P3 多 provider（原生）

- `WidgetProviders.java`：
  - `List<ComponentName> renderers()`（**4×3 = 旧类名 `ClassTrackWidgetReceiver`**，其余四档 = 新类）；
  - `WidgetPreset presetFor(ComponentName)`；
  - `int[] allAppWidgetIds(Context)`（跨 provider 并集）；
  - `WidgetPreset presetForAppWidgetId(Context, int)`（`getAppWidgetInfo(id).provider` → 映射）。
- 预设标识改为**按尺寸命名**（`cell_2x2` / `cell_2x3` / `cell_4x2` / `cell_4x3` / `cell_6x3`），原生 `WidgetPreset` 白名单与 Web `WidgetPinPresetId` 同步改；
  旧标识（`phone_minimal` / `phone_standard` / …）不再使用 —— 跨层白名单测试与新标识一起更新（迁移期只需读得到旧值不崩：未知值一律回退默认）。
- 新增四个 receiver（`Cell2x2WidgetReceiver` / `Cell2x3WidgetReceiver` / `Cell4x2WidgetReceiver` / `Cell6x3WidgetReceiver`，各自三行、共用同一个 `ClassTrackWidget` 实例）。
- 资源：新增四份 info XML（各自 `targetCell`、`configure`、`updatePeriodMillis`、`previewLayout`/`previewImage`、`resizeMode`）；
  既有的 `class_track_widget_info.xml` **保持 4×3 不变**（改它会影响存量实例的拾取器认知）；
  五份标签用 `strings.xml` 的新字符串（逐字 `课表 · 极简 2×2` / `课表 · 手机 2×3` / `课表 · 宽横 4×2` / `课表 · 标准 4×3` / `课表 · 宽屏 6×3`）。
- 清单：新增四个 receiver（exported=true + `APPWIDGET_UPDATE` + meta-data）。
- `generate-widget-preview.py` 参数化为按 provider 产出五张 `previewImage`。
- 测试：`WidgetProvidersTest`（恰好五个、组件↔预设一一对应、未知组件返回 null、并集去重）；
  `widgetPinPresets.test.ts` 增加**读真实文件**的跨层断言：五份 info XML 的 `targetCell` 与 `strings.xml` 标签，
  必须与 TS 里的预设定量逐字一致（防止三层各写一遍写歪）。

## P4 放置即带样式 + 多 provider 正确性

- `ClassTrackWidget.provideGlance`：未配置实例按 provider 写一次默认配置（design D3）。
- `WidgetConfigActivity`：id 归属校验改为 `WidgetProviders.renderers()`；预填改为按 provider（不再依赖 pin 槽位）。
- `WidgetPinResultReceiver` / `WidgetSnapshotPlugin`：基线、当前集合、pin 目标组件全部走 `WidgetProviders`。
- 单测：未知组件 / 未知 id → null 且不抛；跨 provider 并集去重且顺序稳定。

## P5 尺寸变化自动匹配（口径变更，design D3b）

- `WidgetStyleConfig.LayoutStyle` 新增 `AUTO` 并**改为默认值**；缺省键读作 `AUTO`（向后兼容：老实例没写过键 → 自动）。
- `WidgetPreset.match(widthDp, heightDp)`：对四档预设的标定尺寸算**归一化最近邻**（纯函数、无阈值分支、并列取小档）。
- `provideGlance`：`layoutStyle == AUTO` 时，样式 / `wide_layout` / 行项形态都取匹配到的预设；显式值一律优先（手动优先）。
- 配置页：新增「自动（按尺寸）」选项并作为默认；显式选择写盘后不再自动匹配。
- 单测 `WidgetPresetMatchTest`：各档中心命中自己、档间边界取近者、并列取小档、极端尺寸（0 / 超大 / 负值）不崩且落到最近档；
- 「显式样式优先」不变式：`AUTO` 才走匹配，显式值必须原样返回。

## P7 真机验证（PKR110 / ColorOS）

1. 点预设 → **立即**出现「正在尝试添加…」模态（截图 + 时间戳）。
2. 约 2 秒后（探针命中，无需等 10 秒）→ 失败态模态，含按尺寸手动步骤（截图 + 时间戳差）。
3. 系统拾取器（长按桌面空白 → 小工具）里出现**五个** ClassTrack 条目，尺寸标签分别是 `2×2`、`2×3`、`4×2`、`4×3`、`6×3`（截图）。
4. 从拾取器放下实例，确认样式与该 provider 的预览一致（`layout_metrics ... dual=true/false` 日志 + 截图）。
5. 记录 `dumpsys appwidget` 实例数与 provider 组件名，确认**存量实例仍在**（旧 receiver 未改名）。
6. **拖动改尺寸**：在 4×3 与 6×3 之间拖动，确认单/双栏与行项形态自动跟着变；
   然后在配置页显式选一个样式，再次拖动，确认**不再自动变**（手动优先）。

## 风险与对策

| 风险 | 对策 |
|---|---|
| 旧实例因 provider 改名而失效 | **4×3 那个 provider 沿用旧类名**，只新增三档；真机验证时先确认旧实例还在 |
| 探针误判（launcher 在同一任务内弹对话框） | 只切失败态、不停止监听；回调到达即翻成功；文案标为"如果你看到了确认界面，请先点完" |
| 自动匹配会改变用户看到的样式（口径变更） | 产品已明确要求；配置页显式选择永远优先，且默认档「自动」在文案里说清是按尺寸 |
| 四份静态预览 + 四张 PNG 手写同步容易歪 | 文件头注明同步条件；资产脚本断言四份 `targetCell`；跨层测试比对标签；预览内容与默认样式同源 |
| `updatePeriodMillis` 变成四份 | 四份都保留（L5 兜底路径）；代价是系统 tick 翻倍，属可接受 |
