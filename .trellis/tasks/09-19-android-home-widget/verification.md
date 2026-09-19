# 验证结果与未验证项（P6）

> 生成时间：2026-09-19 · 分支 `feat/android-home-widget`
> 原则：**只记录真正执行过并拿到输出的证据**。凡未验证的，明确写「未验证」并给出可复现的阻塞原因，不用「类型检查通过」冒充行为验证。

## 一、环境级阻塞（硬性、可复现）

端到端设备验证**未完成**，原因不在代码：

```text
$ /home/yetongy/Android/Sdk/emulator/emulator -avd Medium_Phone -no-window -gpu off -no-snapshot
ERROR | x86_64 emulation currently requires hardware acceleration!
CPU acceleration status: /dev/kvm is not found: VT disabled in BIOS or KVM kernel module not loaded
```

- 本机 `/dev/kvm` 不存在（容器/沙箱内无 KVM），而 AVD `Medium_Phone` 与系统镜像 `android-37.1/google_apis_playstore_ps16k/x86_64` 都是 x86_64 ⇒ 模拟器拒绝启动。
- `adb devices` 为空：无真机连接。
- 结论：**任何依赖设备（launcher、桌面小工具渲染、Doze、真实广播投递）的验收项在本环境无法取证。** 已清理为启动而做的 AVD 副本改动（`-wipe-data`）不影响仓库。

## 二、已用真实执行的证据验证的验收项

| 项 | 证据（可复现命令） | 结果 |
|---|---|---|
| **A1–A3** 快照契约与纯逻辑 | `npx vitest run app/lib/widget-snapshot.test.ts` | 18 用例通过；覆盖正常上课日、进行中、今日无课、休息日、`firstWeekStartDate` 缺失/非法、跨周、条数截断、体积上限、42 天后仍可定位 |
| **A4** 插件封装与 Web 兜底 | `npx vitest run app/lib/native-widget-snapshot.test.ts` | 5 用例通过；Web 上 `pushSnapshot` 明确 reject 而非静默成功 |
| **A5 / D5** Web 端集成与浏览器 no-op | 真实 headless Chrome 153 + CDP 打开 `pnpm dev`（脚本见 `/tmp/d5-check.mjs`） | 页面完整渲染（title=ClassTrack，12 个链接）；`exceptions: []`；`logErrors: []`；`platform: "web"` ⇒ 同步 hook 整体 no-op；**无任何 WidgetSnapshot 桥调用**；仅两条既有的 `DialogContent` aria 警告（`git diff master` 新增行里 `DialogContent` 计数为 0，非本次引入） |
| **C2** 落盘成功才 resolve | `WidgetSnapshotPlugin` 代码 + `WidgetSnapshot` 写路径审查 | 四条失败路径各自 `reject` 具名错误码，`resolve` 只在 `commit()` 返回 true 之后 |
| **C5** 权限最小化 | `aapt2 dump xmltree --file AndroidManifest.xml app-debug.apk` 与合并清单 | 主动声明仅 `INTERNET` + `SCHEDULE_EXACT_ALARM`；`android:name="android.permission.USE_EXACT_ALARM"` 计数 **0**；`RECEIVE_BOOT_COMPLETED`/`WAKE_LOCK`/`FOREGROUND_SERVICE` 仅来自 `androidx.work` 库清单 |
| **C6** 系统级兜底 | 同上，`aapt2 dump xmltree --file res/xml/class_track_widget_info.xml` | `updatePeriodMillis=1800000`、`targetCellWidth=4`、`targetCellHeight=2`、`resizeMode=0x3`、`minWidth=180dp`、`minHeight=60dp` |
| **C7** 长期不打开 App | `WidgetSnapshotCrossLayerTest#nativeSideStillPicksTheRightCourseSixWeeksLater`——夹具由 Web 侧 `buildWidgetSnapshot` **真实产出**（`android/app/src/test/resources/widget-snapshot-v1.json`），交给原生解析器与 resolver | 把 `now` 直接推到第 42 天（跨 6 周、中间零渲染），原生仍选出 `2026-11-02 高等数学` 且 `heroState=UPCOMING`；窗口末日仍可用，越过 `validUntil` 才转 `STALE`；关键点：学期最后一天末得 `NO_UPCOMING` 而非 `STALE` |
| **C11** 结构性保证 | `WidgetStateResolverTest` + `WidgetSnapshotCrossLayerTest` | `start < now < end` 时仍是 hero 且 `IN_PROGRESS`；首尾相接处（A.end == B.start）该瞬间 hero 必须是 B（严格 `>` 语义）；只有快照里不存在 `end > now` 的课程才可能「无课」 |
| **N3** 隐私 | 夹具生成时写入 3 个敏感哨兵值，`WidgetSnapshotCrossLayerTest#snapshotNeverCarriesFieldsBeyondTheDisplayContract` 断言它们不出现在快照里；`aapt2` 侧另有日志白名单 | 教师 / `courseId` / `classId` 三个哨兵在快照中计数均为 0 |
| **N4** 不回归 | `pnpm cap:build:android`（含 `cap sync` + `assembleDebug` + `android:check-assets`） | `Android asset check passed: 245 assets, 27 index references` |
| **N5** 可测试 | `./android/gradlew -p android :app:testDebugUnitTest` | **56 用例全通过**（原 16 + 新增 40：parser 14 / resolver 17 / 跨层 9） |
| **D1** Web 五项门禁 | `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` | 全绿；`lint` 0 problems；vitest 52 用例 |
| **D2** APK 与资源一致性 | `pnpm cap:build:android` | BUILD SUCCESSFUL，`check-assets` 通过 |
| **D3** 新增 Android 单测 | 同上 | 通过，且用 `test-results/*.xml` 逐类核对数量，未出现「被静默跳过」的假绿灯 |
| **D8 的可静态验证部分** | `WidgetPendingRoute` 白名单 + `MainActivity.onNewIntent` 审查 | 路由 extra 只接受编译期常量 `/schedule`，外部应用无法注入任意路径；点击 Intent 不携带任何课程数据 |

