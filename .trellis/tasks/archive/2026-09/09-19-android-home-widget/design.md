# 技术设计：Android 桌面小工具显示接下来的课程

> 任务：`.trellis/tasks/09-19-android-home-widget` · 分支 `feat/android-home-widget` · 日期 2026-09-19

## 0. 问题定义

课表数据只存在于 Capacitor WebView 的 `localStorage`（Zustand persist，key `class-track-storage`）。Android App Widget 运行在应用自身的原生进程里，无法读取 WebView 存储。因此本设计的核心是**在 Web 与原生之间建立一条单向、带版本、可校验的快照通道**，并把「随时间推进该显示哪节课」的判断拆成两侧各自的纯函数。

### 数据流总览

```text
┌──────────────────────── WebView（JS，事实来源） ────────────────────────┐
│  useClassStore (localStorage: class-track-storage)                      │
│        │ subscribe(去抖 1.5s) / 前景恢复 / 启动                          │
│        ▼                                                                │
│  buildWidgetSnapshot({classes, currentWeek, firstWeekStartDate}, now)   │
│  纯函数 → WidgetSnapshotV1（绝对 epoch + 预格式化显示串）                │
│        ▼                                                                │
│  widgetSnapshotPlugin.pushSnapshot({ snapshotJson })                    │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ Capacitor bridge（JSON 字符串）
┌──────────────────────────────────▼──────────────────────────────────────┐
│  WidgetSnapshotPlugin (Java) 校验 → SharedPreferences.commit()          │
│        │ 成功后才 resolve；失败 reject 具名错误码                        │
│        ▼                                                                │
│  WidgetRefreshBridge.requestRefresh(context)  (Kotlin)                  │
│        ├─ 立即：WidgetRefreshWorker 立即执行 + ClassTrackWidget.updateAll│
│        └─ 排程：下一个时间边界的一次性 Work                             │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────────────────────┐
│  ClassTrackWidget (Glance)                                              │
│   读 SharedPreferences → parseWidgetSnapshot() → resolveWidgetState(now) │
│   → 渲染（正在进行 / 接下来 / 今日剩余 / 空 / 陈旧 / 缺失）              │
└─────────────────────────────────────────────────────────────────────────┘
```

**分工原则**：JS 负责一切日历与时间戳计算（周次、单双周、绝对 epoch、显示串）；原生只做 `now` 与 epoch 的比较、排序裁剪和渲染。原生**不**解析 localStorage，**不**重新实现周次语义，**不**做时区换算。

---

## D1. 原生技术栈：`app` 模块内引入 Kotlin + Jetpack Glance 1.2.0

**决策**：在现有 `:app` 模块中引入 Kotlin 与 Glance，不新建 Gradle 模块。

- `android/build.gradle` 的 `buildscript.classpath` 增加：
  - `org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.20`
  - `org.jetbrains.kotlin:compose-compiler-gradle-plugin:2.1.20`
  
  走 buildscript classpath（而非 `plugins {}` + `gradlePluginPortal()`）的原因：根 `build.gradle` 只声明 `google()` / `mavenCentral()`，没有 Gradle Plugin Portal；这两个构件在 Maven Central 上存在（已实测华为云/阿里云镜像均 200），因此不需要新增仓库。
- `android/variables.gradle` 增加 `kotlinVersion = '2.1.20'`、`glanceAppWidgetVersion = '1.2.0'`、`androidxWorkVersion = '2.11.2'`。
- `android/app/build.gradle` 应用 `org.jetbrains.kotlin.android` 与 `org.jetbrains.kotlin.plugin.compose`，新增 `androidx.glance:glance-appwidget`、显式 `androidx.work:work-runtime-ktx`，并用 `kotlin { jvmToolchain(21) }` + `compilerOptions.jvmTarget` 把 Kotlin 的 jvmTarget 与 Java 侧对齐（见 D1.2）。
- Kotlin 源码放在 `android/app/src/main/java/com/classtrack/app/widget/`（与既有包路径一致；Android 不要求 `.kt` 与 `.java` 分目录）。

### D1.1 版本选择依据

| 构件 | 版本 | 依据 |
|---|---|---|
| `glance-appwidget` | `1.2.0` | Google Maven metadata 中最新**稳定**版（`1.3.0-alpha02` 为预发布，不采用） |
| `kotlin-gradle-plugin` / `compose-compiler-gradle-plugin` | `2.1.20` | Glance 1.2.0 声明 `kotlin-stdlib 2.0.21` + Compose Runtime `1.7.8`，2.1.x 与该时代匹配；Kotlin 2.x 起 Compose 编译器由 Kotlin 自带，无需独立版本对齐 |
| Compose Runtime | 保持 Glance 传递的 `1.7.8` | 不额外引入 Compose BOM，避免与 Glance 发布元数据打架 |
| `work-runtime-ktx` | `2.7.1`（与 Glance 传递版本一致） | 早期设计想显式提升到当前稳定版；实机验证后改为**跟随 Glance 自带版本**：这个组合已在真机上验证过边界任务按时交付（20:10:00.077 触发）且重启后待办被 WorkManager 自行恢复。注意 Glance 把 WorkManager 声明为 `runtime` 作用域，因此仍需显式 `implementation` 才能编译。 |

### D1.2 已识别风险与缓解

