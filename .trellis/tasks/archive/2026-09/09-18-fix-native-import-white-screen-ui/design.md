# 技术设计：双 WebView React Shell 与受限金智页面

## 1. 设计目标与不可变约束

本设计解决三个相互关联的问题：

1. Activity 已能绘制但页面内容不可诊断、跳转可能被静默拦截，导致用户看到白屏或“无响应”。
2. Activity 退出时直接销毁仍挂载的 WebView，产生 `WebView.destroy() called while WebView is still attached to window`，并存在回调竞态。
3. Android Activity 内的 ClassTrack-owned UI 使用 Java 默认控件，与主 Web/PWA 的 shadcn UI 不一致。

不可变约束：

- 不把第三方页面导航放宽到任意 URL；登录/导航白名单和课表响应捕获白名单必须分离。
- 不记录或传递账号、密码、Cookie、Authorization、表单值、响应正文或带敏感查询参数的 URL。
- 课程响应仍走 `cacheDir` 私有临时文件 → `CourseImportPlugin` → 现有 parser/`importClasses`，不把 raw JSON 放入 shell、Intent extra 或 localStorage。
- backup、parser/JSON、书签脚本和普通 Web/PWA 降级流程不改变。
- Java 只负责 WebView 容器、session controller、安全桥接和生命周期；不复制 shadcn markup。

## 2. 组件边界

```text
MainActivity / Capacitor WebView
  └─ ImportDialog -> InAppImportStep -> CourseImportPlugin.open(...)
                                      │
                                      ▼ Activity Result（既有契约）
CourseImportActivity / FrameLayout
  ├─ shell WebView（app-owned asset origin）
  │    └─ CourseImportShell（React + shadcn）
  │       - 标题、阶段、term/第一周日期、说明、隐私提示
  │       - loading/error/captured/success 状态
  │       - 返回、刷新、重试、请求导入、取消
  │
  └─ academic WebView（remote HTTPS，仅允许配置 host）
       └─ 金智登录/CAS/验证码/课表页面与同一 WebView session
          └─ ScheduleCaptureScript -> CourseImportBridge

CourseImportActivity
  └─ NativeSessionController（状态唯一来源）
       ├─ NavigationPolicy（登录/导航 allowlist）
       ├─ ScheduleResponseValidator（精确 capture allowlist + payload）
       ├─ CourseImportShellBridge（只收固定命令）
       └─ private result file handoff
```

shell 与 academic WebView 不直接通信。两个 WebView 使用不同 bridge 名称；academic 页面永远不能取得 shell bridge 或 Capacitor 主 bridge。

## 3. React shell 资产与入口

### 3.1 入口方案

复用现有 `build/client` 产物，不新增第二套 Vite 输出。新增一个由 query 选择的 shell 模式：

- Activity 加载 `https://appassets.androidplatform.net/index.html?native-shell=1`。
- `app/root.tsx` 在浏览器端识别 `native-shell=1` 后渲染 `CourseImportShellEntry`，不渲染主应用 route、PWA update prompt、Markdown editor 等主页面副作用。
- 主 Capacitor WebView 和普通浏览器没有该 query 时继续走现有 `<Outlet />`，不改变路由、PWA fallback 或备份/解析导入。
- `CourseImportShell` 是共享的 presentational component；`InAppImportStep` 以 dialog variant 使用同一组表单、状态卡片、按钮和说明子组件，native shell 以 activity variant 使用它们。平台 bridge 适配器留在 shell entry，不污染通用组件。

这样可以直接复用现有 `app/app.css`、Tailwind/shadcn tokens、Geist 字体和 lucide 图标，避免 Android Java 维护第二套视觉实现。

### 3.2 AssetLoader

当前 Capacitor 同步结果在 `android/app/src/main/assets/public/`，而生成的 HTML 使用根绝对路径 `/assets/...`。Activity 使用 `androidx.webkit:webkit:$androidxWebkitVersion` 的 `WebViewAssetLoader`，注册 app-owned HTTPS origin，并用一个只读 `PathHandler` 将请求路径映射到 `public/<path>`：

- `/index.html` → Android asset `public/index.html`
- `/assets/<hash>.js|css|...` → Android asset `public/assets/<hash>...`
- 图标、字体等根资源同样只能从 `public/` 读取。

shell WebView 关闭 `allowFileAccess`、`allowContentAccess`、file URL universal access 和 mixed content；只允许 `appassets.androidplatform.net` 的本地资源请求。不能用 `file://`、`loadData` 或手工提交同步生成的 `android/app/src/main/assets/public` 作为最终方案。

实施时先做 asset smoke：`pnpm build && pnpm cap:sync:android` 后检查 index、hashed JS/CSS、字体、图标和 `CourseImportShellBridge.ready()` 是否全部成功。资源 404/MIME 错误必须和 academic 网络白屏分开诊断。

## 4. Native session controller 与状态机

