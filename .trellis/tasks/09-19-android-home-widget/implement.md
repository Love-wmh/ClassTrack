# 执行计划：Android 桌面小工具显示接下来的课程

> 任务：`.trellis/tasks/09-19-android-home-widget` · 分支 `feat/android-home-widget`（base `master`）
> 设计依据：同目录 `design.md`；契约以 `design.md` D2 为唯一事实来源。

## 执行约定

- **阶段顺序不可调换**：P1 必须先于 P2–P5，因为 Kotlin/Glance 工具链是本任务唯一的黑天鹅风险，必须最先证伪或证实。
- **每个阶段结束都要**：(1) 跑该阶段列出的校验命令；(2) 确认输出符合「通过判据」；(3) 若失败，按该阶段的「回滚点」处理，不要带着失败进入下一阶段。
- **提交粒度**：每个阶段一个 commit，遵循仓库 commitlint（`type-enum` 限定 `build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test`）。
- **禁止事项**（违反即回退重做）：
  - 不使用 `@ts-ignore` / `@ts-expect-error` / `eslint-disable` / `any`；
  - 不使用抑制手段绕过构建或测试失败；
  - 不改动 `CourseImportShellUrl`、导航 allowlist、捕获 allowlist、`scripts/check-android-assets.js` 的判定逻辑；
  - 不在原生侧引入 `java.time` / `Calendar` / `SimpleDateFormat`（design 一致性检查表 #2）。

## 需要的既有参考资料

| 用途 | 路径 |
|---|---|
| Web 侧插件与降级模式范本 | `app/lib/native-course-import.ts`、`app/lib/native-platform.ts` |
| 课程/学期领域类型 | `app/lib/types.ts` |
| 周次与日期既有算法 | `app/features/schedule/utils.ts`（`getCurrentWeek`、`getMaxWeek`、`getDayDate`） |
| Android 插件范本 | `android/app/src/main/java/com/classtrack/app/CourseImportPlugin.java` |
| Android 纯逻辑测试范本 | `android/app/src/test/java/com/classtrack/app/*Test.java` |
| 构建/资源校验 | `scripts/check-android-assets.js`、`scripts/install-android.sh`、`package.json` scripts |
| 质量门禁定义 | `.trellis/spec/frontend/quality-guidelines.md` |
| 研究证据（未被注入，按需自行读取） | `research/internal-web-layer.md`、`research/internal-android-layer.md`、`research/external-glance-widget.md`、`research/widget-data-bridge.md` |

---

## P-1. 本机构建环境（**先读这一节，否则 Gradle 跑不起来**）

本机根文件系统只读、且没有可用 DNS。所有 `./android/gradlew` 调用都必须先做下面两步，否则会分别报
「`gradle-8.14.3-all.zip.lck` Read-only file system」/「Name or service not known」/「Unable to create debug keystore … not writable」。

```bash
# 1) 可写的 GRADLE_USER_HOME + 代理 + 镜像（都在仓库外，绝不写进版本库）
GH=/home/yetongy/.cache/gradle-home
mkdir -p "$GH/caches" "$GH/wrapper/dists" "$GH/init.d"
cp -a ~/.gradle/wrapper/dists/gradle-8.14.3-all "$GH/wrapper/dists/"
cp -a ~/.gradle/caches/modules-2 "$GH/caches/"
cp -a ~/.gradle/caches/jars-9 "$GH/caches/"
cp -a ~/.gradle/caches/8.14.3 "$GH/caches/"
cp scripts/gradle-mirrors.init.gradle "$GH/init.d/"
# 并在 $GH/gradle.properties 写 systemProp.http(s).proxyHost=localhost / proxyPort=3128 / proxyUser / proxyPassword（凭据取自 $HTTPS_PROXY）

# 2) 可写的 Android 用户目录（AGP 要在其中创建 debug keystore）
AH=/home/yetongy/.cache/android-home
mkdir -p "$AH" && cp -a ~/.android/. "$AH/"

export GRADLE_USER_HOME=$GH ANDROID_USER_HOME=$AH
```

**代理凭据与本机路径属于环境信息，禁止写入仓库任何文件**（包括 `android/gradle.properties`、`android/local.properties`）。

## 阶段状态（每次推进后更新）

| 阶段 | 状态 | 实测结论 |
|---|---|---|
| P0 基线 | ✅ 完成 | Web 五项门禁全绿（vitest 29 用例）；`testDebugUnitTest` 16 用例通过；`android:check-assets` 通过 |
| P1 工具链 | ✅ 完成 | KGP 2.1.20 + compose 编译器插件 + Glance 1.2.0 + WorkManager 2.11.2 可编译出 APK；**不需要** `buildFeatures.compose`；Java/Kotlin jvmTarget 统一 21（见 design.md D1.2） |
| P2 Web 契约 | ✅ 完成 | `app/lib/widget-snapshot.ts`（+18 用例）、`native-widget-snapshot.ts`（+5 用例）落地；全量 vitest 52 用例通过 |
| P3 Android 通道 | ⬜ 待做 | |
| P4 Glance + 调度 | ⬜ 待做 | |
| P5 Web 接入 | ⬜ 待做 | |
| P6 端到端 | ⬜ 待做 | |
---

