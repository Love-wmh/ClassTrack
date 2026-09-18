# 实施计划：修复白屏、接入 React Shell、完成回归

> 任务已按用户确认进入 `in_progress` 并完成实现；本文件保留原计划、验证命令和未完成的真机/Android 环境阻塞记录。

## 0. 激活前审查门

- [ ] 用户确认：采用“两 WebView + 单 Activity + React/shadcn 固定 chrome/content slot”作为目标；若 slot 在真机验证不稳定，切换版只能作为明确记录的降级，不得默称完全一致。
- [ ] 用户确认：shell 复用 `build/client`，以 `index.html?native-shell=1` 进入 native 模式，使用 `WebViewAssetLoader`；不引入 `@capacitor/browser` 或其他外部浏览器插件。
- [ ] 用户确认：保留现有私有临时文件和 parser/importClasses 数据流；不实现系统进程杀后的自动登录恢复。
- [ ] 用户确认后执行：

```bash
python3 ./.trellis/scripts/task.py start .trellis/tasks/09-18-fix-native-import-white-screen-ui
```

## 1. 重新读取规范并建立基线

- [ ] 读取 `.trellis/spec/frontend/index.md`、component/hook/state/type/quality/directory 及 cross-layer/code-reuse 指南；实现前重新读取所有将要编辑的源文件，不能依赖研究文档的旧行号。
- [ ] 记录当前工作树，仅允许已有任务规划文件变更：

```bash
git status --short --branch
git diff --check
```

