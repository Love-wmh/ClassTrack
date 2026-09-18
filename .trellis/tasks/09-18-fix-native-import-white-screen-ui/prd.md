# 修复应用内导入白屏与 UI 风格

## Goal

让 Android App 点击“应用内打开教务系统”后能够稳定显示金智教务页面或明确的可恢复错误，而不是进入白屏无响应；同时让 ClassTrack 自己负责的导入界面遵循现有 shadcn 组件和视觉风格，不再出现与主应用割裂的原生默认控件。

用户价值：用户可以在应用内完成登录和课表导入，遇到网络、跳转或登录问题时能看到明确状态并重试；导入流程与 ClassTrack 其他界面保持一致。

## Confirmed evidence

### Logcat

用户提供的 2026-09-18 logcat 显示：

- `CourseImportActivity` 成功启动并完成窗口首帧绘制（`isSurfaceValid:true`、`draw finished`）。
- 日志中没有 `FATAL EXCEPTION`、`AndroidRuntime` 崩溃栈，也没有当前 Activity 的 `WebViewClient.onPageFinished`、网络错误或 WebView 控制台诊断记录。
- 点击返回后 Capacitor 正常收到 `CourseImport.open` 的 `CANCELLED` 回调，说明 Activity Result 链路至少能完成取消返回。
- 期间出现 `WebView.destroy() called while WebView is still attached to window` 警告；它发生在 Activity 退出阶段，需在修复时一并处理，但从现有日志不能单独认定它是首次白屏原因。
- 日志中的 Oplus `SurfaceFlinger`/窗口重排告警没有直接证据表明是应用崩溃原因，不能替代 WebView 页面加载诊断。

### Current implementation and research evidence

- `android/app/src/main/java/com/classtrack/app/CourseImportActivity.java` 使用 Java 动态创建 `LinearLayout`、Android 默认 `Button`、`TextView`、`ProgressBar` 和 `WebView`，未使用 ClassTrack 的 shadcn React 组件或设计 token。
- `CourseImportActivity.shouldOverrideUrlLoading` 对不在 `jwxt.tjut.edu.cn` 主机白名单内的主文档跳转直接返回 `true`，这会阻止 WebView 自己加载该跳转；如果金智登录/CAS 实际使用受控的其他认证主机，可能表现为白屏。当前 logcat 没有实际跳转主机记录，因此这是最高优先级假设而非已证实事实。
- 对入口 `https://jwxt.tjut.edu.cn/jwapp/sys/wdkb/*default/index.do` 的当前 HTTP 响应检查显示，它会返回同一主机下 `/authserver` 的统一认证页面；因此“入口立即跳到其他主机”尚未被证实，必须通过设备上的脱敏导航日志确认实际登录提交后的跳转，不能直接把白屏归因于 CAS 主机。
- `onPageFinished` 只处理白名单主机；`onPageStarted`、`onReceivedHttpError`、`WebChromeClient.onConsoleMessage` 和页面加载结果没有面向 logcat 的非敏感诊断，因此现有日志无法区分“未发起请求、跳转被拦截、TLS/网络失败、页面脚本异常”几类原因。
- React 侧 `InAppImportStep` 已使用 `Input`、`Label` 和 `DatePicker`，但主体仍是普通 `div`、文字和手写边框；现有 `Dialog`、`Button`、`Card`、`Badge`、`Separator` 等 shadcn 组件尚未用于组织状态卡片、说明和错误反馈。
- `CourseImportPlugin` 的 Activity Result 取消链路已有日志证据；本任务不重做课程解析器或 Zustand 数据写入。
- 研究结论认为，若要满足“两边完全一致”，ClassTrack-owned UI 必须由可加载的 React/shadcn shell 持续负责，教务页面本身仍保持第三方页面视觉；Android Java 不应复制一份 shadcn markup。

## Resolved product decisions

- UI 范围选择：**两边完全一致**。
- Android 导入 Activity 中的 ClassTrack-owned 返回、刷新、阶段、错误、成功和操作区域必须由本地 React/shadcn shell 渲染并持续可见；不得继续使用默认 Android 控件作为主要导入 UI。
- 金智登录、验证码、菜单和课表内容属于第三方页面，不改写为 shadcn；它们在受限 academic WebView 内容区域中显示。
- 采用双 WebView 形态作为规划目标：一个本地 shell WebView 负责 ClassTrack UI，一个独立 academic WebView 负责登录态和接口捕获；二者由 native session controller 协调，不能互相直接传递课程正文或 Cookie。

## Requirements

### R1. 修复白屏并提供可诊断状态

- 打开应用内导入后，Activity 首屏必须显示本地 shell 的可见加载/状态区域；academic WebView 成功加载时显示教务页面，加载失败时显示明确的错误和刷新/返回操作。
- 修正 WebView 主文档导航策略：允许必要的登录跳转通过，但只能落在经过明确配置的 HTTPS 主机白名单内；禁止任意外部网页，不通过放宽为任意 URL 来“修复”白屏。
- 增加非敏感 WebView 诊断：记录阶段、主机、路径、HTTP 状态和错误类别，不记录账号、密码、Cookie、Authorization、表单值或响应正文。
- 覆盖页面开始/完成、HTTP 错误、SSL 错误、网络错误、控制台错误、跳转拦截和 Activity 销毁等关键阶段；保留用户可见的重试和返回行为。
- 修复 Activity 销毁时 WebView 的清理顺序，避免在仍附着于窗口时直接 destroy；取消、重试、旋转和返回不得泄漏页面或临时响应。

