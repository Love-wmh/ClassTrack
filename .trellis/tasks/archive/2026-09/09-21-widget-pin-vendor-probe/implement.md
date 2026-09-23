# 执行计划：厂商分诊的 pin 探测 + 降级引导

> 需求 [prd.md](./prd.md) · 设计 [design.md](./design.md) · 调研 [research.md](./research.md)
> **所有命令在 worktree 里执行**：`/media/yetongy/64E8E38AE8E358B65/CodeFiles/SleepDown课程表/ClassTrack-wt/widget-pin-vendor-probe`

> **产物位置**：需求/设计/计划/验收四份文档留在主仓 `ClassTrack/.trellis/tasks/09-21-widget-pin-vendor-probe/`
> （Trellis 只从那里读任务状态），**代码改动只在上面这个 worktree 里做**。两边都不复制对方的内容，避免分叉。
> `.trellis/tasks/` 下的活动任务目录是未被 git 跟踪的，因此 worktree 里看不到它们 —— 需要读文档时用绝对路径。

## 阶段总览

| 阶段 | 产物 | 完成定义（就是这条命令过） |
|---|---|---|
| P0 | 基线取证 | 基线门禁结果已记录（含既有失败项，若有） |
| P1 | `WidgetVendorFamily` / `WidgetVendorSupport` + 各自 JUnit | `./android/gradlew -p android testDebugUnitTest --tests '*WidgetVendor*'` |
| P2 | `WidgetPinBaseline.peek` / `WidgetPinObservation` + JUnit | `./android/gradlew -p android testDebugUnitTest --tests '*WidgetPin*'` |
| P3 | `WidgetPinExtras` + `WidgetPinNavigation` + 插件四个新方法 + `requestPinWidget` 改造 | 同上命令全量过 + 手写日志核对 |
| P4 | Web 层类型 / 文案表 / hook / 面板 | `pnpm test -- widgetPinPresets native-widget-snapshot` |
| P5 | 跨层断言 | `pnpm test` |
| P6 | 全门禁 | 见 P6 命令组 |
| P7 | 设备验收 + 开放项 V1–V6 | 截图/日志证据写进 `verification.md` |
| P8 | 收尾 | `verification.md` 落盘、验收清单勾选 |

---

## P0 基线取证（不改任何代码）

目的：把「改动前的真实状态」固定下来，避免后面把既有问题算到本轮头上。

```bash
cd /media/yetongy/64E8E38AE8E358B65/CodeFiles/SleepDown课程表/ClassTrack-wt/widget-pin-vendor-probe
git log --oneline -1
git status --short
pnpm test 2>&1 | tail -20
./android/gradlew -p android testDebugUnitTest 2>&1 | tail -20
```

记录：Web 例数、原生例数、有无既有失败。**既有失败必须原样记录并在最终报告里如实说明**，不得顺手修、也不得掩盖。

> 已知上下文（不必重查）：`master` 主工作区里另一个会话正在并发实现 `09-21-widget-scope-narrowing`（新增 `WidgetProviderScope` 与 3×2/1×2 两个 provider）。本 worktree 从 `647b6ea` 切出，**不含**那些改动，两个任务互不阻塞。

## P1 原生纯逻辑：厂商族 + 版本门槛

新增：

- `android/app/src/main/java/com/classtrack/app/WidgetVendorFamily.java`
  - `enum WidgetVendorFamily { XIAOMI, OPPO, VIVO, HONOR, OTHER }`
  - `static WidgetVendorFamily detect(String manufacturer, String brand)`（关键字与优先级见 design D2）
- `android/app/src/main/java/com/classtrack/app/WidgetVendorSupport.java`
  - `static final int MODERN_SDK_FLOOR = 34`（带注释说明 HyperOS 1 / ColorOS 14 / OriginOS 4 / MagicOS 8 的对应关系）
  - `static boolean isModern(int sdkInt, WidgetVendorFamily family)`
  - `static boolean showsShortcutPermissionHint(int sdkInt, WidgetVendorFamily family)` → `family == XIAOMI && isModern(...)`
  - `static boolean usesWidgetCenterExtras(int sdkInt, WidgetVendorFamily family, boolean detailPageSupported)` → 仅 `XIAOMI && isModern(...) && detailPageSupported`（**探测结果为假就不带这组 extras**，退回标准 pin）
  - `static boolean showsWidgetGalleryButton(int sdkInt, WidgetVendorFamily family)` → 仅 `VIVO && isModern(...)`

  **不设 `spaceHintApplies`**：空间不足的补充句四家都要，直接写进各自的文案里，不做一个只影响文案的开关（否则「荣耀是否零能力分支」这条断言会被它搞模糊）。