## 三、未验证项（**不声称已完成**）

| 项 | 未验证的内容 | 为什么无法验证 | 交给设备验证的步骤 |
|---|---|---|---|
| **B1** | 小工具出现在 launcher 的「小工具」选择器中并可被拖到桌面 | 需要 launcher | `adb install -r android/app/build/outputs/apk/debug/app-debug.apk` → 桌面长按 → 小工具 → ClassTrack |
| **B2** | 4x2 显示 hero + 今日剩余；2x1 不溢出 | 需要实际 RemoteViews 渲染 | 放置后分别放大到 4x2 与缩小到 2x1，截图对比 |
| **B3** | 课程结束/开始时 widget 自动切换 | 需要真实时间推进 + Glance 渲染 | 改系统时间到某节课结束前后，观察切换 |
| **B4 / D8** | 点击小工具真正跳转到课表页 | 需要设备 | 点击 widget 后确认落在 `/schedule`；若未跳转，按 design D8 的降级条款记录为「仅打开 App」。**当前不声称跳转已生效**：代码路径完整，但最坏情况只是打开首页，无副作用 |
| **B5** | 深色/浅色可读性 | 需要实际渲染 | 切换系统深色模式截图 |
| **C1** | 推送后「同一次推送内」看到刷新 | 需要设备 | 打开 App 改一下当前周，观察 widget 秒级更新 |
| **C3** | 无快照/过期时的引导态外观 | 需要设备 | 全新安装（无快照）→ 应显示「打开 ClassTrack 同步课表到桌面」 |
| **C4** | 重启后排程仍能恢复 | 需要设备重启 | 放置 widget → 重启 → 确认仍会刷新 |
| **C8** | 三个广播的实际投递 | 需要设备 | 改系统时间/时区，确认 widget 在数秒内重算；manifest 声明与幂等入口已静态确认 |
| **C9** | 精确闹钟在授予/撤销后的行为 | 需要设备 | `adb shell cmd appops set com.classtrack.app SCHEDULE_EXACT_ALARM allow` → 观察 Doze 下按点切换；再 `deny` → 确认静默回退且不崩 |
| **D4** | 端到端放置 + 同步 + 显示正确 | 无 KVM、无真机 | 同上 B1–B3 的组合流程 |
| **D6** | 「长期不打开 App」的设备实测 | 无 KVM、无真机 | 推送快照后不再打开 App，把系统时间跳到窗口内另一天 → 确认内容变化；再跳到超过 `validUntil` → 确认进入引导态，并截图留证 |

**残余风险（因未在真实 RemoteViews 上渲染，属于静态审查无法覆盖的部分）**：

1. `appWidgetBackground()` + `cornerRadius(16.dp)` 在不同 launcher / Android 版本上的实际裁剪表现未验证；若出现异常圆角或背景缺失，可去掉 `cornerRadius`（不影响信息正确性）。
2. 12.sp/13.sp 字号在超大字体缩放（`fontScale` ≥ 1.5）下是否溢出未验证；当前用 `maxLines` 截断，不会破坏布局，但可能截断课程名。
3. `SizeMode.Responsive` 的三档尺寸与真实桌面格子换算在不同 launcher 上可能略有差异；列表行数由 `LocalSize.current.height` 决定，因此尺寸判定本身是自适应的。
4. 冷启动路径（进程未运行 + 广播唤醒）在真机上的耗时未测量；设计上接收器只做「读偏好 + 重算 + 排程」，没有网络与长耗时 IO。

## 四、验证脚本与命令速查

```bash
# 环境（必需，见 env-setup.md）
export GRADLE_USER_HOME=/home/yetongy/.cache/gradle-home ANDROID_USER_HOME=/home/yetongy/.cache/android-home

# Web 门禁
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build

# Android 单测（含跨层用例）
./android/gradlew -p android :app:testDebugUnitTest

# APK + 资源一致性
pnpm cap:build:android

# APK 内容取证
AAPT=~/Android/Sdk/build-tools/34.0.0/aapt2
$AAPT dump xmltree --file res/xml/class_track_widget_info.xml android/app/build/outputs/apk/debug/app-debug.apk
$AAPT dump xmltree --file AndroidManifest.xml android/app/build/outputs/apk/debug/app-debug.apk

# 重新生成跨层夹具（仅在 Web 侧契约变更时需要）
# 临时用例调用 buildWidgetSnapshot 后写入 android/app/src/test/resources/widget-snapshot-v1.json
```