## P0. 基线确认（不产出代码）

**目标**：把 master 基线的门禁结果固定下来，后续任何失败都能归因到本次改动。

1. 在分支上运行：
   ```bash
   pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
   ```
2. 记录 Android 基线（首次执行会下载依赖，耗时较长）：
   ```bash
   ./android/gradlew -p android :app:testDebugUnitTest
   ```
3. 记录依赖解析是否顺畅；若 `repo1.maven.org` 直连失败，按 README 启用镜像：
   ```bash
   mkdir -p ~/.gradle/init.d && cp scripts/gradle-mirrors.init.gradle ~/.gradle/init.d/
   ```

- **通过判据**：五项 Web 门禁全绿；`testDebugUnitTest` 通过（既有 6 个测试类）。
- **失败处理**：若基线本身失败，停下来报告，不要开始 P1 —— 不能把既有失败混进本次改动。

---

## P1. 打通 Kotlin + Glance 工具链（**最高风险，必须最小化验证**）

**目标**：在完全不加业务代码的前提下，证明「Java 模块 + Kotlin 插件 + Compose 编译器插件 + Glance 依赖」能构建出 APK。

### 改动文件

1. `android/build.gradle` — `buildscript.dependencies` 增加：
   ```gradle
   classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlinVersion"
   classpath "org.jetbrains.kotlin:compose-compiler-gradle-plugin:$kotlinVersion"
   ```
   （`kotlinVersion` 由 `variables.gradle` 提供；`apply from: "variables.gradle"` 已在其下方，注意变量可在 buildscript 块内使用的外部依赖顺序 —— 若 `variables.gradle` 的 `apply from` 位于 `buildscript` 之后，需把 `$kotlinVersion` 改写为字面量 `'2.1.20'`，以实际构建为准。）
2. `android/variables.gradle` — 新增：
   ```gradle
   kotlinVersion = '2.1.20'
   glanceAppWidgetVersion = '1.2.0'
   androidxWorkVersion = '2.11.2'
   ```
3. `android/app/build.gradle`：
   ```gradle
   apply plugin: 'org.jetbrains.kotlin.android'
   apply plugin: 'org.jetbrains.kotlin.plugin.compose'
   ```
   并在 `android { }` 内加 `compileOptions`（`JavaVersion.VERSION_17`）与 `kotlinOptions { jvmTarget = '17' }`；
   在 `dependencies` 内加：
   ```gradle
   implementation "androidx.glance:glance-appwidget:$glanceAppWidgetVersion"
   implementation "androidx.work:work-runtime-ktx:$androidxWorkVersion"
   ```
4. 新增探针文件 `android/app/src/main/java/com/classtrack/app/widget/WidgetToolchainProbe.kt`：
   ```kotlin
   package com.classtrack.app.widget
   internal object WidgetToolchainProbe {
     const val SCHEMA_VERSION = 1
   }
   ```

### 校验

```bash
./android/gradlew -p android :app:assembleDebug
./android/gradlew -p android :app:testDebugUnitTest
pnpm android:check-assets   # 需要先有 APK；若 assets 未同步则先 pnpm cap:sync:android
```

- **通过判据**：Kotlin 编译成功且 APK 产出；既有 JUnit 测试仍通过；`check-android-assets` 通过。
- **常见失败与处置**：
  - `Inconsistent JVM-target compatibility` → 对齐 `compileOptions` 与 `kotlinOptions` 的 jvmTarget。
  - Compose 相关报错 → 补 `buildFeatures { compose = true }`（design D1.2 已列为待确认事实 #1）。
  - 依赖解析失败 → 启用镜像（P0 步骤 3）。
  - KGP 与 AGP 不兼容报错 → 依次尝试 KGP `2.1.21`、`2.2.20`；仍在失败则**停止并升级回滚决策**（design-appendix §Rollback 第 2 行：改 RemoteViews），不要在此阶段耗时超过必要限度。
- **回滚点**：还原上述 3 个 Gradle 文件并删除探针文件，工作区回到纯 Java 基线。
- **提交**：`build(android): add kotlin and glance toolchain`

---

## P2. Web 侧快照契约与纯逻辑

**目标**：实现 `design.md` D2 契约的生成端，纯函数 + vitest，不触碰原生。

### 文件