- 测试：`WidgetVendorFamilyTest` / `WidgetVendorSupportTest`
  - 四家关键字各一例 + 大小写混合 + `null` + 空串 + `huawei` → `OTHER`
  - 优先级：`manufacturer="Redmi", brand="Xiaomi"` → `XIAOMI`；`manufacturer="OnePlus", brand="OnePlus"` → `OPPO`
  - `isModern(33, XIAOMI) == false` / `isModern(34, XIAOMI) == true` / `isModern(36, OTHER) == false`
  - `showsShortcutPermissionHint` 仅小米 + modern 为真；`usesWidgetCenterExtras` 同理；`showsWidgetGalleryButton` 仅 vivo + modern 为真
  - **A12 的判据**：上述三个开关对 `HONOR` **全部为 `false`**（荣耀只有文案，没有能力分支）

门禁：
```bash
./android/gradlew -p android testDebugUnitTest --tests '*WidgetVendor*'
```

**不变量**：这个阶段的产物**只**回答「是谁、够不够新」，不回答「能不能 pin」。任何 `supportsPin` 形状的 API 都不许出现在这两个类里（design D3）。

## P2 原生复核：`peek` + 观察槽位

改 `WidgetPinBaseline.java`：

- 新增 `public static synchronized int[] peek(long nowEpochMs)`
  - 语义与 `consume` 完全一致（**除了不清空**）：没记录 / 已超时 → `null`；空集合是有效记录 → `new int[0]`。
- 扩 `WidgetPinBaselineTest`：
  - `peek` 连续调两次结果相同（不消费）
  - `peek` 之后 `consume` 仍能拿到同一集合（这是「回调在复核之后到达」能兜住的前提）
  - `peek` 超时 → `null`；没记录 → `null`；空集合记录 → 空数组而不是 `null`

新增 `android/app/src/main/java/com/classtrack/app/WidgetPinObservation.java`：

- 与 `WidgetPinResult` 同范式：`record(int freshCount, long nowEpochMs)` / `static int consume(long nowEpochMs)`（返回新实例个数，`0` 表示没有观察结论）、`static clear()`、`TIMEOUT_MS = 5 * 60 * 1000L`
- 只存数值：命中时刻 + 新实例个数。**不存 id**（design D3）
- 测试 `WidgetPinObservationTest`：一次性、超时、`freshCount <= 0` 不记、`clear`、陈旧结论不串到下一次

门禁：
```bash
./android/gradlew -p android testDebugUnitTest --tests '*WidgetPin*'
```

## P3 原生桥接：extras 计划 + 插件三个方法

### P3.1 `WidgetPinExtras.java`（纯决策 + 机械落地）

按 design D5 的签名实现 `Plan` / `plan(...)` / `apply(Plan, WidgetPinExtrasSink)` / `widgetName(pkg, cls)`。
测试 `WidgetPinExtrasTest` 用**假 sink**（`Map<String,Object>`）覆盖四组：

| family | modern | 期望 |
|---|---|---|
| XIAOMI | true | 含 `addType=appWidgetDetail`、含 `widgetName`（形如 `com.classtrack.app/com.classtrack.app.widget.Cell4x3WidgetReceiver`）、含尺寸键 |
| XIAOMI | false | **不含** `addType` / `widgetName`，含尺寸键 |
| OPPO | true | 不含 `addType` |
| XIAOMI | true（但探测 `detailPageSupported=false`） | **不含** `addType`（探测不支持详情页 → 退回标准 pin） |
| OTHER | false | 只有尺寸键 |

### P3.2 `WidgetSnapshotPlugin.java`

