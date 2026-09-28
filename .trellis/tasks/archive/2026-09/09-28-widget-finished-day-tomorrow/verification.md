# 验收记录：小工具「今天已无课」档重做 + 快照保留当天已上完课

> 2026-09-28 · 分支 `fix/widget-today-done-show-tomorrow` · 工作树 `../ClassTrack-wt/widget-today-done-show-tomorrow`（从 `master` 7bd194f 开出）
>
> **沙盒环境注记（复现用）**：agent shell 里 `$HOME/.gradle` 是只读挂载、且没有直连外网。因此 Android 门禁这样跑：
>
> ```bash
> GRADLE_USER_HOME=/media/yetongy/64E8E38AE8E358B65/CodeFiles/.worktrees/.gradle-home \
>   ./android/gradlew -p android :app:testDebugUnitTest --offline
> ```
>
> 该可写 gradle home 里原本缺本项目要用的模块（`compose-compiler-gradle-plugin:2.1.20` 等，联网拉包会在
> 代理上撞 TLS 握手），已把 `~/.gradle/caches/modules-2` 合并进去（1.4G，24s）。工作树还需要两个
> 不在版本库里的东西：`android/local.properties`（`sdk.dir`）与 `cap sync` 生成物
> （`android/capacitor-cordova-android-plugins/`、`android/app/src/main/assets/`、`res/xml/config.xml`），
> 均已从主检出复制。

## 门禁结果

| 门禁 | 命令 | 结果 |
|---|---|---|
| Android 单测 | 见上 | **BUILD SUCCESSFUL**；34 个测试类 / **262 例 / 0 失败**（含 `WidgetSnapshotCrossLayerTest`、`WidgetDayPlanTest`、`WidgetLinePolicyTest`）|
| Web 单测 | `vitest run` | **36 文件 / 289 例全过** |
| 类型检查 | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| 格式 | `pnpm format:check` | `All matched files use Prettier code style!`，exit 0 |
| 构建 | `pnpm build` | `✓ built in 9.70s`，exit 0 |
| 空白错误 | `git diff --check` | 干净 |

## 跨层夹具未重新生成的证据（PRD D11）

夹具 `android/app/src/test/resources/widget-snapshot-v1.json`：`generatedAt = 2026-09-21T09:00:00+08:00`，
`dayOffset == 0` 只有一条 `高等数学 10:00–11:40`，其 `endEpochMs (11:40) > generatedAt (09:00)`。

被删掉的那条过滤只在 `endEpochMs <= generatedAt` 时生效，而覆盖窗口从**今天**开始 ——
也就是说该过滤在这个夹具上**从未丢掉任何条目**（用 Python 逐字段核对过：`dayOffset == 0` 条目数 = 1，
且它的 `endEpochMs > generatedAtEpochMs`）。因此夹具字节不变，也不需要重新生成；
`WidgetSnapshotCrossLayerTest` 在**未动夹具**的情况下全绿，即是这条推论的证据。

## 逐项验收（对应 prd.md 的验收清单）

**JVM 单测**

- [x] `WidgetDayPlanTest#dimPolicyAlsoFallsBackToTomorrowOnceTodayIsDone`（SHOW_DIM：今天全上完 + 明天有课 → `TOMORROW`，`todayHadClasses == true`）
- [x] `WidgetDayPlanTest#hiddenFinishedDayFallsBackToTomorrow`（HIDE：同上；这条断言在改动前是**反向**的）
- [x] `WidgetDayPlanTest#collapsedFinishedDayFallsBackToTomorrowAndKeepsTheCount`（COLLAPSE：回退到明天且 `collapsedFinishedCount == 2` 不丢）
- [x] `WidgetDayPlanTest#dimPolicyKeepsFinishedRowsWhileTodayIsStillGoing`（回归：白天还没上完时，今天的灰课表照旧）
- [x] `WidgetDayPlanTest#finishedDayWithoutTomorrowNeverListsCourses`（今天已上完 + 明天没课 → `NONE`，`todayHadClasses == true`）
- [x] `WidgetDayPlanTest#todayRowsWinOverTomorrow` / `#fallsBackToTomorrowWhenTodayIsEmpty` / `#noRowsWhenTodayAndTomorrowAreBothEmpty` / `#nullItemsAreTreatedAsEmpty` / `#rowsAreNotExternallyMutable`（既有规则回归）
- [x] `WidgetLinePolicyTest#finishedTodayListsTomorrowWithoutTheNextOtherDayLine`（三种样式：首行 `HERO_EMPTY` + 明天课表，**不带** `NEXT_OTHER`）
- [x] `WidgetLinePolicyTest#longHolidayStillKeepsTheNextOtherLine`（长假档三种样式仍保留 `NEXT_OTHER` = 「下次上课」块的载体）
- [x] `WidgetLinePolicyTest` 其余用例（`heroIsToday == true` 的逐项断言、双栏切分点、空课态 flag）全部保持原样通过
- [x] `WidgetSnapshotCrossLayerTest` 未重新生成夹具即全绿

