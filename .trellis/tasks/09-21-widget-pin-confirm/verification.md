# 验收记录：回调式确认 + 两段式落预设 + 诚实文案

> 任务 [prd.md](./prd.md) / [design.md](./design.md) / [implement.md](./implement.md)
> 验证日期 2026-09-21。环境：`pk` 真机（PKR110 / ColorOS / Android 16）+ AOSP 模拟器（Medium_Phone，Android 16 / google_apis_playstore）。

## 结论

在**模拟器**上完成了端到端验证（回调送达 → 目标实例解析 → 预设真的落到该实例 → Web 三态文案）。
真机（ColorOS）上 launcher 始终不确认，因此真机能验的是「不再撒谎 + 如实告知」，逐项顺延到真机可用时补（见「残余」）。

**过程中发现并修掉了一个真机永远暴露不出来的缺陷**（详见 A4(d)）：AOSP Launcher3 的确认回调把
`EXTRA_APPWIDGET_ID` 发成 `0`，只信回调 id 的实现在模拟器上「成功了但预设静默丢失」。
这条只能靠模拟器发现——真机上 ColorOS 根本不发确认回调，那段代码永远不会被执行。

## A1 回调判决逻辑有 JUnit 覆盖 ✅

| 测试类 | 覆盖 |
|---|---|
| `WidgetPinConfirmationTest` | 有效 id + 待消费预设 → 用该预设的样式/大格子表现写入；预设未表达「已上完」策略 → 沿用默认；无预设 → 不写；非法 id → 不写 |
| `WidgetPinResultTest` | 一次性、超时（60s）、非法 id 不记、没确认时如实返回「没有」 |
| `WidgetPinTargetsTest` | 回调 id 可信 → 用它；发回 `0` / 未知 id / `-1` → 用差集；基线为 `null`（不知道）→ **绝不放宽成全集**；差集为空 → 什么都不做 |
| `WidgetPinBaselineTest` | 一次性、超时（5min）、`clear()`、空集合是有效记录、没记录 → `null`（不是空集合） |

- Android 单测：**157 例全绿**（上一轮 132 → 本轮 +25）。
- `pnpm test`：**80 例全绿**（14 个文件；新增三态判决 7 例 + Web 兜底 1 例）。

## A2 只有确认才成功 ✅

三段日志实测（模拟器，`adb logcat -s ClassTrack.Widget`）：

```
phase=pin_requested preset=phone_minimal
phase=pin_result supported=true requested=true      ← 只表示「请求已受理」，不再当成功
phase=pin_confirmed widget=0                        ← 真的收到系统确认（id 不可信，见 A4d）
```

未确认时**只有前两段**，Web 面板在 10 秒后进入 `unconfirmed`（见 A4b）。

## A3 Web 三态与常驻手动步骤 ✅

| 场景 | 实测结果 |
|---|---|
| 请求已发出、等确认 | `data-outcome="requesting"`，按钮文案「等待确认…」，卡片**不显示**「已添加」 |
| 收到确认 | 仅被确认的那张预设卡显示「已添加」（`tablet_dual` 卡 `已添加`，其余 4 张仍「添加到桌面」） |
| 10 秒未确认 | `data-outcome="unconfirmed"` + 「系统没有完成添加（部分厂商桌面会忽略这个请求）。请用下面的手动步骤添加。」**且 `已添加` 按钮数 = 0** |
| 手动步骤 | 面板底部常驻（`hasManual=true`、含「长按桌面空白处」），未请求时也可见 |

`resolvePinStartOutcome` / `resolvePinPollOutcome` / `pinOutcomeMessage` 为纯函数，由 vitest 钉住
（含「requesting 文案绝不含『已添加』」这条）。

## A4 端到端证据（模拟器；真机项待补）✅/⏳

### (a)(b) 不再出现假「已添加」，超时如实告知

```
14 秒后（模拟器上弹出确认界面但故意不点）：
{"outcome":"unconfirmed","msg":"系统没有完成添加（部分厂商桌面会忽略这个请求）。请用下面的手动步骤添加。","addedBtns":0}
```

对照修复前：点完立刻 `setAdded(preset)` → 卡片显示「✓ 已添加」（真机截图 `pin-confirm-sheet.png`）。

### (c) launcher 侧行为证据

| 环境 | `AddItemActivity` 是否启动 | 是否置前（`mCurrentFocus`） | 结果 |
|---|---|---|---|
| 真机 PKR110 / ColorOS | **是**（`CONFIRM_APPWIDGET`） | **从未**（一直是 `com.classtrack.app/.MainActivity`） | 一个小工具也没放下 |
| 模拟器 AOSP Launcher3 | 是（`QuickstepAddItemActivity`） | **是** | 放下了，并发出确认回调 |

