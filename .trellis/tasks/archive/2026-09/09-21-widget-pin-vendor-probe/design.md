# 技术设计：厂商分诊的 pin 探测 + 降级引导

> 需求 [prd.md](./prd.md) · 调研 [research.md](./research.md) · 执行计划 [implement.md](./implement.md)

## D1 边界与文件布局

沿用既有分层铁律：**纯逻辑放 Java（JUnit 可测）、渲染/Android 依赖放 Kotlin/Java 桥接、文案与用户可见状态放 Web（vitest 可测）**。
本轮**不新增 Kotlin 文件**，也不动 `ClassTrackWidget` / 刷新链路 / 快照格式。

### 原生新增（全部纯逻辑，`com.classtrack.app`）

| 文件 | 职责 |
|---|---|
| `WidgetVendorFamily.java` | 枚举 + `detect(String manufacturer, String brand)`。**只识别，不断言能力** |
| `WidgetVendorSupport.java` | `isModern(int sdkInt, WidgetVendorFamily family)`、`showsShortcutPermissionHint(...)`、`usesWidgetCenterExtras(...)`、`spaceHintApplies(...)` |
| `WidgetPinExtras.java` | `plan(...)` 产出「这次 extras 该带哪些键」，经 `WidgetPinExtrasSink` 接口落到 `Bundle` |
| `WidgetPinObservation.java` | 「无回调复核命中」的一次性槽位（与 `WidgetPinResult` 同范式，5 分钟超时） |
| `WidgetPinNavigation.java` | 导航判决（小米权限页 / vivo 组件库）+ vivo 跳转 URI 的**单一构造点**（纯函数） |

### 原生改动

| 文件 | 改动 |
|---|---|
| `WidgetPinBaseline.java` | 新增 `peek(long nowEpochMs)`：**不消费**地读基线（复核用）。`consume()` 语义不变，仍只给回调路径用 |
| `WidgetSnapshotPlugin.java` | `requestPinWidget` 改用 `WidgetPinExtras`；新增 `getPinCapability` / `consumePinObservation` / `openPinShortcutPermissionSettings` / `openWidgetGallery` 四个 `@PluginMethod` |

### Web 新增/改动

| 文件 | 改动 |
|---|---|
| `app/lib/native-widget-snapshot.ts` | 新增 `WidgetVendorFamily` 联合类型、`WidgetPinCapability`、`WidgetPinObservation`、`PinNavigationStep` 类型与四个方法（含 WebPlugin 的**拒绝式**兜底实现，与既有 `requestPinWidget` 同风格） |
| `app/features/schedule/widgetPinPresets.ts` | 单句 `WIDGET_PIN_MANUAL_STEPS` → `MANUAL_HINT_BY_FAMILY` 表 + `manualSteps(family, sizeList)`；新增 `resolveObservedHint` 与 `pinOutcomeMessage` 的新分支 |
| `app/features/schedule/hooks/useWidgetPin.ts` | 轮询末尾加一次复核；`getPinCapability` 取一次厂商信息 |
| `app/features/schedule/WidgetPinEntry.tsx` | 小米权限提示条 + vivo「去组件库添加」按钮；手动步骤改为按厂商取 |

**关键约束**：厂商族在原生（驱动 extras / 提示是否出现）与 Web（驱动文案）**各存在一份**，因此必须有跨层断言把它们钉在一起（D8）。

## D2 厂商族识别（纯函数）

```java
public enum WidgetVendorFamily { XIAOMI, OPPO, VIVO, HONOR, OTHER }

public static WidgetVendorFamily detect(String manufacturer, String brand)
```

- 输入：`Build.MANUFACTURER` 与 `Build.BRAND`（两个都传，因为不同 ROM 把信息放在不同字段）。
- 匹配：先 trim + `Locale.ROOT` 小写；命中**任一**关键字即归属该族。
  | 族 | 关键字（任一命中） |
  |---|---|
  | XIAOMI | `xiaomi`, `redmi`, `mi`, `poco` |
  | OPPO | `oppo`, `oneplus`, `realme` |
  | VIVO | `vivo`, `iqoo` |
  | HONOR | `honor`, `hihonor` |
  | OTHER | 其余（含 `null` / 空串 / `huawei`） |