1. `requestPinWidget`：把现有那段手写 `extras.putInt(...)` 换成
   `WidgetPinExtras.apply(WidgetPinExtras.plan(family, modern, getContext().getPackageName(), provider.getClassName(), w, h), sink)`。
   **其余一律不动**：`WidgetPendingPreset.set`、`WidgetPinBaseline.record`、`PinAttemptState.reset`、`successCallback` 全部保留。
   厂商族与 `modern` 由 `WidgetVendorFamily.detect(Build.MANUFACTURER, Build.BRAND)` + `WidgetVendorSupport.isModern(Build.VERSION.SDK_INT, family)` 现算。
2. 新增 `@PluginMethod getPinCapability(PluginCall)` → `{family: "xiaomi", modern: true, shortcutHint: true}`（无副作用，可重复调用）。
3. 新增 `@PluginMethod consumePinObservation(PluginCall)` → 懒计算复核：
   ```java
   int[] baseline = WidgetPinBaseline.peek(now);          // 不消费
   int[] fresh = WidgetPinTargets.resolve(baseline, WidgetProviders.allAppWidgetIds(context), -1);
   // fresh.length > 0 → WidgetPinObservation.record(fresh.length, now)，并返回 {observed:true, count:n}
   // 确认回调已经到过（WidgetPinResult 已有值）时一律 observed=false —— 回调路径优先
   ```
   一律返回 `{observed, count}`，不返回 id。
4. 新增 `@PluginMethod openPinShortcutPermissionSettings(PluginCall)` → 按 design D6 的三分支，返回 `{launched, step}`。
   `startActivity` 包 `try/catch (RuntimeException)`，失败按 `NONE` 处理。
5. 诊断：`WidgetDiagnostics` 只加**数值与白名单枚举**（family 名、observed、count、step、launched），不得记录包名之外的用户数据。
6. 新增 `@PluginMethod openWidgetGallery(PluginCall)`（design D6 的 vivo 小节 / D11）：`setPackage("com.bbk.launcher2")` + `setData(widgetGalleryUri(包名, provider 类名))`；`resolveActivity` 不可解析 → `{launched:false, step:'none'}`；`startActivity` 抛 `RuntimeException` → 同样。**一律不抛给 Web**。
7. **清单**：新增 `<uses-permission android:name="com.bbk.launcher2.permission.JUMP_ORIGIN" />`，并在清单注释里写明「只为跳转组件库而声明，不授予任何系统能力」。
8. **小米前置探测**（design D5 / prd R6）：新增 `WidgetVendorProbe`（Android 侧薄封装，不写纯逻辑）：
   ```java
   Uri uri = Uri.parse("content://com.miui.personalassistant.widget.external");
   // 两个方法都问；任何异常/空 Bundle/键缺失 → false
   getContentResolver().call(uri, "isMiuiWidgetSupported", null, null);
   getContentResolver().call(uri, "isMiuiWidgetDetailPageSupported", null, null);
   ```
   结果按进程缓存一次（`static volatile Boolean` 或等价），供 `usesWidgetCenterExtras(..., detailPageSupported)` 使用；**非小米族不调用**（省一次跨进程 call，也避免在别家触发奇怪行为）。
   探测失败一律 `false` → 走标准 pin + 引导，**绝不**因此崩溃或阻塞。

门禁：
```bash
./android/gradlew -p android testDebugUnitTest
```

**人工核对**（本阶段必须做，别只信测试）：`adb logcat -s ClassTrack.Widget` 走一次 pin，确认 `phase=pin_requested` 之后 extras 相关诊断里 family 正确。


### P3.3 `WidgetPinNavigation.java`（纯函数，导航判决）

- `static String widgetGalleryUri(String packageName, String providerClassName)`：构造 `vivo://com.bbk.launcher2/origin?pkg=...&classname=...&comType=0&locType=1`。
  **`comType` 必须来自具名常量** `VIVO_GALLERY_COMP_TYPE_KEY`，常量注释里写明「vivo 官方同一节正文写 `cmpType`、示例代码写 `comType`，本实现依示例代码；V5 真机确认后如需改动只改这一个常量」。
