# 更新检测：GitHub Release 探测、通知与更新通道设置

> 本文是**轻量规划**的唯一产物（用户 2026-09-23 口径：只写 `prd.md`，不写 `design.md` / `implement.md`）。
> 因此「技术前提与决策」一节也放在这里，实现前必须先把这一节点读完。

## Goal

1. **安卓端自动发现新版本**：冷启动与回到前台时，按可配置间隔查询 GitHub Release；
   发现有比当前安装版本更新的包时，**前台弹模态框**并**发系统通知**（通知栏）。
2. **给用户三个独立控制**（这是需求的核心，缺一不可）：
   - 关掉通知栏推送（仍然在应用内提示）；
   - 完全关掉更新推送（不再联网检查、不再提示）；
   - 选择更新通道（仅正式版 / 仅测试版 / 全部），默认值由**当前安装包类型**决定。

现状：安卓 APK 上**完全没有**更新提示。已有的 `PwaUpdatePrompt` 只在非原生平台渲染
（`app/root.tsx` 里 `!isNativeApp() && <PwaUpdatePrompt />`），浏览器/PWA 已经由 Service Worker 覆盖。

## 背景与现状事实

| 事实 | 后果 |
|---|---|
| 仓库公开：`https://github.com/Love-wmh/ClassTrack`（`git remote -v`） | 匿名调用 GitHub API 即可，不需要 token / 不需要后端 |
| 两条发布轨道由 `.github/workflows/android-release.yml` 产出：正式版 tag `vX.Y.Z`（非 prerelease、`--latest`）、测试版 tag `android-beta-N`（prerelease），版本名分别是 `X.Y.Z` 与 `1.0.N-beta`（见该文件 183–210 行的「计算版本号与标签」） | 版本号与「是不是测试版」都能从 release 的 `prerelease` 字段 + 版本名判定，无需额外元数据 |
| 截至 2026-09-23 现网**只有测试版** release，最新是 `android-beta-10` = `1.0.10-beta`（实测 `GET /releases?per_page=5`） | 正式版轨道暂时空；实现必须能容忍「某轨道一个包都没有」 |
| 版本名由 `android/app/build.gradle` 从 `CLASSTRACK_VERSION_NAME` 环境变量读入；Web 层**没有任何版本常量**（`grep -rn "APP_VERSION\|appVersion" app/` 无命中） | Web 层不知道自己是哪个版本 → 必须从原生读（见决策 T1） |
| `android/app/src/main/assets/capacitor.plugins.json` 当前只注册了 `@capacitor/filesystem`、`@capacitor/share` | 本地通知与 App 插件都要新增依赖 + 重新 `cap sync android` + 重新出包 |
| `android/app/src/main/AndroidManifest.xml` 里**没有** `POST_NOTIFICATIONS` | Android 13+ 需要在该权限上做运行时申请；插件自带声明与否要在实现时核对（T4） |
| 设置页已有「仅安卓渲染」的卡片先例：`app/features/profile/WidgetPrecisionSettings.tsx`（`supported === false` 时整节 `return null`） | 新增的「应用更新」卡片照这个模式写，浏览器/PWA 上不出现死开关 |
| 设置持久化先例：`app/store/mobileNavigationStore.ts` 用独立 zustand persist key（`class-track-mobile-navigation`），**不进** `class-track-storage` | 更新设置属设备相关，同样用独立 store，避免污染备份 JSON 与 schema 迁移 |
| 根组件挂载点先例：`WidgetGuideDialog` / `PwaUpdatePrompt` 都挂在 `app/root.tsx` 的 Layout body 尾部（`!nativeShell` 判定） | 模态框挂同一处，组件内部自己判平台 |
| 仓库有 vitest（`pnpm test`），组件测试用 `renderToStaticMarkup` 静态渲染（见 `WidgetGuideDialog.test.ts`） | 版本比较、通道筛选、间隔节流这些判定逻辑必须写成纯函数并单测 |

## 口径确认记录（2026-09-23，用户）

