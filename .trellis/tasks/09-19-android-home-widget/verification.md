# 验证结果与未验证项（P6）

> 生成时间：2026-09-19 · 分支 `feat/android-home-widget`
> 原则：**只记录真正执行过并拿到输出的证据**。凡未验证的，明确写「未验证」并给出可复现的原因，不用「类型检查通过」冒充行为验证。

## 0. 结论摘要

- 沙盒关闭后环境恢复（`~/.gradle` 可写、**`/dev/kvm` 存在**、DNS 正常、无代理），因此**回归与设备端验收都在真实环境下完成**。
- 设备端验收发现并修复了 **3 个静态检查无法发现的真实缺陷**（见 §2）。其中两个是我自己引入的，一个会让小工具**反复显示空白**、一个会让点击**渲染 404**。
- 最终状态：本轮（P7 需求变更）新增的 **B6–B11 已验证**；**B12（最小 2x2 尺寸的像素布局）为部分验证**（缩放句柄无法用 adb 合成手势抓取，原因与旧 B2 相同），与旧 B2 一样记录了复验方式。
- **P7 设备实测还发现并修复了 1 个真缺陷**：`provideGlance` 只执行一次，`update`/`updateAll` 只重新合成、不重跑 `provideGlance`，导致**闭包里的旧状态被反复使用** —— 实测「把系统时间从 17:00 推到 18:00，小工具仍显示上一节为『正在进行』」。修复为 `WidgetRenderCache`（进程内可观察容器，合成阶段读最新解析结果），见 §3.5-3.6。

## 1. 回归测试（沙盒关闭后，使用项目文档里的原生命令）

未做任何环境变量覆盖，即与普通开发者本机构建完全一致：

| 门禁 | 命令 | 退出码 | 结果 |
|---|---|---|---|
| 类型检查 | `pnpm typecheck` | 0 | 通过 |
| Lint | `pnpm lint` | 0 | 0 problems |
| 格式 | `pnpm format:check` | 0 | All matched files use Prettier code style |
| Web 单测 | `pnpm test` | 0 | **54 用例**（12 文件）全通过 |
| Web 构建 | `pnpm build` | 0 | 通过 |
| Android 单测 | `./android/gradlew -p android :app:testDebugUnitTest` | 0 | **56 用例**全通过（含 9 个跨层用例） |
| APK + 资源一致性 | `pnpm cap:build:android` | 0 | BUILD SUCCESSFUL + `Android asset check passed: 246 assets, 28 index references` |

**关键旁证**：真实 `~/.gradle` 缓存里出现了 `androidx.glance` 与 `org.jetbrains.kotlin`，说明构建不依赖此前为绕开只读挂载而临时建立的沙盒缓存 —— 之前那些绕法没有掩盖任何真实问题。

## 2. 设备实测中发现并修复的缺陷（静态检查无效）

这三个都是「代码能编译、单测全绿、静态审查通过」但真机上出错的问题。

### 2.1 `initialLayout` 使用了 RemoteViews 不允许的类 → 桌面显示「Can't load widget」

```
AppWidgetHostView: Error inflating AppWidget ...
android.view.InflateException: Binary XML file line #19 in com.classtrack.app:layout/class_track_widget_initial
Caused by: Class not allowed to be inflated android.view.View
```

`appwidget-provider` 的 `initialLayout` 会走传统 RemoteViews 解析，**只允许 `@RemoteView` 白名单内的类**。我原本放了一个 `<View>` 子节点承载背景色，launcher 无法 inflate，桌面直接显示「Can't load widget」。

**修复**：`res/layout/class_track_widget_initial.xml` 只保留一个承载背景的 `FrameLayout`，不再放任何子节点。

### 2.2 接收器里 `goAsync()` 返回 null → NPE 崩溃 → 小工具反复显示空白

