# 验收记录：厂商分诊的 pin 探测 + 降级引导

> 任务 [prd.md](./prd.md) / [design.md](./design.md) / [implement.md](./implement.md) / 调研 [research.md](./research.md)
> 目标分支 `feat/widget-pin-vendor-probe`，worktree `/media/yetongy/64E8E38AE8E358B65/CodeFiles/SleepDown课程表/ClassTrack-wt/widget-pin-vendor-probe`
> 起始提交 `647b6ea`。验证日期 2026-09-21。

## 0 本轮约束（先说清楚，后面所有"未覆盖"都由它而来）

| 约束（来源：产品口径 2026-09-21） | 后果 |
|---|---|
| **一切需要审核 / 上架 / 审批的能力一律不用** | 荣耀 deeplink（需荣耀快服务上架）、OPPO 插件卡（需授权码+商务审批）、vivo `requestPinAppWidget`（官方注明需原子组件平台审核）全部排除 |
| **荣耀走安卓原生路径，不做厂商适配** | 荣耀只允许有**文案**差异；三个能力开关全 `false`（A12 断言） |
| **只有一个真机（ColorOS），且本机做不到真机验收** | 厂商分支**无法在设备上走通**；改用「原生纯逻辑单测 + Web 单测 + 跨层断言」，并在 §4 逐项标注 ⏳ |

## 1 P0 基线（改动前，用于对账）

| 套件 | 基线 | 命令 |
|---|---|---|
| Web（vitest） | **14 文件 / 92 例 / 0 失败** | `pnpm test` |
| 原生（JUnit） | **27 类 / 186 例 / 0 失败 / 0 错误** | `./android/gradlew -p android testDebugUnitTest` |

**基线无既有失败**，因此后面出现的任何红都是本轮引入的。

> worktree 是独立签出，`node_modules` 与 `local.properties` 都不在（前者软链到主仓、后者手写 `sdk.dir`），
> 且 `android/capacitor-*` 生成物缺失会让 gradle 立刻失败 —— 已用 `pnpm cap:sync:android` 补齐。

## 2 P1 厂商族 + 版本门槛 ✅

新增（纯逻辑，均可 JUnit）：

| 文件 | 内容 |
|---|---|
| `WidgetVendorFamily.java` | `XIAOMI / OPPO / VIVO / HONOR / OTHER` + `detect(manufacturer, brand)` |
| `WidgetVendorSupport.java` | `MODERN_SDK_FLOOR = 34`、`isModern`、`usesWidgetCenterExtras(family, modern, detailPageSupported)`、`showsShortcutPermissionHint`、`showsWidgetGalleryButton` |

两条关键取舍（都由测试钉住）：

- **`Mi` 只能精确匹配**：`mi` 作为子串会误伤 `Micromax` / `Microsoft`（它们跑接近 AOSP 的桌面，被当成小米会给出完全错误的引导）。
- **`HONOR` 三个能力开关全为 `false`**：荣耀只允许有文案差异，这条以后谁想顺手加 extras 都会被测试拦下。

证据：

```
WidgetVendorFamilyTest: 8 例 / 0 失败
WidgetVendorSupportTest: 8 例 / 0 失败
BUILD SUCCESSFUL
```

## 3 P2 无回调复核 ✅

改 `WidgetPinBaseline`：新增 `peek(long)`（**不消费**地读基线）。

新增 `WidgetPinObservation`：一次性 + 5 分钟超时的「桌面上确实多出来一张卡片」槽位，**只存数值**（命中时刻 + 新实例个数），不存 id。

为什么必须是 `peek` 而不是复用 `consume`：确认回调可能在复核**之后**才到，那时 `WidgetPinTargets` 还要用同一份基线去兜 AOSP Launcher3 那种「回调把 `EXTRA_APPWIDGET_ID` 发成 0」的场景；`consume` 会把基线清掉，等于把回调路径的兜底弄没了。

证据：

```
WidgetPinBaselineTest: 11 例 / 0 失败   （原有 7 + 新增 4）
WidgetPinObservationTest: 7 例 / 0 失败
BUILD SUCCESSFUL
```

全量对账（本轮至今）：

| 套件 | 基线 | 现在 | 增量 |
|---|---|---|---|
| 原生 | 27 类 / 186 例 | **32 类 / 236 例 / 0 失败 / 0 错误** | +5 类 / +50 例 |
| Web | 14 文件 / 92 例 | **14 文件 / 101 例 / 0 失败** | +9 例 |

## 3.5 P3 原生桥接 ✅

