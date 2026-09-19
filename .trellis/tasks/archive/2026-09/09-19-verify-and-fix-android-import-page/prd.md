# PRD：修复并验证 Android 教务导入页白屏、布局与 404

## 背景

用户报告 Android 应用内天津理工大学金智课表导入出现白屏、布局异常、无响应和 404。在具备 `/dev/kvm` 与模拟器的环境中已完成真实复现，确认根因是原生 shell 页面加载路径触发了应用自身的 React Router 404 错误边界，而非资源缺失或教务服务器问题。详细证据见 `research/native-shell-404-root-cause.md`。

## 目标

1. 修复应用内导入页的白屏、布局异常、无响应与 404。
2. 修复日志中与 shell 无关但真实存在的资源 404：`favicon.ico` 404 与 Workbox 预缓存失败。
3. 在模拟器上完成全流程手动回归，确认应用功能正常。
4. 补齐可离线运行的自动化回归测试，防止同类回归。

## 需要修复的问题

### P1：应用内导入页整屏 404 白屏

- 触发路径：导入课程数据 → 选择学校 → 导入方式「应用内打开教务系统」→ 填写学期与第一周日期 → 点击「打开教务系统并导入」。
- 现状：`CourseImportActivity` 启动，但界面只有白底和 `404` / `The requested page could not be found.`。
- 直接后果：shell 的 React 外壳完全不渲染，重试、返回、刷新、取消控件全部不存在，页面无响应。

### P2：主应用内 Service Worker 预缓存失败

- 冷启动日志出现 `non-precached-url :: [{"url":"/index.html"}]`、`bad-precaching-response :: [{"url":"https://localhost/favicon.ico","status":404}]`。
- 属于真实 404，虽然不影响当前可用功能，但污染运行时并可能影响后续缓存行为。

### P3：缺少针对 shell 引导路径的自动化回归

- 现有测试不覆盖「shell 引导 URL 必须能被客户端路由匹配」这一契约，因此同类回归无法被提前发现。

## 非目标

- 不扩大或收紧 academic WebView 的导航 allowlist、capture allowlist、host、端口、路径范围。
- 不改变 parser、`importClasses`、学期/第一周日期语义、JSON 上传与备份导入流程。
- 不改变 Web/PWA 的书签脚本导入方式与离线行为。
- 不引入 `@capacitor/browser`、外部浏览器插件或服务端代理。
- 不记录或传递账号、密码、Cookie、Authorization、表单值、敏感 query、响应正文或 raw JSON。
- 不修改 `server.androidScheme` 或 Capacitor 主 WebView 的 origin，避免改变既有用户数据的 origin 归属。

## 验收标准

### A. 修复验收（模拟器，Android 37.1 x86_64）

- A1：进入应用内导入后，shell 首帧渲染 ClassTrack 外壳，不再出现 React Router 404 文案。
- A2：shell 标题、状态、学年学期代码、第一周第一天、操作按钮（打开/重试、返回、刷新、取消）可见可点。
- A3：`window.CourseImportShell` 桥接就绪，content slot 尺寸上报使 academic 区域可见。
- A4：academic WebView 加载 `https://jwxt.tjut.edu.cn` 登录页，页面可见或给出明确错误态，不再整屏空白无响应。
- A5：返回、刷新、重试、取消四个动作各自表现为预期状态，均不导致白屏。
- A6：旋转、软键盘弹出、字体缩放后 shell 与 content slot 仍不重叠、不裁切。
- A7：脱敏 logcat 中不再出现 `phase=console_error ... url=...index.html` 形式的 shell 引导失败；同时不引入 `WebView.destroy() called while WebView is still attached`。

### B. 资源 404 验收

- B1：主应用冷启动日志不再出现 `non-precached-url` 与 `bad-precaching-response`。
- B2：原生应用内不再注册 Service Worker；Web/PWA 构建仍保留 Service Worker 与更新提示。
- B3：`favicon.ico` 在 Web/PWA 与原生应用中均可获取，不再产生 404。

### C. 功能回归验收（模拟器）

- C1：课表主页、数据看板、课程管理、代课管理四个底部页签均可正常渲染与切换。
- C2：导入课程数据三步流程（来源 → 应用内导入 → 结果）可完整走通到成功或明确错误态。
- C3：手动新建/编辑课程等核心操作不回归。
- C4：JSON 上传与备份导入入口仍可用（不要求完整走通真实文件）。

### D. 自动化回归验收

- D1：新增测试覆盖「shell 引导 URL 路径必须匹配客户端路由」这一契约，并在当前缺陷下失败。
- D2：新增测试覆盖原生资源处理器对根路径的 index 映射契约。
- D3：新增或更新测试覆盖原生应用内不注册 Service Worker、Web 端仍注册。
- D4：`pnpm test`、`pnpm typecheck`、项目本地 ESLint、`pnpm format:check`、`pnpm build`、`pnpm test:android-assets`、`pnpm android:check-assets`、`git diff --check` 全部通过。
- D5：Android JVM 单元测试通过。

## 约束

- 必须在具备 KVM 的模拟器或真实设备上完成 A、C 两组验收；静态与前端测试不能替代。
- 测试与验收证据中不得包含凭据、Cookie、表单值、响应正文或原始 JSON。
- 临时模拟器改动只允许作用于可写副本或标准 AVD 状态，不破坏既有 AVD 数据。

## 风险

- 修改 shell 引导路径会同时影响 `isShellUrl()` 的导航放行判定；若放宽过度会削弱 shell 只允许自身 origin 的安全边界。必须保持 host、scheme、port、userinfo 校验不变，仅调整 path 判定。
- 关闭原生 Service Worker 会影响「应用内离线」路径；需确认原生资产本身已离线可用，并保留 Web/PWA 的 SW 行为。
- 模拟器为 x86_64 且宿主内存有限，长流程回归可能受性能影响，需如实记录。