`CourseImportActivity` 成为 controller owner，shell 只显示 controller 状态，主 Capacitor React 只等待最终 Activity Result。

```text
IDLE
  ├─ shell ready + startAcademic(term,date) -> ACADEMIC_LOADING
  └─ cancel/back -> CANCELLED
ACADEMIC_LOADING
  ├─ page finished (allowed) -> ACADEMIC_READY
  ├─ HTTP/SSL/network/blocked navigation -> ERROR
  └─ retry -> ACADEMIC_LOADING
ACADEMIC_READY
  ├─ refresh -> ACADEMIC_LOADING
  ├─ requestImport -> CAPTURE_WAITING
  ├─ back with WebView history -> ACADEMIC_READY
  └─ back without history/cancel -> CANCELLED
CAPTURE_WAITING
  ├─ validated target response -> CAPTURED
  ├─ rejected/timeout -> ERROR
  └─ refresh/retry -> ACADEMIC_LOADING or ACADEMIC_READY
CAPTURED
  ├─ requestImport -> HANDING_OFF
  └─ refresh -> clear candidate + ACADEMIC_LOADING
HANDING_OFF
  ├─ private file + RESULT_OK -> finish
  └─ write failure -> ERROR
ERROR
  ├─ retry/refresh -> IDLE or ACADEMIC_LOADING
  └─ back/cancel -> CANCELLED
```

状态下发给 shell 只包含可安全显示的固定字段，例如：

```json
{
  "state": "ACADEMIC_READY",
  "messageKey": "academicReady",
  "errorCode": null,
  "canRetry": true,
  "canRefresh": true,
  "canImport": true,
  "term": "2025-2026-2",
  "firstWeekStartDate": "2025-09-01"
}
```

不下发 raw URL、响应 body、Cookie、Authorization、账号输入或异常原文。诊断所需的 safe host/path 只进入脱敏日志，不进入 React state。

## 5. 双 WebView 布局

目标是固定 ClassTrack chrome + academic content slot，而不是透明 shell 覆盖 remote WebView：

- `FrameLayout` 根节点包含 shell WebView 和 academic WebView。
- shell component 在 active academic 状态只渲染顶部 chrome；通过 `ResizeObserver`/bridge 上报 CSS 高度，native 以 density/viewport 约束将 shell WebView 安置为顶部固定区域，academic WebView 放在其下方。shell WebView 不覆盖 academic 内容，因此不拦截 remote 页面触摸。
- 初始、错误、成功、取消等没有可用 academic 内容的状态下，academic WebView 隐藏，shell WebView 占满 Activity；shell 显示完整 form/status/error card。
- academic WebView 登录、验证码、课表页面加载期间，shell chrome 保持可见；刷新、重试、返回和请求导入操作由 shell bridge 传给 native。
- shell 高度有上限和最小值，native 对 resize 命令做 clamp；字体放大、横屏、IME 和 system insets 通过 `WindowInsets`、ResizeObserver 和真机矩阵验证。
- 若设备验证表明动态 slot 在字体缩放、键盘或旋转时无法稳定布局，安全降级是切换 shell/academic visibility；必须在验收报告中明确这不满足“remote 页面期间持续 chrome”的严格版本，不能无记录地把降级当作完全一致。

## 6. Bridge contracts

### 6.1 Shell → native

仅在 shell WebView 的 app-owned 当前 URL、当前 session nonce 和合法状态下接受：

```text
ready()
resize(heightCssPx)
startAcademic({ term, firstWeekStartDate })
retry()
refreshAcademic()
back()
requestImport()
cancel()
```

native 再次验证：命令名、JSON shape、term `\\d{4}-\\d{4}-[12]`、日期 `yyyy-MM-dd`、高度范围、session 状态和当前 shell URL。命令没有 URL、目标 endpoint、脚本、body 或 Cookie 字段。

native → shell 通过 `evaluateJavascript` 调用固定入口（例如 `window.__classTrackNativeState(...)`），只发送上面的 safe state。shell ready 之前的状态保存在 native，不依赖 WebView history。

### 6.2 Academic → native

academic WebView 只注入现有 `ScheduleCaptureScript` 的 capture bridge。脚本仍只筛选精确的 HTTPS target host/path 和大小上限；native 再按当前 top-level page、session nonce、`ScheduleResponseValidator.isValidTargetResponse` 复核。登录/导航 allowlist 扩展不能改变 `isTargetUrl`。

### 6.3 Activity Result / TypeScript

扩展而不破坏现有 `CourseImportOpenOptions`：

- `open` 接收安全的 `firstWeekStartDate`，Activity shell 初始显示并允许用户修正。
- Activity Result 可返回安全的 `term`/`firstWeekStartDate`，以及既有 private `resultFile`/sanitized `sourceUrl`。
- `CourseImportPlugin` 继续读取、验证、删除私有文件；raw body 仍只在 plugin resolve 的既有 `data` 字段短暂返回给主 WebView，用于现有 parser 路径，不经过 native shell。
- `useImportFlow` 使用 Activity 返回的日期（若存在）调用现有 `parser.parse` 和 `importClasses`，其余 store、current week、school 和 initialized 行为保持不变。