新增：

| 文件 | 内容 |
|---|---|
| `WidgetPinExtras.java` | `plan(...)` 纯决策 + `apply(Plan, Sink)` 机械落地 + `widgetName(pkg, cls)` 单一拼装点 |
| `WidgetPinNavigation.java` | `widgetGalleryUri(pkg, cls)`（vivo）+ `shortcutPermissionStep(miui, details)` + `galleryStep(resolvable)` + 两个 `wireName()` |
| `WidgetVendorProbe.java` | 小米官方 ContentProvider 两个方法的薄封装（Android 依赖，故不写纯逻辑单测） |

改：

| 文件 | 改动 |
|---|---|
| `WidgetVendorSupport` | 新增 `usesWidgetCenterExtrasFor(family, modern, detail)`；原 `usesWidgetCenterExtras(sdkInt, …)` 改为委托它（**决策只有一处**） |
| `WidgetPinResult` | 新增 `hasConfirmed(long)`：不消费地查「回调到过没」，复核据此保证**回调路径优先** |
| `WidgetDiagnostics` | 新增 `pinVendor` / `pinObserved` / `pinNavigation` / `widgetCenterProbe` + 两个白名单（`safeVendor` / `safeNavigationStep`），只输出数值与白名单枚举 |
| `WidgetSnapshotPlugin` | `requestPinWidget` 的 extras 改走 `WidgetPinExtras`；新增 `getPinCapability` / `consumePinObservation` / `openPinShortcutPermissionSettings` / `openWidgetGallery` 四个 `@PluginMethod` + `isResolvable` / `startQuietly` / `widgetGalleryIntent` 三个私有辅助 |
| `AndroidManifest.xml` | 声明 `com.bbk.launcher2.permission.JUMP_ORIGIN`（注释写明：只为跳转、非平台审批） |

两处**与计划不同的实现决定**（都是收窄风险，不是放宽）：

1. `WidgetVendorProbe` 只缓存**成功回答**（`Boolean` 而非 `boolean`）：一次 `RuntimeException`（例如刚起进程、Provider 未就绪）不该被判成「这台机器永远不支持详情页」。
2. `WidgetPinExtras.plan(...)` 不自己判断「要不要带小米那组」，而是转问 `WidgetVendorSupport.usesWidgetCenterExtrasFor` —— 否则厂商与版本门槛会出现第二份实现，迟早漂移。

编译期被拦下的两处（说明门禁在工作）：`Step` 枚举常量后缺 `;`（插入方法后必然发生，javac 直接报错）；`WidgetPinResult` 的插入曾落在 `consumeConfirmed` 的 javadoc 与方法之间（已修正到方法之后，注释归属正确）。

证据：

```
WidgetPinExtrasTest: 10 例 / 0 失败
WidgetPinNavigationTest: 9 例 / 0 失败
WidgetPinResultTest: 9 例 / 0 失败（新增 4 例 hasConfirmed 语义）
BUILD SUCCESSFUL
```

## 3.6 P4 Web 层 ✅

| 文件 | 改动 |
|---|---|
| `app/lib/native-widget-snapshot.ts` | 新增 `WidgetVendorFamily` / `WidgetPinCapability` / `WidgetPinObservation` / `PinNavigationStep` / `PinNavigationResult` 类型；接口与 Web 兜底实现各加 4 个方法 |
| `app/features/schedule/widgetPinPresets.ts` | 删 `WIDGET_PIN_MANUAL_STEPS`，改为 `MANUAL_HINT_BY_FAMILY` + `manualSteps(family, sizeList)` + `widgetPinSizeList()`；新增 `WIDGET_PIN_SPACE_HINT` / `WIDGET_PIN_OBSERVED_HINT` / 小米权限与 vivo 组件库各两句文案；`WidgetPinOutcome` 加 `'added_observed'`；新增 `resolvePinOutcomeFromObservation` |
| `app/features/schedule/hooks/useWidgetPin.ts` | 挂载时取一次 `getPinCapability`（中性默认值 `NEUTRAL_CAPABILITY`）；轮询**末轮**加一次 `consumePinObservation`（复核命中 → `added_observed`）；新增 `openShortcutPermission` / `openWidgetGallery` 两个静默导航 |
| `app/features/schedule/WidgetPinEntry.tsx` | 抽出 `ManualFallback` 组件（面板底部与失败弹窗**复用**，不再各抄一份）；`added_observed` 时模态描述改用限定句 |