| 风险 | 缓解 |
|---|---|
| KGP 与 AGP 8.13.0 的组合未在本仓库验证过 | 实现阶段第 1 步就是「只加工具链、加一个空 Kotlin 类」跑通 `assembleDebug`，再写业务代码（implement.md P1） |
| Java 与 Kotlin 的 jvmTarget 不一致会导致构建失败 | **已实测落地**：本机只有 JDK 21（`/usr/lib/jvm/temurin-21-jdk-amd64`），AGP 8.13 默认就按 21 产出 Java 字节码（改动前 `MainActivity.class` 已是 major 65）。只写 `compileOptions { targetCompatibility 17 }` **无效** —— AGP 用 JVM toolchain 覆盖它，Java 任务仍是 21，于是 KGP 报 `Inconsistent JVM-target compatibility: compileDebugJavaWithJavac (21) vs compileDebugKotlin (17)`。最终方案：统一为 **21**，用 `kotlin { jvmToolchain(21); compilerOptions { jvmTarget = JVM_21 } }`；实测 Kotlin 产物 major 65，与 Java 一致。**不引入第二个 JDK。** |
| `buildFeatures.compose` 是否需要开启存在歧义 | 实现时以真实构建为准：先只应用 compose 插件；构建报错再补 `buildFeatures { compose = true }` |
| `compose-compiler-gradle-plugin` 从 `repo1.maven.org` 直连在本机不稳（实测多次 000，但阿里云/华为云 200） | 若依赖解析失败，按 README 启用 `scripts/gradle-mirrors.init.gradle`；本设计不新增仓库声明 |
| Glance 在 `:app` 模块内与 Capacitor 的 Java 代码共存出现问题 | 回滚路径见 §Rollback，降级到 RemoteViews（纯 Java/XML，零新工具链） |

**被否决的方案**

- **新建 `:widget` Gradle 模块**：Capacitor 的 `cap sync` 会改写 `android/settings.gradle`（`capacitor.settings.gradle` 的 `apply from`），新模块需要额外的同步后校验，收益不抵成本。
- **改用 RemoteViews（纯 Java/XML）**：零工具链风险、启动最快，但列表需要 `RemoteViewsService` + `ListView`，代码量明显更大且更难维护。作为**回滚方案**保留，不作为首选。
- **Glance 1.3.0-alpha02**：预发布版本，不用于本任务。

---

## D2. 冻结契约：`WidgetSnapshotV1`

这是 Web 与 Android 之间唯一的跨层契约。两侧实现可并行，任何一侧都不得单方面扩展字段。

```ts
type WidgetSnapshotStatus = 'ok' | 'empty' | 'unavailable'

type WidgetOccurrence = {
  id: string            // `${class.id}#${dayKey}`，同一节课的稳定标识
  name: string          // 课程名
  classroom: string     // 教室，可为空串
  sections: string      // 节次标签，如 "3-4"
  startEpochMs: number  // 绝对起始时间（epoch 毫秒）
  endEpochMs: number    // 绝对结束时间（epoch 毫秒）
  startLabel: string    // JS 预格式化，如 "10:00"
  endLabel: string      // JS 预格式化，如 "11:35"
  dayKey: string        // JS 本地日期，如 "2026-09-19"
  dayOffset: number     // 相对 `dayKeys[0]` 的天数偏移，0 = 快照生成当天
  weekdayLabel: string  // 如 "周三"
}