- [ ] 运行最小基线验证，记录与本任务无关的已有失败：

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
```

- [ ] 确认真实设备/模拟器可用：

```bash
adb devices -l
```

若无设备，继续纯逻辑和前端实现，但把 Android/真机验收保留为阻塞项。

## 2. 先做白屏诊断与导航/lifecycle 最小修复

目标：在引入新的 shell 之前，先让 academic WebView 的实际行为可观察，从真实设备确认白屏根因，避免把 shell 资源故障误认为教务页面故障。

- [ ] 新增集中 `CourseImportNavigationPolicy`（或同等职责模块）：
  - 入口和已确认认证 host 使用显式 HTTPS host 集合。
  - 当前还需显式限制 `/jwapp/sys/wdkb` 与 `/authserver` 路径前缀；同主机其他主文档路径也必须阻止。
  - 拒绝 HTTP、非默认端口、userinfo、未知 host、非 HTTP(S) scheme 和外部 intent。
  - 导航判定与目标响应捕获判定分离；`ScheduleResponseValidator.isTargetUrl` 仍精确绑定 `jwxt.tjut.edu.cn` 与目标 path。
- [ ] 给 `CourseImportActivity` 增加非敏感事件诊断：`activity_created`、`navigation_started/blocked`、`page_started/finished`、`http_error`、`ssl_error`、`network_error`、`console_error`、`capture_candidate`、`capture_timeout`、`back/cancelled`、`activity_destroyed`。
  - 只保留固定 phase/category、safe host/path、HTTP code、byte length、错误 enum。
  - 通过 sanitizer 丢弃 query、fragment、userinfo、Cookie、Authorization、表单值、账号、密码、学号、验证码、异常原文和响应正文。
- [ ] 修正 WebView 回调：允许 host 返回 `false` 继续加载；拦截时更新用户可见错误；只把主框架 HTTP/network 错误标为页面失败；SSL 错误继续 cancel。
- [ ] 修正 `onDestroy`：使 controller/session 失效，移除 Handler 回调，移除 JS interface，停止加载/清空 client，先从 parent detach，再调用 `destroy()`；shell 和 academic 两个 WebView 共用可测试的安全清理 helper。
- [ ] 增加 retry/back/cancel/重复请求的状态保护，确保 capture timeout 和旧 bridge callback 不能更新新 session。
- [ ] 在有设备时用诊断日志确认实际登录跳转 host/path；只有确认属于天津理工大学认证链路后才加入显式 navigation allowlist，不使用 wildcard。

### 阶段 2 验证

```bash
./android/gradlew -p android test
adb logcat -c
# 手工打开 native import，保存脱敏 logcat
adb logcat -d -s ClassTrack.CourseImport Capacitor/Console AndroidRuntime
```

若 Gradle/SDK/设备不可用，保存命令、错误和未覆盖测试，不以静态阅读替代真机结论。

## 3. 建立 React/shadcn shared shell

- [ ] 抽取纯 presentational `CourseImportShell` 与状态/操作子组件；复用 `app/components/ui/` 的 `Card`、`Button`、`Badge`、`Separator`、`Input`、`Label`、日期选择器和现有 tokens，不在 Java 复制样式。
- [ ] 保留 `InAppImportStep` 的现有使用语义，并让主 Dialog variant 与 native activity variant 共用表单、说明、隐私提示、status card 和 action labels。
- [ ] 覆盖 `idle`、`opening/loading`、`academic ready`、`capture waiting`、`captured`、`failed`、`handing off` 状态；所有失败状态有可理解的文案和可操作的重试/刷新/返回。
- [ ] 在 `app/root.tsx` 或等价入口加入明确的 `native-shell=1` 分支：shell 模式不渲染主 route、PWA update、Markdown editor 等副作用；普通浏览器/Capacitor 无 query 时保持现有 `<Outlet />`。
- [ ] 新增 typed shell protocol 模块，约束 state 与 command schema；不得把 raw URL、body、Cookie、Authorization 或 arbitrary script 放进协议。
- [ ] shell bridge 仅提供 `ready/resize/startAcademic/retry/refreshAcademic/back/requestImport/cancel`；native 对命令、session、term/date 和高度再次校验。
- [ ] 用 `ResizeObserver` 上报可渲染 chrome 高度；输入区域在字体缩放、窄屏和键盘下不截断。

## 4. 打包并验证 app-owned shell 资产

- [ ] 在 `android/app/build.gradle` 使用现有 `androidxWebkitVersion` 增加直接 `androidx.webkit:webkit` 依赖，除非已由可靠直接依赖覆盖；不增加外部浏览器插件。
- [ ] 在 `CourseImportActivity` 中配置 `WebViewAssetLoader` 的 app-owned HTTPS origin；自定义只读 path handler 将 `public/<path>` 提供给根绝对路径 `/index.html`、`/assets/*`、字体和图标。
- [ ] shell WebView 关闭 file/content access、file URL universal access 和 mixed content；只允许本地 asset origin。
- [ ] 保证 `android/app/src/main/assets/public` 仍是 `cap sync` 生成物，不手工提交或修改。
- [ ] 运行 asset smoke：

```bash
pnpm build
pnpm cap:sync:android
# 检查 build/client/index.html、hashed assets 以及生成的 Android assets
```

- [ ] 在 Activity shell WebView 中确认：index 可加载、JS/CSS/font/icon 无 404/MIME 错误、`CourseImportShellBridge.ready()` 能到达 native、shell 状态可下发；若失败，分别记录 asset failure，不把它标成 academic network failure。

## 5. 接入双 WebView 与 native 状态机

- [ ] 将 `CourseImportActivity` 改为 `FrameLayout` controller：shell WebView 为 ClassTrack chrome，academic WebView 为受限 remote page；删除 Java 动态 toolbar/status/button 作为主要 UI。
- [ ] 实现固定 chrome/content-slot 布局：active academic 时 shell 只占顶部 chrome，academic WebView 放在内容槽；初始/error/success 时 academic 隐藏、shell 占满窗口；禁止透明 shell 覆盖并拦截 academic 触摸。
- [ ] 实现状态机：`IDLE -> ACADEMIC_LOADING -> ACADEMIC_READY -> CAPTURE_WAITING -> CAPTURED -> HANDING_OFF`，并覆盖 `ERROR/CANCELLED`；每个状态只由 native controller 改变并同步 safe state 给 shell。
- [ ] shell `startAcademic` 接收并校验 term/第一周日期后加载固定 entry URL；academic WebView 只加载显式 navigation allowlist，登录、验证码、课表 history 始终保留在同一个 academic 实例。
- [ ] academic `onPageFinished` 幂等注入 `ScheduleCaptureScript`；保留 XHR/fetch clone、精确 target path、大小限制和 JSON validator；重复 reload 不产生重复 hook/capture。
- [ ] shell `requestImport` 只触发当前 validated candidate 的 private cache handoff；不把 response body 注入 shell。
- [ ] Android back 与 shell back 按设计执行：先处理 academic history/capture waiting，再无 history 时返回 `CANCELLED`；不会把 remote page history 当 shell history。
- [ ] 旋转/配置变化保持当前可行 session；不声称支持进程杀恢复；过期 private files 和所有错误分支都清理。

## 6. 更新 Capacitor/TypeScript 数据边界

- [ ] `app/lib/native-course-import.ts` 增加安全的 `firstWeekStartDate` open option 和可选结果 metadata，保持现有 `data/sourceUrl` 兼容；WebPlugin 仍返回 `UNAVAILABLE`。
- [ ] `CourseImportPlugin.open()` 在边界重新校验 adapter、entry URL、term、date，并把 safe options 传给 Activity；`handleImportResult()` 继续校验私有路径、payload size、target response，所有成功/失败/超限路径删除文件。
- [ ] `useImportFlow.handleNativeImport()` 仍执行 `JSON.parse -> parser.parse -> importClasses`，使用 Activity 返回的安全日期，保持 `setFirstWeekStartDate`、`setCurrentWeek`、`setSchool`、`setIsInitialized` 与成功/取消/error toast 行为。
- [ ] `ImportDialog`、`ImportSchoolStep`、backup/parser/bookmarklet 流程不共享 native-only bridge；普通 Web/PWA 仍过滤 native method 并保留既有降级。

## 7. 自动化回归测试

### Android unit tests

- [ ] navigation policy：entry/allowed auth host、HTTP、unknown host、non-default port、userinfo、non-http scheme。
- [ ] capture policy 独立性：navigation auth host 不可捕获；exact target host/path、payload size、JSON marker、HTML/empty rows/invalid JSON。
- [ ] diagnostics sanitizer：query/fragment/userinfo/Cookie/Authorization/password/body 不出现在结果或日志字段。
- [ ] shell command parser/state transitions/resize clamp/term-date validation。
- [ ] `ScheduleCaptureScript` 保留 idempotent/XHR/fetch clone/target path，且不输出 raw body。
- [ ] lifecycle helper：remove-from-parent/stop-clear/destroy 顺序、destroyed 后 bridge 不更新状态、timeout 取消和结果文件清理。

### Frontend tests

- [ ] `CourseImportShell`/`InAppImportStep` 的 idle/loading/ready/captured/failed DOM 结构均使用 shadcn components/tokens。
- [ ] term/date controlled input、retry/refresh/back/requestImport callbacks 和错误文案可验证。
- [ ] `native-course-import.test.ts` 继续覆盖 Web unavailable、adapter lookup、error mapping，并补 protocol/status 的纯函数测试。
- [ ] 保持 parser/backup/bookmarklet 现有测试不变并通过。

## 8. 真机/模拟器验收

有设备后按以下顺序执行，记录设备型号、Android/WebView 版本和脱敏日志：

1. 首次打开：首屏能看到 React/shadcn shell，不是空白或默认 Android 控件。
2. shell term/日期输入、开始、返回/取消；重复点击无并发 Activity Result。
3. 金智入口、统一认证/CAS、验证码、菜单和课表详情保持同一 academic WebView session。
4. shell chrome 在登录/课表内容期间持续可见，academic content slot 不被遮挡；验证 portrait、landscape、系统字体放大、IME 和 safe area。
5. 允许 host 正常加载；unknown host、HTTP、非默认端口、userinfo 被阻止并出现错误卡片。
6. 刷新、页面 HTTP/SSL/network/console error、capture timeout、重试和返回均可恢复。
7. 目标响应成功捕获，private file 交给既有 parser/importClasses，课程数据与上一版本一致。
8. Activity 返回/取消/旋转/后台恢复；logcat 无 attached-to-window destroy、崩溃、并发 callback 或敏感值。

若无法取得设备或真实账号，必须把未完成的矩阵列为验收阻塞；不得以 mock login host 或前端 build 通过代替真实登录验收。

## 9. 完整质量门禁与审查

按最小到完整顺序执行：

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
pnpm cap:sync:android
./android/gradlew -p android test
pnpm cap:build:android
git diff --check
python3 ./.trellis/scripts/task.py validate .trellis/tasks/09-18-fix-native-import-white-screen-ui
```

- [ ] 对照 PRD acceptance criteria 逐项勾选，区分“自动化通过”“真机通过”“环境阻塞”。
- [ ] 执行 `trellis-check` 质量审查：规格符合性、cross-layer data flow、敏感日志、WebView policy、组件复用、测试覆盖和构建结果。
- [ ] 若 Android 环境仍因 Gradle/SDK/网络阻塞，记录精确错误（此前已知 `services.gradle.org` DNS/Gradle home 问题），不修改实现去掩盖阻塞。
- [ ] 完成后按 `trellis-finish-work`：更新 `.trellis/spec/frontend/native-course-import.md` 的可执行契约、补开发日志，提交新 commit；不在本任务中回写原始已归档任务。

## 10. 当前执行结果

- [x] 已完成双 WebView React shell、受限 academic WebView、显式导航路径 allowlist、独立 capture allowlist、脱敏诊断、nonce/state gating 和 detach-before-destroy 清理。
- [x] 已完成 shared `CourseImportShell`、native shell entry、typed bridge state、失败态恢复、私有文件 handoff 和现有 parser/`importClasses` 日期数据流回归。
- [x] 已通过 `pnpm test`（7 个文件、24 个测试）、`pnpm typecheck`、本地 ESLint 10、`pnpm format:check`、`pnpm build`、`pnpm cap:sync:android`、`git diff --check` 和 Trellis context validation。
- [x] 已由 `trellis-check` 以 xhigh 完成两轮审查，并修复 shell origin、oversize callback、raw URL redaction、retry/state race 和 Activity adapter boundary 问题。
- [ ] Android Gradle test/build 仍受默认 Gradle home 只读、可写 home 无法访问 `services.gradle.org`/缺失离线依赖阻塞。
- [ ] 真机/模拟器验收仍受 `adb devices -l` 无设备阻塞：真实 CAS/验证码、旋转、IME、字体缩放、content-slot 和 logcat 终验待补。
