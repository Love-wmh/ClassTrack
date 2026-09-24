# App Update Check

> Android 客户端的更新检测契约：GitHub Release 的版本解析与通道判定、通道默认值的**一次性播种与持久性**、
> 通知与权限边界，以及「现网最新版本 == 待验收版本」时怎么验收。

---

## Overview

安装过的 APK 需要自己告诉用户「有新版本」。这件事跨四层，每一层都有各自的失败方式：

```
android-release.yml（生成 tag 与版本名） → APK 里的 versionName（@capacitor/app 读回）
   → GitHub Releases API（远端数据） → 版本/通道判定（纯函数） → 模态框 + 系统通知
```

相关代码：

| 位置 | 职责 |
| --- | --- |
| `.github/workflows/android-release.yml` | 版本名与 tag 的**唯一生成者**：正式版 `vX.Y.Z`（非 prerelease）、测试版 `android-beta-N`（`1.0.N-beta`） |
| `app/lib/app-update/version.ts` | 版本号解析与比较（三元组按数值比较；同三元组时正式版 > 测试版） |
| `app/lib/app-update/channels.ts` | release 原始数据 → `UpdateCandidate` 的唯一收窄点；通道筛选；通道播种 |
| `app/lib/app-update/releases-api.ts` | GitHub 读取（不抛错，失败收敛成 `reason`）+ 调试假数据注入 |
| `app/lib/app-update/schedule.ts` | 间隔与节流判定 |
| `app/lib/app-update/native-update.ts` | `@capacitor/app`（版本名 / 回前台）与 `@capacitor/local-notifications`（权限 / 通知）适配层 |
| `app/store/updateStore.ts` | 设备相关设置（独立 localStorage key `class-track-update`，不进备份 JSON） |
| `app/components/app-update/` | 模态框 + 自动检查挂载点（`useAppUpdate`） |
| `app/features/profile/AppUpdateSettings.tsx` | 个人中心的「应用更新」卡片 |
| `android/…/AppUpdatePlugin.java` + `NotificationSettingsTargets.java` | 本应用自己的插件：跳到通知设置页（Web 层没有这个能力）。目标链的判决与渠道 id 校验在纯类里，由 JVM 单测钉住 |

---

## Contracts

- **平台范围只有 Android 原生**（`isAndroidApp()`）。浏览器 / PWA 由 Service Worker 的 `PwaUpdatePrompt` 负责，
  那边不渲染设置卡片、不发起任何请求。非 Android 时 `useAppUpdate().candidate` 恒为 `null`。
- **版本名的形态是跨层契约**：`X.Y.Z` 是正式版包，含 `-` 后缀（`1.0.10-beta`、`1.0.0-local`）是测试版包。
  改 CI 的命名规则必须同步改 `version.ts`，否则「是不是新版本」会判错。
- **候选版本解析优先级：标题 → tag**。标题取 `ClassTrack Android (\S+)`；取不到就 tag（`v1.2.0` → `1.2.0`，
  `android-beta-7` → `1.0.7-beta`，与工作流生成规则一致）。两条都取不到就**整条丢掉**，不抛错。
- **`html_url` 必须落在 `https://github.com/Love-wmh/ClassTrack/releases/` 前缀内**，否则该条直接被丢弃。
  远端数据不允许变成任意跳转地址。
- **`prerelease` 必须是真 boolean**：字符串 `"false"` 会让 `Boolean` 判定把它算成测试版，因此类型不符即丢弃。
- **通道语义**：`stable` 只看非 prerelease，`beta` 只看 prerelease，`all` 跨两者取版本号更高者。
  某条轨道一个包都没有时按「没有候选」处理（现网正式版轨道长期为空，这是常态而非异常）。
- **通道默认值只在首次读到版本名时播种一次**：
  - 存储里没有值 → 按安装包类型播种（测试版包 → `all`，正式版包 → `stable`）；
  - 存储里**已经有值 → 原样返回，永不改写**。所以「测试版包升级成正式版包」之后通道仍是 `all`
    （用户 2026-09-23 明确要求）。判据是「存储里有没有值」，不是「安装包类型变了没有」。
  - 卸载重装会清掉 localStorage 并重新播种，这是可接受的。