- `static Step shortcutPermissionStep(boolean miuiResolvable, boolean appDetailsResolvable)` → `MIUI_PERMISSION | APP_DETAILS | NONE`（design D6 的小米三条分支）。
- `static Step galleryStep(boolean galleryResolvable)` → `WIDGET_GALLERY | NONE`。
- 测试 `WidgetPinNavigationTest`：
  - URI 逐字断言（含 `comType=0`、`locType=1`、包名与类名都被 URL 编码到该有的位置）；**包名/类名含特殊字符时不产生畸形 URI**（或明确用不编码并在测试里钉住这个选择）。
  - 小米：两个都不可解析 → `NONE`；只有应用详情页可解析 → `APP_DETAILS`；MIUI 页可解析 → `MIUI_PERMISSION`。
  - vivo：可解析 / 不可解析两条。
  - **不抛异常**：三个判决函数对任意布尔组合都返回枚举（穷尽断言）。
## P4 Web 层：类型、文案表、hook、面板

### P4.1 `app/lib/native-widget-snapshot.ts`

- 新增类型：
  ```ts
  export type WidgetVendorFamily = 'xiaomi' | 'oppo' | 'vivo' | 'honor' | 'other'
  export type WidgetPinCapability = { family: WidgetVendorFamily; modern: boolean; shortcutHint: boolean }
  export type WidgetPinObservation = { observed: boolean; count: number }
  export type PinPermissionStep = 'miui_permission' | 'app_details' | 'none'
  export type PinNavigationStep = 'miui_permission' | 'app_details' | 'widget_gallery' | 'none'
  ```
- 接口新增四个方法：`getPinCapability()` / `consumePinObservation()` / `openPinShortcutPermissionSettings()` / `openWidgetGallery()`
- `WebPlugin` 兜底实现**必须 reject**（照既有 `requestPinWidget` 风格），不得返回假成功

### P4.2 `app/features/schedule/widgetPinPresets.ts`

- 删掉单一常量 `WIDGET_PIN_MANUAL_STEPS`，改为 `MANUAL_HINT_BY_FAMILY: Record<WidgetVendorFamily, string>`（五条，内容见 prd R5）+ `manualSteps(family, sizeList)`。
- 四家文案末尾统一接上空间不足补充句（`WIDGET_PIN_SPACE_HINT`，只在 `family !== 'other'` 时拼）。
- `WidgetPinOutcome` 新增 `'added_observed'`；`pinOutcomeMessage` / `resolvePinModalState` 补分支：
  - `'added_observed'` 的文案 = `WIDGET_PIN_OBSERVED_HINT`（含「如果不是你刚添加的，请忽略」）
  - `resolvePinModalState('added_observed', …)` → `'added'`（模态相同，只有提示语不同）
- 新增 `resolvePinOutcomeFromObservation(observation)` → `'added_observed' | 'unconfirmed'`

### P4.3 `app/features/schedule/hooks/useWidgetPin.ts`

- 挂载时取一次 `getPinCapability()`（`supported` 为假时不调用），存进 state 供面板用
- 轮询循环：`POLL_ATTEMPTS` 的最后一次（`attempt === POLL_ATTEMPTS - 1`）在 `consumePinResult()` 未命中后，再调一次 `consumePinObservation()`：
  - `observed` → `setAdded(preset)` + `setOutcome('added_observed')` + `return`
- 顺序铁律：**先回调、后复核**。复核命中要覆盖已经设过的 `'no_confirmation'`（design D3 优先级）
- 新增 `openShortcutPermission()`：调 `openPinShortcutPermissionSettings()`，失败静默（只保证不抛到 UI）
- 新增 `openWidgetGallery()`：调 `openWidgetGallery()`，同一套静默语义

### P4.4 `app/features/schedule/WidgetPinEntry.tsx`

- 手动步骤改为 `manualSteps(capability.family, sizeList)`
- 小米 + modern 时渲染权限提示条 + 「去开启」按钮（`capability.shortcutHint`）
- 文案不得声称跳转一定能到位（prd R7）
- vivo + modern 时渲染「去组件库添加」按钮（`capability.galleryButton`），点击调上面的 `openWidgetGallery()`；文案写成「打开组件库」，**不得**承诺一定能看到课表（prd R9）

门禁：
```bash
pnpm test -- widgetPinPresets native-widget-snapshot
pnpm typecheck
```

## P5 跨层断言

扩 `app/features/schedule/widgetPinPresets.test.ts`：