type WidgetSnapshotV1 = {
  schemaVersion: 1
  status: WidgetSnapshotStatus
  generatedAtEpochMs: number   // 快照生成时刻
  validUntilEpochMs: number    // 覆盖窗口结束（最后一天本地 24:00）
  entries: WidgetOccurrence[]  // 按 startEpochMs 升序，上限 800 条
  dayEndEpochMs: number[]      // 下标 = dayOffset，值为该日本地 24:00 的 epoch；覆盖窗口内每一天各一项
  generatedAt: string          // ISO 8601 含偏移，仅用于诊断
  timezone: string             // IANA 时区名，仅用于诊断
}
```

**关键设计点**

1. **覆盖窗口从「今天」一直延伸到学期最后一周的最后一天**（而不是固定天数，也不是只覆盖今天）。这样即使用户长期不打开 App，原生仍能用 `dayEndEpochMs` 定位「今天是第几天」并正确裁剪出当天的剩余课程，不会把昨天的列表当成今天。典型一学期约 400–500 条 occurrence，JSON 约 100 KB，远低于 256 KiB 上限；vitest 必须断言快照体积上限。窗口起点是快照生成当天，因此在学期中段生成时窗口自然缩短，不会有额外成本。
2. **`dayEndEpochMs[dayOffset]` 是原生判断「今天是哪一天」的唯一依据**，从而彻底避免原生做日期/时区运算（原生因此不需要 `java.time`、不需要 core library desugaring）。
3. **显示串由 JS 生成**（`startLabel`/`endLabel`/`weekdayLabel`/`sections`）。原生不做任何格式化，UI 文案因此只有一处事实来源。
4. **`validUntilEpochMs` 承载陈旧判定**：`now > validUntilEpochMs` 时原生显示陈旧提示，不猜。
5. `status` 区分三种「没有可展示课程」的原因：
   - `empty`：课表为空（未导入）；
   - `unavailable`：`firstWeekStartDate` 缺失，无法推算日历日期 —— 绝不退化为「第 N 周 + 今天」的猜测；
   - `ok`：正常（当日无课时 `entries` 仍可能包含后续日期）。
6. `schemaVersion` 不匹配时原生按「无可用快照」处理并保留原文件，不抛异常、不崩溃。
7. **`entries` 之外的字段刻意不含**：教师工号、`courseId`/`classId`、备注原文、URL、Cookie、学期标识。满足 N3。

---

## D3. 数据通道：自建 Capacitor 插件 + 应用私有 SharedPreferences

**决策**：新增 Capacitor 插件 `WidgetSnapshot`（Java，`android/app/src/main/java/com/classtrack/app/WidgetSnapshotPlugin.java`），Web 侧封装在 `app/lib/native-widget-snapshot.ts`。

- 存储位置：`getContext().getSharedPreferences("class-track-widget", Context.MODE_PRIVATE)`，单键 `snapshot_json`，单次 `putString(...).commit()` 写入一整个 JSON 字符串。
  - 用 `commit()` 而非 `apply()`：插件必须在 `resolve()` 之前保证数据已落盘，否则 JS 认为推送成功但接收方可能读到旧值（C2）。
  - 只写一个键 ⇒ 读者不可能观察到「半新半旧」的快照；JSON 本身要么完整要么不存在。
- 插入前校验：必须是合法 JSON 对象、`schemaVersion === 1`、`status` 属于枚举、`entries`/`dayEndEpochMs` 为数组、整体长度 ≤ 256 KiB、`entries` ≤ 60 条。任一不满足 → `call.reject(message, code)`。
- 错误码（与 `CourseImportErrorCode` 风格一致）：`UNAVAILABLE`、`INVALID_PAYLOAD`、`PAYLOAD_TOO_LARGE`、`STORAGE_ERROR`、`REFRESH_ERROR`。
- Web 实现：`WebPlugin` 子类，`pushSnapshot` 直接 `reject('UNAVAILABLE')`；调用方（同步 hook）在 Web 上根本不调用它，因此浏览器不会出现未捕获异常。
- 注册：`MainActivity.onCreate` 中 `registerPlugin(WidgetSnapshotPlugin.class)`（与 `CourseImportPlugin` 同一处）。

**被否决的方案**

- **`@capacitor/preferences`**：仓库当前未安装；它引入独立的序列化契约与 JS 层，而我们需要在写入后立刻触发刷新，自建插件反而更小。
- **原生解析 `class-track-storage`**：需要复制 schema 迁移、周次展开、单双周语义，且 Zustand 的持久化结构属于 Web 内部实现，把它变成原生契约会长期耦合。
- **WebView 直接暴露数据**：小工具可能在任何时刻被渲染（进程冷启动、无 Activity），不能依赖 WebView 存在。

---

## D4. 刷新调度：五层精度阶梯

**决策**：所有触发路径统一收敛到「读快照 → 重算状态 → 渲染 → 重排下一次触发」这一条**幂等**通路（`WidgetRefreshWorker`、`ClassTrackWidgetReceiver.onUpdate`、广播接收器共用同一实现）。

| 层 | 触发 | 机制 | 权限 | 精度 |
|---|---|---|---|---|
| **L1** | 数据变更 / 前台恢复 | 插件写入成功后 `WidgetRefreshBridge.requestRefresh(context)`（Kotlin `object` + `@JvmStatic`）；立即 `updateAll` + 入队 0 延迟唯一一次性 Work 作持久化兜底 | 无 | 立即 |
| **L2** | 跨零点 / 用户改时间 / 换时区 | manifest 声明接收 `ACTION_DATE_CHANGED`、`ACTION_TIME_SET`、`ACTION_TIMEZONE_CHANGED` → 立即重算并重排。这三个广播在 Android 8+ 的**隐式广播豁免清单**内，manifest 接收器可收，且与 targetSdk 无关 | 无 | 精确到广播时刻 |
| **L3** | 课程开始 / 结束边界（精确模式） | `AlarmManager.setExactAndAllowWhileIdle(boundary, pendingIntent)`，按 `canScheduleExactAlarms()` 判断可用性；**用户显式开启后启用** | 需用户在系统设置授予「闹钟与提醒」（`SCHEDULE_EXACT_ALARM`） | **Doze 下也按点触发**。现代应用的 Doze 配额是 72 次/小时，我们一天只触发几次，远不受限 |
| **L4** | 课程边界（回退，默认） | `OneTimeWorkRequest<WidgetRefreshWorker>`，`setInitialDelay(nextBoundary - now)`，`ExistingWorkPolicy.REPLACE`，唯一名 `widget-boundary-refresh`；每次执行后按最新快照重排下一个边界 | 无 | 屏幕点亮/退出 Doze 后通常数秒内交付；深 Doze 期间被推到维护窗口 |
| **L5** | 系统级兜底 | `appwidget-provider` 的 `android:updatePeriodMillis="1800000"` | 无 | ≤30 分钟（AOSP 硬下限 `MIN_UPDATE_PERIOD`）。由系统 `AppWidgetServiceImpl` 用自己的闹钟投递，不依赖 WorkManager、不依赖应用进程被预热 |

**L3 与 L4 的关系**：L3 开启时**优先**用精确闹钟；同时仍然保留 L4 的一次性 Work 作为冗余（若精确闹钟因权限被撤销、或因厂商 ROM 拦截而未触发，Work 仍会兜住）。两者指向同一个幂等重算入口，重复触发无副作用。

### 关键论证：为什么默认（无 L3）也够用

Doze **只在息屏 + 静止**一段时间后才进入。也就是说「≤30 分钟的陈旧窗口」在定义上只存在于**没人在看 widget** 的时候。用户一拿起手机（亮屏）设备即退出 Doze，被推迟的 WorkManager 任务与系统广播会被立即投递，widget 在数秒内自我纠正。因此：

- **亮屏时**：陈旧窗口是秒级到几分钟级；
- **息屏时**：可能陈旧到 30 分钟，但屏幕是黑的，无人可见；
- **跨零点与改时间**：由 L2 精确覆盖，不存在陈旧窗口。

L3 的价值在于把「首尾相接的两节课之间切错课」这个真实缺陷（最坏 30 分钟的错课）压缩到秒级 —— 因此它是本设计推荐的增强项，但**必须由用户显式授权**才能启用。

### 其他约定

- **`nextBoundary` 的取值**：`{ 当前进行中课程的 endEpochMs, 下一节课的 startEpochMs, 下一节课的 endEpochMs, 当天 24:00 }` 中大于 `now` 的最小值；若快照无未来项则取 `validUntilEpochMs`。
- **重启后自动恢复**：WorkManager 把待办持久化在自身数据库并由其库内 `RescheduleReceiver` 在开机后重建，因此**我们不声明 `RECEIVE_BOOT_COMPLETED`**。（注意：Glance 已传递依赖 `androidx.work`，其库清单会把这个普通权限合并进来 —— 这是融合清单的事实，不是本任务新增的声明。）L3 的精确闹钟是 `AlarmManager` 闹钟，**不随重启保留**，因此在 `ACTION_BOOT_COMPLETED` 不可用（我们不要该权限）的前提下，L3 只能由「开机后首次打开 App」或「首次系统 L5 广播」重新武装；这是 L3 的已知限制，必须写入交付说明（见 D12）。
- **`onEnabled` / `onDisabled`**：第一个实例被添加时启动排程，最后一个被移除时取消 `widget-boundary-refresh`、`widget-immediate-refresh` 与精确闹钟。
- **幂等性**：L2/L3/L4/L5 可能在同一分钟内先后触发。所有路径必须是无状态重算 + 重排，不依赖「上次是谁调用的」。
- **权限撤销处理**：若用户在授予后又撤销「闹钟与提醒」，`canScheduleExactAlarms()` 会返回 false；此时静默回退到 L4，不得抛出或崩溃。同时注册 `AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED`（前台广播）以便在授权状态变化时重新武装或清理。

**被否决的方案**

- **只依赖 WorkManager 的 `PeriodicWorkRequest` 做兜底（本设计早期版本）**：WorkManager 会被 Doze 与厂商省电策略节流，且依赖其自身数据库与进程唤醒；`updatePeriodMillis`（L5）由系统闹钟投递，更独立、更省电，因此取代周期 Worker。
- **`setAlarmClock()`**：虽然不受 Doze 限流且系统会提前退出 Doze，但它会在状态栏显示闹钟图标，对一个课程表 widget 是误导性的 UX；且同样需要精确闹钟权限。
- **`ACTION_TIME_TICK`（每分钟一次）**：虽在豁免清单内可以 manifest 接收，但会让应用每分钟被唤醒，对 battery 完全不值得。
- **自己声明 `BOOT_COMPLETED` 接收器**：重复 WorkManager 已提供的能力，多一个权限声明与一段生命周期代码。
- **把 L3 设为默认并首次启动就弹权限**：`SCHEDULE_EXACT_ALARM` 在 Android 14+ 默认拒绝，未获得用户明确同意前弹系统设置会造成困惑与拒绝率上升；因此改为「应用内说明 + 一键跳转」的引导式可选增强（见 D12 与 implement.md P5）。
---

## D5. Java ↔ Kotlin 边界

**决策**：插件（Java）与 widget（Kotlin）之间只有一种跨语言调用：`WidgetRefreshBridge.requestRefresh(Context)`（Kotlin `object` + `@JvmStatic`，Java 以静态方法调用）。其余全部通过 SharedPreferences（数据）与广播（系统事件）解耦。

理由：Capacitor 插件必须与 `CourseImportPlugin` 保持同构（Java），而 Glance 必须是 Kotlin。把跨语言面压到「一个静态方法、参数只有 Context、无返回值」可以把 Kotlin/Java 互操作风险降到最低。

`WidgetSnapshotPlugin` 位于 Java，因此不直接触碰 Glance 的 suspend API；`WidgetRefreshBridge` 负责 `CoroutineScope` 与 `updateAll` 的分发。

---

## D6. 前台恢复检测

**决策**：在 `WidgetSnapshotPlugin` 中覆写 `handleOnResume()`（`com.getcapacitor.Plugin` 已提供，`Bridge.onResume()` 会遍历插件调用），用 `notifyListeners("resumed", null)` 通知 JS。JS 通过 `addListener('resumed', ...)` 触发一次推送。

**被否决的方案**

- **新增 `@capacitor/app` 依赖**：为单个事件引入一个 npm 依赖不值得；上述方案 5 行原生代码即可。
- **`document.visibilitychange`**：Capacitor WebView 下的触发时机没有契约保证，不能作为唯一依据。

---

## D7. 原生渲染与状态解析

### 状态模型

```kotlin
// 下面用 Kotlin 书写仅为表达力；**P3 的实际实现是 Java 类**（`WidgetDisplayState` 用内部枚举），
// 因为该阶段刻意不碰 Glance，纯逻辑放在 Java 里能与既有测试风格保持一致。
sealed interface WidgetDisplayState {
  data object Missing : WidgetDisplayState      // 从未推送过快照 / schemaVersion 不匹配
  data object Unavailable : WidgetDisplayState  // 缺少学期开始日期
  data object Empty : WidgetDisplayState        // 课表为空（尚未导入课程）
  data object Stale : WidgetDisplayState        // now > validUntilEpochMs，或设备时钟被回拨
  data object NoUpcoming : WidgetDisplayState   // 快照有效，但已无任何未结束的课程（学期已结束）
  data class Ready(
    val hero: Hero,                       // 正在进行 / 接下来
    val heroState: HeroState,             // InProgress | Upcoming | UpcomingOtherDay
    val todayItems: List<WidgetDayItem>,  // 今天一整天的课（含已上完），按 startEpochMs 升序
    val todayRemainingCount: Int,         // 今天尚未结束的节数（紧凑样式用）
    val todayFinishedCount: Int,          // 今天已上完的节数（折叠策略用）
    val nextBoundaryEpochMs: Long,        // 下一次需要重渲染的时刻，由解析器一并算出
  ) : WidgetDisplayState
  data class WidgetDayItem(
    val occurrence: WidgetOccurrence,
    val phase: Phase,                     // 由解析器按 now 标好，渲染层因此不做任何时间比较
  )
  enum class Phase { FINISHED, IN_PROGRESS, UPCOMING }
}
```

**实现期新增的两点（P3 落地后回填）**：

1. **`NoUpcoming` 与 `Empty` 必须分开**：`Empty` 是「还没导入课表」，`NoUpcoming` 是「本学期已结束」。两者对用户的含义完全不同，合并成一个状态会让 UI 在学期末错误地提示「暂无课表数据」。
2. **`nextBoundaryEpochMs` 由解析器一并算出**，而不是让调度器自己去拼候选集合。这样「下一边界是哪一刻」也落进了可单测的纯函数（`WidgetStateResolverTest` 有 4 个用例专测它），调度器只剩「把时刻交给 AlarmManager / WorkManager」这一件事。

### 解析纯函数

```kotlin
fun parseWidgetSnapshot(json: String): WidgetSnapshot?   // 失败返回 null
fun resolveWidgetDisplayState(snapshot: WidgetSnapshot?, nowEpochMs: Long): WidgetDisplayState
fun nextBoundaryEpochMs(state: WidgetDisplayState, nowEpochMs: Long): Long?
fun formatCountdown(...)  // 不使用；时间文案全部来自 JS
```

### 解析算法（`resolveWidgetDisplayState`）

1. `snapshot == null` → `Missing`；`schemaVersion != 1` → `Missing`（保留原文件）。
2. `status == Unavailable` → `Unavailable`；`status == Empty` → `Empty`。
3. `now > validUntilEpochMs` → `Stale`。
4. `currentDayOffset` = 满足 `dayEndEpochMs[i] > now` 的最小下标 `i`；不存在则 `Stale`。
5. `hero` 候选 = `entries` 中 `endEpochMs > now` 的第一项。
   - 若 `startEpochMs <= now < endEpochMs` → `HeroState.InProgress`。
   - 否则若该项 `dayOffset == currentDayOffset` → `HeroState.Upcoming`。
   - 否则 → `HeroState.UpcomingOtherDay`（今日无课，显示后续日期）。
   - 没有任何候选 → `Empty`（课表已结束）。
6. `todayItems` = `entries` 中 `dayOffset == currentDayOffset` 的**全部**项（含已上完），按 `startEpochMs` 升序，每项按 `now` 标 `phase`：`endEpochMs <= now` → `FINISHED`；`startEpochMs <= now < endEpochMs` → `IN_PROGRESS`；否则 `UPCOMING`。
   - 时间比较**只发生在这里**：渲染层拿到的每一行都带好了 `phase`，所以「渲染层无时间运算」这条分工原则依然成立。
   - `todayItems` 与 `hero` 是两种用途不同的视图：前者回答「今天整天有什么」，后者回答「现在上什么」。**原设计只显示一节的原因正在于此** —— `todayRemaining` 的定义排除了 hero 与已上完项，于是当天课上完后只剩一行明天的课。
7. `todayRemainingCount` = `todayItems` 中 `endEpochMs > now` 的项数；`todayFinishedCount` = `phase == FINISHED` 的项数。（紧凑样式显示「今天还有 N 节」，折叠策略显示「已上完 N 节」，两者都直接读这两个数，不在渲染层重算。）
8. 早退保护：`now < generatedAtEpochMs - 6h`（设备时钟被回拨）时按 `Stale` 处理。

**这是本任务唯一需要精细推理的算法，因此全部落在纯 Java/Kotlin 类中，用 JUnit 覆盖（不依赖 Android 框架）。**

### 渲染

**三种样式，按 widget 实例选择**（R1/R8，配置见 D13）。渲染层的输入是「解析好的状态 + 该实例的配置」，输出是 RemoteViews；渲染层不做任何时间比较、也不做策略判断：

| 样式 | 结构 | 小尺寸退化 |
|---|---|---|
| 全天课表（默认） | 汇总行（`今天 周三 · 共 N 节`）→ 可滚动列表（全天课程，`IN_PROGRESS` 高亮、`FINISHED` 按策略处理） | 高度 < 110dp 时省略汇总行 |
| 接下来 | hero 卡片（状态标签 + 课程名 + 起止时间 + 教室）→ 分隔线 → 可滚动列表（同全天课表） | 高度 < 150dp 时只留 hero |
| 紧凑 | hero（课程名 + 时间 + 教室）→ 一行「今天还有 N 节」/「今天已无课」 | 无（本身即最小形态） |

- **列表真实滚动**：用 Glance 的 `LazyColumn`（`androidx.glance.appwidget.lazy`）+ `ColumnScope.defaultWeight()` 吃掉剩余高度。底层就是 Android 原生的集合型 widget（`GlanceRemoteViewsService` + `RemoteCollectionItems`），已在合并清单里，**不需要新增组件或权限**。因此不再有「+N 节未显示」这种截断（R5 变更）。
- **行数由策略决定而不是截断**：`FINISHED` 行是显示、隐藏还是折叠成计数，由 D13 的「已上完的课」选项决定；这部分判断放在纯函数 `WidgetDayListPolicy`（Java，可 JUnit 覆盖）里，渲染层只按结果画。
- 点击：widget 主体绑定 `actionStartActivity` → `MainActivity`（携课表跳转 extra，见 D8）；汇总行的「样式」小按钮绑定另一个 `actionStartActivity` → `WidgetConfigActivity`（携 `EXTRA_APPWIDGET_ID`，见 D13）。两个点击区域不重叠，主体点击行为不回归。
- 主题：显式提供浅色/深色两组颜色（`res/values/colors.xml` + `res/values-night/colors.xml`），不依赖自定义字体（Glance 不支持）。
- 尺寸：`SizeMode.Responsive(setOf(110×110dp, 180×140dp, 250×180dp, 250×260dp))`，provider XML 的 `targetCellWidth/Height = 4x3`、`minWidth/minHeight = 110dp`（允许缩到约 2x2）。**实际渲染只依据 `LocalSize`，不依据命中了哪一档** —— 这样在 Android 12 以下（系统不给多尺寸集合，由 `AppWidgetUtilsKt.findBestSize()` 挑最接近的一档，provider 的 min 尺寸会成为回退基准）也不会因为「挑错档」而只显示一节。这条是 2026-09-19 那次缺陷的根治措施。
- `android:updatePeriodMillis="1800000"`（见 D4 系统级兜底）；选择器预览见 D14。

---

## D8. 点击打开 App（含课表跳转）

- Widget 的点击 action 启动 `MainActivity`，并附带 `Intent` extra `classtrack_widget_route = "/schedule"`。
- `MainActivity.onNewIntent`/`onCreate` 把该 extra 交给 `WidgetSnapshotPlugin` 暂存；插件暴露 `consumePendingRoute()`，JS 在启动时消费并 `navigate('/schedule')`。
- **降级条款**：若该链路在模拟器上无法稳定验证（`singleTask` + `onNewIntent` 的时序、或与 `CourseImportShellUrl` 的启动契约冲突），则降级为「仅打开 App 首页」，并在 `check` 阶段记录该降级，不声称已实现跳转。这与既有 spec 中「显式记录降级」的做法一致。

---

## D9. Web 侧模块划分

| 文件 | 职责 |
|---|---|
| `app/lib/widget-snapshot.ts` | `WidgetSnapshotV1` / `WidgetOccurrence` 类型 + `buildWidgetSnapshot(input, now)` 纯函数 + `serializeWidgetSnapshot()` |
| `app/lib/widget-snapshot.test.ts` | vitest，纯逻辑，`now` 与日期全部显式传入 |
| `app/lib/native-widget-snapshot.ts` | `registerPlugin` 封装、`WidgetSnapshotErrorCode` 联合类型、`isNativeWidgetSnapshotAvailable()`、Web 侧 `WebPlugin` 兜底 |
| `app/hooks/useWidgetSnapshotSync.ts` | 集中式同步：store 订阅（去抖 1.5s）+ 启动推送 + `resumed` 监听 |
| `app/components/native-widget/WidgetSnapshotSync.tsx` | 挂载上述 hook 并返回 `null` |
| `app/features/profile/hooks/useWidgetPrecision.ts` | 读取/请求精确闹钟授权状态（D12 的设置节数据源） |

- 挂载点：`app/root.tsx` 的 `Layout` 中，与 `<PwaUpdatePrompt />` 并列 —— `{!nativeShell && <WidgetSnapshotSync />}`。原生导入壳（`?native-shell=1`）没有课表数据，必须排除。
- 订阅实现：`useClassStore.subscribe(listener)`，在 listener 内**手写字段比较**（`classes`、`currentWeek`、`firstWeekStartDate`、`currentSemesterId`、`semesters`、`isInitialized` 的引用比较）。不引入 `subscribeWithSelector` 中间件，避免为单个消费方改动 store 结构。
- 去抖用 `useRef` + `setTimeout`，不在 effect 内同步 setState（质量规范禁止）。
- 仅在 `isNativeWidgetSnapshotAvailable()` 为真时推送；其余环境整体 no-op。

## D10. 与既有安全/构建边界的兼容

- 不修改 `CourseImportShellUrl`、导航 allowlist、捕获 allowlist、缓存交接（cache-dir）流程中的任何一项。
- 新增文件不进入 `build/client`，因此 `scripts/check-android-assets.js` 的字节一致性断言不受影响；该脚本会作为每个阶段的收尾校验之一运行。
- Widget 的持久化是应用私有 SharedPreferences，与 WebView 的 localStorage 互不干扰。

---

## D13. 每实例样式配置（R8/R9）

**决策**：样式与「已上完的课」选项按 **widget 实例**保存，用 Glance 官方状态容器而不是自建 SharedPreferences。

- 存储：`updateAppWidgetState(context, PreferencesGlanceStateDefinition, glanceId) { prefs -> ... }` 写两个键；读取用 `currentState(glanceId, PreferencesGlanceStateDefinition)`。选 Glance 状态容器而不是自建 prefs 键，是因为它天然按 `GlanceId` 分片、随实例删除而清理，不会因为 `appWidgetId` 复用而继承上一个实例的样式。
- 映射：`GlanceAppWidgetManager.getAppWidgetId(glanceId)` / `getGlanceIdBy(appWidgetId)` / `getGlanceIdBy(intent)`（三个 API 已在 `glance-appwidget-1.2.0` 的字节码里确认存在，见下）。
- 默认值：从未写入过状态 → **接下来**（`DEFAULT_LAYOUT_STYLE`，2026-09-20 从「全天课表」改）+ 已上完灰显。选择器预览（D14）与配置页的默认选中项都跟随这个常量：改它就要同步改 `widget_preview_next_up.xml` 与 `scripts/generate-widget-preview.py`。未知或损坏的值按默认值处理、不抛异常（与 D2 `schemaVersion` 不匹配时的策略一致）。
- 清理：覆写 `GlanceAppWidgetReceiver.onDeleted(context, appWidgetIds)`，删除该实例的键。

```kotlin
// 已确认存在于 androidx.glance.appwidget.GlanceAppWidgetManager（1.2.0 字节码）
fun getAppWidgetId(glanceId: GlanceId): Int
fun getGlanceIdBy(appWidgetId: Int): GlanceId
fun getGlanceIdBy(intent: Intent): GlanceId
```

### 配置页（`WidgetConfigActivity`）

- provider XML 声明 `android:configure="com.classtrack.app.widget.WidgetConfigActivity"`，launcher 在**放置时**自动打开它；同时声明 `android:widgetFeatures="reconfigurable"`（API 28+），使长按菜单出现「重新配置」入口。
- 放置之后再次修改：汇总行里的「样式」小按钮 → `Intent(context, WidgetConfigActivity::class.java).setAction(AppWidgetManager.ACTION_APPWIDGET_CONFIGURE).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)`。
- 配置页用传统 View + XML 实现（不引入 Compose UI 依赖，把依赖面控制在「Glance 与其传递依赖」内）：两组单选（样式 / 已上完的课）+ 三张样式缩略预览（静态 mock inflate，见 D14）+ 确定 / 取消。
- 确认：写状态 → `ClassTrackWidget().update(context, glanceId)` → `setResult(RESULT_OK, intent.putExtra(EXTRA_APPWIDGET_ID, id))` → `finish()`。取消：`setResult(RESULT_CANCELED)` 后 `finish()`，让 launcher 不留下实例。
- 交互诚实性：选中「紧凑」样式时，「已上完的课」对它无效果，配置页必须就地标注这一点（R9），不能让用户以为设置坏了。

### 安全边界（必须实现，属于新增攻击面）

1. 该 Activity 必须 `android:exported="true"`（launcher 要能拉起它），因此 `EXTRA_APPWIDGET_ID` 一律按**不可信输入**处理：用 `AppWidgetManager.getAppWidgetInfo(id)` 校验该 id 存在、且其 `provider` 等于本应用的 `ClassTrackWidgetReceiver`；不满足立即 `setResult(RESULT_CANCELED)` + `finish()`，不做任何写入、不返回任何信息。
2. ~~配置页**不显示任何课程数据**~~ —— **该边界已于 2026-09-19 被用户主动替换**（见 D14「残余风险」）：配置页现在渲染真实课表作为所见即所得的样式预览。保留的缓解、以及为什么不靠白名单 launcher 包名「加固」，都写在 D14 里；不要把它当成遗漏去「修」。
3. Intent 里只有整数 widget id，不接收 URL、文件路径或任意 payload，也就没有注入面。
4. 日志沿用 D3 的诊断约定：只记 phase / 枚举 / 布尔，不记课程载荷。

---

## D14. 选择器预览（R10）

- **Android 12+**：`android:previewLayout` 指向一份传统 RemoteViews 布局 mock，只能使用白名单类（`FrameLayout` / `LinearLayout` / `TextView` / `ImageView` 等）。**绝不能再出现 `android.view.View`** —— 那正是 2026-09-19 设备验收发现的缺陷 1（`InflateException: Class not allowed to be inflated android.view.View`，桌面显示「Can't load widget」）。mock 展示默认样式（全天课表）。
- **Android 12 以下**：`android:previewImage` 指向一张**由真机截图裁出的真实预览图**（`res/drawable-nodpi/widget_preview.png`，用 Pillow 从 `adb exec-out screencap` 的截图裁切），而不是现在的 `@mipmap/ic_launcher` —— 后者就是用户报的「没有做好预览」。
- **配置页缩略图：改为「真实渲染」，静态 mock 已删除**（2026-09-19 需求变更）。原先三套静态 mock 与真实 Glance 渲染是两套代码，真机上直接对不上：预览永远显示示例数据（「今天 周三 · 共 6 节 + 3 行示例课程」），而真实卡片在周末只有两行并留下大片空白。用户明确要求**所见即所得**，于是：
  - `WidgetPreviewRenderer` 复用同一个 `WidgetContent` 组合，经 `GlanceRemoteViews.compose(context, size, null, Bundle.EMPTY)` 得到真实 `RemoteViews`，配置页用 `RemoteViews.apply` 放进 `FrameLayout`（视觉上按槽宽等比缩小）。
  - 渲染尺寸取实例的真实格子尺寸（`OPTION_APPWIDGET_MIN_WIDTH/HEIGHT`）。这一点只在 `sizeMode = Exact` 时成立：此前声明固定候选尺寸（`Responsive`）时，真实渲染用的是挑中的那一档（180×140），预览却按格子原始尺寸（286×158）画，于是「预览列出三行课、桌面只剩 hero」（真机实测）。
  - `widget_preview_next_up.xml` / `widget_preview_compact.xml` **已删除**：两套渲染器要手工同步，正是漂移的来源。`widget_preview_day_list.xml` 只保留给 picker 的 `previewLayout`（那是宿主 inflate 的静态布局，拿不到数据），仍需手工保持同步。
- **踩过并必须保住的两个坑**（真机复现）：
  1. **`RemoteViews` 必须用 `applicationContext` inflate**，不能用 Activity：`AppCompatActivity` 的 LayoutInflater 上装着 AppCompat 的视图替换工厂，会把框架控件换成 `AppCompat*`，而 `RemoteViews` 的反射只接受框架类，`apply()` 时抛 `ActionException: view: androidx.appcompat.widget.AppCompatImageView can't use method with RemoteViews: setImageResource(int)` 直接崩掉进程。宿主 launcher 没有这个工厂，所以 Application 上下文才等价于宿主 inflate 出来的布局。
  2. **预览失败绝不能影响保存样式**：`WidgetPreviewRenderer.render` 捕获 `RuntimeException` 返回 `null`，配置页 `showPreview` 外再包一层捕获 —— 预览只是锦上添花，用户必须始终能改回样式。