```
FATAL EXCEPTION: DefaultDispatcher-worker-2
java.lang.NullPointerException: Attempt to invoke virtual method
'void android.content.BroadcastReceiver$PendingResult.finish()' on a null object reference
	at com.classtrack.app.widget.ClassTrackWidgetReceiver$runInBackground$1.invokeSuspend(ClassTrackWidgetReceiver.kt:60)
```

`goAsync()` 在 `AppWidgetProvider` 的 `onUpdate`/`onEnabled`/`onAppWidgetOptionsChanged` 这些回调里并不总是可用，实测返回 `null`；我直接调用 `pending.finish()` 导致进程被杀。**进程在更新途中被杀，正是小工具反复停留在 `initialLayout`（一片空白）的真实原因** —— 这个现象一度被我误判成 `TextStyle` 的问题，加诊断日志后才定位到崩溃。

**修复**：
- `ClassTrackWidgetReceiver` 彻底不再使用 `goAsync()` + 协程，改为入队持久化的 WorkManager 任务（这几个回调只需要把边界链续上，不需要接收器自行完成工作）；
- 两个真正的 `onReceive`（L2 时间变更、L3 精确闹钟）那里 `goAsync()` 是合法的，但也补上了判空，避免同类崩溃。

### 2.3 点击小工具的路由常量写错 → 客户端渲染 404

`WidgetPendingRoute.ROUTE_SCHEDULE` 我写成了 `/schedule`，但**课表在 `app/routes.ts` 里是 index 路由 `/`**，根本没有 `/schedule` 这个路径。真机上点击小工具后：

```
路由 = /schedule
页面 = 404 The requested page could not be found.
```

更严重的是：404 由 `root.tsx` 的 `ErrorBoundary` 渲染，它会**替换整棵组件树**，把小工具同步组件一起卸载 —— 即这条错误路径会连带停掉快照同步。

另外「路由 extra → JS 消费」只实现了原生一半：我导出过 `consumePendingRoute`，但 Web 侧没有任何消费者，所以跳转从未生效。

**修复**：
- 常量改为 `/`（并注明它是 index 路由），JS 侧导出 `WIDGET_ROUTE_SCHEDULE` 供白名单复用；
- 新增 `app/lib/native-widget-route.test.ts`，用 `matchRoutes(routes, ...)` 断言该常量**必须命中真实路由表**、且 `/schedule` 必须不命中 —— 与既有 `native-shell-url.test.ts` 同一模式，这类漂移以后由 CI 拦住；
- 在 `WidgetSnapshotSync` 里补上 Web 侧消费者（`useWidgetPendingRoute`），并对路由做第二层白名单校验。

## 3. 设备端验收证据（模拟器 `Medium_Phone`，Android 17 / SDK 37，x86_64 + KVM）

数据注入方式：通过 WebView 调试通道（debug 构建默认开启）把一份包含「一节课正在进行 + 今日还有一节 + 明天一节」的课表写入 `localStorage` 并重载，让**真实同步链路**把它推给原生。读取原生状态用 `adb shell run-as`（debug 包）直接读私有 SharedPreferences。