**一处与计划的偏离（收窄而非放宽）**：Web 兜底实现返回「什么都没做」（`{launched:false, step:'none'}`）而不是 `reject`。理由是与该文件既有约定一致 —— 只有 `pushSnapshot` 这种**写入**会 `throw`（不能让写静默失败），`requestExactAlarmPermission` 这类**动作**接口一律如实返回未启动。设计意图（**绝不返回假成功**）保持不变。

## 3.7 P5 跨层断言 ✅

`widgetPinPresets.test.ts` 扩到 **+9 例**：

| 断言 | 防的是 |
|---|---|
| 读 `WidgetVendorFamily.java` 与 `native-widget-snapshot.ts` 两份源码，断言**原生枚举 ↔ Web 联合类型逐字一致** | 两侧漏加一族（附带防呆：解析出空数组时长度断言会拦下「假通过」） |
| `MANUAL_HINT_BY_FAMILY` 的 key 集合 == 族集合，且每条非空 | 文案表漏一条 |
| 四家文案各含关键节点词（安卓小部件 / 卡片+搜索 / 应用挂件 / 服务卡片+窗口小工具） | 文案被改回通用句 |
| 四家都含空间不足句，`other` 不含 | 把补充句漏在某一族上、或误加给通用句 |
| 未识别族在表里是 `undefined`（`manualSteps` 的 `??` 就是为它写的） | 渲染出 `undefined` |
| `added_observed` 文案含限定句、绝不含「系统已确认」；回调命中为 `null`；两者模态相同 | 两条「加上了」被写成一样，或复核冒充权威结论 |

> 旧常量 `WIDGET_PIN_MANUAL_STEPS` 删除后，**任何**遗留引用都会直接编译失败 —— `pnpm typecheck` 就是那条守卫，比字符串搜索更硬。

## 3.8 P6 全门禁 ✅

| 门禁 | 结果 |
|---|---|
| `pnpm test` | **101 例 / 14 文件 / 0 失败** |
| `pnpm typecheck` | 通过 |
| `pnpm lint` | 通过（`--max-warnings 0`，无 disable 注释） |
| `pnpm format:check` | All matched files use Prettier code style |
| `pnpm android:check-assets` | passed（245 assets；`app-debug.apk` sha256 `f6b2b948…`） |
| `pnpm test:android-assets` | 4 pass / 0 fail |
| `./android/gradlew -p android testDebugUnitTest` | **32 类 / 236 例 / 0 失败 / 0 错误** |

额外取证（`aapt2 dump xmltree`）：新声明的 `com.bbk.launcher2.permission.JUMP_ORIGIN` 确实进了 APK 清单，不是只写在源码里。

> `android:check-assets` 需要先有 APK：它在 P0 阶段同样会失败（当时 worktree 连 build 目录都没有），因此这次先跑 `assembleDebug` 再校验 —— **不是**本轮引入的回归。

## 3.9 提交与合并 ✅

分支 `feat/widget-pin-vendor-probe`（worktree `../ClassTrack-wt/widget-pin-vendor-probe`）四次提交 + 一次合并提交，随后 **master 快进**：

| 提交 | 内容 |
|---|---|
| `bd62349` | `feat(widget): 厂商族与版本门槛识别（纯逻辑 + 单测）` |
| `4ee0dc6` | `feat(widget): pin 无回调时的实例差集复核（纯逻辑 + 单测）` |
| `135824e` | `feat(widget): pin extras 按厂商拼装，并加能力/复核/跳转四个桥接方法` |
| `f945c38` | `feat(widget): 面板按厂商给手动路径，并支持复核结论如实措辞` |
| `ed5cab5` | `chore(widget): 合并 master（小工具收窄两档）并解冲突` |
| `f1142e7` | `docs(widget): 同步桌面卡片契约…`（A10） |

P4 与 P5 合成一次提交：**只做 P4 会让 typecheck 红**（删掉旧常量后测试里还留着引用），拆开就得不到「每次提交都是绿的」。

### 合并时的三处冲突（都是「两边在同一处插了东西」）

| 文件 | 解法 |
|---|---|
| `WidgetDiagnostics.java` | 我的四个 pin 诊断方法与他侧的 `scopeConverged` **都保留**。注意：两侧共享了同一个 `/**` 开头，且收尾的 `}` 落在冲突区**之后**的公共部分 —— 直接删标记会让 `widgetCenterProbe` 少一个花括号 |
| `WidgetPinEntry.tsx` | 取我这侧的 import，并去掉他侧已经删掉的 `WIDGET_PIN_NARROW_CELL_HINT` |
| `widgetPinPresets.test.ts` | 删掉双方各自删除的旧常量引用 |