- **诚实性要求**：预览与真实渲染共用同一份「行的序列」与同一个渲染函数（`bodyLines` / `BodyLineView`），**不做第二套渲染代码**；唯一差别是预览用普通 `Column`（`LazyColumn` 靠宿主的 `RemoteViewsService` 填行，没有宿主时会画成空列表）。改样式只需改一处。
- **残余风险（已接受）**：配置页现在会渲染真实课程数据，而它是 `exported` 的 Activity。任何能猜到有效 `appWidgetId` 的应用都可以拉起它并看到课表。原来的「配置页不显示任何课程数据」边界是为了彻底避免这一类问题，用户在看到「静态 mock 会撒谎」后选择用 WYSIWYG 换掉它。保留的缓解：仍校验 widget id 归属、Intent 不携带任何载荷、日志不含课程内容。**不要**用白名单 launcher 包名来「加固」：configure Intent 只带 id，包名不是可验证的信任根。

---

## D15. 实验性 API opt-in：正好两处

- `androidx.glance.appwidget.lazy.LazyColumn` 带 `androidx.glance.ExperimentalGlanceApi` 注解（已实测确认字节码），因此 `ClassTrackWidget.kt` 里有一处 `@OptIn(ExperimentalGlanceApi::class)`。
- 配置页预览用的 `GlanceRemoteViews` 带 `androidx.glance.ExperimentalGlanceRemoteViewsApi` 注解，因此 `WidgetPreviewRenderer.kt` 里有一处 `@OptIn(ExperimentalGlanceRemoteViewsApi::class)`（2026-09-19 从静态 mock 改成真实渲染时引入）。
- **为什么接受**：两处都是官方 opt-in 机制（不是 `@Suppress` 式压制）。前者是 Glance 里**唯一**能实现 widget 内真实滚动的路径（用户明确要求「格子放不下时可以上下滑动看完整天」）；后者是**唯一**能把真实组合渲染成 `RemoteViews` 的公开入口，而所见即所得的预览正是用户点名要的。
- **影响面与检查方式**：`grep -rn "OptIn" android/app/src/main` 应当正好命中这两处，不得扩散。**注意 `ExperimentalGlanceRemoteViewsApi` 与 `ExperimentalGlanceApi` 是两件事**：前者只服务配置页预览，即使将来被移除也只影响预览（回退路径是恢复静态 mock 布局）。
- **回退路径**：若某个启动器不支持集合型 widget（滚动退化为不可滑），把列表换回「按 `LocalSize` 计算行数 + `+N 节未显示`」的截断实现即可 —— 纯 Kotlin 改动，不影响 D2 契约、D3 通道、D4 调度与 Java 纯逻辑。