- `huawei` 归 `OTHER`：华为现役机型已是鸿蒙（无 `AppWidget` 体系），能跑到这段代码的是鸿蒙 5.0 以下的 EMUI 老系统 → 按 D1（老系统）走通用文案。**这是刻意归类，不是遗漏。**
- 多个关键字同时命中时按**上表顺序**取第一个（`redmi` 与 `mi` 都命中 → XIAOMI；`oneplus` 与 `oppo` 不会同时出现）。顺序即优先级，写进 JUnit。

## D3 能力结论只来自行为探测

三段式，前两段是既有实现，第三段是本轮新增：

| 段 | 触发时机 | 输入 | 结论 |
|---|---|---|---|
| T0 前置 | 请求前 | `SDK_INT >= 26 && isRequestPinAppWidgetSupported()` | 仅用于「连请求都不发」的短路。**已知不可靠**（部分 ROM 恒真）→ **不产生任何"支持"结论** |
| T1 快探针 | 请求后 ~2s | `PinAttempt.shouldFailFast(requestedAt, now, backgroundedAt)` | 「系统没有弹出确认界面」——**推断**，非终态 |
| T2 确认回调 | 任意时刻 | `WidgetPinResult.consumeConfirmed(now)` | **成功**（唯一权威信号） |
| T3 无回调复核 | 等待窗口末尾 | `WidgetPinBaseline.peek` + 当前实例集合 | 有新实例 → **已添加（复核）**；否则 → 未确认 |

### T3 的判决复用既有纯函数，不新写一套

```java
// 复核就是把既有差集判决跑一遍，且刻意「没有可信回调 id」：
int[] fresh = WidgetPinTargets.resolve(baseline, WidgetProviders.allAppWidgetIds(context), -1);
boolean observed = fresh.length > 0;
```

- 复用 `WidgetPinTargets.resolve` 的两个既有保证：基线为 `null` → 返回空数组（**不判成功**）；差集为空 → 空数组。
- `WidgetPinBaseline.peek` 新增的理由：**`consume` 不能用于复核**。`consume` 会清空基线，而回调可能在复核之后到达（那时 T2 还要用基线的差集兜 `EXTRA_APPWIDGET_ID = 0` 的 AOSP 场景）。`peek` 只读不写，清理由 `record()` 覆盖 + 5 分钟超时保证。

### 优先级与互不覆盖

```
T2 命中 → added（confirmed）
T2 未命中 且 T3 命中 → added（observed）   ← T3 覆盖 T1 的「没有弹出确认界面」
T2/T3 都未命中 → T1 命中过 ? no_confirmation : unconfirmed
```

`T3` 覆盖 `T1` 是刻意的：卡片真的在桌面上了，还说「系统没有弹出确认界面」是自相矛盾。

### 「一次性」的落点

`WidgetPinObservation` 采用与 `WidgetPinResult` 完全相同的槽位范式：`record(now)` 写入、`consume(now)` 读取并清空、5 分钟超时。
计算放在 `consumePinObservation()` **被调用时**（懒计算），不在原生侧起定时器 —— 等待窗口的归属方是 Web 的轮询循环，原生只回答问题。
槽位里**只存数值**（命中时刻、新实例个数），不存 id、不存任何内容（沿用「状态与日志只含数值」的既有约束）。

## D4 为什么不做权限检测（含被否方案）

「小米的『创建桌面快捷方式』未开 → pin 静默失败」是真实约束，但**无法用公开 API 检测**：

- 公开 SDK 的 `AppOpsManager` 只有 7 个 `public static final int`（`MODE_*` + 2 个 flag），**没有** `OP_REQUEST_PIN_SHORTCUT`（`javap` 实测，见 research.md §1）。
- 网上流传的「`appOps.checkOpNoThrow(AppOpsManager.OP_REQUEST_PIN_SHORTCUT, uid, pkg)`」**编译不过**。
- 「反射 `android.app.MiuiAppOpsManager` + 硬编码操作码 22」属于私有 API 直连，且不同 MIUI 版本操作码不同。

→ 结论（D4）：**只提示、不判断**。提示条永远显示（在小米 + modern 上），点击只做导航，跳转失败静默降级。这样最坏情况只是「多了一句可能用不上的提示」，而不是「因为检测写错而给了错误的结论」。

## D5 小米 extras 的拼装点与可测性

`Bundle` 是 Android 类，为了让「该带哪些键」能被 JUnit 验证，把**决策**与**落地**分开：

