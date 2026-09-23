# 验收证据与残余风险

任务：`09-23-update-check-notify`（更新检测：GitHub Release 探测、通知与更新通道设置）
形态：轻量规划（PRD-only），实现由主会话直接完成（用户 2026-09-23 明确要求「不要使用任何子代理」）。
第二轮（沙盒解除后）：补上当初被阻塞的原生跳转方法、gradle 实测与模拟器真机验收。

---

## 1. 门禁（本机实测，全绿）

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `pnpm typecheck` | 通过（`react-router typegen && tsc`，无输出） |
| 前端单测 | `pnpm test` | **23 个文件 / 198 个用例全过**（`app/lib/app-update/*` 新增 50 个） |
| Lint | `pnpm lint` | 通过，**0 problems**（`--max-warnings 0`） |
| 格式 | `pnpm format:check` | 通过 |
| 构建 | `pnpm build` | 通过 |
| **原生单测** | `./android/gradlew -p android :app:testDebugUnitTest` | **BUILD SUCCESSFUL**，34 个测试类 / **253 个用例全过**（新增 `NotificationSettingsTargetsTest` 6 个） |
| **APK 编译** | `./android/gradlew -p android assembleDebug` | **BUILD SUCCESSFUL**，`app-debug.apk` 10.7 MB |

`@capacitor/local-notifications:compileDebugKotlin` 成功 → 第一轮遗留的「插件自带 KGP 版本与根工程不同」这一风险**已由实测排除**。

## 2. 合并后 manifest（gradle 真实产物，第一轮只能静态推断）

`android/app/build/intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml`：

- 权限：`POST_NOTIFICATIONS`、`RECEIVE_BOOT_COMPLETED`、`WAKE_LOCK` 为**新增**；`SCHEDULE_EXACT_ALARM` 与本仓库已有声明**合并成一条**（无重复）。
- 组件：新增 `TimedNotificationPublisher`、`NotificationDismissReceiver`、`LocalNotificationRestoreReceiver`（3 个 receiver）
  与 `LocalNotificationsAssetProvider`（authority `com.classtrack.app.localnotifications.fileprovider`，与自建 `com.classtrack.app.fileprovider` 并存不冲突）。
- `@capacitor/app` 的 manifest 为空 → **零权限零组件**，与预告一致。

## 3. 模拟器真机验收（Medium_Phone / API 37，逐条对照 PRD）

证据全部在 `evidence/`（截图 + DOM/系统 dump 文本）。

| PRD 验收项 | 结果 | 证据 |
| --- | --- | --- |
| 设置卡片只在安卓出现；浏览器 / PWA 无更新 UI | ✅ | 真机 `#card-app-update` 渲染（`device-01`）；浏览器（headless Chrome 走 dev server）里更新卡片与小工具精度卡片**都不出现**、学期卡片正常出现 |
| 冷启动弹模态框 + 通知栏出现条目 | ✅ | `device-06-real-api-modal.png` / `.txt`：模态框「发现新版本 1.0.10-beta / 1.0.0 → 1.0.10-beta / 测试版」+ 真实 release 正文；`dumpsys notification` 里 `NotificationRecord(pkg=com.classtrack.app … channel=updates)`，`android.title=ClassTrack 有新版本`、`android.text=1.0.10-beta 已发布，点击查看`；`device-04` 是通知栏截图 |
| 「稍后」后重启仍提示；「跳过此版本」后重启不再提示、但「立即检查」仍弹出 | ✅ | 点「跳过此版本」→ `skippedVersion:"9.9.9"`、模态框关闭；reload → **无模态框**；到设置页点「立即检查」→ 模态框重新出现（`version:9.9.9`） |
| 关闭通知开关 → 只弹模态框；关闭总开关 → 不发请求、不弹框 | ✅ | 关掉总开关后把 `lastCheckAt` 清空再重启：`lastCheckAt` **仍为 `null`**（证明早退发生在 `markChecked`/联网之前）、无模态框 |
| 通道三选一各自只推对应轨道 | ✅（单测 + 联调） | 真机上是 `stable`/`all` 两条路径；`beta` 与跨通道比较由 50 个纯函数用例 + 第 4 节真实 API 联调覆盖 |
| 测试版包默认「全部」，覆盖安装正式版后**仍是「全部」** | ✅ | 清空设置后装 `versionName=1.0.11-beta` 的包 → `channel:"all"`（卡片显示「全部」）；**覆盖安装** `versionName=1.0.0` 的包（数据保留）→ `channel:"all"` 未变（卡片仍显示「全部」） |
| Android 13+ 首次开通知开关弹系统权限；拒绝后开关回退为关 | ✅ | 「Allow ClassTrack to send you notifications?」（`device-03`）授权后 `dumpsys package` 里 `POST_NOTIFICATIONS: granted=true`；撤销权限后点开关 → 弹窗选「Don't allow」→ 开关回到 `unchecked`、`state.notify:false` |
| 用真实网络在最新版本上报「已是最新版本」 | ✅ | 早期一轮（装机版本 `1.0.10-beta`）真实 API 联调结果：三个通道都「不提示」 |
| **额外**：真实 API + 真实 release 的正向链路 | ✅ | 第 5 节 |