| 问题 | 确认结果 |
|---|---|
| 任务流程 | **轻量规划**：建 Trellis 任务，只写 `prd.md`，确认后直接实现 |
| 「发送通知」怎么实现 | **新增原生本地通知插件** `@capacitor/local-notifications`，走安卓通知栏 |
| 「更新通道」给几个选项 | **三选一**：仅正式版 / 仅测试版 / 全部（跨通道取版本号更新者）；默认值跟随安装包类型 —— 正式版包默认「仅正式版」，**测试版包默认「全部」**（用户选中的选项预览里明确写了这一条）；并且**一次播种、永久保持**：测试版包升级到正式版之后通道仍然是「全部」，不会因为安装包变成正式版而被重置（用户 2026-09-23 明确要求） |
| 什么时候检查 | 「设置默认 1 天检查一次和前台启动时检查，**间隔可以更改**」→ 触发点 = 冷启动 + 回到前台；默认间隔 1 天，可改 |

## 技术前提与决策

| 编号 | 决策 | 理由 / 影响 |
|---|---|---|
| T1 | 版本号与前台事件都用 **`@capacitor/app`**：`App.getInfo().version`（= Android `versionName`）+ `App.addListener('appStateChange')` | 构建时注入做不到：工作流里 `pnpm cap:sync:android`（会 `pnpm build`）跑在「计算版本号」步骤**之前**，注入要改 CI 顺序。运行时读 versionName 最准，且顺带拿到回前台事件 |
| T2 | 平台范围 **仅安卓原生**（`isAndroidApp()`）。浏览器 / PWA 不渲染设置卡片、不发起检查 | PWA 已有 SW 更新提示；网页端追 GitHub Release 语义上没意义 |
| T3 | 数据源：**单次请求** `GET https://api.github.com/repos/Love-wmh/ClassTrack/releases?per_page=20`（已实测：`access-control-allow-origin: *`，匿名限流 60/h） | 列表 newest-first，一次就能同时拿到两条轨道，不用按通道分两次请求。1 天 1 次远低于限流 |
| T4 | 通知权限：Android 13+ 申请 `POST_NOTIFICATIONS`（`LocalNotifications.checkPermissions()` / `requestPermissions()`），通知走独立 channel（`id: 'updates'`） | 插件自身的 manifest 是否已声明该权限，实现时用 `android/app/build/intermediates/merged_manifests/…/AndroidManifest.xml` 核对；缺就自己加 |
| T5 | release 正文**按纯文本渲染**（`whitespace-pre-wrap`），不走 `marked` → HTML | release 正文是远端内容；`marked` 输出未净化，直接 `dangerouslySetInnerHTML` 会在 WebView 里开出一个脚本注入面（本应用 localStorage 里是全部课程数据）。纯文本足够看懂「本次改动」 |
| T6 | 「去下载」只允许打开 `html_url`，且**校验前缀**必须是 `https://github.com/Love-wmh/ClassTrack/releases/` | 远端数据不能变成任意 URL 跳板 |
| T7 | 更新设置存独立 zustand persist store（key `class-track-update`），不进 `class-track-storage` | 设备相关，与备份 / schema 迁移解耦 |
| T8 | 判定逻辑（版本解析、比较、通道筛选、节流）全部做成**纯函数 + vitest 单测**；真机验收用「假数据注入」通道（T9） | 现网最新 release 恰好等于即将安装的版本，真机上天然无法触发「有新版本」 |
| T9 | 假数据注入：仅当构建时 `VITE_UPDATE_DEBUG=1` 时，`localStorage['class-track-update-debug']` 里的 JSON 会替代真实 API 响应 | 让**真机**能验收模态框 / 通知 / 权限 / 跳转全链路；正式包不设该变量即彻底关闭 |
| T10 | 新增本应用自己的原生插件 `AppUpdatePlugin`（方法 `openNotificationSettings`），目标链与渠道 id 校验放在纯类 `NotificationSettingsTargets` 里由 JVM 单测钉住 | F5 的「去系统设置」跳转：`@capacitor/local-notifications` 与 `@capacitor/app` 都没有打开系统设置页的能力。用户 2026-09-23 明确要求补上 |
| T11 | `schedule()` 必须传 `isExactNotification: false` | 该字段默认 `true`，会让插件在系统未授予「闹钟与提醒」时弹设置页并**等结果**，导致调用永不 resolve、通知永不投递（真机验收实测，见 verification.md 第 6 节） |

### 版本解析与比较规则（实现口径）

- 候选版本取值优先级：release 标题 `ClassTrack Android <ver>` 捕获 `<ver>`；失败则回退 tag
  （`v1.2.0` → `1.2.0`；`android-beta-7` → `1.0.7-beta`，与工作流生成规则一致）。