```java
public interface WidgetPinExtrasSink {
    void putString(String key, String value);
    void putInt(String key, int value);
}

/** 纯决策：返回这次 extras 该带哪些键（不含任何 Android 类型）。 */
public static WidgetPinExtras.Plan plan(
        WidgetVendorFamily family, boolean modern,
        String packageName, String providerClassName,
        int minWidthDp, int minHeightDp);

public static void apply(Plan plan, WidgetPinExtrasSink sink);   // 机械落地
```

- `Plan` 的内容（全部为纯数据）：
  - `minWidthDp` / `minHeightDp`：**恒定**带上（沿用既有 `OPTION_APPWIDGET_MIN_WIDTH/HEIGHT`，是尽力而为的尺寸提示）。
  - `widgetCenterDetail`（`family == XIAOMI && modern`）：额外带 `addType = "appWidgetDetail"` 与 `widgetName = packageName + "/" + providerClassName`。
  - `widgetName` 的格式由 `Plan.widgetName(packageName, providerClassName)` 单点生成，JUnit 断言形如 `com.classtrack.app/com.classtrack.app.widget.Cell4x3WidgetReceiver`。
- 落地侧只有 4 行：

```java
WidgetPinExtras.apply(plan, new WidgetPinExtrasSink() {
    @Override public void putString(String key, String value) { extras.putString(key, value); }
    @Override public void putInt(String key, int value) { extras.putInt(key, value); }
});
```

- **不替代标准 pin**（D5 的产品决策在技术上的体现）：`successCallback`、基线记录、`PinAttemptState.reset` 全部照旧执行；`addType` 只是多带一个键。
- 回滚粒度：把 `plan(...)` 里的 `widgetCenterDetail` 恒置 `false`，就退回标准 pin，其他三层不受影响。
- **前置探测先于 extras**（prd R6 / D13）：小米官方给了 ContentProvider 探测接口，所以「要不要带 `addType`」不是拍脑袋，而是**先问系统**：
  - `widgetCenterDetail = family == XIAOMI && modern && detailPageSupported`
  - 探测放在 Android 侧薄封装里（`WidgetVendorProbe`），**结果按进程缓存**；纯逻辑只接收 `boolean detailPageSupported` 这个入参，因此 `WidgetPinExtrasTest` 不需要 Android 环境就能覆盖「探测为假 → 不带 extras」。
  - 探测失败（Provider 不存在、抛异常、返回 `null`）一律当 `false` → 退回标准 pin + 引导。**探测不是能力结论的唯一来源**（D3 仍然成立）：它只回答「这台小米机器有没有详情页」。

## D6 导航判决：小米权限页 + vivo 组件库（可注入，不抛异常）

照既有 `requestExactAlarmPermission` 的范式：**只跳设置页，不假装已授权**。三条分支：

```java
/** 导航判决（纯函数，输入是"哪个 Intent 能解析"）。 */
public static Step permissionStep(boolean miuiResolvable, boolean appDetailsResolvable);
// → MIUI_PERMISSION | APP_DETAILS | NONE
```

实现（Android 侧）：

1. 构造 MIUI intent（`miui.intent.action.APP_PERM_EDITOR` + `setClassName("com.miui.securitycenter", "com.miui.permcenter.permissions.PermissionsEditorActivity")` + `extra_pkgname` + `extra_type=1`）。
2. `resolveActivity` 可解析 → 走 `MIUI_PERMISSION`。
3. 否则走 `APP_DETAILS`（`Settings.ACTION_APPLICATION_DETAILS_SETTINGS` + `package:` URI）。
4. 两个都不可解析 / 任何 `RuntimeException` → `NONE`，只记一条诊断（phase + 白名单枚举值），**不弹错、不崩溃**。

`startActivity` 必须 `try/catch (RuntimeException)`：MIUI 的权限页在部分版本上存在但**不可导出**，`resolveActivity` 通过而 `startActivity` 抛 `SecurityException` —— 这时要把它当成 `NONE` 而不是崩溃。返回 `{launched, step}` 给 Web。


### vivo：跳转原子组件库详情页（R9 / D11）

官方文档给了两条可跳转的信息（research §3.4），这里同样只做**导航**，不做能力探测：

