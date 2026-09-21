# 技术设计：多 provider + 快速失败探针 + 醒目标态框

> 配套 [prd.md](./prd.md)。只写「怎么做 / 为什么」，含被否方案。

## D1. 为什么多 provider 是这条链路的正解

`requestPinAppWidget` 的尺寸提示（`OPTION_APPWIDGET_MIN_WIDTH/HEIGHT`）**会被 launcher 忽略**
（实测 Launcher3 按 provider 声明的 `targetCellWidth/Height` 放置并显示「4 × 3」）。也就是说：
**想让用户拿到不同尺寸，唯一可靠的办法是注册多个 provider**，每个 provider 自己声明尺寸与预览。

由此还顺带解决两件事：

- **不依赖 pin 回调**：用户从系统拾取器拖放 → 实例天生就是那个 provider 的尺寸，样式由 provider 决定，
  ColorOS 丢不丢 pin 请求都无所谓。这是本任务真正的产品价值。
- **配一个确定性的"放置即带样式"**：`AppWidgetManager.getAppWidgetInfo(appWidgetId).provider`
  直接告诉我们这个实例来自哪个 provider → 映射到默认样式。不需要猜、不需要一次性槽位。

**被否方案**：
- 继续靠 pin extras 指定尺寸 —— 已被实测证伪。
- 用 `SizeMode.Responsive` 声明尺寸档位 —— 早前已被产品否掉（会让合成布局依赖宿主选的档位）。
- ~~把预设全做成 provider~~ —— **改为采纳**（产品 2026-09-21）：旧清单里的两个 4×3 先合成为一个（一个 4×3 条目靠几何规则决定单/双栏），
  最终五档 `2×2 / 2×3 / 4×2 / 4×3 / 6×3` 各一个 provider（2×3 是产品指定的手机主力位）；不合并的话拾取器里会出现两个都标 `4 × 3` 的条目。

## D2. provider 结构与映射

```
com.classtrack.app.widget
├─ ClassTrackWidget                 // 唯一的 GlanceAppWidget（渲染逻辑不复制）
├─ ClassTrackWidgetReceiver         // 4×3 provider：**沿用既有类名**（改名会让桌面上已有实例全部失效）
├─ Cell2x2WidgetReceiver            // 新：2×2
├─ Cell2x3WidgetReceiver            // 新：2×3（手机主力位）
├─ Cell4x2WidgetReceiver            // 新：4×2
├─ Cell6x3WidgetReceiver            // 新：6×3
└─ WidgetProviders.java             // 新：唯一的「有哪些 provider / 组件↔预设」真相源

WidgetProviders.renderers()  → List<ComponentName>（2×2、2×3、4×2、4×3、6×3）
WidgetProviders.presetFor(component) → WidgetPreset | null
WidgetProviders.allAppWidgetIds(context) → int[]（跨 provider 并集，pin 基线与回调集合用）
WidgetProviders.presetForAppWidgetId(context, appWidgetId) → WidgetPreset | null（放置即带样式用）
```

- receiver 只需三行：`class X : GlanceAppWidgetReceiver() { override val glanceAppWidget = ClassTrackWidget() }`。
  **必须用不同的类**：Android 的组件身份是类名，同一个类写两条 `<receiver>` 会被合并成一个组件。
- **保持既有 receiver 名不变**：现有实例的 provider 组件名是 `...ClassTrackWidgetReceiver`，
  改名会让**桌面上已有的实例全部失效**（系统按组件名找回 provider）。因此 **4×3 那个 provider 沿用旧类名**，
  其余四档（2×2 / 2×3 / 4×2 / 6×3，类名 `Cell2x2WidgetReceiver` 等）新增。旧类名与「4×3」语义不一致这一点，用注释与 `WidgetProviders` 的映射说清。
- 资源：`res/xml/class_track_widget_info.xml`（保留 = 4×3 那份，`targetCell` 仍是 4×3 不变）
  + 新增 2×2 / 2×3 / 4×2 / 6×3 四份 info XML；拾取器预览五份（见 D6）。
  标签用 receiver 的 `android:label`，逐字为 `课表 · 极简 2×2` / `课表 · 手机 2×3` / `课表 · 宽横 4×2` / `课表 · 标准 4×3` / `课表 · 宽屏 6×3`。