- **节流记的是「尝试」**：失败的那次也更新 `lastCheckAt`，否则断网时会变成每次切前台都重试。
  手动检查不走节流，且 `ignoreSkipped: true`（被跳过的版本仍然展示）。
- **「跳过此版本」只抑制自动提示**：`skippedVersion` 存版本号本身，比对用归一化后的版本号。
- **通知**：只在**自动检查**发现更新时发（用户点「立即检查」时正看着界面，不需要第二条提醒）。
  权限在首次要发通知时申请；被拒**不改**开关（用户没做任何操作，静默翻开关会让人莫名其妙），
  卡片里给「系统通知权限未开启」的提示。只有用户主动打开开关却被拒时才把开关退回关闭。
- **「发现新版本时发通知」默认关**（2026-09-23 用户口径）：首装 / 存储里没有该字段的设备不发通知、
  **也不申请通知权限**，新版本仍在应用内弹模态框；「自动检查更新」保持默认**开**。默认值与「localStorage
  是外部输入、坏值怎么逐字段收窄」都搬进了纯模块 `app/lib/app-update/settings.ts`
  （`DEFAULT_UPDATE_SETTINGS` / `normalizeUpdateSettings`）并由 `settings.test.ts` 钉住，`updateStore` 只负责
  把它交给 persist 的 `merge`。改默认值只影响存储里**没有**该字段的设备 —— 已经存过 `notify: true` 的
  用户不受影响，这是有意的。
- **`schedule()` 必须显式传 `isExactNotification: false`**：我们发的是「立刻投递」的通知，插件走
  `NotificationManager.notify`，不经过 AlarmManager。默认值 `true` 会让插件的 `doSchedule` 在系统未授予
  「闹钟与提醒」特殊访问时先 `startActivityForResult` 弹系统设置页**并等结果**，于是这次调用永不 resolve、
  通知永不投递，用户还会被莫名拽到设置页。这个坑是 2026-09-23 在 API 37 模拟器上实测出来的，两个日志特征：
  logcat 里 `Capacitor: callback: … methodName: schedule` 之后什么都没有，且紧接着出现
  `Settings$AlarmsAndRemindersAppActivity`。通知 id 固定，避免通知栏堆一串重复提醒。
- **release 正文按纯文本渲染**：它是远端内容，`marked` 的输出未经净化，直接 `dangerouslySetInnerHTML`
  会在 WebView 里开出脚本注入面（这个 WebView 的 localStorage 里是用户的全部课程数据）。
  只做「去掉 `**` + trim」这种纯文本清理。
- **「去下载」用锚点导航**，不用 `window.open(url, '_blank')`：Capacitor 的 `Bridge.launchIntent` 会把非同源导航
  交给系统浏览器（`Intent.ACTION_VIEW`），而本仓库的 WebChromeClient 没有覆写 `onCreateWindow`，
  `_blank` 在新窗口被禁用时可能什么都不发生。

---

## 原生依赖与权限增量

引入 `@capacitor/app@8.1.1` 与 `@capacitor/local-notifications@8.3.1` 后，`cap sync android` 会：

- 在 `android/app/src/main/assets/capacitor.plugins.json` 与两个 `capacitor*.gradle` 里注册插件；
- 合并插件自身的 manifest。**净增量**：

| 来源 | 新增内容 |
| --- | --- |
| `@capacitor/app` | **无**（它的 AndroidManifest 是空的） |
| `@capacitor/local-notifications` | 权限 `POST_NOTIFICATIONS`、`RECEIVE_BOOT_COMPLETED`、`WAKE_LOCK`；`SCHEDULE_EXACT_ALARM` 与本仓库已有声明去重；3 个 receiver 与 1 个 provider（authority `${applicationId}.localnotifications.fileprovider`，与自建的 `${applicationId}.fileprovider` 不冲突） |