- 通道归属：`prerelease === true` → 测试版；`false` → 正式版。
- 当前版本是否为测试版包：`versionName` 含 `-` 后缀即为测试版
  （`1.0.10-beta`、本机签名包的 `1.0.0-local`）；纯 `x.y.z` 为正式版。
  本地 debug 包 `versionName` 是 `1.0`，会被当成正式版包 → 默认通道「仅正式版」，
  这对内测机没有实际影响，且用户可在设置里改。
- 比较：拆成数字三元组 `[X, Y, Z]`；三元组逐位比较（数值，不是字符串）→ 大者为新；
  三元组完全相同时，无 prerelease 后缀的比有后缀的新（`1.0.10-beta` 与未来可能的 `1.0.10`）。
- 提示条件：最新候选版本 **严格大于** 当前版本，且不是用户已「跳过」的那个版本。
- **通道播种只做一次**：存储里没有通道值时，按当时的安装包类型写一个默认值（测试版包 → `all`，正式版包 → `stable`）；一旦存储里有值就永远只读它，**不再看安装包类型**。所以「测试版包 → 升级为正式版包」之后通道仍是 `all`（见上面口径表）。卸载重装会清掉 localStorage、回到按新包类型播种，这是可接受的。

## 功能需求

### F1 版本识别

- 安卓启动时读 `App.getInfo()`，得到 `version`（如 `1.0.10-beta`）与 `build`（versionCode）。
- 设置卡片显示「当前版本 1.0.10-beta」，并标出当前通道。
- 读取失败（插件不可用 / 异常）→ 整个功能静默禁用，不报错、不渲染卡片。

### F2 检查调度

- **触发点**：应用启动（组件挂载）+ 回到前台（`appStateChange` 的 `isActive === true`）。
- **节流**：距上次检查尝试（成功或失败都算）时长 < 设置的间隔 → 直接跳过，不发起请求。
  默认间隔 **1 天**；首次安装 / 无记录时立即检查。
- **间隔选项**：每次启动 / 1 天（默认）/ 3 天 / 7 天。
- **总开关关闭** → 不发任何网络请求、不弹模态框（手动按钮也不再触发请求）。
- **失败静默**：网络错误、403/429（限流）、5xx、响应结构不符 → 不打扰用户，
  只记下尝试时间（用于节流），下次按间隔重试。
- `import.meta.env.DEV` 下默认不做自动检查（避免开发时反复打真接口），手动按钮仍可用。

### F3 更新判定

- 通道筛选：`stable` 只在 `prerelease === false` 里取版本最新者；`beta` 只在 `prerelease === true` 里取；
  `all` 取两者中版本号更新者（即跨通道比较，见上面规则）。
- 某轨道为空时按「没有候选」处理，不报错。
- 候选版本 ≤ 当前版本 → 不提示。
- 候选版本 === 已跳过版本 → 自动提示（模态框 + 通知）都抑制；**手动「立即检查」仍然展示**。

### F4 前台模态框

- 安卓前台弹出（挂在 `app/root.tsx`，与 `WidgetGuideDialog` 同处）。
- 内容：标题「发现新版本 1.2.0」、`当前版本 → 新版本`、通道标签、更新说明（release 正文纯文本、限高可滚动）、
  按钮 **「去下载」**（外部浏览器打开 release 页面）/ **「稍后」** / **「跳过此版本」**。
- 同一版本在一次会话里只弹一次；「稍后」→ 下次检查（或下次启动、间隔已过）仍会提示；
  「跳过此版本」→ 永久不再自动提示该版本（本地持久化）。
- 浏览器 / PWA 不渲染。

### F5 系统通知

- 检查到更新（且未被跳过、通知开关为开）时发一条本地通知：
  标题「ClassTrack 有新版本」，正文「1.2.0 已发布，点击查看」，点击打开应用。
- **通知开关**（默认开）：关闭时只弹模态框、不发通知。
- 权限：Android 13+ 首次打开通知开关（或首次要发通知）时申请权限；
  **被拒 → 开关自动回退为关**，并给出「通知权限被拒绝，去系统设置开启」的提示与跳转按钮。
- 已知取舍（写明以免被当成 bug）：检查只在启动/回前台发生，所以通知与模态框几乎同时出现。
  两者用途不同 —— 模态框负责当下的决定，通知留在通知栏供稍后回看。

