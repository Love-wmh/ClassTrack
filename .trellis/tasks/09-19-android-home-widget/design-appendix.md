# 附录：design.md 的保证边界、检查表与回滚

> 配套文件：[design.md](./design.md)。本文件承载 D11/D12、一致性检查表、Rollback、验证策略与未决事实；拆分原因是 `design.md` 超出 `.trellis/config.yaml` 的 `context_injection.max_file_bytes`（32768 字节），否则注入子代理时会被截断。

---

## D11. 「长期不打开 App」的保证与失效边界

这是本方案最容易被过度承诺的地方，因此单独成节，且**必须在交付说明中原样保留**。

### 三层保证

| 场景 | 结果 | 机制 |
|---|---|---|
| 从未打开过 App | 显示「打开 ClassTrack 同步课表到桌面」引导态 | `WidgetSnapshotStore` 为空 → `Missing` |
| 打开过一次后长期不再打开 | **正确**：每节课开始/结束时自动切换，跨天跨周同样正确 | 快照覆盖到学期末（D2）+ WorkManager 边界任务 + 系统 30 分钟兜底（D4） |
| 到达覆盖窗口之外（学期结束等） | 显示「课表数据已过期，请打开 ClassTrack 同步」 | `validUntilEpochMs` 判定 → `Stale` |

**贯穿三层的不变式**：任何情况下都**不显示推测出来的课程**。宁可显示引导态，也不显示可能错的课。这是本方案对「显示不出问题」的严格定义。

### 明确的失效边界（不保证项）

1. **从未打开过 App 就没有数据**：数据源只有 WebView 的 `localStorage`，原生无法自行获取。这是跨进程存储边界导致的固有约束，不是实现缺陷。
2. **快照不会自动感知外部变化**：学校临时调课/停课、教务系统临时改课、用户修改课程或学期起始日期 —— 这些只在 Web 侧发生，不打开 App 就不会推送新快照。
3. **用户手动「强制停止」App**：Android 会把包置为 stopped 状态并拦截广播投递，widget 可能停更直到用户再次打开 App。任何权限组合都无法绕开这一平台行为；`updatePeriodMillis` 是其中最可能仍被投递的路径，但**不承诺**在 force-stop 后仍然生效。
4. **用户关闭该 App 的全部后台活动**：部分厂商 ROM 的「深度省电/后台冻结」会抑制 WorkManager 与系统广播。同样无法从应用侧强制保证。

### 为什么这样取舍

- 与其用「原生再实现一套周次/日历推算」换取独立性，不如把 JS 作为唯一事实来源：后者不会产生两侧算法漂移，代价是必须至少打开一次 App 来播种数据。
- 与其让原生再实现一套「今天是第几周」，不如把 JS 作为唯一事实来源：代价是必须至少打开一次 App 播种数据，换来的是永远不会出现两侧算法漂移。

---

## D12. 精度阶梯的用户可见行为与交付口径

### 结构性保证（任何精度层都成立）

原生 hero 的选取规则是「第一条 `endEpochMs > now` 的课程」，不是「第一条 `startEpochMs > now` 的课程」。因此：

- 课已开始但未结束 → 它**就是** hero（标签应显示「正在进行」）；
- 只有当快照中**确实不存在任何未结束的课程**时，才可能显示「无课」。

**推论：任何时刻显示的课程名都是正确的**，前提是快照存在且覆盖到该课程。所以「要上课了却显示不上课」在本设计里不可能发生 —— 这是必须写进交付说明的核心结论，也是本设计对「时效性」的严格定义。

### 唯一真实存在的精度缺陷

首尾相接的两节课（A 10:00 结束、B 10:00 开始）之间，若期间没有发生任何渲染，widget 会继续把 **A** 显示为「正在进行」。这是**显示错课**，不是显示无课。其窗口大小取决于当前生效的精度层：