- **两个旧预设里的 4×3 合成为一个**（产品决定）：4×3 的 provider 直接具备双栏能力，
  由既有几何规则（宽 ≥ 320dp 且 宽 ≥ 高×1.25）决定最终是单栏还是双栏 —— 手机 4×3 退单栏、平板 4×3 分两栏，
  因此拾取器里不会出现两个都标 `4 × 3` 的条目。

## D3. 放置即带样式（替代「猜新实例」）

`provideGlance` 里读配置时，若该实例**三个键一个都没写过**，则以 provider 的预设作为默认：

```
config = readConfigSafely(context, id)                  // 读到的显式值永远优先（手动优先）
providerPreset = WidgetProviders.presetForAppWidgetId(context, appWidgetId)
if (config == null) config = WidgetPinConfirmation.planForProvider(providerPreset)   // 放置即带样式
```

- 判据与上一轮删掉的 `isConfigured` 不同：那里是**猜"哪个实例是新的"**（所以有竞态、已删除）；
  这里是**问系统这个实例属于谁**（无竞态、幂等、可测）。
- 只在「从未配置」时按 provider 写一次默认值：写盘而非每次现算，是为了让配置页语义一致，
  且用户手改过样式后不会被 provider 默认值覆盖。
- 配置页预填同样改成按 provider 预填（不再依赖 pin 槽位）。

## D3b. 尺寸变化 → 自动匹配预设（口径变更）

> **本条推翻 2026-09-20 的「禁止按尺寸阈值决定显示哪一块」口径**（产品 2026-09-21 明确要求「改尺寸后要匹配上」）。
> 放开范围**仅限挑选预设**；`SizeMode.Responsive` 与「离散档位决定合成布局」仍然禁止。

```
effectiveStyle = (config.layoutStyle == AUTO) ? WidgetPreset.match(wDp, hDp) : config.layoutStyle
effectiveWide  = (config.layoutStyle == AUTO) ? matched.wideLayout        : config.wideLayout
rowShape       = (config.layoutStyle == AUTO) ? matched.rowShape         : 由显式样式决定
```

- `LayoutStyle` 新增 `AUTO`，并**成为默认值**；缺省键读作 `AUTO`（向后兼容：老实例没写过键 → 自动）。
- **手动优先**：配置页显式选了 `day_list` / `next_up` / `compact` → 该实例不再自动匹配（用户的显式值永远赢）。
- **匹配规则 = 连续最近邻**（`WidgetPreset.match(wDp, hDp)`）：对五档预设的标定尺寸算归一化距离取最近；
  并列取**小档**（更保守，不会让内容在大档位看起来空）。规则是纯函数、可 JUnit 覆盖，
  **不引入 `if (height < N.dp)` 这类阈值分支**（那是被否掉的档位化做法）。
- 触发时机不需要新机制：尺寸变化时 Glance 会重新执行 `provideGlance`（`LocalSize` 变），
  且既有的 `onAppWidgetOptionsChanged` → `WidgetRefreshScheduler.enqueueImmediate` 已经会立刻续一次刷新。

## D4. 快速失败探针

```
请求发出（native 记 requestedAtMs）
    │
    ├─ supported=false / requested=false ─────────────▶ 立即失败（unsupported / cancelled）
    │
    └─ 已请求：Web 每 500ms 轮询 getPinAttempt()
         native 返回 { backgroundedAtMs }  ← MainActivity.onPause 记录
         PinAttempt.shouldFailFast(requestedAt, now, backgroundedAt) 为真
             ⇒ "系统没有弹出确认界面"（no_confirmation）+ 手动步骤
             ⇒ **但继续轮询 consumePinResult**：回调若到 → 成功并关闭模态
        10 秒仍无回调 ⇒ unconfirmed（如实文案，沿用上一轮）
```

- 为什么用「Activity 有没有退到后台」而不是别的东西：ColorOS 的失败现场是
  **`AddItemActivity` 起了却从不置前**，`mCurrentFocus` 一直是我们；而 AOSP 成功现场是它**置前**把
  我们挤到后台。这个差异在应用内**可观测**（`onPause`），无需任何权限，也不需要读系统窗口信息。