## 4. 真实网络联调（临时脚本，跑完即删）

```
fetch ok = true（候选 10 条）
候选：1.0.10-beta(beta) … 1.0.1-beta(beta)
全部 pageUrl 前缀合法 = true
stable 最新 = (无)      beta 最新 = 1.0.10-beta      all 最新 = 1.0.10-beta
已装 1.0.10-beta · stable/beta/all → 不提示
已装 1.0.9-beta  · beta/all → 提示 1.0.10-beta
已装 1.0.0       · beta/all → 提示 1.0.10-beta
已装 1.2.0       · 全部通道 → 不提示
```

## 5. 真机上的「真实链路」意外收获（最有价值的一条）

最后一轮装包时漏了 `VITE_UPDATE_DEBUG=1`，于是这一轮**没有注入假数据**，走的是真实 GitHub API：

- 装机版本 `1.0.0`（正式版形态）、持久化通道为「全部」（上一轮测试版包播种的，且**没有被重置**）；
- 冷启动检查命中真实 release `1.0.10-beta`（比 1.0.0 新）→ 弹模态框 + 通知栏出现条目。

也就是说，「测试版用户升级到正式版包」这个最容易出问题的路径在真机上跑通了，同时第三次印证了通道持久性。

## 6. 真机验收揪出的一个真 bug（已修）

**症状**：通知永远发不出去，`await LocalNotifications.schedule(...)` 永不 resolve，且用户会被莫名拽到系统设置页。

**根因**：插件 `doSchedule` 里，通知的 `isExactNotification` **默认是 `true`**；当系统未授予「闹钟与提醒」特殊访问
（`canScheduleExactAlarms() === false`）时，插件会先 `startActivityForResult(ACTION_REQUEST_SCHEDULE_EXACT_ALARM)` 并**等结果回来**才继续。
我们发的是「立刻投递」通知，根本不需要精确闹钟，于是这次调用就挂在那里。

**日志特征**（下次排同类问题的抓手）：logcat 里 `Capacitor: callback: … methodName: schedule` 之后什么都没有，
紧接着出现 `Settings$AlarmsAndRemindersAppActivity`。

**修复**：`sendUpdateNotification` 里显式传 `isExactNotification: false`（`app/lib/app-update/native-update.ts`），
并给两处动作型原生调用加了 `console.warn`（不再静默吞掉失败）。修完重测：通知正常投递。

## 7. 与 PRD 的偏差（已在实现中说明）

1. **「上次检查」显示绝对时间戳**而不是「3 小时前」：本仓库 `react-hooks/purity` 把渲染期 `Date.now()` 设为 error，
   相对时间需要额外时钟源；绝对时间对设置页也更稳定。