| 生效层 | 缺陷窗口 |
|---|---|
| L3（精确闹钟，用户已授权） | 秒级 |
| L3 未授权，屏幕亮着 | 秒级到几分钟（退出 Doze 后 L4 立即交付） |
| L3 未授权，屏幕熄灭且深度 Doze | 最长 30 分钟 —— **但屏幕是黑的，无人可见** |
| 跨零点（任何情况） | 0：由 L2 的 `ACTION_DATE_CHANGED` 精确覆盖 |

### 应用内呈现（L3 的可选开启）

- 在 `app/features/profile/ProfilePage.tsx` 增加一节「桌面小工具」，展示：
  1. 当前精度等级（`基础` / `精确`），由插件 `getExactAlarmStatus()` 返回；
  2. 一段**如实说明**：基础模式在息屏深度省电时最长可能延迟 30 分钟才切换；精确模式在休眠中也能按点切换；
  3. 未授权时显示「开启精确切换」按钮 → 插件 `requestExactAlarmPermission()` → 跳 `Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM`；
  4. 已授权时显示「已开启」状态；可提供「前往关闭」入口（跳同一设置页），不做应用内开关（系统权限才是事实来源，避免出现两处互相矛盾的状态）。
- 不主动弹窗、不在首次启动拦截。用户在小工具不工作时会自然来这里找原因。

### L3 的已知限制（必须交付说明）

1. **需要用户手动授权**，且在 Android 14+ 默认拒绝；用户拒绝或不理解时功能仍可用，只是精度降级。
2. **精确闹钟不随重启保留**：我们不要 `RECEIVE_BOOT_COMPLETED`，因此重启后 L3 需要在应用被打开或首次收到系统 L5 广播时重新武装。重启后到重新武装之间的边界切换依赖 L4/L5。
3. 部分厂商 ROM 会无视精确闹钟；无法从应用侧保证。

### 交付口径（不得夸大）

- 允许说：「课程名永远正确；跨零点与改时间即时纠正；开启精确模式后课程切换在秒级。」
- 禁止说：「小工具永久实时」「任何情况下都能在秒级切换」「不需要打开 App 就永远准确」。

---

## 一致性检查表（实现与检查阶段逐项核对）

| # | 约束 | 判定方式 |
|---|---|---|
| 1 | 原生不解析 localStorage / 不重算周次 | 审查 `widget/` 与插件代码，只允许读 `class-track-widget` |
| 2 | 原生不做日期/时区运算 | 代码中不出现 `Calendar`/`java.time`/`SimpleDateFormat`，只有 `System.currentTimeMillis()` 与 epoch 比较 |
| 3 | 权限合规 | `AndroidManifest.xml` 声明 `SCHEDULE_EXACT_ALARM`（**可选增强**，用于 L3），但绝不声明 `USE_EXACT_ALARM`；未授予时全部路径静默回退，不得崩溃或弹错误；`RECEIVE_BOOT_COMPLETED` 只作为 `androidx.work` 的融合结果出现 |
| 4 | 写入成功才 resolve | `WidgetSnapshotPlugin` 所有 `commit()` 失败路径都 `reject` |
| 5 | Web 环境 no-op | `pnpm dev` 下不产生 console 报错；`native-widget-snapshot.ts` 的 Web 实现只 reject |
| 6 | 快照不含敏感字段 | 对照 D2 字段表审查 payload |
| 7 | 时区正确性 | vitest 用例显式传入带偏移的 `now` 与日期；JUnit 用例显式传入 `nowEpochMs` |
| 8 | 构建门禁 | `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` 全绿 |
| 9 | 覆盖窗口宽度正确 | `buildWidgetSnapshot` 的窗口末日 = 学期最后一周的最后一天；`dayEndEpochMs.length` 等于窗口天数；每个 entry 满足 `dayOffset < dayEndEpochMs.length` |
| 10 | 系统兜底已生效 | provider XML 的 `updatePeriodMillis` 为 `1800000`（不是 0） |
| 11 | 未过度承诺 | 交付说明保留 D11/D12 的失效边界与精度口径，不得写成「永久实时」 |
| 12 | L2 广播已注册 | manifest 中同时存在 `ACTION_DATE_CHANGED`、`ACTION_TIME_SET`、`ACTION_TIMEZONE_CHANGED` 的 intent-filter，且接收器走与 Worker 相同的幂等重算入口 |
| 13 | L3 可降级 | 代码中存在 `canScheduleExactAlarms()` 判断；未授权时仍走 L4，且不产生异常或用户可见错误 |
| 14 | 结构性保证成立 | JUnit 断言：一条课程 `start < now < end` 时它仍是 hero 且 `heroState = InProgress`；只有全部 `end <= now` 才可能为 `Empty` |
| 15 | `Empty` 与 `NoUpcoming` 不混淆 | `WidgetDisplayState.Type` 同时存在 `EMPTY`（未导入课表）与 `NO_UPCOMING`（学期已结束）；解析器在快照有效但无未结束课程时返回后者，UI 文案随之不同 |