### F6 设置卡片「应用更新」（个人中心，仅安卓）

| 行 | 控件 | 默认 |
|---|---|---|
| 当前版本 | 只读文本 + 通道标签 | — |
| 自动检查更新 | 开关（**总开关**） | 开 |
| 更新通道 | 三选一（仅正式版 / 仅测试版 / 全部） | 首次安装时按安装包类型播种（正式包 → 仅正式版，测试包 → 全部），**之后永久保持，不随安装包类型变化重置** |
| 检查间隔 | 四选一（每次启动 / 1 天 / 3 天 / 7 天） | 1 天 |
| 发现新版本时发通知 | 开关 | 开 |
| 上次检查 | 相对时间文本 + 「立即检查」按钮 | — |

- 总开关关闭时：间隔与通知两行禁用（灰掉但可见，解释为什么不可用），而不是整段消失。
- 「立即检查」忽略间隔；无更新 → toast「已是最新版本」；有更新 → 直接弹模态框（即使是已跳过的版本）。
- 卡片位置：`ProfilePage` 里排在 `WidgetPrecisionSettings` 之后。

## 边界与不做的事

- **不自带安装器**：不在应用内下载 / 静默安装 APK，不碰 FileProvider 安装流程；「去下载」交给系统浏览器。
- 不接入任何应用商店；不做增量包；不做强制更新。
- iOS / 浏览器 / PWA 不检查更新。
- 更新设置**不写进备份 JSON**（设备相关，不进 `class-track-storage`）。
- 不引入 GitHub token，不做后端代理；接受匿名限流（60/h）与「网络不可用就静默跳过」。
- 不新增任何用户数据上传：请求只带公开的 repo 路径。

## 验收清单

**单测（`pnpm test`，纯函数）**

- [ ] 版本解析：`ClassTrack Android 1.0.10-beta` / `v1.2.0` / `android-beta-7` → `1.0.10-beta` / `1.2.0` / `1.0.7-beta`；
      标题与 tag 都取不到时返回「无候选」而不是抛错。
- [ ] 版本比较：`1.2.0 > 1.0.10-beta`；`1.0.11-beta > 1.0.10-beta`；`1.0.10 > 1.0.10-beta`；`1.0.10-beta` vs `1.0.10-beta` 不算更新。
- [ ] 通道筛选：`stable` 忽略 prerelease；`beta` 忽略正式版；`all` 跨通道取更新者；某轨道为空不报错。
- [ ] 节流：间隔内重复触发只发一次请求；失败也更新尝试时间；「每次启动」间隔下每次触发都放行。
- [ ] 跳过版本：被跳过的版本不产生「自动提示」，但手动检查的结果里仍在。
- [ ] 通道播种：存储里没有通道值时才按安装包类型播种；**已有值时，传入不同的安装包类型也不会被改写**（这条直接钉住「升级到正式版仍保持全部」）。
- [ ] 响应结构非法（非数组 / 缺字段 / `html_url` 前缀不符）时不抛错、不跳转。

**真机（安卓，`VITE_UPDATE_DEBUG=1` 构建 + 注入假 release 数据）**

- [ ] 设置卡片只在安卓出现；浏览器 / PWA 打开个人中心没有任何更新相关 UI。
- [ ] 注入一个比已装版本新的正式版 → 冷启动弹模态框 + 通知栏出现条目。
- [ ] 「稍后」后重启应用（间隔设为「每次启动」）→ 再次提示；「跳过此版本」后重启 → 不再提示，但「立即检查」仍能弹出。
- [ ] 关闭通知开关 → 只弹模态框、通知栏无条目；关闭总开关 → 断网也不发请求（抓 logcat / 代理确认）、不弹框。
- [ ] 通道三选一各自只推对应轨道；正式版包默认「仅正式版」，测试版包默认「全部」。
- [ ] 通道持久性：在测试版包上把通道确认为「全部」→ 覆盖安装正式版包（数据保留）→ 通道仍是「全部」，没有被重置成「仅正式版」。
- [ ] Android 13+ 首次开通知开关弹系统权限；拒绝后开关回退为关并出现引导文案。
- [ ] 用真实网络（不注入）在 `1.0.10-beta` 的包上检查 → 报「已是最新版本」（现网最新就是它）。
