# 「添加到桌面」在真机上不生效：按 API 真实契约重做

## Goal

应用内「添加到桌面」在**真机（PKR110 / ColorOS / Android 16）上根本不生效**：点预设的「添加到桌面」
之后面板显示 **「✓ 已添加」**，但桌面上一个小工具都没有 —— 也就是说**我们向用户撒谎了**。

本任务按 `requestPinAppWidget` 的**真实契约**重做这条链路，并把 OEM launcher 会静默吞掉请求这一事实
如实呈现给用户。

## 现场证据（2026-09-21，真机 `192.168.5.18`，adb 无线调试）

| 观察 | 证据 |
|---|---|
| 面板一旦点过就显示「✓ 已添加」 | 截图：`pin-confirm-sheet.png`（`手机 · 极简/宽横` 显示"已添加"） |
| 实际没有任何实例 | `dumpsys appwidget \| grep -c classtrack` 恒为 **1**（只有 provider 条目） |
| 我们只凭「请求已受理」就宣布成功 | `phase=pin_result supported=true requested=true`（`requested` 来自 `requestPinAppWidget` 的返回值） |
| launcher **确实**收到了请求并起了确认界面 | 全量日志：`wm_create_activity ... com.android.launcher/com.android.launcher3.dragndrop.AddItemActivity ... android.content.pm.action.CONFIRM_PIN_APPWIDGET` |
| 但确认界面**从未出现在屏幕上** | 点击后 1s/4s 的截图都是我们自己的课表页；`mCurrentFocus` 始终是 `com.classtrack.app/.MainActivity`（HOME 之后再抓也没有） |
| 装的包不是旧的 | 拉下真机 APK：`classes.dex` 里有 `requestPinWidget`，JS bundle 里有 `phone_minimal/tablet_dual/tablet_wide` |
| launcher 是 OEM 的 | HOME = `com.android.launcher/.Launcher`（`com.android.common.LauncherApplication`，ColorOS） |

## API 真实契约（研究结论，务必写进 spec）

| 事实 | 出处 |
|---|---|
| `requestPinAppWidget` **立即返回**；`true` 只表示"请求已受理"，**不代表放下**；pin 失败**没有任何回调** | 官方 discoverability 文档；SO 64088622 |
| `successCallback` 的 `PendingIntent` **只在用户确认后触发**，并带 `EXTRA_APPWIDGET_ID`（官方示例用 `PendingIntent.getBroadcast`） | `AppWidgetManager` 文档；SO 47158435 |
| 是否显示确认 UI **完全由 launcher 决定**（"optionally showing confirmation UI"） | 官方文档 |
| 配置页（`android:configure`）由 **host/launcher** 拉起，不是应用控制；Android 14+ 有 BAL 加固导致它可能压根不启动 | SO 74953434 / SO 78585725 |
| ColorOS 16 有社区反馈：不启动配置页、直接放未配置的小工具 | OPPO 社区帖 |
| Redmi/MIUI 需要"桌面快捷方式"特殊权限，且可能不弹窗直接添加 | SO 57781688 |

**由此推翻上一轮的一个设计假设**：「`android:configure` 会让 launcher 在放置后拉起配置页」不成立 ——
上一轮为此写了"渲染侧猜哪个实例是新的"兜底（`WidgetPendingPreset.claim()` + `provideGlance` 里套用）。
本任务改为**用确认回调带回的 id 直接写预设**，确定且不依赖 launcher。

## Requirements

### R1 只有系统确认才算成功

- `requestPinAppWidget(provider, extras, successCallback)` 传一个 `PendingIntent`（广播到应用内 receiver）。
- 收到回调（带 `EXTRA_APPWIDGET_ID`）才算成功；**没有回调就绝不显示"已添加"**。
- 新增日志：`phase=pin_confirmed widget=<id>`（只含数值与白名单枚举）。

### R2 用回调带回的 id 直接落预设

- 回调里读待消费槽位（仍是一次性 + 5 分钟超时），若有预设则
  `GlanceAppWidgetManager.getGlanceIdBy(appWidgetId)` → `WidgetStyleState.write(...)` → 清空槽位 →
  请求一次刷新，让新实例按预设渲染。
- **删除渲染侧兜底**（`provideGlance` 里的 `applyPendingPreset` + `WidgetPendingPreset.claim()`）：
  它存在的唯一理由是"launcher 不拉配置页、我们不知道新实例是谁"，现在回调给了 id，兜底反而带来
  「两个实例抢同一预设」这类竞态。
- 配置页预填保留（有些 launcher 确实会拉），两条路径都以同一个槽位为源、都只消费一次。

