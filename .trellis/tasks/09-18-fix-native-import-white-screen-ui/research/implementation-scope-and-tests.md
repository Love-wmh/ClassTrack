# 推荐实施边界、文件范围与回归策略

> 本文件只给后续规划/实现代理使用，不执行实现。所有行号是当前快照的近似值，改动前必须重新读取文件获得新 anchors。

## 1. 最小行为边界

### 要修的最小 gap

当前：Activity 首帧能绘制，但受限 WebView 导航可能在 CAS/认证 host 被 `shouldOverrideUrlLoading()` 静默拦截；异常阶段不可诊断；Activity 销毁直接对仍挂载的 WebView `destroy()`；Android 自有外壳与 React shadcn UI 两套视觉。

目标：

1. 页面加载首屏总有可见的 app-owned shell/loading 状态；允许的金智登录页面能继续加载；未允许主机显示可恢复的拦截错误。
2. 导航白名单、响应捕获白名单、响应大小/JSON 校验独立存在；登录白名单扩大不能扩大捕获范围。
3. 页面开始/完成、HTTP/SSL/网络/console、拦截、捕获拒绝、取消和生命周期清理都有脱敏诊断。
4. Android Activity 的 ClassTrack-owned UI 使用可打包的 React/shadcn shell；第三方金智内容不改写、不注入 ClassTrack 业务 UI。
5. 成功返回仍是 cache private file -> Capacitor callback -> 现有 parser/importClasses；backup/parser/bookmarklet 路径不变。

### 明确不做

- 不把导航放宽为任意 URL、通配任意子域或自动打开系统浏览器。
- 不把 login/navigation host 集合拿来做 target response capture；capture 仍是天津理工精确 HTTPS host/path。
- 不在 Java/Kotlin 复制 `Card`/`Button` 等 shadcn markup；若 React shell 资产打包不可行，必须记录阻塞并明确 token-aligned native fallback，而不是声称“完全一致”。
- 不把账号、密码、Cookie、Authorization、表单值、响应正文或原始 query 写入日志/React shell/localStorage。
- 不重做 parser、`Class` 模型、Zustand 数据写入、备份 JSON 或 Web/PWA 书签脚本。

## 2. 推荐文件范围（按责任分层）

### A. Android 导航/生命周期/桥接

| 文件 | 当前责任/方法 | 推荐边界 |
|---|---|---|
| `android/app/src/main/java/com/classtrack/app/CourseImportActivity.java` | `onCreate()` 约 L54-L69；`createContentView()` L80-L124；`configureWebView()` L127-L160；`requestCurrentSchedule()` L166-L198；`persistAndFinish()` L200-L240；`onBackPressed()` 约 L265-L279；`onDestroy()` L281-L299；inner `CourseImportBridge` L306-L327 | 改为 native session controller + academic WebView 生命周期 owner；实现 `onPageStarted`, `onPageFinished`, `onReceivedHttpError`, 脱敏 console/error；对 blocked navigation 更新 shell state；refresh/back/cancel/retry 状态机；先 detach/stop/clear callbacks 后 destroy。若采用推荐双 WebView，新增 shell WebView、academic WebView、状态命令 bridge；不要在此文件复制 shadcn 样式。 |
| `android/app/src/main/java/com/classtrack/app/CourseImportPlugin.java` | `open()` 约 L24-L54；`handleImportResult()` L57-L105；`isPrivateResultFile()` L107-L118；`rejectActivityError()` L120-L133；`readFile()` L135-L151 | 保持 Capacitor 8 Activity Result contract；在边界重新校验 adapter/url/term；统一所有失败/取消/超限分支删除私有文件；不把 raw body 改成 Intent extra。必要时把 `sourceUrl` 规范化为无 query 的安全值。 |
| `android/app/src/main/java/com/classtrack/app/MainActivity.java` | `onCreate()` 约 L9-L14 注册 `CourseImportPlugin` | 推荐不改主 Activity 的 WebView 路由；只有若 shell 采用主 Capacitor route 才触及，此方案不推荐。 |
| `android/app/src/main/AndroidManifest.xml` | `CourseImportActivity` 声明约 L17-L25 | 保持 `exported=false`；若双 WebView/自定义 asset loader 不需新 exported component，不扩大 manifest 暴露；评估 `configChanges` 是否掩盖重建测试，不能以它替代状态恢复。 |
| `android/app/build.gradle` | 依赖约 L34-L46 | 如使用 `WebViewAssetLoader`/origin-scoped WebMessage，确认 `androidx.webkit` 直接依赖和版本；不要为修白屏引入外部浏览器插件。当前 variables 已有 `androidxWebkitVersion = '1.14.0'`（`android/variables.gradle` L1-L12），应先确认是否传递依赖再添加。 |

