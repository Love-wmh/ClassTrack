# CourseImportActivity 白屏/无反应：证据与诊断研究

> 研究范围：只分析现有实现和任务中已确认的 logcat，不修改产品代码。行号按当前工作树快照估算；实现时应重新读取文件确认行号。

## 结论摘要

最强假设是“WebView 主文档导航被过窄的白名单静默拦截”，其次是教务网络/TLS/脚本错误但当前没有足够日志区分。`CourseImportActivity` 的静态外壳理论上应在首帧显示返回、刷新、状态文字和导入按钮，因此 logcat 的首帧成功不能证明网页加载成功；它更支持“Activity 已启动，但 WebView 内容区域没有形成可见页面”的判断。生命周期销毁顺序是已确认的独立缺陷，会解释退出时的 attached-to-window 警告，但现有证据不足以把它认定为首次白屏原因。

## 1. 证据链

### 已确认的运行时证据

- 用户 logcat 显示 `CourseImportActivity` 成功完成窗口首帧绘制（`isSurfaceValid:true`、`draw finished`），没有 `FATAL EXCEPTION` 或 `AndroidRuntime` 崩溃栈。
- 没有 `CourseImportActivity` 的 `onPageFinished`、网络错误、HTTP 错误或 WebView 控制台诊断记录。由于当前代码确实没有为这些阶段统一打非敏感日志，缺失记录不能等同于回调没有发生。
- 返回后 Capacitor 收到 `CourseImport.open` 的 `CANCELLED`，说明 `CourseImportPlugin.open()` 到 Activity Result 回调的取消链路至少能够完成一次闭环。
- `WebView.destroy() called while WebView is still attached to window` 出现在 Activity 退出阶段；该警告与现有 `onDestroy()` 的调用顺序直接相符。
- Oplus/SurfaceFlinger 窗口告警目前没有与 WebView 请求失败建立因果关系，不能代替网页回调诊断。

### 代码事实

| 位置 | 事实 | 对故障的含义 |
|---|---|---|
| `android/app/src/main/java/com/classtrack/app/CourseImportActivity.java` `onCreate()`（约 L54-L69） | `setContentView(createContentView())` 后立即 `configureWebView()` 和 `loadUrl(ENTRY_URL)` | Activity 首帧与网页首帧是两个阶段；首帧成功只说明动态布局/窗口创建成功 |
| `createContentView()`（约 L80-L124） | `LinearLayout` 中有 toolbar、4px progress、status `TextView`、权重为 1 的 WebView、底部 Button | 单纯 WebView 网络失败不应让整个 Activity 崩溃；应至少能看到原生 status，但默认控件/白底容易被用户感知为“白屏” |
| `configureWebView()`（约 L127-L160） | 仅设置 `WebViewClient` 的部分回调；没有 `onPageStarted`、`onReceivedHttpError`、`WebChromeClient.onConsoleMessage` | 无法从 logcat 区分未发请求、重定向拦截、HTTP/TLS/网络失败、页面脚本失败 |
| `shouldOverrideUrlLoading()`（约 L141-L144） | 返回 `!ScheduleResponseValidator.isAllowedPageUrl(request.getUrl().toString())` | 对未列入当前单主机白名单的主文档导航返回 `true`，WebView 不再自行加载；没有用户提示 |
| `onPageFinished()`（约 L146-L150） | 仅对白名单 URL 更新状态并注入 hook；非白名单 URL 直接 `return` | 被拦截或已落到未允许主机时，界面可能一直停留在“正在打开教务系统…”或空白 WebView |
| `onReceivedError()` / `onReceivedSslError()`（约 L151-L159） | 仅更新用户状态，未记录 host/path/错误类别/是否主框架 | 发生网络/TLS 错误时用户理论上能看到提示，但日志不能证实路径；页面资源错误也需要严格区分主框架 |
| `requestCurrentSchedule()`（约 L166-L198） | 只有 `webView.getUrl()` 仍被 `isAllowedPageUrl()` 接受时才补抓；8 秒超时后统一为未登录/无课表 | 若登录跳转后页面仍在未配置认证主机，补抓入口会被拒绝；超时文案掩盖了导航根因 |
| `onDestroy()`（约 L281-L299） | `removeJavascriptInterface()` 后直接 `webView.destroy()`，未先从父容器移除 | 与 logcat 的 attached-to-window 警告直接对应；还可能在 WebView 回调/渲染线程收尾时产生竞态 |
| `CourseImportBridge.onScheduleResponse()`（约 L306-L327） | UI 线程再次校验当前页和响应 URL/body；无诊断日志 | 安全筛选方向正确，但捕获被拒绝时没有可观察原因 |

