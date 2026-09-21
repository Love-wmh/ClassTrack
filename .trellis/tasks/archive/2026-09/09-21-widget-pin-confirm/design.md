# 技术设计：回调式确认 + 按 id 落预设 + 三态文案

> 配套 [prd.md](./prd.md)。本文只写「怎么做」与「为什么」，含被否方案。

## D1. 为什么必须换成「回调式确认」

`requestPinAppWidget` 的返回值和真实结果无关（见 PRD 的契约表）。因此**唯一**能知道"真的放下了 +
新实例 id"的途径是它的第三个参数 `successCallback`：

```kotlin
val callback = PendingIntent.getBroadcast(
    context, REQUEST_CODE,
    Intent(context, WidgetPinResultReceiver::class.java).setAction(ACTION_PIN_CONFIRMED),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
)
appWidgetManager.requestPinAppWidget(provider, extras, callback)
```

- 官方文档就是这么用的（`PendingIntent.getBroadcast`）。
- 系统在用户确认后发广播，extra 是 `AppWidgetManager.EXTRA_APPWIDGET_ID`。
- **没有回调就永远不显示"已添加"**：这是本任务的核心修复点。

**被否方案**：靠 `requested == true` 当成功（现状，会撒谎）；靠"猜哪个实例是新的"（上一轮的渲染侧兜底，
在 launcher 不放置时毫无意义，还会在两个实例同时渲染时抢同一个预设）。

## D2. receiver 里做什么

```
WidgetPinResultReceiver.onReceive(context, intent)
├─ callbackId = intent.getIntExtra(EXTRA_APPWIDGET_ID, INVALID)   // 不可信，实测可能是 0
├─ 记 phase=pin_confirmed widget=<callbackId>
├─ baseline = WidgetPinBaseline.consume(now)          // 请求前实例集合；null = 不知道（一次性 + 5min）
├─ current  = AppWidgetManager.getAppWidgetIds(provider)
├─ targets  = WidgetPinTargets.resolve(baseline, current, callbackId)
│    ├─ 一级：callbackId 在 current 里 → 用它
│    └─ 二级：baseline 非 null → current \ baseline（差集）
├─ targets 为空 → 记 pin_confirmed_unresolved，**不写、不消费槽位**，返回
├─ pending = WidgetPendingPreset.peek()               // 一次性 + 5 分钟超时
├─ config  = WidgetPinConfirmation.planFor(targets[0], pending)
│    └─ null → 只记日志，不替用户改样式
├─ WidgetPinResult.recordConfirmed(targets[0], now)   // Web 轮询用，趁早记下
└─ goAsync()：对每个 target 写 Glance 状态 → consume() 槽位 → 请求刷新（异常都 finish）
```

> **修订（2026-09-21，模拟器实测）**：D2 初稿写的是「回调带回的 id 是确定的」—— **不成立**。
> AOSP Launcher3 发回 `EXTRA_APPWIDGET_ID = 0`（真实新实例是 8），`getGlanceIdBy(0)` 抛异常 → 预设静默丢失，
> 且真机 ColorOS 根本不发确认回调，这段代码永远跑不到，所以只有模拟器能发现。
> 因此加了 `WidgetPinTargets`（两级判决）与 `WidgetPinBaseline`（请求前实例集合）。
> 其中 `null` 基线必须表示「不知道」而不是「空集合」，否则差集退化成「当前全集」，会把预设写到用户所有旧卡片上。

- **为什么要写 Glance 状态而不是等配置页**：实测（本机 ColorOS）launcher 既不弹确认也不拉配置页；
  即使拉配置页，Android 14+ 的 BAL 加固也可能让它起不来（PRD 契约表）。用回调直接写是唯一确定的路径。
- **落库逻辑放纯 Java**（`WidgetPinConfirmation`）：把「该不该写、写什么」与「怎么写到 Glance」分开，
  前者可 JUnit 覆盖（A1），后者只是三行 Android 调用。
- **receiver 用 `goAsync()` 且必须判空**：这不是 `AppWidgetProvider` 回调，因此允许 `goAsync()`；
  spec 里那条"绝不在 AppWidgetProvider 回调里 goAsync"的规则不适用（会在 spec 里写清这个区分）。
  异步写完之后 `pending.finish()`，异常也 finish（不能把广播拖死）。

## D3. Web 侧三态与「常驻手动步骤」

```
idle ──pin()──▶ requesting ──consumePinResult(confirmed)──▶ added
                     │
                     └──10 次轮询未确认──▶ unconfirmed（如实告知 + 手动步骤）
```

- 新增插件方法 `consumePinResult(): Promise<{ confirmed: boolean; appWidgetId: number | null }>`，
  与既有 `consumePendingRoute()` 同构（一次性读取），由 receiver 写入进程内状态。
- **为什么轮询而不是事件**：既有插件事件只有 `resumed`（`handleOnResume`），而 pin 确认发生在
  launcher 前台、我们大概率处于后台；轮询在面板可见期间进行，逻辑简单且不依赖事件投递。
- 文案：
  - `requesting` → 「已请求系统添加，请在系统弹窗里确认。」
  - `added` → 「已添加到桌面。」
  - `unconfirmed` → 「系统没有完成添加。可以长按桌面空白处 → 小工具 → 课表，把它拖到桌面上。」
  - **手动步骤常驻面板底部**（`WIDGET_PIN_MANUAL_HINT`），因为它在这类桌面上是唯一可靠路径。
- 预设卡片上的「✓ 已添加」只在 `added === preset.id` 或 `consumePendingRoute` 之后出现。

## D4. 删除渲染侧兜底

上一轮在 `ClassTrackWidget.provideGlance` 里加了 `applyPendingPreset(...)`（对"从未配置过的实例"
套用待消费预设 + 原子 `claim()`）。本任务**删除它**：

- 它的存在理由是"launcher 不拉配置页、我们不知道新实例 id"；回调现在给了 id。
- 它带来竞态（两个实例同时渲染时抢同一个槽位），真机上曾出现两条 `preset_applied`。
- 配置页预填保留（有些 launcher 会拉），两条路径共用同一个槽位、都是一次性消费。

## D5. 真机验证方法（本机 ColorOS / Android 16）

```bash
# 连接（无线调试端口每次都变，用 avahi 发现）
avahi-browse -rt _adb-tls-connect._tcp | grep -A1 port
adb connect <ip>:<port>
# 证据
adb shell dumpsys appwidget | grep -c classtrack          # 实例数（provider + N）
adb logcat -s ClassTrack.Widget                            # pin_requested / pin_result / pin_confirmed
adb logcat -b all | grep -iE "AddItemActivity|CONFIRM_PIN" # launcher 是否起了确认界面
adb shell dumpsys window | grep mCurrentFocus               # 确认界面有没有置前
```

- **桌面是 OEM 的**（`com.android.launcher`），因此"是否弹确认界面"不可控；验收以
  「不再撒谎 + 如实告知 + 手动步骤可达」为准（PRD A4）。
- 装的是 beta/release 包（非 debug）→ WebView devtools socket 不开，UI 驱动只能靠 `input tap` + 截图
  与日志；定位控件时用截图量测（uiautomator 拿不到 WebView 内部节点）。

## D6. 兼容与回滚

| 项 | 处理 |
|---|---|
| 存量实例 | 不受影响：本任务只改 pin 链路与文案 |
| 快照契约 | 不动（`schemaVersion = 1`） |
| 回滚 | `git revert` 即可；`consumePinResult` 是新增方法，旧代码不调用 |
| 「不支持」路径 | 保持：`supported=false` → 不请求、清槽位、显示手动步骤 |