| 项 | 证据 |
|---|---|
| **B1** 出现在小工具选择器 / 可被添加 | ① 选择器搜索 `ClassTrack` 命中，预览卡片显示 **「ClassTrack / 4 × 2 / 在桌面上显示接下来的一节课和今天剩余课程」**（尺寸元数据与中文描述都正确）；② 拖到桌面后 `dumpsys appwidget` 出现 launcher 托管的实例（`host=...nexuslauncher`、`provider=...ClassTrackWidgetReceiver`）；③ 系统 provider 登记里 `updatePeriodMillis=1800000`、`resizeMode=3` 与声明一致 |
| **B3** 进行中课程被标记，且自动切换 | 「正在进行」标签在真机渲染正确；把时间推到 20:10（课程结束时刻）后，两个实例都自动切到「接下来 · 第 3-4 节 / 大学物理 / 21:10 - 22:50 · 教二105」，「今日剩余」随之消失 —— **全程未打开 App** |
| **B4** 点击打开 App 且跳到课表页 | 用小工具完全等价的 Intent（`MainActivity` + `classstrack_widget_route`）冷启动后：`topResumedActivity=com.classtrack.app/.MainActivity`、`path="/"`、`is404=false`、`isSchedule=true`。另测**白名单**：extra 传 `/evil-route` 时 `path="/"`、无 404，即被拒绝 |
| **B5** 深色/浅色可读 | 浅色：白底深字 + 蓝色标签；`cmd uimode night yes` 后自动切到 `values-night` 配色（深底浅字），两个实例都正常渲染且可读 |
| **B2** 尺寸适配 | **部分验证**：已在 250×200dp 下渲染 hero + 今日剩余列表；调试探针在真机上读到了 `LocalSize=250.0x200.0`，证明尺寸驱动分支有效；**2x1 紧凑尺寸的实际像素布局未验证**（该 launcher 的缩放句柄无法用合成手势抓取，长按只弹出 Settings 菜单） |
| **C1** 推送后同一次推送内刷新 | 日志显示 `phase=snapshot_stored bytes=15128` → 同一秒内 `phase=refresh_requested trigger=plugin_push` 与 `trigger=widget_update`，且桌面内容随推送立即变化 |
| **C2** 落盘成功才 resolve | 真机上 `snapshot_stored` 与随后刷新成对出现；插件四条失败路径各自 `reject` 具名错误码（代码审查 + 单测） |
| **C3** 无数据/过期显示引导态 | 清空 WebView 的课表数据后重载，原生收到 `status=empty`，两个实例都显示「暂无课表数据，打开 ClassTrack 导入」，不猜课程 |
| **C4** 重启后仍能恢复 | `adb reboot` 后约 42 秒开机，未打开 App 的前提下：`dumpsys jobscheduler` 中已存在 `com.classtrack.app/androidx.work...SystemJobService`（WorkManager 自行恢复待办），桌面两个实例均正常重渲染 |
| **C6** 系统级兜底 | `dumpsys alarm` 中出现系统投递的 `ELAPSED_WAKEUP tag=*walarm*:android.appwidget.action.APPWIDGET_UPDATE repeatInterval=1800000`，与我们的 `updatePeriodMillis` 一致 |
| **C8** 跨零点/改时间/换时区即时纠正 | 用 `cmd alarm set-time` 把时间改到 20:09:00 后，日志出现 `20:09:00.369 phase=refresh_requested trigger=time_change` —— L2 广播立即重算 |
| **C9** 精确模式授予/撤销 | ① 默认（Android 14+ 未授予）：`com.classtrack.app` 的精确闹钟计数为 0 → 静默回退；② `cmd appops set ... allow` 后重新武装，`dumpsys alarm` 出现 `RTC_WAKEUP ... tag=*walarm*:com.classtrack.app.action.WIDGET_BOUNDARY_ALARM`、**`origWhen=2026-09-19 20:10:00.000`**（正好是那节课的结束时刻）、**`window=0`（精确）**、`exactAllowReason=permission`；③ `deny` 后再刷新，`dumpsys alarm` 出现 `Reason=alarm_cancelled` / `pi_cancelled`，精确闹钟被清理 |
| **C10** 设置节如实展示 | 授权态：`path=/profile`、卡片存在、等级显示 **「精确」**；撤销授权后重载：等级显示 **「基础」**，文案包含 **「30 分钟」** 与 **「课程名」**（即如实说明延迟，同时说明课程名始终正确） |
| **C11** 结构性保证 | resolver 单测 + 跨层用例（含「首尾相接处该瞬间 hero 必须是下一节」）；真机上「正在进行」标签按预期出现 |
| **D4** 端到端 | 放置 → 导入数据 → 桌面正确显示「正在进行 高等数学 / 今日剩余 大学物理」；推进时间后自动切换（见 B3） |
| **D6** 长期不打开 App | 见 B3/C8/C9：时间推进到边界时，**精确闹钟在 20:10:00.077 触发**（距边界 77ms），同时 L2（20:09:00.369）与 L4（同刻 `trigger=boundary_work`）也各自交付；整个过程未打开 App，且应用进程已回收（属广播唤醒路径） |
| **N3** 隐私 | 真机快照内容检查：`status/entries/dayEndEpochMs` 等字段齐全，**教师、`courseId`、`classId` 三个哨兵值均未出现**；`logcat -s ClassTrack.Widget` 全程只有阶段名、字节数与白名单枚举值，无课程内容 |
| **N4** 不回归 | `pnpm cap:build:android` 的 `check-android-assets` 通过（246 assets / 28 references 字节一致） |