1. `app/lib/widget-snapshot.ts`
   - 导出 `WidgetSnapshotV1`、`WidgetOccurrence`、`WidgetSnapshotStatus`、`WidgetSnapshotInput`。
   - `buildWidgetSnapshot(input: WidgetSnapshotInput, now: Date): WidgetSnapshotV1`
     - 覆盖窗口：以 `now` 所在本地日为 day 0，延伸到**学期最后一周的最后一天**（`firstWeekStartDate` + `getMaxWeek(classes)` × 7 天；`getMaxWeek` 的 20 周兜底沿用）；`WIDGET_MAX_ENTRIES = 800`。窗口末日**至少**为 day 0 的 24:00（即至少覆盖今天），保证快照生成当天不会立刻落入过期态。学期中段生成时窗口自然缩短。
     - 第 `d` 天的教学周 = `getCurrentWeek` 同源算法：由 `firstWeekStartDate` 与目标日期的天数差推出；仅在 `week` 落在 `1..getMaxWeek(classes)` 内才保留（复用 `app/features/schedule/utils.ts` 的 `getCurrentWeek`/`getMaxWeek` 语义，不新造一套）。
     - 命中条件：`classItem.dayOfWeek === dayOfWeekOf(date)` 且 `classItem.weeks.includes(week)`。
     - `startEpochMs`/`endEpochMs`：用本地年月日 + `classItem.startTime`/`endTime`（`HH:mm`）构造本地时刻再取 `getTime()`；**不得**用 `new Date('YYYY-MM-DD')` 这种按 UTC 解析的写法（既有 `getDayDate` 的时区隐患，本次不复制）。
     - `startLabel`/`endLabel` 直接取自 `startTime`/`endTime` 并做 `H:mm → HH:mm` 归一；`sections` 由 `startSection`/`endSection` 生成（相等时只给一个数字）；`weekdayLabel` 由 `dayNames` 同源映射；`dayKey` 为本地 `YYYY-MM-DD`。
     - `status`：`firstWeekStartDate == null` → `unavailable`；`classes` 为空 → `empty`；否则 `ok`（`ok` 下当日无课也合法）。
     - 覆盖窗口内的 day 0..13 全部写入 `dayEndEpochMs`（本地次日 00:00 的 epoch）。
     - `unavailable`/`empty` 时仍返回完整结构（`entries: []`、`dayEndEpochMs` 可为空数组、`validUntilEpochMs = generatedAtEpochMs`）。
   - `serializeWidgetSnapshot(snapshot): string` 只做 `JSON.stringify`，便于测试与插件共用。
   - 复杂日期逻辑按仓库规范写中文 JSDoc（含 `@param`/`@returns`）。
2. `app/lib/widget-snapshot.test.ts` — vitest，`now` 与 `firstWeekStartDate` 全部显式传入，断言使用**显式 epoch 常量**而非重新计算：
   - 正常上课日的「接下来」与「今日剩余」；
   - 进行中课程（`now` 落在某节课区间内）仍作为 hero，且不计入今日剩余；
   - 今日已无课但后续日期有课 → hero 为后续日期；
   - `firstWeekStartDate = null` → `unavailable`，且 `entries` 为空；
   - `classes = []` → `empty`；
   - 休息日（该 `dayOfWeek` 无课）→ 当日无 entries，后续日期有；
   - `weeks` 不含当前周 → 该课程不出现；
   - 跨周边界（第 N 周周日 → 第 N+1 周周一）；
   - `dayOffset`/`dayEndEpochMs` 与 `entries` 的一致性：每个 entry 满足 `dayOffset < dayEndEpochMs.length` 且 `startEpochMs < dayEndEpochMs[entry.dayOffset]`；`dayEndEpochMs.length` 等于窗口天数；数组严格递增；
   - 快照体积：对一个 20 周、每周 25 节、每节 1 条 occurrence 的合成课表，断言 `serializeWidgetSnapshot(...).length` 小于 256 KiB 且 entries 数在 500 上下（用于验证上限选择的合理性）；
   - 远距离稳定性：把 `now` 设为快照生成日 + 40 天，断言仍能正确定位到对应周的课程（即窗口确实覆盖到学期末），而不是落到过期态。
3. `app/lib/native-widget-snapshot.ts` — 依 `native-course-import.ts` 模式：
   - `interface WidgetSnapshotPlugin { pushSnapshot(options: { snapshotJson: string }): Promise<void>; consumePendingRoute(): Promise<{ route: string | null }>; addListener(...) }`
   - `WidgetSnapshotErrorCode = 'UNAVAILABLE' | 'INVALID_PAYLOAD' | 'PAYLOAD_TOO_LARGE' | 'STORAGE_ERROR' | 'REFRESH_ERROR'`
   - `WidgetSnapshotError extends Error` + `getWidgetSnapshotErrorCode`（与既有 `getCourseImportErrorCode` 同构）
   - `isNativeWidgetSnapshotAvailable()` = `Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('WidgetSnapshot')`
   - Web 实现：`WebPlugin` 子类，`pushSnapshot` reject `UNAVAILABLE`；`consumePendingRoute` 返回 `{ route: null }`。