- **权限**：清单声明 `<uses-permission android:name="com.bbk.launcher2.permission.JUMP_ORIGIN" />` —— 只为跳转而声明，不授予任何系统能力。
- **URI 构造是纯函数**，集中在 `WidgetPinNavigation.widgetGalleryUri(...)`：
  ```
  vivo://com.bbk.launcher2/origin?pkg=<包名>&classname=<provider 完整类名>&comType=0&locType=1
  ```
- **官方文档自相矛盾**：同一节正文写「`pkg`、`classname`、`cmpType`、`locType`」，而示例代码写 `comType`。→ 参数名必须是**具名常量**（`VIVO_GALLERY_COMP_TYPE_KEY = "comType"`）并在注释里记录这个矛盾；真机验证（V5）若发现不对，只改这一处。
- **判决**：`resolveActivity` 不可解析 → `NONE`；`startActivity` 抛任何 `RuntimeException` → `NONE`；两条都只记一条诊断，不弹错、不崩溃。
- 未上架时该跳转很可能无效（V5）→ **手动步骤必须继续常驻**，按钮只是多给一条路。
- `classname` 的取值 = 该档 provider 的完整类名（与 `WidgetPinExtras.widgetName` 用的是同一个值，复用同一个取法，不写第二份）。
## D7 Web 侧：厂商只影响文案

```ts
export type WidgetVendorFamily = 'xiaomi' | 'oppo' | 'vivo' | 'honor' | 'other'

export const MANUAL_HINT_BY_FAMILY: Record<WidgetVendorFamily, string>            // 见 prd R5 表
export function manualSteps(family: WidgetVendorFamily, sizeList: string): string
export function resolvePinOutcomeFromObservation(observation: WidgetPinObservation): WidgetPinOutcome
```

- `manualSteps` 的 `sizeList` 参数来自 `WIDGET_PIN_PRESETS`（既有做法），尺寸清单不会手写漂移。
- 新增 outcome 值 `'added_observed'`：`pinOutcomeMessage` 与 `resolvePinModalState` 的 `switch` 都是穷尽的，加值会让**编译器/TS 立刻指出漏改点** —— 这是选独立值而不是加一个布尔字段的原因。
- 复核命中的文案（R4）：「检测到桌面上新增了一张课表卡片。如果不是你刚添加的，请忽略。」；回调命中仍是 `null`（不给提示，`added` 模态自己会收起）。
- PWA/浏览器：`isNativeWidgetSnapshotAvailable()` 为假 → 三个新方法一次都不会被调用。WebPlugin 兜底实现**必须 reject 而不是返回假成功**（与既有 `requestPinWidget` 同风格），这样「忘了加守卫」会在开发期就暴露。

## D8 跨层断言与门禁

| 断言 | 落在哪 | 防的是 |
|---|---|---|
| `WidgetVendorFamily` 的枚举名集合 ↔ Web 的 `WidgetVendorFamily` 联合类型 | `widgetPinPresets.test.ts`（读 `WidgetVendorFamily.java` 源码，正则取枚举名） | 两侧漏加一族；文案表缺 key |
| `MANUAL_HINT_BY_FAMILY` 每个 key 都有非空文案，且**没有**任何地方直接引用已删除的单句常量 | 同上 | 回到「一句通用文案」 |
| 四家文案各含其关键节点词（安卓小部件 / 插件 / 应用挂件 / 窗口小工具） | 同上 | 文案被改回通用句 |
| `WidgetVendorSupport.isModern` 的 33/34 边界 | `WidgetVendorSupportTest` | 门槛写错 |
| `WidgetPinExtras.plan` 的四组情况（小米·modern / 小米·旧 / 非小米·modern / 非小米·旧） | `WidgetPinExtrasTest`（假 sink） | extras 串台 |
| `WidgetPinBaseline.peek` 不消费、超时返回 `null`、没记录返回 `null` | `WidgetPinBaselineTest`（扩既有） | 复核把回调路径的基线吃掉 |
| `WidgetPinObservation` 一次性 + 超时 | `WidgetPinObservationTest` | 陈旧命中串到下一次操作 |
| `WidgetPinNavigation` 的小米三条分支 + vivo URI 形态 + `comType` 常量 | `WidgetPinNavigationTest` | 跳转判决写错 / 参数名被顺手「修正」成 `cmpType` |

门禁命令沿用既有：`pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm android:check-assets` / `./android/gradlew -p android testDebugUnitTest`。