1. **读 `WidgetVendorFamily.java` 源码**，正则取出枚举名集合（小写化）→ 断言与 Web 的 `WidgetVendorFamily` 联合类型**完全相等**（两侧漏加一族就红）。这是本轮最关键的一条跨层断言。
2. `MANUAL_HINT_BY_FAMILY` 每个 key 都有非空文案；且 `Object.keys(...)` 与厂商族集合相等。
3. 关键节点词各自出现：小米含「安卓小部件」、OPPO 含「卡片」**与**「搜索」、vivo 含「应用挂件」、荣耀含「窗口小工具」。
4. 四家文案都含 `WIDGET_PIN_SPACE_HINT` 的关键词；`other` 不含。
5. 全仓搜索断言：**没有任何文件**再引用 `WIDGET_PIN_MANUAL_STEPS`（用读源码的方式断言，不靠 grep 命令）。
6. `'added_observed'` 的文案含「如果不是你刚添加的」；回调命中（`'added'`）的文案为 `null`。
7. 荣耀：`MANUAL_HINT_BY_FAMILY.honor` 含「服务卡片」与「窗口小工具」；且**没有任何** Web 侧分支以 `honor` 为条件去改 extras / 提示 / 按钮（面板只在 `xiaomi` / `vivo` 下多东西）。
8. vivo：`MANUAL_HINT_BY_FAMILY.vivo` 含「应用挂件」；`openWidgetGallery` 只在 `vivo` 下有可点的调用点。

同时保留既有断言不动：预设表 ↔ `WidgetProviderRegistry.java` ↔ `widget_info_*.xml` ↔ `strings.xml`。

门禁：
```bash
pnpm test
```

## P6 全门禁

```bash
cd /media/yetongy/64E8E38AE8E358B65/CodeFiles/SleepDown课程表/ClassTrack-wt/widget-pin-vendor-probe
pnpm test
pnpm typecheck
pnpm lint
pnpm android:check-assets
pnpm test:android-assets
./android/gradlew -p android testDebugUnitTest
```

- 与 P0 基线对比例数：新增的 JUnit / vitest 例数要能对上本计划的清单。
- 与 P0 的既有失败项对照：**只允许**既有失败仍然存在，不允许出现新失败。
- `lint` 不得靠 `eslint-disable` 绕过；`--max-warnings 0` 已开。

## P7 设备验收

### P7.1 AOSP 模拟器：复核命中路径（本轮新增逻辑的主战场）

必须在真机上验不到的路径，靠模拟器：

1. 装 debug 包，打开「添加到桌面」面板，点一档预设。
2. **制造「实例增加但没有回调」**：在等待的 10 秒窗口内，用既有的拖放手法从拾取器往桌面放一个同档卡片：
   ```bash
   adb shell input motionevent DOWN 400 900
   sleep 2
   for y in 940 1060 1180 1300 1400; do adb shell input motionevent MOVE 540 $y; sleep 0.25; done
   adb shell input motionevent UP 540 1400
   ```
   （若拖放来不及，退而求其次：`adb shell am broadcast` 不可行时，直接改成「先删一个实例再让复核看到净增」的等价操作，并在 `verification.md` 里如实说明用了哪种手法。）
3. 期望：面板在 10 秒内进入 `added` 模态，提示语是**复核版**（含「如果不是你刚添加的，请忽略」），对应预设卡显示「已添加」。
4. 日志：`adb logcat -s ClassTrack.Widget | grep -E "pin_observed|pin_confirmed"` → 只有 `pin_observed`，没有 `pin_confirmed`。

### P7.2 真机 PKR110 / ColorOS / Android 16：文案不串台 + 未回归

1. 面板底部手动步骤必须是 **OPPO 版**（含「卡片」与「直接搜索课表」），**不得**出现「安卓小部件 / 应用挂件 / 窗口小工具」；且 OPPO 面板上**不得出现任何跳转按钮**（D12：OPPO 只做手动引导）。
2. **不得**出现小米权限提示条。
3. 既有失败路径行为不变：点预设 → 「等待确认」→ 10 秒后如实告知（且此时复核**未命中**，因为实例数没变 → 结论仍是 `unconfirmed`）。
4. 拍照/截图存证。

### P7.3 开放项