### B. 安全策略、校验与脚本

| 文件 | 当前责任/方法 | 推荐边界 |
|---|---|---|
| `android/app/src/main/java/com/classtrack/app/ScheduleResponseValidator.java` | constants 约 L10-L14；`isAllowedPageUrl()` L19-L29；`isTargetUrl()` L32-L44；`isValidTargetResponse()` L56-L76 | 拆分 `isAllowedNavigationUrl()`（显式 entry + 经真实设备确认的 CAS/认证 hosts）与 `isTargetUrl()`（精确目标 host/path）；保留 HTTPS、无 userinfo、默认/443 port；加入安全 URL/diagnostic projection，去除 query/fragment。保持 512 KiB、`datas.cxxszhxqkb.rows`、非空首行 `KCM` 约束。 |
| `android/app/src/main/java/com/classtrack/app/ScheduleCaptureScript.java` | `create()` L6-L7 | 保持 XHR/fetch hook 和 idempotent marker；只向 bridge 发送 exact target URL/path 的字符串响应；必要时增加脚本版本/候选状态，不打印 body。不要让 shell command 改变 target path。 |
| 新增 `CourseImportNavigationPolicy.java`（建议） | 无 | 集中 scheme/host/port/userinfo、main-frame、login allowlist/capture allowlist 判定；供 Activity、Plugin 和 unit test 使用，避免 validator 与 UI 各自复制 URL 逻辑。 |
| 新增 `CourseImportDiagnostics.java` / `SafeUrl.java`（建议） | 无 | 集中日志 tag、阶段枚举、safe host/path、状态码、byte length、错误类别；禁止直接打印 `Uri.toString()`、exception message、query 或 body。若过度抽象，至少保留一个单元可测 sanitizer。 |

### C. React shell 与现有导入流程

| 文件 | 当前责任/方法 | 推荐边界 |
|---|---|---|
| `app/components/import-flow/InAppImportStep.tsx` | 组件主体约 L15-L58 | 抽取可共享的 `CourseImportShell`/状态卡片：学期/日期输入、说明、隐私提示、loading/success/error、retry/back/refresh action；使用已有 `Card`, `CardHeader`, `CardContent`, `Badge`, `Button`, `Separator`, `Input`, `Label`, `DatePicker`。保留现有 props 语义，避免改变主 Dialog 的 native/parser/backup 流程。 |
| `app/components/dialog/ImportDialog.tsx` | `renderStepContent()` 约 L7-L49；Dialog JSX L54-L87 | 继续承载主 Capacitor WebView 的 shadcn flow；只接入共享 shell content/状态，不把 Activity 专属 bridge 逻辑写进 Dialog。 |
| `app/components/import-flow/useImportFlow.ts` | native state/handler 约 L96-L181、`handleNativeImport()` L218-L298、button state L315-L354 | 保持 Promise result -> parser/importClasses 的数据流；只增加状态映射、取消/重试语义或 session cleanup。不要把 raw body/Activity URL 放入 Zustand/localStorage。 |
| `app/lib/native-course-import.ts` | plugin types/adapter/error mapping 约 L1-L94 | 维持 `CourseImportOpenOptions`, `CourseImportResult`, error code 和 Web `UNAVAILABLE` fallback；若需要 shell command protocol，另建 typed module，不把 Android-only bridge fields 混进返回课程 payload。 |
| `app/components/import-flow/ImportStepDescription.tsx` | `ImportStepDescription()` L7-L17 | 复用作 shell 说明；如需状态/隐私卡片，新增通用组件而不是复制说明文字到 Java。 |
| `app/components/stepper/StepperActions.tsx` | `StepperActions()` L14-L46 | 主 Dialog 的 cancel/back/primary 继续使用；native Activity shell 可共享纯 action labels/state，但不能直接在 Android Java 调用该组件。 |
| `app/app.css` | shadcn tokens/typography/radius 约 L1-L100+ | 作为 local shell 的 CSS 来源；验证 asset build 后 `@fontsource`, Tailwind, `shadcn/tailwind.css`、dark/light variables 和 icons 均可加载。不要给 Android Java 单独维护第二份 token。 |
| `app/routes.ts` / 新增 native shell entry | 当前 route list L1-L14，无导入 shell route | 选择一个明确的 bundle 方案：专用 route/SPA entry 或 dedicated Vite entry；先验证 `build/client` 在 `WebViewAssetLoader` 下可用，再决定是否复用 route。不要直接假设现有 root route 能从 appassets URL 正确 fallback。 |
| `vite.config.ts`, `react-router.config.ts`, `capacitor.config.ts` | Vite/PWA、`ssr:false`、`webDir` | 只有 asset-loading spike 证明需要时才改；避免为 Android Activity 导航而改变普通 Web/PWA 的 router/PWA fallback。生成的 `android/app/src/main/assets/public` 不纳入手工改动。 |