---

## D16. 响应式：按真实尺寸自适应，不用尺寸档位（2026-09-19 真机回测确立）

**决策**：`sizeMode = SizeMode.Exact`，布局完全由内容与真实可用空间决定，**不声明固定候选尺寸、不写按尺寸分支的阈值**。

- **为什么改掉 `SizeMode.Responsive(4 档)`**：声明档位会让「真实渲染用哪一档」与「配置页拿到的格子尺寸」成为两件事 —— 真机 4×2 上真实渲染按 180×140 裁决、预览按 286×158 画，于是预览列出三行课而桌面只剩 hero。同时档位本身也不可靠：Android 12 以下没有多尺寸集合，`findBestSize` 只会挑最近的一档；用户还能把格子拖成任意大小。改成 `Exact` 后 `LocalSize` 就是真实格子尺寸，预览与真机天然一致（真机日志 `widget_sized 286x158` / `preview_sized 286x158` 相同）。
- **自适应靠布局而不是算术**：正文是一份行序列（`bodyLines` → `List<BodyLine>`），装进 `LazyColumn` 吃掉卡片剩余高度 —— 格子高就多显示几行、矮就少显示几行并允许滑动。**不要**再回到 `if (availableHeight < N.dp) 不显示列表` 这类阈值：那既是「钉死尺寸」，也制造过「4×2 只剩 hero、下面 45% 全白」。
- **整张卡片一条滚动轴**：hero、汇总行、课程行都是同一个 `LazyColumn` 的 item，不存在「上方固定 + 下方一小块可滚」的局部滚动区。用户明确否掉了后者：「不要做一个特别小的滚动区域」。
- **上下留白属于内容**（序列首尾各一个 `Spacer`），不挂在卡片的 `padding` 上：挂在卡片上的纵向内边距在滚动时不动，看起来就是顶部一条固定的白边（用户回测报的就是这个）。
- **hero 课程名只给一行**（`maxLines = 1`）：真机上两行标题会把卡片上半部分吃光，留给「剩余课程」的位置只剩一丝。用户的原话：「如果课程要换行，留给剩余部分的显示面积就很少」。
- **紧凑样式不因格子变大而加内容**：它的定位就是只显示一节课（R8），用户也确认「紧凑可以就不显示那么多」。