### 3.5 P7 需求变更后的二次设备验收（样式 / 滚动 / 配置页 / 预览 / 每实例配置）

需求变更（用户实测后提出）：三种样式可选、列表可滚动、每实例配置页、真实预览。本轮在同一个 `Medium_Phone` 模拟器上二次验收（APK 重新构建安装，进程重启后取证）。

| 项 | 证据 |
|---|---|
| **B8** 三种样式各自渲染 | 同一快照下：实例 A 设为「全天课表」（汇总行「今天 周六 · 共 N 节」+ 全天列表 + ● 高亮进行中那一行）；实例 B 设为「接下来」（hero 卡片「正在进行 / 课程01 / 20:10 - 20:30 · X001」+ 下方全天列表）；再设为「紧凑」（只显示 hero + 「今天还有 8 节」）。三者各自渲染正确 |
| **B9** 列表真实可滚动 | 注入 12 节当天课程后，4x3 格子只显示约 5 行；在列表区域内 `input swipe 540 890 540 660` 连续两次，首行从「课程01(20:10)」滚到「课程04(21:25)」再到「课程05(21:50)」——**原生集合型 widget 的真实滚动**，不是截断 |
| **B10** 三种「已上完的课」策略 | ① 灰显保留：时间推进后已上完的课仍在列表（`今天 周六 · 共 8 节` 不变、行还在）；② 不显示：总数从 7 → 6（已上完行消失）；③ 折叠：总数为 4 且底部出现 **「已上完 1 节」**（18:30-19:30 的课折叠成计数，不占行） |
| **B11** 样式入口重开配置页 + 与主体点击互不干扰 | ① 点 widget 内「样式」→ `topResumedActivity=...WidgetConfigActivity`；② 点 widget 主体 → `topResumedActivity=...MainActivity` 且 WebView `path=/`（课表首页，B4 回归通过） |
| **B6** 选择器预览 | 选择器命中 ClassTrack：预览页显示「4 × 3 / 4 wide by 3 high」与更新后的描述「在桌面上显示今天一整天的课程…」；`LauncherAppWidgetHostView` 的区域由 launcher **live 渲染我们的 widget**（uiautomator 能读到我们渲染的文本节点），不是 App 图标。`previewLayout` mock 与 `previewImage` 两个兜底资源均已编入 APK（aapt 验证） |
| **B7** 每实例配置 + 设置入口 + 取消不落地 | ① 配置页保存后 `style_configured style=next_up finished=collapse`，该实例立即变样式、**其它实例不受影响**（同数据两种样式并排实拍）；② 配置按实例持久化在 Glance 状态（`appWidget-4/5.preferences_pb`）；③ 删除实例后对应状态文件被 `onDeleted` 清理（`appWidget-4.preferences_pb` 消失）；④ 在配置页选新样式后按「取消」→ 无新 `style_configured`、实例样式不变 |
| **B12** (部分) | 最小尺寸像素未验证（原因同旧 B2）；但「小尺寸下可滚动显示全部」已被 B9 覆盖，配置页在紧凑样式下禁用了无关选项 |
| 配置页安全 | 用不存在的 `--ei appwidget_id 9999` 从外部启动 `WidgetConfigActivity`：页面未显示（直接 `RESULT_CANCELED` 退出）、日志 `phase=config_rejected reason=invalid_widget_id`、无任何写入（Glance 状态文件无新增键） |
| 配置页「紧凑」诚实性 | 选「紧凑」后，「已上完的课」三个单选被禁用（`enabled=false`）且出现「『紧凑』样式不显示课程列表，所以这个选项对它没有效果」 |
| 放置时 configure 弹窗 | **部分验证**：`android:configure` 属性 + `widgetFeatures=reconfigurable` 都已编入 APK（aapt 验证）；真机上「长按 widget → Settings」能通过系统正确拉起 `WidgetConfigActivity`（与放置时同一套系统机制）。Pixel Launcher 全屏 picker 的拖放自动 configure 流程本次未能捕获（adb 合成拖拽与真实手势有差异），记录为残余风险（见 §4） |