### 校验

```bash
pnpm test -- app/lib/widget-snapshot.test.ts
pnpm typecheck
pnpm lint
pnpm format:check
```

- **通过判据**：新增用例全绿；三项门禁无新增问题。
- **回滚点**：删除这 3 个文件即可，无外部依赖。
- **提交**：`feat(widget): add widget snapshot contract and builder`

---

## P3. Android 数据通道与状态解析（纯逻辑优先）

**目标**：先写可单测的 Java 纯逻辑（无 Android 框架依赖），再写薄薄的 Capacitor 插件胶水。

### 文件与顺序

1. `android/app/src/main/java/com/classtrack/app/WidgetOccurrence.java` — 不可变模型 + getter（`id/name/classroom/sections/startEpochMs/endEpochMs/startLabel/endLabel/dayKey/dayOffset/weekdayLabel`）。
2. `android/app/src/main/java/com/classtrack/app/WidgetSnapshot.java` — 不可变模型（`schemaVersion/status/generatedAtEpochMs/validUntilEpochMs/entries/dayEndEpochMs`）。
3. `android/app/src/main/java/com/classtrack/app/WidgetSnapshotParser.java` — `static WidgetSnapshot parse(String json)`，用 `org.json`（已在测试依赖中，运行期由 Android 框架提供）：
   - 非法 JSON / 非对象 / `schemaVersion != 1` / `status` 不在枚举 / `entries`、`dayEndEpochMs` 非数组 → 返回 `null`；
   - 单条 entry 字段缺失或类型不符 → 跳过该条（不整体失败）；
   - `entries` 按 `startEpochMs` 升序稳定排序。
4. `android/app/src/main/java/com/classtrack/app/WidgetDisplayState.java` — 按 `design.md` D7 的状态模型（`Missing`/`Unavailable`/`Empty`/`Stale`/`Ready`），纯数据 + 静态工厂。
5. `android/app/src/main/java/com/classtrack/app/WidgetStateResolver.java` — `static WidgetDisplayState resolve(WidgetSnapshot snapshot, long nowEpochMs)` 与 `static Long nextBoundaryEpochMs(WidgetDisplayState state, long nowEpochMs)`，严格实现 D7 的 7 步算法。
6. `android/app/src/main/java/com/classtrack/app/WidgetSnapshotStore.java` — `PREFS_NAME = "class-track-widget"`、`KEY_SNAPSHOT_JSON = "snapshot_json"`、`read(Context)`、`write(Context, String)` 返回 `boolean`（`commit()` 结果）；`write` 前做长度与可解析性校验。
7. `android/app/src/main/java/com/classtrack/app/WidgetSnapshotPlugin.java` — `@CapacitorPlugin(name = "WidgetSnapshot")`：
   - `@PluginMethod pushSnapshot(PluginCall call)`：取 `snapshotJson` → 空/超 256 KiB → reject `INVALID_PAYLOAD`/`PAYLOAD_TOO_LARGE` → `WidgetSnapshotParser.parse` 为 `null` → reject `INVALID_PAYLOAD` → `WidgetSnapshotStore.write` 失败 → reject `STORAGE_ERROR` → `WidgetRefreshBridge.requestRefresh(getContext())` → `call.resolve()`；
   - `@PluginMethod consumePendingRoute(PluginCall call)`：返回并清空暂存路由（P4 的 D8 部分使用）；
   - `@Override protected void handleOnResume()` → `notifyListeners("resumed", null)`；
   - 日志只输出阶段/字节数/错误码，绝不打印 `snapshotJson` 内容。
8. `android/app/src/test/java/com/classtrack/app/WidgetSnapshotParserTest.java`、`WidgetStateResolverTest.java` — JUnit 4，纯逻辑，**所有 `nowEpochMs` 显式传入**：
   - parser：合法 payload、截断 JSON、`schemaVersion` 不匹配、`status` 非法、entry 字段缺失被跳过、`entries` 排序；
   - resolver：`Missing`/`Unavailable`/`Empty`/`Stale` 四种非 Ready 分支；进行中课程；今天有课未开始；今天无课但明天有课；今日剩余排除 hero 且排除已开始/已结束项；`dayEndEpochMs` 已全部过期 → `Stale`；设备时钟回拨（`now < generatedAt - 6h`）→ `Stale`；`nextBoundaryEpochMs` 取最近未来边界、无未来项时取 `validUntilEpochMs`；
   - **结构性保证（prd C11，必须显式断言）**：`start < now < end` 的课程仍然是 hero 且 `heroState = InProgress`；只有快照中不存在任何 `end > now` 的课程时才可能得到 `Empty`；「首尾相接」场景（A 结束时刻 == B 开始时刻）下 `now` 恰为该时刻时 hero 必须是 **B**（`endEpochMs > now` 的严格大于语义），用于锁死边界语义。