---

## Rollback

| 阶段 | 回滚点 |
|---|---|
| P1（工具链）失败 | 还原 `android/build.gradle`、`variables.gradle`、`app/build.gradle`；工作区回到纯 Java，无功能损失 |
| P2/P3（Glance 渲染或调度无法跑通） | 保留 D2 契约、D3 通道、D4 调度、D6/D9 Web 侧全部成果，只把 `widget/` 的渲染层换成 RemoteViews（纯 Java/XML），并在本文件追加一节记录降级理由 |
| P4（点击跳转不稳定） | 按 D8 降级条款，移除 Intent extra 消费逻辑，仅保留打开 App |
| 整体放弃 | 分支 `feat/android-home-widget` 独立于 `master`，未合并即无影响；`cap sync` 不会改写 `app/build.gradle`，因此回滚只需还原该文件与新增文件 |

## 验证策略

| 层次 | 手段 |
|---|---|
| Web 纯逻辑 | `pnpm test`（vitest，新增 `widget-snapshot.test.ts`） |
| Android 纯逻辑 | `./android/gradlew -p android :app:testDebugUnitTest`（新增 JUnit 用例） |
| Web 门禁 | `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm build` |
| Android 构建与资源一致性 | `pnpm cap:build:android` + `pnpm android:check-assets` |
| 端到端 | 启动 `Medium_Phone` AVD → 安装 APK → 放置小工具 → 打开 App 同步 → `adb exec-out screencap` 留存截图（含浅色/深色、4x2 与缩小后布局） |

## 未决 / 需在实现中确认的事实

1. ~~`buildFeatures { compose = true }` 是否为 Glance-only 构建所必需~~ → **已结案（P1 实测）**：**不需要**。只应用 `org.jetbrains.kotlin.plugin.compose` 即可编译 `@Composable`，未添加 `buildFeatures.compose`。
2. ~~KGP 2.1.20 与 AGP 8.13.0 的实际兼容性~~ → **已结案（P1 实测）**：兼容，构建通过，未出现 AGP 版本告警阻断。真正的坑是 jvmTarget 对齐，见 design.md D1.2。
2b. **本机 JDK 相关实测结论**：本机只有 JDK 21，AGP 8.13 默认按 21 产出 Java 字节码；`compileOptions` 会被 toolchain 覆盖，因此统一用 `kotlin { jvmToolchain(21) }` 让 Kotlin 与 Java 同为 21。**不需要、也不引入第二个 JDK。**
3. WorkManager 2.11.2 是否与 Capacitor 8 / minSdk 24 组合正常（否则回落到 Glance 传递的 2.7.1 或 2.10.5）。
4. 模拟器上通过 `adb` 完成「放置小工具」的具体可行路径（`adb shell input` 长按 + 拖拽，或人工放置后截图）。若不可行，D4 验收改为人工放置 + 截图留档，并在 check 阶段说明。
5. 典型学期的实际快照体积（需在 P2 实测并写入测试断言）。若超过 256 KiB，先收紧 `WIDGET_MAX_ENTRIES` 再考虑压缩字段名。
6. `commit()` 写入 ~100 KB 是否在 Capacitor 桥线程上造成可感知延迟；若明显，把落盘移出 `PluginCall` 线程并把 `resolve()` 改为在写入完成后回调（协议不变）。