## 2. 白屏/无反应假设排序

### H1：登录/CAS 重定向被主文档白名单静默阻断（最高优先级）

当前 `ScheduleResponseValidator.isAllowedPageUrl()`（`android/.../ScheduleResponseValidator.java`，约 L19-L29）只接受：HTTPS、精确主机 `jwxt.tjut.edu.cn`、无 userinfo、默认/443 端口。`CourseImportActivity.shouldOverrideUrlLoading()` 对所有其他 URL 返回 `true`。如果金智实际登录需要跳到 CAS、统一认证、验证码或受控门户主机，WebView 不会继续加载该 URL；`onPageFinished()` 又对非白名单 URL 直接返回，因而不会显示“被阻止的登录主机”或错误。

这能解释：Activity 首帧正常、没有崩溃、没有 `onPageFinished` 诊断、WebView 区域看起来空白/无反应。它还符合 PRD 已记录的“当前仓库没有实际登录跳转主机证据”。但仍需用真实设备记录**脱敏后的主机/路径**确认 CAS 主机，不能直接把白名单改成任意 URL。

额外注意：`isAllowedPageUrl()` 是“可导航页面”与“可捕获课表接口”的同一个单主机判断。登录允许范围扩大时不能复用它来扩大捕获范围；目标捕获必须仍由 `isTargetUrl()` 的 HTTPS + 精确 host + 精确 path + payload/JSON 校验约束。

### H2：网络/TLS/HTTP 错误，但现有日志缺失导致表现像白屏

`onReceivedError()` 和 `onReceivedSslError()` 会设置错误文字，但不记录阶段、URL 主机/路径或错误类别；`onReceivedHttpError()` 完全没有实现。若入口返回 4xx/5xx、证书错误、DNS/连接失败或 WebView 资源无法加载，用户需要刷新，但当前状态机无法区分“页面失败”和“页面还在加载”。

需要记录主框架优先级：HTTP/网络回调对 `request.isForMainFrame()` 为 false 的资源错误不能把整个导入标成失败；主框架错误应产生可恢复错误状态。SSL 必须继续 `handler.cancel()`，不能为了白屏而接受证书。

### H3：页面/脚本异常或 hook 时机问题

`onPageFinished()` 仅在允许主机时注入 `ScheduleCaptureScript`；当前 hook 本身有 XHR/fetch 幂等标记（`ScheduleCaptureScript.create()`，约 L6-L7），但没有记录注入结果、控制台错误或页面错误。页面的早期请求可能发生在注入之前，虽然用户点击“导入当前课表”时会再次注入并在当前页面上下文中发起同源 `fetch`，因此早期请求丢失不是首屏白屏的首要解释。

`CourseImportBridge` 暴露在 WebView 中，native 端会再次校验 URL/path/JSON marker；这保证了不应把任意响应当成课程，但也意味着被错误页面返回的 HTML、登录页或空 rows 会安静地被丢弃，8 秒后只显示 `NOT_LOGGED_IN_OR_NO_SCHEDULE`。应增加“目标接口收到但 payload 被拒绝”的非敏感阶段，而不是记录正文。

### H4：动态布局/默认 WebView 外壳让用户看不到可用状态（次要）

`createContentView()` 的布局没有 XML 约束错误或明显的零高度 bug：WebView 使用 `MATCH_PARENT, 0, weight=1`，上方/下方组件是 `WRAP_CONTENT`。所以“Activity 完全没有首帧”与代码不符。仍有三个 UX 风险：

1. 根布局和 WebView 没有显式的项目色彩/背景，默认白色 WebView 会掩盖“加载中”的层次。
2. Android 默认 `Button`、`TextView`、进度条与 React shadcn 风格割裂，状态文字不是卡片/错误区域，用户不容易辨认下一步。
3. 没有在 `onPageStarted()` 统一显示加载状态、重置进度、清理上一次错误；重试只改一次文案后 `reload()`。

这更可能放大白屏的感知，而不是造成 WebView 网络请求不发出。需要在真实设备确认静态 toolbar/status 是否实际可见；若连静态 status 都不可见，应再检查 Activity theme/window inset/布局测量，而不是只调 URL 白名单。