### R3 Web 侧如实呈现（三态）

| 时机 | 文案 |
|---|---|
| 请求已发出、还没确认 | **中性**：「已请求系统添加，请在系统弹窗里确认。」 |
| 收到确认 | 「已添加到桌面。」 |
| ~10 秒仍未确认 | **如实**：「系统没有完成添加（部分厂商桌面会忽略这个请求）。可以长按桌面空白处 → 小工具 → 课表，把它拖到桌面上。」 |

- 手动步骤**常驻在面板底部**（不只失败时才出现）——在会静默吞请求的桌面上它才是唯一可靠路径。
- 探测方式沿用既有范式：新增 `consumePinResult()` 一次性读取（与 `consumePendingRoute` 同构），
  Web 侧轮询至多 10 次。

### R4 不支持时的行为不变

`isRequestPinAppWidgetSupported()` 为假 → 不发起请求、清空槽位、返回 `{supported:false}`，
面板显示手动步骤（既有行为，保留）。

### R5 真机验证（本任务的验收环境）

- 在 PKR110 上验证：**不再出现假"已添加"**；超时后出现如实文案与手动步骤。
- 若某次请求真的被确认（例如换 launcher 或系统允许），验证预设按 R2 落到该实例。
- 记录 launcher 侧证据（`AddItemActivity` 起没起、是否置前），写进 verification。

### R6 约束

- 不改 Web → 原生冻结快照契约（`schemaVersion = 1`）。
- 日志只含阶段名、数值、白名单枚举；**不含课程内容**。
- `WidgetConfigActivity` 的安全校验（id 归属）不变。

### 非目标

- 让 OEM launcher 弹窗（做不到，属 launcher 行为）。
- 自动打开 `WidgetConfigActivity`（有些 launcher 会自己拉；我们主动拉会与它竞争）。
- 绕过平台直接绑定实例（`bindAppWidgetIdIfAllowed` 需要系统权限 `BIND_APPWIDGET`）。

## Acceptance Criteria

- [x] **A1 回调落库有 JUnit 覆盖**：`WidgetPinConfirmation`（纯逻辑）覆盖「有效 id + 有待消费预设 → 用该预设的样式/大格子表现」「无预设 → 只记日志」「非法 id → 不写」；另加 `WidgetPinTargets`（回调 id 可信 / 发回 0 / 差集 / 基线未知 / 差集为空）与 `WidgetPinResult`、`WidgetPinBaseline` 两个一次性槽位的语义（共 157 例全绿）。
- [x] **A2 只有确认才成功**：`phase=pin_requested` / `pin_result` / `pin_confirmed`（另加 `pin_confirmed_unresolved`）齐备；`requested=true` 只进「等待确认」，不再被当作成功（模拟器实测三段日志，见 verification A2）。
- [x] **A3 Web 三态有测试**：三态判决抽成纯函数 `resolvePinStartOutcome` / `resolvePinPollOutcome` / `pinOutcomeMessage`，由 vitest 钉住（含「requesting 文案绝不含『已添加』」「unconfirmed 文案含『厂商桌面』并指向手动步骤」）；常驻手动步骤文案亦被覆盖。
- [ ] **A4 真机证据**（**部分待补**）：(d) 已在模拟器上完成——确认回调触发后 `tablet_dual` 预设真的落库（`wide=adaptive → wide=two_column`），且**发现回调 id 不可信（发回 0）并据此加了两级判决**；(a)(b)(c) 的**真机现场**证据待真机空闲时补（模拟器侧等价证据见 verification A4）——真机预期：`pin_confirmed` 不出现 → 10 秒后如实文案 + 常驻手动步骤，桌面无小工具但**不再撒谎**。
- [x] **A5 渲染侧兜底已移除**且无回归：删掉 `applyPendingPreset` / `WidgetStyleState.isConfigured` / `WidgetPendingPreset.claim()`；Android 单测 **157 例**全绿、`pnpm test` **80 例**全绿、`pnpm lint` 0 error、`pnpm cap:build:android` 通过。
- [x] **A6 spec 同步**：`android-home-widget.md` 重写 pin 条目（API 真实契约 + 确认 id 不可信 + 两段式目标解析 + `null` 基线语义 + 诚实文案 + 常驻手动步骤），并明确记下删除的「渲染侧兜底」。

## Notes

- 「装了但没放下」这类问题无法用 API 探测，因此**诚实文案就是最终产品行为**，不是临时兜底。
- 若将来要覆盖更多 OEM：可以把手动步骤做成图文（截图引导），但先把链路改对。