**Web 单测**

- [x] `widget-snapshot.test.ts`「今天已结束的课仍留在快照里」：`MATH#2026-09-21`（20:00 时已上完）仍在 `entries`，`dayEndEpochMs[0]` 仍覆盖今天，前两条仍按开始时刻升序
- [x] `widget-snapshot.test.ts`「跨周边界」：周日那节已上完但仍在，`MON4#2026-09-28` 仍被选中、`MON3#2026-09-28` 不出现
- [x] 休息日 / 体积 / 条数上限 / 周次语义 / 星期标签 / 时区偏移等既有用例全过

**模拟器 / 真机**（渲染层，尚无 JVM 测试）

- [ ] ❌ 3×2 与 1×2 的真实渲染截图 —— **本次沙盒起不了模拟器**（没有 `/dev/kvm`），已把可安装的 debug APK 留在工作树交给本机设备补验（见下节）

## 设备验证尝试（2026-09-28，沙盒里失败，留可安装 APK）

- 已成功产出**可安装的 debug APK**：`android/app/build/outputs/apk/debug/app-debug.apk`（10,713,023 B）。
  复现命令（沙盒里 `$HOME/.android` 与 `$HOME/.gradle` 都是只读，两处都必须改写）：

  ```bash
  pnpm cap:sync:android
  HOME=/home/yetongy/.cache/android-home ANDROID_USER_HOME=/home/yetongy/.cache/android-home \
    GRADLE_USER_HOME=/media/yetongy/64E8E38AE8E358B65/CodeFiles/.worktrees/.gradle-home \
    ./android/gradlew -p android assembleDebug --offline
  ```

  不设 `ANDROID_USER_HOME` 时 `:app:validateSigningDebug` 会失败：
  `Unable to create debug keystore in /home/yetongy/.android because it is not writable`
  （`/home/yetongy/.cache/android-home` 里有可写的 `debug.keystore`）。
- **模拟器起不来**：沙盒里没有 `/dev/kvm`（`ls /dev/kvm` → No such file or directory；
  `emulator -accel-check` → `/dev/kvm is not found: VT disabled in BIOS or KVM kernel module not loaded`）。
  这与 spec 里「本机可用：`/dev/kvm` 存在」那条注记不冲突 —— 那是用户的正常环境，不是 agent 沙盒。
  因此下面这些只能在本机设备上补齐：`adb install -r -t <上面的 APK>` 之后，用「接下来（3×2）」与
  「紧凑（1×2）」各看这四档：`今天已上完（显示已上完 / 不显示已上完 / 折叠）`、`长假（今天与明天都没课）`。
  重点看三件事：(1) 3×2 的「下次上课」+「9月28日 周一 08:00」两行层级；
  (2) 1×2 的「下次上课 / 9月28日」有没有出现省略号；(3) App 切后台再切回（会重推快照）后，
  今天已上完的课是否仍灰显在卡上（C 的现场验证）。

## 未覆盖 / 已知缺口

- **渲染层未做设备验证**：`NextOtherDayLine` 的宽/窄两档、`compactCounterText` 的新文案、两处高度估算都只经
  编译 + 行序单测覆盖，没有模拟器截图 —— 原因是本次沙盒没有 `/dev/kvm`（见上一节），不是「忘了做」。
  APK 已留在工作树，本机设备上按上一节那三条重点看一遍即可闭环。
- 1×2 的短档文案 `9月28日` 是按「数字窄、约 3.5 个汉字宽」推算的；若实测仍被截，降级方案是只留 `28日`
  （已写进 PRD 的 D7，改动只涉及一处字符串函数）。
- 双栏（`two_column`）+ `day_list` 档下 `NEXT_OTHER` 落在左栏这一支，估算分支已补齐，但没有对应截图。