### D. 测试/文档

| 文件 | 推荐新增/修改 |
|---|---|
| `android/app/src/test/java/com/classtrack/app/ScheduleResponseValidatorTest.java` | 扩大 host/path/port/userinfo/HTML/empty rows/invalid JSON/UTF-8 byte limit；增加 navigation allowlist 与 capture allowlist 相互独立的断言。当前已有精确 endpoint、HTTP、host、8443、userinfo、rows、oversize 基线。 |
| `android/app/src/test/java/com/classtrack/app/ScheduleCaptureScriptTest.java` | 保留 idempotent/XHR/fetch/target path/bridge 断言；增加不包含敏感日志/response body logging、clone/text、configured bridge/path 的静态回归。 |
| 新增 `CourseImportNavigationPolicyTest.java`, `CourseImportDiagnosticsTest.java` | 覆盖 HTTPS、unknown host、auth host、non-default port、userinfo、HTTP/non-http、safe URL 不含 query/fragment、错误类别和固定字段。 |
| 新增 Android instrumentation test（可选但验收需要） | 在 `android/app/src/androidTest/...` 覆盖首屏状态、blocked navigation、retry/back/cancel、detach-before-destroy；真实 WebView/网络/cookies 需真机或 mock server，不能只靠字符串测试声称完成。 |
| `app/components/import-flow/InAppImportStep.test.tsx` 或结构回归测试 | 当前仓库没有 React Testing Library 依赖；可先用 `react-dom/server`/DOM harness 验证 Card/Button/Label、loading/success/error、privacy/operation text 和 action callbacks，或明确增加测试依赖。不要只测试 `status` 字符串而不验证组件结构。 |
| `app/lib/native-course-import.test.ts` | 保持现有 Web unavailable、adapter lookup、error mapping；补 native shell protocol/error recovery 的纯函数测试，不要把平台检测 mock 成永远 Android。 |
| `.trellis/tasks/.../design.md`（由主规划/实现代理创建或更新） | 写清“两 WebView + shared React shell”的选择、shell asset origin、bridge protocol、login allowlist/capture allowlist 分离、Activity 生命周期和回滚。研究代理不在此处创建该文件。 |

## 3. 测试分层与验收顺序

### 3.1 纯逻辑单测（先做）

1. **URL policy**：
   - entry host 与已确认认证 host 的 HTTPS URL 接受；HTTP、unknown host、非默认端口、userinfo、未知 scheme 拒绝。
   - query/fragment 不影响导航判定，但 safe diagnostics/result source 不携带它们。
   - navigation auth host 接受不代表 capture URL 接受；target path 必须精确匹配。
2. **payload validator**：
   - 合法 `datas.cxxszhxqkb.rows[0].KCM` 接受；HTML、invalid JSON、missing marker、empty rows、blank KCM、oversize、wrong host/path 拒绝。
3. **diagnostic sanitizer**：
   - 输出只有 phase/category/safe host/path/status/byte length 等字段；输入中加入 query、userinfo、Cookie、Authorization、password-like strings、body 后输出不包含原值。
4. **capture script**：
   - XHR `open/send`, fetch `clone().text()`, idempotent marker、exact target path 和 bridge 保留；无 `console.log(body)`/raw response logging。

### 3.2 前端结构/状态测试

- `InAppImportStep` 的 `idle`, `opening`, `captured`, `failed` 分支均有可见且可操作的 ClassTrack UI。
- 输入区域包含 term 和 first-week date 的 `Label`/controlled input/date picker；说明、隐私提示、重试/返回/刷新操作使用 shadcn components/tokens。
- `InAppImportStep` 不改变 `BackupImportStep`, `ParserImportStep`, bookmarklet path；普通 Web 的 native option 仍由 `ImportSchoolStep` 的 `nativeImportAvailable && getNativeCourseImportAdapter()` 过滤（`ImportSchoolStep.tsx` 约 L38-L62）。
- `useImportFlow.handleNativeImport()` 成功仍只调用现有 parser/importClasses/setFirstWeekStartDate/setCurrentWeek/setSchool/setIsInitialized；取消不 toast error，其他错误可重试；raw JSON 不进入 store/localStorage。