**花括号那个坑值得单独记**：少一个 `}` 时 `javac` **编译通过**，但 Kotlin 编译阶段会以 `Unresolved reference 'widgetRendered'`／`'styleReadFailed'`／`pinConfirmed'…` 的形式报**整个 `WidgetDiagnostics` 类都找不到**（Kotlin 要解析 Java 源码取符号）。也就是说：看到「Kotlin 说某个 Java 类的所有成员都不存在」时，第一反应应当是**那个 Java 文件的括号/结构**，而不是 Kotlin 或依赖。

### 合并后的门禁（worktree）

- Web 101 例 / 原生 **33 类 247 例** / lint / format:check / `android:check-assets`（245 assets）全通过
- 例数对账：186（基线）+ 50（本轮）+ 11（他侧 `09-21-widget-scope-narrowing`）= 247 ✓

### master 上的复核（快进之后重跑一遍，不是「继承」worktree 的结论）

| 门禁 | 结果 |
|---|---|
| `pnpm test` | 101 例 / 14 文件 / 0 失败 |
| `pnpm typecheck` / `lint` / `format:check` | 全部通过 |
| `./android/gradlew -p android testDebugUnitTest` | **247 例 / 0 失败 / 0 错误** |

## 3.10 推送、PR 与发布 ✅

选的是「先推分支 + 开 PR」而不是直接推 master。**最终结果：已合并进远端 master，并已自动发出 beta 版**。