- 判定写成纯函数（Java，可 JUnit）：

```java
// 返回 true = 几乎可以确定系统没有弹出确认界面
static boolean shouldFailFast(long requestedAtMs, long nowMs, long backgroundedAtMs /* 0 = 从未退后台 */)
```

  规则：`nowMs - requestedAtMs >= PROBE_DELAY_MS(2000)` 且 `backgroundedAtMs == 0` 且 `nowMs >= requestedAtMs`
  （时钟回拨/负数一律**不判失败** —— 宁可多等，不可误报）。
- **诚实边界**：这是推断。文案写「系统没有弹出确认界面」，并附「如果你在桌面上看到了确认界面，请先把它点完」；
  同时**不停止监听**，回调到达即翻成成功。极少数"在同一任务里弹对话框"的 launcher 会让我们早判失败，
  但那种情况下用户看到的确认界面仍是可点的，点完回调照样到 → 最终状态仍正确。

## D5. 模态框状态机（Web）

```
              点击
               │
               ▼
        ┌─ requesting ──（原生返回 supported/requested）──┬─▶ unsupported（立即）
        │  模态已开：                                ├─▶ cancelled（立即）
        │ 「正在尝试添加…」                           └─▶ 轮询…
        │                                              ├─ 探针命中 ─▶ no_confirmation（+手动步骤，继续监听）
        │                                              ├─ 回调到达 ─▶ added（成功，自动关闭）
        │                                              └─ 10s 超时 ─▶ unconfirmed（如实文案）
        └──────────────────────────────────────────────────────────────┘
```

- 模态组件：Radix `Dialog`（不是 Sheet —— Sheet 是"从底部拉起的面板"，我们要的是**打断式**的醒目提示）。
- 状态与文案仍走**纯函数**（`resolvePinOutcome` / `pinOutcomeMessage` 扩展），由 vitest 钉住；
  文案里"按尺寸选哪个"直接复用 provider 标签常量，避免两处抄错。
- 面板本身保留（选预设、看说明）；模态只在**请求期间与失败后**出现。
- 关闭语义：用户关掉模态 → 面板里仍留着同样的文案（单一信息源，不因关闭而"丢失"失败事实）。

## D6. 拾取器预览

- **每个 provider 一份** `previewLayout`（五份），如实画出该 provider 在该尺寸下的样式（2×2 极简单栏、2×3 手机单栏、4×2 横铺、4×3 单栏那一档、6×3 双栏）；文件头注明「仅在 `W_REF/H_REF` 保持 2×2 标定、下界为 1.0 时成立」——沿用既有约定。
- `previewImage`（Android 12 以下只认它）：`scripts/generate-widget-preview.py` **参数化**为按 provider 产出五张（尺寸/内容与该 provider 一致），否则老机器上拾取器预览会撒谎；脚本与 info XML 都要在注释里写明同步条件。
- 门禁：`scripts/check-android-assets.js` 增加断言 —— APK 内**五份** info XML 存在，且 `targetCellWidth/Height` 分别为 2×2 / 2×3 / 4×2 / 4×3 / 6×3（防止改了 XML 却没人发现尺寸错位）。

## D7. 安全与回滚

| 项 | 处理 |
|---|---|
| `WidgetConfigActivity` id 校验 | 改为 `WidgetProviders.renderers().contains(info.provider)`；不再单 provider 硬编码（否则新 provider 的实例点"样式"会被拒） |
| pin 基线与回调集合 | 跨 provider 取并集（`WidgetProviders.allAppWidgetIds`） |
| 存量实例 | **不能改名/删除旧 receiver**；旧类名继续作为 **4×3** provider 存在，实例不受影响 |
| 旧预设 | 全部保留为 provider 档位（2×2 / 2×3 / 4×2 / 4×3 / 6×3）；两个 4×3 预设合成为一个（4×3 provider 具备双栏能力） |
| 配置页 | 三个显式样式选项不变，另加「自动（按尺寸）」作为**默认**；显式选择永远优先于自动匹配 |
| 回滚 | 按提交粒度 `git revert`：P1-P2（探针 + 模态）与 P3-P5（多 provider + 自动匹配）互不依赖，可分别回滚 |
