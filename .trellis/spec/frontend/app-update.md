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
| `app/lib/app-update/schedule.ts` | 间隔档位与「这次触发该不该真的联网」的**唯一判决**（纯函数） |
| `app/lib/app-update/check.ts` | 检查内核：闸门 → 读版本 → 记账 → 取远端 → 判定。依赖全注入，所以「成功才记账」是单测钉住的 |
| `app/lib/app-update/settings.ts` | 持久化设置的收窄 + 一次性存量间隔提升（纯函数） |
| `app/lib/app-update/native-update.ts` | `@capacitor/app`（版本名 / 回前台）与 `@capacitor/local-notifications`（权限 / 通知）适配层 |
| `app/store/updateStore.ts` | 设备相关设置（独立 localStorage key `class-track-update`，不进备份 JSON） |
| `app/components/app-update/` | 模态框（`UpdateAvailableDialog`）+ 更新说明渲染（`releaseNotes.tsx`）+ 自动检查挂载点（`useAppUpdate`） |
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
- **两个时间戳各管一件事**（2026-09-28 起，别再合成一个）：
  - `lastCheckAt` = 上一次**成功拿到结果**的时刻 → 间隔窗口，也是设置页展示的那个值；
  - `lastAttemptAt` = 上一次**尝试**的时刻（成功失败都写） → 只为失败后的**短冷却**（60 秒）服务。
  「上次尝试是失败的」由两个时间戳的先后关系推导（`lastAttemptAt > lastCheckAt` 或 `lastCheckAt === null`），
  不额外落布尔字段。
- **只有拿到结果才消耗间隔窗口**：请求失败（网络错误 / 403 / 429 / 5xx / 结构不符）**不更新** `lastCheckAt`，
  所以下一次回到前台会立刻重试（受 60 秒失败冷却约束）。**失败也记 `lastCheckAt` 会退回
  「冷启动那次没网 → 之后回到前台永远被节流拦住 → 只有手动检查能拿到更新」**——这正是 2026-09-28 上报的缺陷。
  「有没有新版本」「被通道或「跳过此版本」过滤掉」都算**成功**（远端确实答了）。
- **失败冷却**（常量，不暴露给用户）：上一次尝试失败且距它不足 60 秒 → 不发起新的检查。
  没有这道闸门，「失败不记账」会变成断网时来回切前台狂打接口，把匿名额度（60 次/小时）打光。
- **重入保护**：`inFlight` 为真时不放行；hook 里**只有真正开始这一轮检查的调用**才允许置位/清除
  `isChecking`，否则被拦下的调用会在 `finally` 里把正在跑的那一轮误标成结束。
- **时间戳在未来**（用户改过系统时间）→ 按「间隔已过完」处理，不让检查永久静默。
- **间隔档位**：`launch`（每次启动/回到前台都放行）/ `1h`（**默认**）/ `1d` / `3d` / `7d`。
  `launch` 的毫秒数是 0，所以它只管间隔，仍受失败冷却与重入约束。
- **存量间隔提升只做一次**（`applyLegacyIntervalMigration`）：值等于旧默认 `1d` **且**没有「用户改过间隔」的
  标记（`intervalPinned`）→ 提升为 `1h` 并置位标记。用户手动改过间隔的设备一个字都不动。
  **只改默认值是不够的**：persist 里已经有值就用存储值，存量设备会继续按 1 天节流。
- 手动检查不走间隔、不走冷却，且 `ignoreSkipped: true`（被跳过的版本仍然展示）。
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
- **release 正文经 `marked.lexer` 的 token → React 元素渲染**（`app/components/app-update/releaseNotes.tsx`）：
  它是远端内容，而这个 WebView 的 localStorage 里是用户的全部课程数据。安全做法是「**不生成 HTML 字符串**」——
  React 对文本子节点自动转义，远端字符串进入 DOM 的唯一路径因此被消除。
  - **禁止 `dangerouslySetInnerHTML`**（全仓库 0 处使用）；也不得把远端字符串拼进 HTML；
  - 原始 HTML（`<script>`、`<img onerror=…>`）按**文本**渲染，不产生元素；
  - 图片**不渲染元素**（不让 WebView 去拉任意远端资源），只留替代文本；
  - 链接只有 `http(s)` 才生成锚点，其它协议（`javascript:` / `data:`）退化成纯文本；锚点**不加 `target`**
    （与「去下载」同一个 Capacitor `_blank` 坑），带 `rel="noreferrer"`；
  - 表格降级成「每行一段文本、单元格用 ` ｜ ` 连接」，不产生 `<table>`；
  - 未知 token（`marked` 升级）必须有兜底：能递归就递归、否则按文本渲染，**不得抛错**；
  - `list` token 的子项字段是 **`items`**，其余块级/行内 token 才是 `tokens` —— 只读一个会把整类列表渲染成空壳。
  2026-09-28 之前这里是「去掉 `**` + `whitespace-pre-wrap`」的纯文本展示（当时的 prd 决策 T5），
  安全目标相同，但用户看到的 `## 本次改动` / `- 条目` 全是字面量。
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

`pnpm test` 覆盖全部纯函数判定（版本解析/比较、通道筛选、播种持久性、调度判决与记账、存量间隔提升、URL 白名单、
响应结构非法时的静默失败、模态框与更新说明的静态渲染）。调度与记账的规则在 `schedule.test.ts` / `check.test.ts`，
它们靠**注入假依赖**（时钟、存储动作、网络）钉住，不需要设备。
真机链路必须用调试注入，原因是**现网最新版本常常就等于待验收的版本**，真机天然触发不了「有新版本」。

```bash
# 1) 带调试开关构建（正式包不设该变量，调试路径恒不生效）
VITE_UPDATE_DEBUG=1 pnpm cap:sync:android
./android/gradlew -p android :app:assembleDebug

# 2) 在设备上写假数据：localStorage key = class-track-update-debug，value = GitHub Releases API 的数组形态
#    数组项至少要有 tag_name / name / body / html_url / prerelease
```

真机检查清单：

- [ ] 注入一条比已装版本新的正式版 → 冷启动弹模态框 + 通知栏出现条目
      （2026-09-28 的调度改动**没有**重跑真机验收，见 `09-28-update-check-foreground-and-notes-markdown` 的残余风险）
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
- 不要在渲染期调用 `Date.now()`（本仓库 `react-hooks/purity` 是 error）。「上次检查成功」展示绝对时间戳
  （`format(new Date(lastCheckAt), 'yyyy-MM-dd HH:mm')`），不显示需要实时刷新的相对时间。
- **不要用 `markChecked` 记一次失败的检查**（2026-09-28 的缺陷就是这么来的）：它是「上一次成功拿到结果」，是间隔
  窗口的唯一依据；失败只调 `markAttempted`。反过来也不要为了防断网重试而把冷却写成「失败也消耗间隔窗口」。
- **不要把 `lastCheckAt` 当「上次尝试」用**（读这段代码时最容易看错的一处）：展示与间隔判定都用「成功」的那个；
  判断「上次是不是失败」请用两个时间戳的先后关系（`lastAttemptAt > lastCheckAt`），不要新增布尔字段。
- **不要给 release 正文重新引入 `dangerouslySetInnerHTML`**（哪怕先用 DOMPurify 净化）。本仓库没有净化依赖，
  而 token → React 元素这条路已经不需要它；表格 / 图片 / 原 HTML 的降级是有意取舍，不是没做完。
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