| 项 | 值 |
|---|---|
| PR | [#12](https://github.com/Love-wmh/ClassTrack/pull/12) `feat(widget): 桌面卡片按厂商分诊：三段探测 + 零审核引导` |
| 分支 | `feat/widget-pin-vendor-probe`（含 5 个提交 + spec 提交，共 6 个） |
| CI | `commitlint` ✅ / `verify` ✅ / Vercel ✅；`mergeStateStatus=CLEAN` |
| 合并方式 | **Merge commit**（不能用 rebase-merge：我分支里的合并提交承载着三处冲突的解法，GitHub 的 rebase 会跳过合并提交、等于把解法丢掉） |

### 合并与发版结果（2026-09-21 16:14–16:18Z）

| 项 | 值 |
|---|---|
| PR | [#12](https://github.com/Love-wmh/ClassTrack/pull/12) → **MERGED** |
| 远端 master | `f8b567c`（Merge pull request #12） |
| 工作流 | `CI` ✅ 52s；`Android Release` ✅ 4m14s（两条都是 merge 提交触发的） |
| 发布产物 | **`1.0.9-beta`**（pre-release，tag `android-beta-9`）：`ClassTrack-beta-1.0.9-beta.apk` 与 `ClassTrack-beta-latest.apk`，各 8 653 072 字节 |
| 签名 | 工作流缺签名 Secrets 时直接失败、不回退 debug 包 —— 它成功了，所以挂上去的是**签名**包 |
| 本地 | `git pull --ff-only` 对齐到 `f8b567c`，无残留 |

**这个 beta 包就是拿去验 A8 / V1–V6 的载体**：本轮小米/vivo/荣耀三个分支只有单测与跨层断言保证，OPPO 侧的文案改动本机也没真机可验。

### 第一次 CI 是红的：`commitlint` 卡在正文行长

三个提交的正文里有超过 100 字符的行。**本机没拦住它们**，原因见 §5 的第 5 条（worktree 里钩子根本没运行）。修法选的是 `git filter-branch --msg-filter`：

- 它**只重写提交信息、不动树**，所以不必重放那次合并、更不必重解那三处冲突（重放会再撞上同样的冲突）
- 范围限定成 `3a27989..分支`，这样 master 上已有的提交（含 `3a27989`）一个都不动，分支仍然包含 master → PR 可快进
- 改完先自查：`git diff --stat backup/pr12-before-msgfix HEAD` **输出为空**（树逐字节一致），再跑 `pnpm exec commitlint --from 3a27989 --to HEAD` 静默通过，才 force-push

## 4 尚未完成 / 未覆盖（逐条如实标注，不谎报）

| # | 项 | 状态 |
|---|---|---|
| P3 | `WidgetPinExtras` / `WidgetPinNavigation` / `WidgetVendorProbe` + 插件四个新方法 + `requestPinWidget` 改造 + 清单权限 | ✅ 见 §3.5 |
| P4 | Web 层：类型、厂商文案表、`useWidgetPin` 复核分支、面板按钮 | ✅ 见 §3.6 |
| P5 | 跨层断言（原生枚举 ↔ Web 联合类型、文案关键节点词、荣耀无能力分支） | ✅ 见 §3.7 |
| P6 | 全门禁（`pnpm lint` / `typecheck` / `format:check` / `android:check-assets` / Web 测试） | ✅ 见 §3.8 |
| P7 | 设备验收 | ⏳ **本机做不到**（见下） |
| P7-V1 | 小米真机：`addType=appWidgetDetail` 对**未上架审核的原生 widget** 是否真的打开详情页 | ⏳ 无小米设备 |
| P7-V2 | 荣耀真机：是否真的不发确认回调 | ⏳ 无荣耀设备 |
| P7-V3 | 小米真机：「创建桌面快捷方式」关闭时 pin 是否确实静默无效 | ⏳ 无小米设备 |
| P7-V4 | 四家最新版实际入口文案是否与 research §4 一致 | ⏳ 无对应设备 |
| P7-V5 | vivo 真机：组件库跳转是否真能打开；`comType` vs `cmpType` 哪个对 | ⏳ 无 vivo 设备 |
| P7-V6 | vivo 真机：未上架时 `requestPinAppWidget` 的真实表现 | ⏳ 无 vivo 设备 |
| P7-A | AOSP 模拟器：无回调复核命中路径（`Medium_Phone` 可用） | ⏳ 未开始（P3/P4 完成后才可测） |

**替代证据（用于弥补上表在设备上的空白）**：

- 厂商分支用**原生纯逻辑单测**覆盖（A1/A2/A12），文案用 **vitest** 覆盖（A4/A5），两侧一致性用**跨层断言**覆盖（A1）——即「分支正确性」有测试保证，缺的只是「设备上真的这么表现」。
- 待 P3/P4 完成后，用 AOSP 模拟器走**复核命中**路径（这条恰好真机上验不了），并在 `verification.md` 补日志与截图。

## 5 记录：本轮踩到的两个坑（避免下次重复）

1. **worktree 不是"能直接跑"的**：`node_modules` / `local.properties` / `android/capacitor-*` 生成物都缺失，gradle 会在 `capacitor.build.gradle:10` 直接失败。补齐顺序：手写 `local.properties` → 软链 `node_modules` → `pnpm cap:sync:android`。
2. **锚点编辑会写错文件**：编辑工具按锚点定位，而锚点来自"上次读到的那个文件"。若先读了主仓的同名文件、又去改 worktree 的副本，改动会落到**主仓**去（本次发生了一次，已 diff 核对「纯新增 42 行」后 `git checkout` 回退）。规矩：**改哪个文件就先读哪个文件**。
3. **`cap sync` 会污染一个被跟踪的生成文件**：软链 `node_modules` 之后，`android/capacitor.settings.gradle` 里的插件路径会被重写成指向主仓的绝对相对路径（`../../../ClassTrack/node_modules/...`）——**这是机器本地路径，绝不能提交**（会让别人的构建直接崩）。已 `git checkout` 回退；回退后 gradle 仍能经软链解析 `../node_modules`，所以「软链 + 提交原始 settings」是可以共存的。**提交前务必 `git status` 看一眼有没有它。**
4. **`cd X && cmd &` 会把 `cd` 一起丢进后台子 shell**：写成 `cd $W && nohup ./gradlew … &` 之后，父 shell 的 cwd **没有变**，于是紧随其后的 `pnpm android:check-assets` 跑在了**主仓**上（输出里的项目路径当场暴露了这一点）。断言「在 worktree 上通过」之前务必看 pnpm 打印的项目路径，或者干脆每条命令各自 `cd`。
5. **git worktree 里 husky 钩子静默失效**：`core.hooksPath` 是 **`.husky/_`**，而 `.husky/_` 是 husky 生成、**被 gitignore** 的目录 —— 新签出的 worktree 里没有它，于是 git 发现 hooks 目录不存在就**直接跳过全部钩子，不报任何错**。后果：在 worktree 里 `git commit` 完全不过 commitlint，超长正文、英文主题这类问题本地全绿、CI 才红（本次就让 3 个提交溜过去了，PR 第一次 CI 因此失败）。
   - 判定：`git rev-parse --git-path hooks` 打出来的路径 `ls` 不到，就是这种情况。
   - 修法：在 worktree 里跑一次 **`pnpm prepare`**（= `husky`）生成 `.husky/_`；或提交前手工自查 `pnpm exec commitlint --from <base> --to HEAD`。