即「是否弹窗/是否置前」完全由 launcher 决定（官方文档口径一致），应用侧无法探测，只能如实呈现。

### (d) 确认回调触发时，预设真的落库 ✅

```
phase=pin_confirmed widget=0            ← 回调 id = 0（不可信）
（差集解出真实新实例 id=10，写入成功：无 style_write_failed、无 pin_confirmed_unresolved）
phase=layout_metrics scale=153 wide=two_column dual=false   ← 修复前是 wide=adaptive
```

`tablet_dual` 预设带来的「双栏表现」确实生效了：该实例的 `wide_layout` 由 `adaptive` 变成 `two_column`。
修复前（在模拟器上还原过）此处是 `phase=style_write_failed` —— 预设静默丢失。

## A5 渲染侧兜底已移除、无回归 ✅

- 删除：`ClassTrackWidget.applyPendingPreset`、`WidgetStyleState.isConfigured`、`WidgetPendingPreset.claim()`。
- `WidgetPendingPresetTest` 相应改为 `peek` 不消费 / `consume` 才消费的语义。
- 门禁：`testDebugUnitTest` 157 例全绿；`pnpm test` 80 例全绿；`pnpm lint` 干净（0 error）；
  `pnpm cap:build:android` 成功（246 assets，index/APK 校验通过）。

## A6 spec 同步 ✅

- 重写 `android-home-widget.md` 的 pin 条目：API 真实契约（返回值 ≠ 放下、失败无回调、确认 id 不可信）、
  两段式目标解析、`null` 基线语义、删掉的渲染侧兜底、`exported=false` 与 `goAsync()` 的适用范围。
- 新增条目：OEM 桌面静默吞请求时文案必须如实说（含常驻手动步骤）。

## 残余风险与待办

1. **真机复验顺延**：A4(a)(b)(c) 的真机现场证据需等真机空闲时补（用户当时在用真机干别的事）。
   预期真机表现：`pin_confirmed` **不会**出现 → 面板 10 秒后显示如实文案，桌面仍无小工具但**不再撒谎**。
2. **回调 id 不可信是 launcher 行为差异**，不是我们能修的：两段式判决已覆盖「id 靠谱」与「id 是 0/未知」两种情况，
   但两者都不成立时（差集为空）我们选择「什么都不写」，用户会看到如实文案 + 手动步骤。
3. **模拟器上的 `-1` 分支未被现场触发**（真机与模拟器都没发过负 id）：仅由单测覆盖。
4. **等待时长固定 10 秒**：真机上若某 launcher 的确认界面延迟超过 10 秒才出现，用户会先看到「没有完成添加」，
   而随后确认仍会生效（回调照写预设）—— 文案不撒谎，但时序上会让人以为失败过一次。
5. **`WidgetPinBaseline` 与 `WidgetPendingPreset` 是两个同构的一次性槽位**：合并成一个「pin 请求」对象会更内聚，
   本轮为保持各自可测而分开放置。

## 过程缺陷（本轮踩到并记录的）

1. **改代码一直用 `bash` + Python 脚本/heredoc，没用 `read`/`replace` 锚点工具** —— 用户当场指出。
   后果：编辑对用户不可见、不可审、出错看不出偏移（本轮就有 4 次「替换范围多吃/少吃一行」的语法错误，
   其中两次只有在构建时才暴露）。已记入失败记忆，后续一律用锚点工具。
2. **一次 `replace` 把 `if` 的收尾 `}` 一起吃掉了**（`WidgetSnapshotPlugin`），靠随后的 `read` 发现并补回。
3. **`WidgetPinBaseline.consume()` 最初用空数组表示「没有记录」** —— 与「记录过空集合」不可区分，
   会让差集退化成「当前全集」并把预设盖到用户所有旧卡片上。写单测时才发现，改为返回 `null`。
4. **多行 `replace` 只替换了值、留下悬空的 `export const X =` 声明行** → vite 解析失败（`PARSE_ERROR`）。
5. **第一次跑真机/模拟器前的假设错了一半**：设计文档里写「回调带回的 id 是确定的」，实测不成立（见 A4d）。
   教训：**依赖外部 launcher 行为的假设，必须在能复现该行为的第二环境（模拟器）上执行一次**，
   真机不弹窗不等于这条代码路径正确。