## D10 荣耀：只有文案，没有能力分支

- 荣耀官方文档明确「遵循 Google 原生 widget 开发规范」（research §3.2）→ **没有可加的厂商能力**。因此荣耀身上**只有一处**厂商相关代码：`MANUAL_HINT_BY_FAMILY.honor` 的文案（入口叫「服务卡片 / 桌面卡片」→「窗口小工具 / 经典小工具」，通用句里的「小工具」在荣耀上找不到）。
- 判据写进 JUnit（A12）：`WidgetVendorSupport` 的三个能力开关对 `HONOR` **全部为 `false`** ——
  - `showsShortcutPermissionHint(...)` = false（小米专属）
  - `usesWidgetCenterExtras(...)` = false（小米专属）
  - `showsWidgetGalleryButton(...)` = false（vivo 专属）
- 这样「荣耀有没有专属行为」变成一个**可断言的事实**，而不是靠人记得不去加。

## D11 vivo：跳转组件库（已纳入）

- 判决与 URI 构造见 D6 的 vivo 小节。
- 唯一影响面：Web 面板多一个按钮 + 清单多一条**只为跳转**的权限声明 + `WidgetPinNavigation` 一个纯函数与其单测。
- 与 `WidgetPinExtras` 的关系：`classname` 参数复用 provider 完整类名的取法，**不新增第二份拼装逻辑**（code-reuse 约束）。

## D9 兼容性与回滚

### 兼容性矩阵

| 环境 | 行为 |
|---|---|
| SDK < 34（含 MIUI 14 / realme UI 4 / Funtouch OS 13 / EMUI） | 厂商族虽可识别，但 `modern=false` → **文案、extras、权限提示全部与改动前逐字一致**（由 `WidgetVendorSupport` 单点把关，A2 有断言） |
| SDK >= 34 + 四家 | 厂商专属文案 + （小米）extras 与权限提示 |
| SDK >= 34 + 未识别厂商 | 通用文案（`OTHER`） |
| 浏览器 / PWA / iOS | 四个新插件方法一次都不调用；面板本身不渲染 |
| SDK >= 34 + 荣耀 | 只用荣耀的入口命名文案；三个能力开关全 `false`（A12 断言） |
| SDK >= 34 + vivo | 专属文案 + 「去组件库添加」按钮；跳转失败静默退回文案 |
| SDK >= 34 + OPPO | 只有 OPPO 版手动步骤；**不给任何按钮**（D12） |

### 回滚点（五处互相独立，可单独回滚）

| 回滚什么 | 怎么回滚 | 影响面 |
|---|---|---|
| 厂商文案 | `manualSteps()` 恒返回 `MANUAL_HINT_BY_FAMILY.other` | 只影响文案 |
| 无回调复核 | `consumePinObservation()` 恒返回 `{observed:false,count:0}` | 回到「只认回调」 |
| 小米 extras | `plan()` 的 `widgetCenterDetail` 恒 `false` | 回到标准 pin |
| 权限提示 | `showsShortcutPermissionHint()` 恒 `false` | 提示条消失 |
| vivo 组件库跳转（V5 证伪，或参数名确实是 `cmpType`） | 删掉按钮与 `openWidgetGallery`；或只改 `VIVO_GALLERY_COMP_TYPE_KEY` 一个常量 | 只影响 vivo 的这一个按钮 |

### 已知残余风险（记录，不修）

1. **复核无法区分「我们 pin 的」与「用户自己手动加的」**：差集只知道多了实例。已用文案限定句（R4）如实表达，接受（D2）。
2. **回调在复核之后到达**：此时基线已被 `peek`（未消费）保留，T2 仍能走差集；但若 T2 的 `EXTRA_APPWIDGET_ID` 是 `0` 且此刻实例集合已变化，仍可能解析不出 → 不写预设。用户已经看到「已添加」，损失只是样式没落上，与既有行为同级。
3. **T3 只在 Web 轮询跑到第 10 次时计算**：若用户在 10 秒内关掉面板，复核不会执行。这是可接受的（用户离开了这个界面就没有反馈的落点）。
4. **vivo 跳转是单点依赖**：scheme 与参数名来自 vivo 官方文档，而文档自身在 `comType` / `cmpType` 上自相矛盾。→ 用具名常量 + 单测钉住 URI 形态，失败静默退回文案（用户的损失只是一次无效点击）。