### 校验

```bash
./android/gradlew -p android :app:testDebugUnitTest
```

- **通过判据**：新增测试类全绿，既有测试类未被破坏。
- **注意**：此阶段 `WidgetRefreshBridge` 尚未存在。若一次提交内不便拆分，可让 `WidgetSnapshotPlugin` 先只做存储 + `resolve()`，把 `WidgetRefreshBridge` 调用放到 P4 一并接上（保持每次提交可编译）。
- **回滚点**：删除新增的 8 个 Java/测试文件（`MainActivity` 的注册行在 P4 一起加）。
- **提交**：`feat(widget): add native snapshot store, parser and state resolver`

---

## P4. Glance 渲染、刷新调度与清单声明

**目标**：让桌面真正出现小工具，并在时间推进与数据变更时刷新。

### 文件

1. `android/app/src/main/java/com/classtrack/app/widget/WidgetRefreshBridge.kt` — `object` + `@JvmStatic fun requestRefresh(context: Context)`：
   - 在应用级 `CoroutineScope(SupervisorJob() + Dispatchers.Default)` 上：`ClassTrackWidget().updateAll(context)`，然后 `WidgetRefreshScheduler.scheduleNextBoundary(context, now)`；
   - 同时 `WidgetRefreshScheduler.enqueueImmediate(context)`（0 延迟唯一性一次性 Work，作为进程被杀时的持久化兜底）。
2. `android/app/src/main/java/com/classtrack/app/widget/WidgetRefreshScheduler.kt`
   - `scheduleNextBoundary(context, now)`：读快照 → `resolve` → `nextBoundaryEpochMs` → `OneTimeWorkRequestBuilder<WidgetRefreshWorker>().setInitialDelay(...)`，`enqueueUniqueWork("widget-boundary-refresh", REPLACE, ...)`；无边界时取消该唯一任务。
   - **不再需要周期 Worker**：系统级兜底改由 provider XML 的 `updatePeriodMillis="1800000"` 承担（design D4）。因此本文件**只**管理边界一次性任务与即时任务两条唯一工作，不创建 `PeriodicWorkRequest`。
   - `enqueueImmediate(context)`：0 延迟一次性 Work（唯一名 `widget-immediate-refresh`，`REPLACE`）。
2b. `android/app/src/main/java/com/classtrack/app/widget/WidgetBoundaryAlarms.kt` — **L3 精确模式**：
   - `canScheduleExact()` → 用 `alarmManager.canScheduleExactAlarms()`（API 31+）判定；API < 31 时恒为 true（无需该权限）。
   - `armNextBoundary(context, now)`：`nextBoundaryEpochMs` 为空时 `cancel`，否则 `setExactAndAllowWhileIdle(boundary, PendingIntent.getBroadcast(...))`，`PendingIntent` 用 `FLAG_UPDATE_CURRENT or FLAG_IMMUTABLE`，请求码固定；同一时刻只保留一个边界闹钟（先 cancel 同一个 PendingIntent 再 set）。
   - `cancel(context)`：移除 PendingIntent 并取消闹钟，用于 `onDisabled` 与权限被撤销时。
   - 必须**先** `canScheduleExact()` 再调用 `setExactAndAllowWhileIdle`，否则会抛 `SecurityException`；异常路径也要吞掉并回退到 L4，不得崩溃。
   - 同时注册 `AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED`（**前台**广播，需 `registerReceiver`，不是 manifest）：授权变为 true 时 `armNextBoundary`，变为 false 时 `cancel`。
2c. `android/app/src/main/java/com/classtrack/app/widget/WidgetTimeChangeReceiver.kt` — **L2**：
   - `BroadcastReceiver`，收到 `ACTION_DATE_CHANGED` / `ACTION_TIME_SET` / `ACTION_TIMEZONE_CHANGED` 时调用与 Worker 共用的幂等重算入口（读快照 → 重算 → 渲染 → 重排 L3/L4 边界）。
   - 这三个广播在 Android 8+ 隐式广播豁免清单内，可用 manifest 声明接收；接收器工作必须极短（只做重算 + 排程），不得做网络或长耗时磁盘操作。