---

## D17. 集合型 widget 的两个真机坑：点击与滚动条（2026-09-20 回测确立）

`LazyColumn` 让正文变成 RemoteViews **集合**（底层是宿主的 `ListView` + `RemoteViewsService`）。这一步带来两个只有真机能发现的坑，都已修，并写进 spec 契约防止复发。

### 坑 1：整卡点击失效（严重，用户报「点卡片打不开 App」）

- **现象**：改装成整卡滚动之后，点卡片没有任何反应，App 打不开。
- **根因**：`LazyColumn` 变成的 `ListView` 几乎铺满整张卡片，`AbsListView` 会为自己的滚动把触摸事件吃掉，**挂在最外层根布局上的 `clickable` 因此永远收不到点击**。此前能点是因为列表只占卡片下半部分，上半部分的 hero 区还能命中根布局。
- **修法**：同一个 `actionStartActivity(...)` 同时挂在三处 —— `LazyColumn` 自己（覆盖列表容器，包括项之间的空隙）、每个列表项的 `Box`（项级点击，集合型 widget 的标准做法）、以及首尾两个留白项（覆盖内边距与内容下方的空白）。改动渲染层时必须保留这三处。
- **验证**：真机 `adb shell input tap` 命中 hero 区与课程行区，`dumpsys activity activities` 的 `topResumedActivity` 都变成 `com.classtrack.app/.MainActivity`（修复前是 launcher）。