### R2. 保留接口捕获安全边界

- 仍只接受已配置学校适配器和目标金智课表接口；继续校验 HTTPS、Host、端口、路径、响应大小和 JSON 结构。
- 登录跳转白名单与“可捕获课表接口白名单”分开维护；扩大登录主机范围时不得扩大响应捕获范围。
- 本地 shell 只能发送固定命令（重试、刷新、返回、请求导入等）和已验证的学期/日期输入；不能指定任意 URL、目标路径或脚本。
- academic WebView 只能通过独立 capture bridge 发送目标响应候选；shell 不接收 raw JSON、Cookie、Authorization、表单内容或响应正文。
- 不因调试而输出 URL 查询敏感值、页面正文、Cookie 或账号信息；大响应继续通过应用私有临时文件传输。

### R3. 双 WebView 本地 shell 与统一导入 UI

- 本地 React shell 必须使用现有 `app/components/ui/` shadcn 组件和项目已有 spacing/color/radius/font 风格，至少覆盖：学期/日期输入区域、标题/阶段、操作说明、加载/成功/错误状态、隐私提示、返回/刷新/重试/请求导入操作。
- shell 与主应用 React 导入步骤应共享可复用的 `CourseImportShell` 或状态卡片组件，避免为 Android 再维护一套 Java 视觉实现。
- shell 本身不请求教务系统；所有登录、验证码、菜单和同源补抓请求都在同一个 academic WebView 页面上下文完成。
- academic WebView 位于 shell 的内容槽内；shell 的可见 chrome 在 portrait、landscape、字体缩放、键盘和系统 inset 下不得遮挡教务页面。若技术验证表明固定内容槽不可稳定实现，必须明确记录降级为切换显示的验收差异，不得默认为“完全一致”。
- 不破坏现有 `backup`、`parser`、书签脚本 JSON 导入路径；普通 Web/PWA 不显示原生入口。

### R4. 可测试与可回归

- 为导航白名单、允许/拦截策略、诊断脱敏、shell 命令契约和 WebView 生命周期清理增加可自动验证的测试；若 Android 单测无法运行，必须记录环境阻塞。
- 为 React shell 的 idle/loading/captured/failed 状态和操作回调增加前端结构/行为测试或等价的可执行回归断言。
- Android 真机验证至少覆盖：首次打开、登录跳转、目标页面加载、刷新、返回、取消、网络失败、页面控制台错误、旋转/重建、shell 操作和成功导入。

## Acceptance Criteria

- [ ] 在真实 Android App 中点击应用内导入后，不再直接白屏；首屏始终能看到 React/shadcn shell 的加载状态、academic 页面或明确错误界面。
- [ ] 金智实际登录跳转在受控白名单内可正常加载；不在白名单内的外部跳转被阻止并由 shell 显示可理解提示。
- [ ] ClassTrack-owned 导入 chrome 在 academic WebView 登录、课表导航、加载失败、重试、成功和取消期间保持 shadcn 风格；第三方金智页面不被改写。
- [ ] logcat 能区分页面开始/完成、被拦截跳转、HTTP/SSL/网络/控制台错误、capture timeout 和用户取消，且搜索不到账号、密码、Cookie、Authorization、表单值或响应正文。
- [ ] Activity 退出和重试不再产生 `WebView.destroy() called while WebView is still attached to window` 警告；无新增崩溃、桥接越权或并发 Activity Result。
- [ ] 成功捕获仍只交给现有天津理工大学解析器和 `importClasses`，课程字段、学期、第一周日期和历史标记行为不变。
- [ ] 普通 Web/PWA 的书签脚本/JSON 和备份导入流程回归通过。
- [ ] `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm build`、适用 Android 测试/构建和 `git diff --check` 通过；环境阻塞被明确记录。
## Verification status

- 自动化前端与静态安全验证已通过：7 个文件、24 个测试，typecheck、local ESLint 10、format、build、cap sync、diff check、Trellis validation。
- Android Gradle test/build 和真实设备验收未完成：默认 Gradle home 只读；可写 home 无法访问 `services.gradle.org` 且离线依赖不完整；`adb devices -l` 无设备。

## Out of scope

- 不实现账号密码自动填写、账号托管、服务端代理或任意网页浏览器。
- 不放宽为任意 URL 导航，也不扩大课表响应捕获范围。
- 不重写天津理工大学课程解析器、课程数据模型或 Zustand 持久化逻辑。
- 不在本任务中实现 iOS 原生导入。
- 不将 shadcn 组件代码复制到 Android Java；本地 shell 必须由可打包的 React/HTML 资产承载，Java 只负责 WebView 容器、状态机和安全桥接。