### 3.6 P7 发现并修复的真缺陷：`provideGlance` 只执行一次，旧状态闭包导致时间推进后画面不变

**现象**（Android 17 / SDK 37 模拟器，可稳定复现）：

```
把系统时间从 17:00 推到 18:00（第一节课 15:20 已结束），
widget 仍显示「高数（进行中）」且 ● 还停在那一行 —— "要上课了却显示不上课"
logcat：只有 phase=refresh_requested trigger=time_change，
没有新的 widget_rendered
```

**根因**：Glance 只在会话建立时执行一次 `provideGlance`；之后的 `update` / `updateAll` 只重新合成 `provideContent`，而闭包里捕获的是那次 `provideGlance` 的 `state`。所以「数据变了、时间变了，推了刷新，画面却停在上一帧」。

**修复**（`WidgetRenderCache.kt`）：所有刷新路径（L1–L5）收敛到 `resolveCurrentState` → 把最新解析结果发布进进程内可观察容器（Compose `mutableStateOf` + `Snapshot.withMutableSnapshot`）；`provideContent` 里读 `WidgetRenderCache.latest()`。合成每次都会重跑（实测 `update` 后 launcher 持有的 `RemoteViews` 对象确实变化），因此总能拿到最新结果；进程重启后由 `provideGlance` 重新播种。

**修复后复验**：时间推到 18:00 → ● 从「改过的物理(16:20-17:20)」移到「数据结构(17:25-18:25)」；推到 20:00 → ● 移到「线性代数(19:35-20:35)」；推到 19:00 → 「紧凑」实例的 hero 从「改过的物理」切到「英语」、计数从 5 → 4。**全程未重新打开 App**，也未重启进程。

**为何旧版（P4/P6）没有暴露**：当时只有「接下来 + 今日剩余」一种形态，且验收靠日志（`refresh_requested`）而非像素；本轮加入全天列表后，「时间推进但画面不变」变得肉眼可见。这条缺陷影响范围与修复都已落入 §4 的复验清单。

## 4. 未验证项 / 残余风险