### H5：Activity Result 链路导致首次页面白屏（低可能）

`CourseImportPlugin.open()`（`android/.../CourseImportPlugin.java`，约 L24-L54）校验 adapter、精确 entry URL、term 后调用 Capacitor 8 的 `startActivityForResult(call, intent, "handleImportResult")`；`handleImportResult()`（约 L57-L105）对无 data 的取消结果 reject。用户已看到 `CANCELLED`，说明 Activity 已能返回。该链路不是当前白屏的主要解释。

仍需防御：UI 外层应防重复 open；native `open()` 也应保证同一 PluginCall 不重复启动；Activity 因旋转/进程重建时要确认 pending call 和临时文件不会永久悬挂。`onCreate()` 只检查 term 非空，未在 Activity 边界再次执行完整格式校验，这是安全/鲁棒性缺口但非白屏首因。

## 3. 生命周期和临时结果风险

### 已确认的销毁顺序错误

`onDestroy()` 当前流程是：设置 `destroyed` → 移除 Handler 回调 → 清除未交接的内存响应 → `removeJavascriptInterface()` → `webView.destroy()` → `super.onDestroy()`。缺少：

- 停止加载/取消待定回调；
- 清除 WebView client/chrome client；
- 从 parent (`LinearLayout`) 移除 WebView；
- 在 detach 完成后再 `destroy()`；
- 对未交接的结果文件做最终清理。

Android WebView 官方 `destroy()` 文档要求在 WebView 从 view hierarchy 移除后调用，并且 destroy 后不能再调用其他方法。实现应保持 UI 线程、先 `parent.removeView(webView)`，再 `webView.stopLoading()`/清空 callback（具体调用顺序需按 Android API 验证），最后 `destroy()`，同时让 bridge 回调检查会话 token/`destroyed`。

### 旋转/重建

Manifest 的 `CourseImportActivity` 配置了 `orientation|screenSize|...` 等 `configChanges`，常规旋转通常不创建新 Activity；这不能覆盖进程被杀、系统回收、厂商配置变化或用户从后台恢复。当前没有 `onSaveInstanceState()`/`restoreState()`，内存中的 `capturedBody`, `capturedUrl`, `waitingForCapture`, error 状态都会丢失。研究阶段建议先保持同一 WebView session，不在旋转时重建；随后用 instrumentation 测试真正的 Activity recreate/process-death 边界。

### 临时文件

`persistAndFinish()`（约 L200-L240）只在用户请求导入后写 cache 文件并将路径放入 Activity result；`CourseImportPlugin.handleImportResult()` finally 删除文件，设计方向正确。风险是：

- Activity 在 `setResult()` 后、Plugin callback 读取前进程被杀，文件可能留到下一次 `onCreate()` 的 `cleanupStaleResultFiles()`；这不是即时泄漏，但应有生命周期/TTL 兜底。
- `finishWithError()`/取消路径目前没有通用的 session file cleanup（当前多数情况下没有 handed-off file）。
- `CourseImportPlugin` 在 `resultFile` 不存在或大小超限时有分支直接 reject，依赖 `finally` 只覆盖已经进入读取 try 的路径；每个包含 path 的失败都应显式删除私有文件。

## 4. 必须增加的非敏感诊断

所有日志统一 tag，例如 `ClassTrack.CourseImport`；禁止打印 query/fragment、user-info、Cookie、Authorization、表单字段、响应正文、账号、学号、验证码和完整 `sourceUrl`。建议使用 `safeUrlForLog(Uri)`：只保留 `scheme`, 精确 `host`, `port`（仅 443 或 `-1`）和 `path`，查询统一替换为 `[redacted]` 或不输出。

### 事件表