2d. `android/app/src/main/java/com/classtrack/app/widget/WidgetBoundaryAlarmReceiver.kt` — L3 闹钟的广播落点（`exported="false"`），收到后调用与 Worker 共用的幂等重算入口，并按新的 `now` 重新 `armNextBoundary`（形成边界链）。
3. `android/app/src/main/java/com/classtrack/app/widget/WidgetRefreshWorker.kt` — 读快照、`updateAll`、重排下一个边界；不打印课程内容。
4. `android/app/src/main/java/com/classtrack/app/widget/ClassTrackWidget.kt` — `GlanceAppWidget`：
   - `provideGlance`：`Dispatchers.IO` 读 SharedPreferences → `parse` → `resolve(System.currentTimeMillis())` → `provideContent { ... }`；
   - `SizeMode.Responsive(setOf(Compact, Detailed, Expanded))`，两种布局按 D7 渲染；
   - 全部状态用 `glance` 自带的 `Text`/`Column`/`Row`/`Box`/`LazyColumn` 与 `GlanceModifier`，不引用 Compose UI 组件；
   - 颜色走 `res/values/colors.xml` + `res/values-night/colors.xml`（不依赖自定义字体）。
5. `android/app/src/main/java/com/classtrack/app/widget/ClassTrackWidgetReceiver.kt` — `GlanceAppWidgetReceiver`：
   - `glanceAppWidget = ClassTrackWidget()`；
   - `onUpdate` → `super` 后调用与 `WidgetRefreshWorker` **共用**的重算入口（读快照 → 重算 → 渲染 → 重排边界），保证系统 30 分钟广播与 Worker 两条路径行为一致、幂等；
   - `onEnabled` → `scheduleNextBoundary`；
   - `onDisabled` → 取消 `widget-boundary-refresh` 与 `widget-immediate-refresh` 两个唯一任务。
6. `android/app/src/main/res/xml/class_track_widget_info.xml` — `appwidget-provider`：`minWidth`/`minHeight`、`targetCellWidth="4"`、`targetCellHeight="2"`、**`updatePeriodMillis="1800000"`**（系统级兜底，design D4；**不得写成 0**）、`resizeMode="horizontal|vertical"`、`initialLayout`（Glance 需要，指向一个最小 `res/layout/` 占位）、`description`。
7. `android/app/src/main/res/layout/class_track_widget_initial.xml` — `initialLayout` 所需的最小占位布局（一个 `TextView` + 背景），这是 `appwidget-provider` 的必填项，不等于 `previewLayout`。
8. `android/app/src/main/res/values/colors.xml` + `res/values-night/colors.xml` — 小工具配色。
9. `android/app/src/main/res/values/strings.xml` — 新增 `app_widget_class_track_label`、`app_widget_class_track_description` 及各状态文案（「接下来」「正在进行」「今日剩余」「今日无课」「暂无课表数据」「请打开 ClassTrack 同步课表」「课表数据已过期」）。
10. `android/app/src/main/AndroidManifest.xml` — 声明：
    ```xml
    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />

    <receiver android:name=".widget.ClassTrackWidgetReceiver" android:exported="true">
      <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>
      <meta-data android:name="android.appwidget.provider" android:resource="@xml/class_track_widget_info" />
    </receiver>

    <receiver android:name=".widget.WidgetTimeChangeReceiver" android:exported="false">
      <intent-filter>
        <action android:name="android.intent.action.DATE_CHANGED" />
        <action android:name="android.intent.action.TIME_SET" />
        <action android:name="android.intent.action.TIMEZONE_CHANGED" />
      </intent-filter>
    </receiver>

    <!-- 边界精确闹钟的广播落点：exported=false，仅由我们自己的 PendingIntent 触发 -->
    <receiver android:name=".widget.WidgetBoundaryAlarmReceiver" android:exported="false" />
    ```
    - `SCHEDULE_EXACT_ALARM` 是**可选增强**所必需（design D4/L3、D12）；**绝不**声明 `USE_EXACT_ALARM`（Google Play 只允许闹钟/日历类应用使用，且会自动授予，不符合本场景）。
    - `ClassTrackWidgetReceiver` 的 `exported="true"` 是 AppWidget 框架的硬要求（宿主需要向我们发送更新广播）；该接收器只读取自己的私有偏好并更新自己的 widget，不接受任何外部输入数据，因此不构成数据暴露面 —— **需在实现注释中写明这一点**。
    - `WidgetTimeChangeReceiver` 与 `WidgetBoundaryAlarmReceiver` 必须 `exported="false"`：前者是系统广播、无需导出；后者只由我们自己的 `PendingIntent` 触发。
11. `android/app/src/main/java/com/classtrack/app/MainActivity.java` — `registerPlugin(WidgetSnapshotPlugin.class)`；并按 D8 处理 `Intent` extra `classtrack_widget_route`（`onCreate` + `onNewIntent`）。
12. `android/app/src/main/java/com/classtrack/app/WidgetPendingRoute.java`（或插件内静态字段）— 暂存待消费路由。
13. `WidgetSnapshotPlugin.java` 追加两个方法（**供 P5 的设置界面使用**）：
    - `@PluginMethod getExactAlarmStatus(PluginCall call)` → resolve `{ available: Boolean, exact: Boolean }`。`available` 表示该 API 等级是否需要该权限（API 31+）；`exact` 表示当前是否已授予。
    - `@PluginMethod requestExactAlarmPermission(PluginCall call)` → API 31+ 时用 `getActivity().startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName")))`，API < 31 时直接 resolve `{ launched: false, exact: true }`。**只跳系统设置页，不在应用内自行请求或假装已授权。**

