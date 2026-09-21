# 实施计划：回调式确认 + 按 id 落预设 + 三态文案

> 配套 [prd.md](./prd.md) 与 [design.md](./design.md)。

## 阶段总览

| 阶段 | 内容 | 完成判据 | 回滚点 |
|---|---|---|---|
| P1 原生回调 | `WidgetPinResultReceiver` + `WidgetPinConfirmation` + `WidgetPinResult` + 插件 `consumePinResult` | Android 单测全绿（含新增 2 个测试类） | `git revert` P1 提交 |
| P2 删兜底 | 移除 `provideGlance` 里的 `applyPendingPreset` 与 `claim()`/`isConfigured` | 构建通过、既有 132 例不回归 | `git revert` P2 提交 |
| P3 Web 三态 | `consumePinResult` 封装 + `useWidgetPin` 状态机（请求中/已确认/超时）+ 常驻手动步骤 | `pnpm test` 新增用例通过、`pnpm lint` 干净 | `git revert` P3 提交 |
| P4 门禁 | `testDebugUnitTest` / `pnpm test` / `pnpm lint` / `cap:build:android` | 全绿 | — |
| P5 真机验证 | 见 P5 小节 | A4 证据落 `verification.md` | — |
| P6 spec | `android-home-widget.md` 记录 API 契约与删掉的兜底 | spec 与实现一致 | — |

## P1 原生回调

- `WidgetPinConfirmation.planFor(appWidgetId, pendingPreset)`：纯判决（非法 id / 无预设 → `null`；
  否则给出 `WidgetStyleConfig(preset.layoutStyle, defaults.finishedPolicy, preset.wideLayout)`）。
- `WidgetPinResult`：一次性 + 超时的确认槽位（供 Web 轮询）。
- `WidgetPinResultReceiver`：`EXTRA_APPWIDGET_ID` → 记 `pin_confirmed` → `peek` 槽位 →
  `GlanceAppWidgetManager.getGlanceIdBy(id)` + `WidgetStyleState.write(...)` → `consume()` →
  `WidgetRefreshBridge.requestRefresh` → `WidgetPinResult.recordConfirmed`。
  - **`goAsync()` 判空且所有路径都 `finish()`**；这不是 `AppWidgetProvider` 回调，spec 里那条禁令不适用。
- 插件：`requestPinAppWidget(..., callbackPendingIntent)`；新增 `consumePinResult()`。
- manifest：注册 receiver，`exported="false"`（经 PendingIntent 投递，无需导出）。

## P2 删掉渲染侧兜底

- `ClassTrackWidget.provideGlance` 不再调用 `applyPendingPreset`；删除该函数、`WidgetStyleState.isConfigured`、
  `WidgetPendingPreset.claim()`（连同相关测试用例改为 `peek` + `consume` 的语义）。

## P3 Web 三态

- `native-widget-snapshot.ts`：`consumePinResult(): Promise<{confirmed: boolean; appWidgetId: number | null}>`
  + Web 兜底返回 `{confirmed:false, appWidgetId:null}`。
- `widgetPinPresets.ts`：新增 `WIDGET_PIN_REQUESTING_HINT`、`WIDGET_PIN_UNCONFIRMED_HINT`，
  以及纯函数 `resolvePinOutcome(...)`（把"已确认/超时/不支持/取消"映射成文案与状态）→ 可 vitest 覆盖。
- `useWidgetPin.ts`：请求后进入 `requesting`，轮询 `consumePinResult` 至多 10 次 × 1s：
  确认 → `added`；超时 → `unconfirmed`（如实文案）。
- `WidgetPinEntry.tsx`：卡片状态用三态；**手动步骤常驻面板底部**。

## P5 真机验证（PKR110 / ColorOS / Android 16）

```bash
avahi-browse -rt _adb-tls-connect._tcp | grep -A1 port      # 端口每次都变
adb connect <ip>:<port>
adb logcat -c && adb logcat -s ClassTrack.Widget             # pin_requested / pin_result / pin_confirmed
adb shell dumpsys appwidget | grep -c classtrack             # 实例数
adb logcat -b all | grep -iE "AddItemActivity|CONFIRM_PIN"   # launcher 是否起确认界面、是否置前
```

判据：不再出现假"已添加"；超时后出现如实文案与手动步骤；launcher 侧证据随附。

## 风险与对策

| 风险 | 对策 |
|---|---|
| `exported=false` 的 receiver 收不到系统回调 | 经 PendingIntent 投递不需要导出；用 AOSP 模拟器（launcher 支持 pin）做端到端验证 |
| `goAsync()` 超时（10s）内没写完 | Glance 写入是毫秒级；且所有路径 `finish()`，异常也不漏 |
| 有些 launcher 会自己拉配置页 → 两条路径都写配置 | 两条路径都以同一个一次性槽位为源，谁先到谁写，后到者拿到 `null` 直接跳过 |
| 超时文案被误读成"功能坏了" | 文案写清"部分厂商桌面会忽略这个请求"并给出手动步骤 |
