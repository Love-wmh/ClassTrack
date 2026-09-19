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
| `work-runtime-ktx` | `2.11.2` | Glance 传递引入的是 2021 年的 `2.7.1`；显式提升到当前稳定版，避免老版本在 targetSdk 36 上的已知缺陷 |

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
    val hero: Hero,                  // 正在进行 / 接下来
    val todayRemaining: List<Item>,  // 今日剩余（不含 hero）
    val heroState: HeroState,        // InProgress | Upcoming | UpcomingOtherDay
    val nextBoundaryEpochMs: Long,   // 下一次需要重渲染的时刻，由解析器一并算出
  ) : WidgetDisplayState
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
6. `todayRemaining` = `entries` 中 `dayOffset == currentDayOffset` 且 `startEpochMs > now` 且 `id != hero.id` 的项。
7. 早退保护：`now < generatedAtEpochMs - 6h`（设备时钟被回拨）时按 `Stale` 处理。

**这是本任务唯一需要精细推理的算法，因此全部落在纯 Java/Kotlin 类中，用 JUnit 覆盖（不依赖 Android 框架）。**

### 渲染

- `SizeMode.Responsive(setOf(Compact(180×60dp), Detailed(250×140dp), Expanded(250×200dp)))`：
  - `Compact` → 仅 hero（课程名 + `startLabel–endLabel`），单行省略；
  - `Detailed` → hero 卡片 + 最多 4 条今日剩余；
  - `Expanded` → hero 卡片 + 最多 7 条今日剩余。
- 超出容量的列表**截断**，不滚动、不溢出（Glance 的 `LazyColumn` 在 widget 内可滚动，但固定尺寸下截断更可预测；列表尾部显示 `+N` 提示）。
- 点击：整个 widget 绑定 `actionStartActivity` → `MainActivity`；若携带课表跳转 Intent extra，由 D8 处理。
- 主题：显式提供浅色/深色两组颜色（`res/values/colors.xml` + `res/values-night/colors.xml`），不依赖自定义字体（Glance 不支持）。
- `android:updatePeriodMillis="1800000"`（见 D4 系统级兜底）；provider XML 声明 `minWidth/minHeight`、`targetCellWidth/Height`、`resizeMode="horizontal|vertical"`、`description`。
  - `previewLayout` **不实现**：它需要一份传统 RemoteViews 布局资源，收益仅限选择器预览像素，列为可选打磨（见 implement.md P5）。未提供时系统使用默认预览。

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

## 附录

D11（长期不打开 App 的保证与失效边界）、D12（精度阶梯的用户可见行为与交付口径）、一致性检查表、Rollback、验证策略与未决事实见 [design-appendix.md](./design-appendix.md)。**D11/D12 是交付口径的强制部分，实现与检查都必须读。**