| # | 怎么验 | 结论写在哪 |
|---|---|---|
| V1 | 小米真机（或云真机）：在 HyperOS 上用带 `addType=appWidgetDetail` 的 extras 发一次 pin，看是否打开了小部件中心详情页 | `verification.md`；若为否 → 按 design D9 回滚「小米 extras」这一处，并更新 prd R6 |
| V2 | 荣耀真机：pin 一次，看是否**完全不来**回调（注意：本轮逻辑下若卡片加上了，复核会判成功） | `verification.md`；若回调正常，则记录的差异只是文案 |
| V3 | 小米真机：「创建桌面快捷方式」关闭 → pin 是否静默无效；开启 → 是否恢复 | `verification.md`；据此调整权限提示文案强度（「会失败」/「可能失败」） |
| V4 | 四家最新版实际入口名是否与 research §4 一致（尤其荣耀「服务卡片」vs「桌面卡片」） | `verification.md`；不符则改 `MANUAL_HINT_BY_FAMILY` |
| V5 | vivo 真机：「去组件库添加」是否真的打开组件库（含 `resolveActivity` 结果）；若打不开，把 `VIVO_GALLERY_COMP_TYPE_KEY` 从 `comType` 改成 `cmpType` 再试一次（官方文档自相矛盾） | `verification.md`；确认无效则按 design D9 回滚这一处 |
| V6 | vivo 真机：未上架审核时 `requestPinAppWidget` 的真实表现（静默丢弃？还是有确认框但加不上？） | `verification.md`；决定 vivo 是否要在点按前就把话说成「引导」 |

**没有对应设备时**：不得谎报为「已验证」。在 `verification.md` 里标 ⏳ 未覆盖，并把该开放项留在任务 notes 里，明确说明「文案来源是两处独立生产 App 文档，未做本机复核」。

## P8 收尾

- 写 `verification.md`：逐条对照 prd 的 A1–A12；P0 基线例数与最终例数对比；P7 的证据（日志片段 + 截图路径 + 手法说明）；未覆盖项与开放项 V1–V6。
- 更新 `.trellis/spec/frontend/android-home-widget.md`（Phase 3.3）：
  - pin 条目补三条契约：**厂商族只选文案**（不得用于断言能力）、**三段探测含无回调复核**（复核复用 `WidgetPinTargets.resolve`，基线用 `peek` 不消费）、**厂商专属手动引导**（四家入口名各不相同，通用句只给 `other`/老系统）。
  - 登记开放项 V1–V4 与残余风险（design D9）。
- 归档任务（`task.py archive`）。

---

## 回滚点

| 触发条件 | 回滚动作 | 影响面 |
|---|---|---|
| V1 为否（小米详情页对原生 widget 不生效） | `WidgetPinExtras.plan` 的 `widgetCenterDetail` 恒 `false` + 撤掉 prd R6 段 | 小米退回标准 pin，其他三层不动 |
| V3 结论是「权限与 pin 无关」 | `WidgetVendorSupport.showsShortcutPermissionHint` 恒 `false` | 提示条消失 |
| 复核在真机上产生假阳性（用户抱怨「我没加却说加了」） | `consumePinObservation` 恒返回 `{observed:false,count:0}` | 回到「只认回调」 |
| V5 证伪（vivo 组件库跳转无效） | 删掉按钮与 `openWidgetGallery`；或只改 `VIVO_GALLERY_COMP_TYPE_KEY` 一个常量 | 只影响 vivo 的这一个按钮 |
| 厂商文案被指出指错路 | `manualSteps()` 恒返回 `MANUAL_HINT_BY_FAMILY.other` | 回到通用句 |
| 整体回退 | `git revert` 本分支的 P1–P5 提交 | 回到 `647b6ea` 的行为 |

## 提交切分（建议）

| # | 提交 | 内容 |
|---|---|---|
| 1 | `feat(widget): 厂商族与版本门槛识别（纯逻辑 + 单测）` | P1 |
| 2 | `feat(widget): pin 无回调时的实例差集复核（纯逻辑 + 单测）` | P2 |
| 3 | `feat(widget): pin extras 按厂商拼装 + 能力/复核/权限跳转三个桥接方法` | P3 |
| 4 | `feat(widget): 面板按厂商给手动路径 + 复核结果如实措辞` | P4 |
| 5 | `test(widget): 厂商族跨层断言与文案表断言` | P5 |
| 6 | `docs(widget): 验收记录与 spec 同步` | P8 + Phase 3.3 |