### 3.3 Android Activity/bridge 测试

**模拟/单元可自动验证**：

- 页面开始时 loading 状态可见，允许/拦截策略结果正确；HTTP/SSL/network/console 回调映射正确。
- 用户 retry 清除旧候选/错误并重新加载；重复 import 不创建并发 capture；back 在有 WebView history 时回退，无 history 时给 `CANCELLED`。
- `onDestroy` 的 fake parent/spy 顺序是 remove-from-parent → stop/clear callback → destroy，且 destroyed 后 bridge/Handler 不更新 UI。
- cache 文件在 success callback、read failure、oversize、cancel/stale cleanup 路径删除；Intent 仍只含私有 path/safe source URL。

**必须真机/模拟器验收**：

- 首次打开、真实登录/CAS/验证码、目标课表页、刷新、返回、取消、网络断开、HTTP/TLS、页面 console error、横竖屏/后台恢复、成功导入。
- 记录真实登录跳转 host/path 后更新明确配置；不能用 mock host 直接宣称金智登录通过。
- `adb logcat` 检查无 `WebView.destroy() called while WebView is still attached to window`，同时 grep 敏感字段。网络失败要能看到可恢复 shell；未知外部导航要有用户可理解提示。

### 3.4 项目质量门禁

按 PRD 顺序执行：

```text
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
pnpm cap:sync:android
pnpm cap:build:android
git diff --check
```

然后执行 Android unit/instrumentation tests 和真机矩阵。归档任务 `09-18-improve-jinzhi-schedule-import/implement.md` 已记录：前端门禁通过，但该环境 Android Gradle 因默认 Gradle home 只读、改用 writable `GRADLE_USER_HOME` 后又因无法从 `services.gradle.org` 下载 Gradle 8.14.3 (`UnknownHostException`) 而不能编译；没有 Android compiler/SDK 和真实教务账号/模拟器。因此本任务不能把历史前端通过记录当作 Android 验收，若环境仍阻塞必须原样记录命令、错误和未覆盖项目。

## 4. 关键实现顺序（规划用）

1. 先确认真实设备登录跳转 host，并把它写入设计/adapter 配置；不先修改为 wildcard。
2. 抽取/测试 navigation policy + safe diagnostics；先固定日志字段和敏感字段禁区。
3. 先修单 WebView 的回调和 lifecycle（首屏/error/retry/detach-before-destroy），用它验证白屏根因；这一步即使 React shell 资产 spike 失败也提供安全回退。
4. 做 local React shell asset-loading spike：`pnpm build -> cap sync -> WebViewAssetLoader`，确认 CSS/font/route/bridge ready；失败时不将失败原因混同为教务 WebView 白屏。
5. 在 shell 中抽取共享 `CourseImportShell`，接入双 WebView/状态机；academic WebView 保持现有 hook/validator 和 private-file result contract。
6. 接前端主 Dialog 与 native shell 状态/命令，不触碰 backup/parser/bookmarklet 数据流。
7. 先跑纯单测/静态回归，再 build/type/lint/format，再 Android build，再真机矩阵与 logcat 脱敏审计。

## 5. 规划阶段已解决的决策

- 用户已选择“完全一致”：采用双 WebView 的固定 ClassTrack chrome/content-slot 目标，而不是仅在 shell 与 academic 页面之间切换可见性。若设备验证显示动态 slot 不稳定，必须把切换版标成明确的验收降级，不可默称完全满足。
- local shell 复用现有 `build/client` 的 React 产物，以 `index.html?native-shell=1` 进入 shell 模式；通过 `WebViewAssetLoader` 的 app-owned HTTPS origin 提供资源。这样不新增第二套 Vite 输出，也避免依赖 SPA 历史 fallback；若构建验证发现 root query 入口不可行，再评估独立 Vite entry。
- bridge 首选窄的 `addJavascriptInterface`，因为 shell origin 由 native 自己加载且命令面很小；仍在 Java 端校验 shell 是否 ready、固定命令 schema、session nonce 和状态。若项目 AndroidX WebKit 版本已可用，可用 origin-scoped WebMessage 加强来源约束，但不是放宽 academic WebView 的条件。
- 本任务不承诺系统进程被杀后的自动恢复；需保留配置变化时的 WebView/session 安全处理、临时文件清理和可理解的重新打开/登录提示。完整进程恢复另列后续任务，不能把 pending PluginCall 静默挂起。