## 7. 导航与安全策略

新增独立 `CourseImportNavigationPolicy`（或等价集中模块）：

- `allowedNavigationHosts` 是按适配器配置的显式 HTTPS host 集合。已知 `jwxt.tjut.edu.cn` 必须保留；真实设备诊断若发现受控 CAS host，只能以明确 host 加入，不能使用通配子域。
- `allowedNavigationPathPrefixes` 同样按适配器显式配置；当前只允许 `/jwapp/sys/wdkb` 和已观察的 `/authserver` 路径前缀，禁止同主机任意路径。
- scheme 必须 HTTPS，port 只能默认/443，禁止 userinfo；HTTP、`intent:`, `file:`, `content:` 和外部 host 直接阻止并更新 shell 错误。
- `shouldOverrideUrlLoading` 对允许的主框架 URL 返回 `false`，让 WebView 正常加载；拦截时返回 `true`，记录 safe host/path/reason 并显示可恢复错误。
- `ScheduleResponseValidator.isTargetUrl` 继续精确要求 `jwxt.tjut.edu.cn` + `/jwapp/sys/wdkb/modules/xskcb/cxxszhxqkb.do`，并保留 512 KiB 和 JSON marker 校验。
- 页面/HTTP/SSL/network/console 回调统一经 `CourseImportDiagnostics` 记录。日志只允许固定 phase/category、safe host/path、status code、byte length、error enum；不打印 query、fragment、userinfo、exception 原文或 response body。

入口 HTTP 当前已观察到同一 `jwxt.tjut.edu.cn` 下的 `/authserver` 认证页面，因此不能在没有设备证据时把白屏归因于 CAS host；第一轮真机诊断必须记录真实的脱敏跳转，随后才决定是否更新 navigation host 配置。

## 8. 生命周期、返回与失败处理

- 创建 shell 和 academic WebView 后均绑定当前 session nonce；Activity 退出、取消、重试和错误转换都先让 controller 失效，移除 Handler 回调并阻止 bridge 更新 UI。
- `onDestroy` 在主线程执行：停止加载 → 清除 WebView clients/bridge/callback → 从父 `FrameLayout` 移除 → `destroy()`；shell/academic 两个实例都走同一 helper，避免 attached-to-window 警告。
- `onBackPressed` 先处理 capture waiting；academic 有 history 时只 `goBack()`，无 history 时才返回 `CANCELLED`；shell back/cancel 不直接调用 `webView.goBack()`。
- 刷新清除上次 candidate、错误和超时回调；capture hook 依赖幂等 marker，重复 `onPageFinished` 不产生重复 hook/candidate。
- 进程被系统杀死后的完整自动恢复不在本任务范围；重新创建时不伪造登录态，必须清理过期 private files，并以可理解错误让用户重新打开/登录。

## 9. 测试与质量门禁

### 纯逻辑/静态测试

- navigation allowlist 与 capture allowlist 独立；HTTPS/host/port/userinfo/scheme 边界。
- safe URL/diagnostic sanitizer 不保留 query、fragment、Cookie、Authorization、密码样式值或 response body。
- shell command parser、状态转移、resize clamp、term/date 校验。
- capture script 的 idempotent marker、XHR/fetch clone、精确 target path 和无 raw-body 日志。
- React shell 与 `InAppImportStep` 的 idle/opening/ready/captured/error 分支及操作回调；现有 native plugin error/fallback 测试保持通过。

### Android/真机

- asset load ready、入口页面、真实登录/CAS/验证码/课表、刷新、返回、取消、网络/HTTP/SSL/console error、capture timeout、旋转/IME/字体缩放和成功导入。
- unknown host/HTTP/non-default port/userinfo 必须被阻止且 shell 可见。
- `adb logcat` 不出现 attached-to-window destroy、并发 result 或敏感字段。
- 若 Gradle/SDK/设备继续不可用，记录精确命令和阻塞证据；不能用前端测试替代 Android/真机验收。

## 10. 回滚点

1. **诊断回滚点**：保留原始 Activity Result 和 capture contract，仅回滚新增 UI/asset shell，不回滚安全日志和 detach-before-destroy。
2. **shell 资产回滚点**：若 appassets smoke 失败，回滚双 WebView UI wiring，保留单 academic WebView 的诊断/导航/lifecycle 修复，并记录 strict UI requirement 未完成；不得换成 Java 假 shadcn 外壳冒充完成。
3. **数据契约回滚点**：任何 parser/importClasses 回归时，恢复 `CourseImportResult` 的兼容字段并保证 existing `data/sourceUrl` 不变；不改变 private file 清理和 capture validator。