| 项 | 未验证内容 | 原因 | 复验方式 |
|---|---|---|---|
| **B2** | 2x1（Compact）的实际像素布局不溢出 | 模拟器 launcher 的缩放句柄无法用 `adb shell input` 合成手势抓取（长按只弹 Settings 菜单） | 在真机桌面上手动把实例缩到 2 格宽，确认只显示课程名与时间、且不溢出 |
| — | 桌面圆角在不同 launcher / Android 版本上的裁剪表现 | 只在模拟器 Pixel Launcher 上看过 | 真机多 launcher 抽查；异常时去掉 `cornerRadius(16.dp)`（不影响信息正确性） |
| — | 超大字体缩放（`fontScale ≥ 1.5`）下的表现 | 未改过 `fontScale` | 设置里调到最大字号看是否截断（当前用 `maxLines` 截断，不会破坏布局） |
| — | 定位到「首尾相接两节课」的真实数据下的切换 | 测试数据里两节课之间有空档 | 导入含相邻课的课表，跨过交界秒验证 |
| **B12** | 最小约 2x2 尺寸的实际像素布局 | 该 launcher 的缩放句柄无法用合成手势抓取（同旧 B2 原因） | 真机手动缩到最小，确认不溢出、不崩溃、仍可读；滚动已由 B9 覆盖 |
| — | **放置时 configure 自动弹窗**（Android 14+ Pixel Launcher 全屏 picker） | adb 拖放手势与真实手势有差异，本次未捕获到「拖放完成→配置页自动弹出」的瞬间；`configure` + `reconfigurable` 已由 aapt 与系统 Settings 路径证实 | 真机手动从选择器放置一次，确认放置即弹配置页；取消时 launcher 不留下实例 |
| — | `previewLayout` mock 与真实渲染的漂移 | mock 是静态 XML（含示例课程），真实渲染随数据/时刻变化 | 改动任一真实样式视觉时同步更新 mock（已在 spec 强制） |
| — | 滚动在被其它 launcher（非 Pixel）的表现 | 只在 Pixel Launcher 验证过 | 真机多 launcher 抽查；异常时按 design D15 回退为截断 |

### 观察到但**无法归因于本次改动**的一次崩溃

沙盒阶段的一次设备运行中出现过 `Fatal signal 4 (SIGILL)`，崩溃栈完整落在 Chromium 内：

```
#00/#01  libwebviewchromium.so
#08      WV.ig1.onTrimMemory
#12–#16  ComponentCallbacksController.dispatchTrimMemory → Application.onTrimMemory
```

栈中没有任何我们自己的类，且本改动**没有引入任何原生库**（Glance / WorkManager 都是纯 JVM 字节码）。事后尝试用 `am send-trim-memory RUNNING_LOW/RUNNING_CRITICAL` 复现未成功，全日志中该 `Fatal signal` 仅出现一次。因此按「一次性环境/WebView 崩溃」记录，不声称已解释清楚。
（另注：本次修复的 §2.2 NPE 与它是**两个不同**的崩溃，NPE 已定位并修复。）

## 5. 命令速查（复现本报告的每一步）

```bash
# 回归（无需任何环境变量覆盖）
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
./android/gradlew -p android :app:testDebugUnitTest
pnpm cap:build:android

# 启动模拟器（需要 /dev/kvm）
~/Android/Sdk/emulator/emulator -avd Medium_Phone -no-window -no-audio -no-boot-anim -no-snapshot-load -gpu swiftshader_indirect
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# 设备侧取证
adb shell dumpsys appwidget | grep -A4 classtrack.app     # provider 登记与实例
adb shell run-as com.classtrack.app cat shared_prefs/class-track-widget.xml   # 原生收到的快照（debug 包）
adb logcat -d -s ClassTrack.Widget                        # 刷新链路（不含课程内容）
adb shell dumpsys alarm | grep -A3 WIDGET_BOUNDARY_ALARM # L3 精确闹钟
adb shell dumpsys jobscheduler | grep classtrack          # WorkManager 待办（重启后仍在）
adb shell cmd appops set com.classtrack.app SCHEDULE_EXACT_ALARM allow|deny  # 精确模式开关
adb shell cmd alarm set-time <epochMs>                    # 推进时间（验证 L2/L3 与 D6）

# 往真机 App 注入课表数据（走真实推送链路）
adb shell pidof com.classtrack.app                          # 取 pid
adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>
node /tmp/wv-eval.mjs @/tmp/seed.js && node /tmp/wv-eval.mjs "location.reload()"
```

注意：`am broadcast -a android.appwidget.action.APPWIDGET_UPDATE` **不可用** —— 系统会以
`Permission Denial: not allowed to send broadcast ... from unknown caller` 拒绝 shell 投递该受保护广播。
触发刷新请用「启动 App」或等待 L3/L5。