| 阶段/事件 | 需要的字段 | 目的 |
|---|---|---|
| `activity_created` | session id、adapter id（固定/非敏感）、entry host/path | 证明 Activity 初始化完成 |
| `navigation_started` / `page_started` | main-frame、safe host/path、allowed/blocked、navigation class | 判断请求是否发起及是否被白名单拦截 |
| `navigation_blocked` | safe host/path、reason=`scheme`/`host`/`port`/`userinfo`/`main-frame` | 直接暴露 H1，而不暴露参数 |
| `page_finished` | safe host/path、progress、main-frame context | 判断 HTML 页面是否真正完成 |
| `capture_hook_injected` | safe current host/path、hook version/idempotent result | 判断脚本是否注入 |
| `http_error` | main-frame、safe host/path、status code、resource type（不要 body） | 区分 HTTP 失败与网络失败 |
| `network_error` | main-frame、safe host/path、error category/code（不要 raw description/query） | 区分 DNS/connect/timeout/unknown |
| `ssl_error` | safe host/path、SSL primary error enum；继续 cancel | 诊断证书问题 |
| `console_error` | level、safe source host/path、line number、固定长度/关键词分类后的 message | 判断页面脚本失败；message 必须脱敏，必要时只记分类 |
| `capture_candidate` | target host/path、byte length、accepted/rejected reason | 区分没有请求、大小超限、JSON marker 不匹配 |
| `import_requested` / `capture_timeout` | state、elapsed ms、current safe path | 判断用户点击和超时状态 |
| `result_file_created/read/deleted` | byte length、private-dir boolean、outcome | 检查文件清理，不打印路径全文 |
| `back_pressed` / `cancelled` | had history、waiting、has capture | 回归返回/取消链路 |
| `activity_destroyed` | reason if known、webViewAttachedBefore/After、had handed-off file | 证明 detach-before-destroy 和清理结果 |

### 错误类别最小集合

建议固定为 `NAVIGATION_BLOCKED`, `HTTP_ERROR`, `SSL_ERROR`, `NETWORK_ERROR`, `CONSOLE_ERROR`, `CAPTURE_REJECTED`, `CAPTURE_TIMEOUT`, `LIFECYCLE_CLEANUP`，而不是直接把 Java exception message 原样输出。用户文案继续使用已有 `NETWORK_ERROR` / `NOT_LOGGED_IN_OR_NO_SCHEDULE` 等契约；诊断类别不应改变业务错误码。

## 5. 诊断后的最小验证矩阵

1. 入口页成功：应看到 `activity_created → navigation_started(allowed) → page_started → page_finished → capture_hook_injected`。
2. 真实 CAS/登录 host：先记录 host/path，再把该 host 加入**显式登录白名单**；确认 `navigation_blocked` 不再出现，仍不改变 capture host/path。
3. 未知外部 HTTPS、HTTP、非默认端口、userinfo：应 `navigation_blocked`，WebView 不加载并显示可理解错误。
4. 主框架 HTTP 4xx/5xx、TLS 失败、断网/DNS：分别看到对应错误类别和可重试 UI；子资源错误不得误报主框架失败。
5. 目标接口返回 HTML、空 rows、超 512 KiB、合法 JSON：分别看到 `CAPTURE_REJECTED` 原因，合法响应才可写临时文件。
6. 取消/返回/刷新/重复点击/旋转/系统重建：无 attached-to-window 警告、无 callback 并发、无 cache 文件长期残留。
7. `adb logcat` 通过关键词审计：日志中不出现账号、密码、Cookie、Authorization、query 参数、表单值或响应正文。

## 外部文档依据

- Capacitor 8 Android Plugin Guide：<https://capacitorjs.com/docs/plugins/android>（可访问到 v8 文档）。文档明确说明 `startActivityForResult(call, intent, callbackName)` 配合带 `PluginCall`、`ActivityResult` 的 `@ActivityCallback` 处理 Activity 结果；当前插件实现的基本模式正确，故不能把取消链路当成首屏白屏的首要原因。
- Android `WebViewClient` reference：<https://developer.android.com/reference/android/webkit/WebViewClient>。`shouldOverrideUrlLoading` 返回 `true` 表示宿主处理 URL，WebView 不继续加载；返回 `false` 才让 WebView 继续。这正是当前白名单阻断的关键语义。
- Android `WebView` reference：<https://developer.android.com/reference/android/webkit/WebView#destroy()>。`destroy()` 应在 WebView 从 view hierarchy 移除后调用，调用后不得再使用该实例；对应当前销毁顺序缺陷。
- Android `WebView.addJavascriptInterface` reference：<https://developer.android.com/reference/android/webkit/WebView#addJavascriptInterface(java.lang.Object,%20java.lang.String)>。接口对象会暴露给 WebView 页面/框架，native 不能把页面来源当作天然可信边界；必须在 bridge 内重新校验当前顶层 host、目标 URL、大小和 JSON 结构。