`@capacitor/local-notifications` 是 Kotlin 模块，它的 buildscript 自带 `kotlin-gradle-plugin` 版本，
与本仓库选定的版本不同 —— 这**不是新问题**：已在仓库里跑通的 `@capacitor/filesystem` 同样是这种形态。

---

## Verification Recipe

`pnpm test` 覆盖全部纯函数判定（版本解析/比较、通道筛选、播种持久性、节流、URL 白名单、响应结构非法时的静默失败、
模态框静态渲染）。真机链路必须用调试注入，原因是**现网最新版本常常就等于待验收的版本**，真机天然触发不了「有新版本」。

```bash
# 1) 带调试开关构建（正式包不设该变量，调试路径恒不生效）
VITE_UPDATE_DEBUG=1 pnpm cap:sync:android
./android/gradlew -p android :app:assembleDebug

# 2) 在设备上写假数据：localStorage key = class-track-update-debug，value = GitHub Releases API 的数组形态
#    数组项至少要有 tag_name / name / body / html_url / prerelease
```

真机检查清单：

- [ ] 注入一条比已装版本新的正式版 → 冷启动弹模态框 + 通知栏出现条目
- [ ] 「稍后」后重启（间隔设为「每次启动」）→ 再次提示；「跳过此版本」后重启 → 不再提示，但「立即检查」仍弹出
- [ ] 关闭通知开关 → 只弹模态框；关闭总开关 → 不发任何请求、不弹框（手动按钮也禁用）
- [ ] Android 13+ 首次开通知开关弹系统权限；拒绝后开关回退为关并出现提示
- [ ] 测试版包默认通道是「全部」，且覆盖安装正式版之后**仍是「全部」**
- [x] 浏览器 / PWA 打开个人中心：没有「应用更新」卡片（对照：小工具精度卡片同样不出现，学期卡片正常出现）

---

## Common Mistakes

- 不要在组件或 hook 里重新解析 release 字段。收窄只发生在 `channels.ts` 的 `toUpdateCandidate`，
  否则同一份远端契约会出现第二个版本（网页一处、`all` 通道一处，改一处漏一处）。
- 不要把 `channel` 的默认值写成「每次启动都按安装包类型算」。那会让测试版用户升级到正式版后
  通道被重置成「仅正式版」，与用户口径相反 —— 播种的判据**只有**「存储里有没有值」。
- 不要在渲染期调用 `Date.now()`（本仓库 `react-hooks/purity` 是 error）。「上次检查」展示绝对时间戳
  （`format(new Date(lastCheckAt), 'yyyy-MM-dd HH:mm')`），不显示需要实时刷新的相对时间。
- 不要在 effect 体里同步 setState（`react-hooks/set-state-in-effect` 是 error）。查询外部状态的写法是
  `void readNotificationPermission().then(setNotificationPermission)`。
- 不要把「判定逻辑正确」当成真机验收通过：判定是纯函数、通知与权限是原生行为，两者必须分别验证。
- 不要因为现网正式版轨道为空就以为 `stable` 分支坏了 —— 那正是「某轨道没有候选」的常态。
- **调试包的 `versionName` 不做处理就是个哑火功能**：`build.gradle` 在没给 `CLASSTRACK_VERSION_NAME` 时回落到
  `1.0`，而 `1.0` 不是 `X.Y.Z`，`parseAppVersion` 返回 `null` → **任何更新都判不出来**。真机验收要用可解析的版本名
  出包（`CLASSTRACK_VERSION_NAME=1.0.0 …`，与 README「本地出签名包」同一做法）；卡片里也把这种情况如实说出来。
- **Android 16 的 Settings 会把通知设置意图落到应用信息页**：API 37 模拟器上，
  `CHANNEL_NOTIFICATION_SETTINGS` / `APP_NOTIFICATION_SETTINGS` / `APPLICATION_DETAILS_SETTINGS` 三个 action
  `am start` 之后 uiautomator 抓到的都是同一个「应用信息」页（通知行就在那里）。这不是跳转写错 ——
  三级回退链在 API 26–35 上才会分别生效，别照着 Android 16 的表现去「修」它。