### 校验

```bash
pnpm cap:build:android        # = cap:sync:android + assembleDebug + android:check-assets
./android/gradlew -p android :app:testDebugUnitTest
adb shell dumpsys appwidget | grep -i classtrack   # 需已安装并启动过 App
adb shell dumpsys package com.classtrack.app | grep -i -E "SCHEDULE_EXACT_ALARM|USE_EXACT_ALARM"  # 必须无输出
grep -n updatePeriodMillis android/app/src/main/res/xml/class_track_widget_info.xml   # 必须为 1800000
grep -c "SCHEDULE_EXACT_ALARM" android/app/src/main/AndroidManifest.xml            # 必须为 1（且不含 USE_EXACT_ALARM）
adb shell cmd appops get com.classtrack.app SCHEDULE_EXACT_ALARM                    # 查看当前授权状态
```

- **通过判据**：APK 产出且 `check-android-assets` 通过；`dumpsys appwidget` 能看到 `ClassTrackWidgetReceiver` 的 provider 注册；`aapt`/`dumpsys package` 中无 `SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM`。
- **回滚点**：删除 `widget/` 与新资源文件、还原 `AndroidManifest.xml` 与 `MainActivity.java`；P2/P3 成果保留。
- **提交**：`feat(widget): add glance widget, refresh scheduling and manifest`

---

## P5. Web 侧同步接入

**目标**：把 P2 的契约与 P4 的通道接起来。

### 文件

1. `app/hooks/useWidgetSnapshotSync.ts`
   - 早退：`if (!isNativeWidgetSnapshotAvailable()) return`（在 effect 内，且 effect 依赖为空）。
   - `push()`：从 `useClassStore.getState()` 取 `classes/currentWeek/firstWeekStartDate/isInitialized`，`buildWidgetSnapshot(...)`，`serializeWidgetSnapshot(...)`，调用插件；失败时 `console.warn` 一次并静默（不打断用户操作）。
   - 挂载时推一次；`useClassStore.subscribe` 监听上述字段的引用变化，变化后 1.5s 去抖推送（`useRef` 保存 timer，cleanup 清理）；`addListener('resumed', push)` 并在 cleanup 中 `remove()`。
2. `app/components/native-widget/WidgetSnapshotSync.tsx` — 调用该 hook 并 `return null`。
3. `app/root.tsx` — 在 `Layout` 的 `body` 内、`<PwaUpdatePrompt />` 旁新增 `{!nativeShell && <WidgetSnapshotSync />}`。
4. `app/features/profile/ProfilePage.tsx` + 其 hook（放 `app/features/profile/hooks/useWidgetPrecision.ts`）— 新增「桌面小工具」设置节（design-appendix D12）：
   - 展示当前精度等级：调用 `getExactAlarmStatus()`，`exact === true` → 「精确」；否则「基础」；
   - 一段**如实**说明基础模式与精确模式的精度差异**（不得写成实时）**；
   - 未授权时提供「开启精确切换」按钮 → `requestExactAlarmPermission()` → 跳系统设置；已授权时显示状态文案，并提供「前往系统设置」入口（不在应用内自造开关，系统权限才是事实来源）；
   - 浏览器/PWA 下整节不渲染（`isNativeWidgetSnapshotAvailable()` 为假时不显示），避免出现无法操作的死按钮；
   - 现有 UI 风格沿用 `app/components/ui/` 的 Card/Button/Switch 与 `cn()`，文案用中文。
5. `app/lib/native-widget-snapshot.ts` 追加 `getExactAlarmStatus()`、`requestExactAlarmPermission()` 的 Web 兜底实现（返回「不可用」，不抛异常）。