### 坑 2：拖动时出现滚动条，压住教室列

- **现象**：上下滑动时右缘出现一条纵向滚动条，正好压在教室文字上。
- **根因**：Glance 的集合容器布局是 `glance_list.xml` 里的 `ListView`，它的 style `Glance.AppWidget.List` 只设了 `ellipsize`，**没有**关滚动条 —— 于是走 Android 给 `ListView` 的默认纵向滚动条。
- **修法**：在 app 模块放一份同名资源 `android/app/src/main/res/layout/glance_list.xml`（与 `glance-appwidget-1.2.0` 的版本逐字一致，只多 `android:scrollbars="none"`）。Android 的资源合并是 **app 覆盖库**，因此不需要 fork 依赖。验证方式：`aapt2 dump xmltree --file res/layout/glance_list.xml <apk>` 应显示 `scrollbars=0x0`。
- **代价**：这份文件与 Glance 版本耦合 —— 升级 Glance 时必须重新 diff 上游那份布局，否则会漏掉上游新增的属性。

---

**权衡**：`Exact` 下每次尺寸变化都要重新组合（`Responsive` 会预先为几档尺寸各组合一次），代价是首次绘制稍贵；换来的是任意尺寸都正确、以及预览与真机不再可能不一致。
---

## 附录

D11（长期不打开 App 的保证与失效边界）、D12（精度阶梯的用户可见行为与交付口径）、D13（每实例样式配置与配置页安全边界）、D14（预览：真实渲染与残余风险）、D15（两处实验性 API opt-in）、D16（响应式：按真实尺寸自适应）、D17（集合型 widget 的点击与滚动条）、一致性检查表、Rollback、验证策略与未决事实见 [design-appendix.md](./design-appendix.md)。**D11/D12 是交付口径的强制部分；D13 的安全边界与 D14 的残余风险是新增攻击面的强制部分；D16 是渲染改动的强制约束（不许回到尺寸档位与阈值），实现与检查都必须读。**