2. **手动「立即检查」不发系统通知**（自动检查才发）：手动检查时用户正看着界面、模态框就在眼前，再叠一条通知是噪声。
3. **通知渠道 importance 取 3（DEFAULT）**：进通知栏但不抢屏（上课场景）。
4. **通知设置跳转在 Android 16 上落到应用信息页**：三级回退链本身工作正常，是系统把三个 action 都重定向到了应用信息页
   （uiautomator 抓到的页面里「通知」行就在那里）。API 26–35 上才会分别落到渠道页/应用通知页。
5. **新增一个原生插件**（`AppUpdatePlugin` + 纯类 `NotificationSettingsTargets` + 6 个 JVM 用例）：
   当初 PRD 把「跳转按钮」列为 F5 的一部分但没做，用户 2026-09-23 明确要求补上。

## 8. 残余风险

- **只在一个 API 37 模拟器上验过**：没有真机、没有 API 26–35 的样本，`stable` 通道的真实推送路径也仍未在真机上出现过
  （现网没有正式版 release）。
- **本次验收的 APK 是 debug 包 + 手填版本名**（`CLASSTRACK_VERSION_NAME=1.0.0`）：签名链路、CI 的
  `android:check-assets` 与真实发布产物没有在本轮重跑。
- **模拟器在测试中出现过一次 WebView 库内部崩溃**（`WV.ig1.onTrimMemory` → `libwebviewchromium.so` SIGILL，
  由系统 `dispatchTrimMemory` 触发），与本次改动无关，但会干扰长时间真机验收。
- **通知权限的首次申请**只在「自动检查发现更新」或「用户打开通知开关」时发生；默认开关是开，因此不进设置页、
  又恰好没检查到更新的用户不会看到权限弹窗（与「开关开着但没权限」一致，卡片里有提示）。

## 9. 变更文件清单

新增：

```
app/lib/app-update/{version,channels,schedule,releases-api,native-update}.ts + {version,channels,schedule,releases-api}.test.ts
app/components/app-update/{useAppUpdate.ts,UpdateAvailableDialog.tsx,UpdateAvailableDialog.test.ts,updateDialogCopy.ts,UpdateCheckRunner.tsx}
app/components/ui/switch.tsx
app/store/updateStore.ts
app/features/profile/AppUpdateSettings.tsx
app/vite-env.d.ts
android/app/src/main/java/com/classtrack/app/AppUpdatePlugin.java
android/app/src/main/java/com/classtrack/app/NotificationSettingsTargets.java
android/app/src/test/java/com/classtrack/app/NotificationSettingsTargetsTest.java
.trellis/spec/frontend/app-update.md
.trellis/tasks/09-23-update-check-notify/{prd.md,verification.md,evidence/*}
```

修改：

```
app/root.tsx（挂载 UpdateCheckRunner）
app/features/profile/ProfilePage.tsx（接入 AppUpdateSettings）
android/app/src/main/java/com/classtrack/app/MainActivity.java（注册 AppUpdatePlugin）
android/app/capacitor.build.gradle、android/capacitor.settings.gradle（两个 Capacitor 插件）
package.json / pnpm-lock.yaml
README.md、.trellis/spec/frontend/index.md
```

## 10. 本机环境注记（不进仓库）

`node_modules` 记录的是容器里的 pnpm store 路径 `/workspaces/ClassTrack/.pnpm-store/v3`，本机不存在且任何
`pnpm install` 都要求清空重装。因此依赖是按「临时目录里 `pnpm add --lockfile-only` 生成清单 + `npm pack` 解包到
`node_modules`」的方式加进去的，`pnpm-lock.yaml` 只有那两个新包的条目（另有一处 `picomatch` 无关漂移已还原）。
CI 的 `pnpm install --frozen-lockfile` 不受影响；`cap sync` 生成的 `android/capacitor.settings.gradle` 指向
`../node_modules/@capacitor/app/android`，两种布局下都成立。