### 校验

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
pnpm dev   # 浏览器打开，确认 console 无报错、Network 中无 WidgetSnapshot 调用
```

- **通过判据**：五项门禁全绿；浏览器环境完全 no-op。
- **回滚点**：删除 hook 与组件、还原 `root.tsx` 一行。
- **提交**：`feat(widget): sync widget snapshot from store and app foreground`

### 若 D8 跳转无法稳定验证

按 `design.md` D8 降级条款移除 Intent extra 消费逻辑（`WidgetPendingRoute`、`consumePendingRoute`、`MainActivity.onNewIntent` 分支），把点击行为改为纯 `actionStartActivity`，并在 `design.md` 追加「跳转降级」记录，commit message 用 `refactor(widget): drop unstable widget route handoff`。

---

## P6. 端到端验证与全量门禁

**目标**：在小工具真正出现在桌面上之前，不宣称完成。

1. 全量门禁：
   ```bash
   pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
   ./android/gradlew -p android :app:testDebugUnitTest
   pnpm cap:build:android
   ```
2. 启动模拟器并安装：
   ```bash
   ~/Android/Sdk/emulator/emulator -avd Medium_Phone -no-snapshot-load &
   adb wait-for-device
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```
3. 放置小工具（`design.md` 待确认事实 #4）：
   - 先尝试 `adb shell input` 长按桌面 → 选择「小工具」→ 拖拽 `ClassTrack`；
   - 若自动化不可行，请人工在模拟器上完成放置，事后用 `adb exec-out screencap -p > /tmp/widget-light.png` 留档。
4. 断言清单：
   - 未打开 App 时小工具显示「打开 ClassTrack 同步课表到桌面」（`Missing`）；
   - 打开 App（已有课表数据）后 ≤ 3 秒内小工具变为课程内容；
   - 修改课程/切换学期/改当前周后，小工具内容随之变化；
   - 用模拟器修改系统时间到某节课开始前/后，触发边界 Worker（或直接 `adb shell am broadcast` 触发即时刷新路径），确认 hero 从「接下来」变为「正在进行」，课程结束后切到下一节；
   - **「长期不打开 App」实测（prd D6）**：推送快照后**不再打开 App**（仅退出到桌面），把系统时间直接跳到窗口内的另一天/另一节课时间点，确认小工具内容正确变化；再把时间跳到超过 `validUntilEpochMs`，确认进入「数据已过期」引导态。两条都要留截图或 `adb shell dumpsys` 输出作为证据；若因模拟器限制无法完成，必须记录为未验证。
   - **L2 精度实测（prd C8）**：`adb shell su 0 date -s ...` 或模拟器设置里改时间/时区，确认**无需打开 App** 小工具在数秒内重算并重排（证明 `DATE_CHANGED`/`TIME_SET`/`TIMEZONE_CHANGED` 接收器生效）；
   - **L3 精度实测（prd C9）**：先用 `adb shell cmd appops get com.classtrack.app SCHEDULE_EXACT_ALARM` 确认默认拒绝态并确认小工具仍工作（降级到 L4）；再用 `adb shell cmd appops set com.classtrack.app SCHEDULE_EXACT_ALARM allow` 授予后，把时间设到某节课结束前 1 分钟，验证边界切换在分钟级内发生；最后撤销授权，确认不崩溃且继续工作；
   - **结构性保证实测（prd C11）**：把时间设到某节课**进行中**，确认小工具显示该课并标注「正在进行」，而不是显示「今日无课」。
   - 缩小到 2 格宽（`Compact`）不溢出；
   - 切换深色模式，文字可读；
   - 点击小工具打开 App（并确认 D8 是否生效）。
5. 截图留档到 `docs/` 或任务目录（不要把大体积二进制提交进仓库，除非仓库已有先例 —— 当前 `docs/` 只有 markdown，因此截图放 `/tmp` 并在完成报告里描述，不提交）。

- **通过判据**：`prd.md` 的 A/B/C/D 全部勾选；任一未通过项必须显式记录为「未完成」或「已降级」，不得沉默跳过。
- **提交**：`chore(widget): verify widget end-to-end`（若只有文档改动）或与最后一段功能改动合并。

---

## 质量检查（每个阶段后 + 收尾全量）

- 阶段内：跑该阶段列出的命令。
- 收尾：按 `trellis-check` 流程做一次**全范围**检查，重点核对 `design-appendix.md` 的 14 项一致性检查表与 `prd.md` 的 A/B/C/D 各级验收标准。
- 特别核对（本任务最容易出错的地方）：
  1. 原生代码里是否混入了日期/时区运算（应只有 epoch 比较）；
  2. 插件是否存在「写入失败却 resolve」的路径；
  3. Web 侧是否在非 Android 环境也会调用插件；
  4. `entries` 覆盖窗口与 `dayEndEpochMs` 下标语义是否一致（跨天、跨周、多天未打开三种场景）；
  5. 是否为了通过门禁而放宽了 lint/类型规则。

---

## 阶段依赖与顺序图

```text
P0 基线
 └─► P1 工具链（可独立失败，失败即走回滚决策）
      └─► P2 Web 契约（纯 TS，可与 P3/P4 并行）
           └─► P3 Android 纯逻辑 + 通道
                └─► P4 Glance 渲染 + 调度 + 清单
                     └─► P5 Web 同步接入
                          └─► P6 端到端 + 全量门禁
```

**依赖说明**：P2 与 P3 共享 `design.md` D2 契约，但两侧实现不互相调用，可在契约不变的前提下并行推进。P4 依赖 P1（工具链）与 P3（`WidgetSnapshotParser`/`WidgetStateResolver`）。P6 依赖全部。
