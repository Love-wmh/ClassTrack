# React/shadcn 本地 Shell + 受限教务 WebView 架构评估

> 目标解释：用户要求 ClassTrack 自己负责的 Android 导入外壳与 `InAppImportStep` 完全一致；金智教务页面本身是第三方页面，不能被安全地改造成 shadcn。以下“完全一致”指加载、说明、错误、刷新、取消、成功等 ClassTrack-owned UI 使用同一套 React/shadcn 组件和 tokens；教务登录/验证码/课表页面仍保持原站视觉。

## 1. 当前跨层数据流与缺口

```text
React MainActivity WebView
  InAppImportStep / useImportFlow
    -> courseImportPlugin.open({ adapterId, entryUrl, term })
      -> CourseImportPlugin.open()
        -> CourseImportActivity
          -> WebView.loadUrl(ENTRY_URL)
          -> login/navigation in academic page context
          -> injected ScheduleCaptureScript (XHR/fetch)
          -> CourseImportBridge.onScheduleResponse(url, body)
          -> ScheduleResponseValidator
          -> private cache file after user import request
        <- ActivityResult(path, sourceUrl)
      <- CourseImportPlugin.handleImportResult() reads + deletes file
    <- useImportFlow JSON.parse -> existing parser.parse -> importClasses
```

### 现有代码事实

- `app/components/import-flow/InAppImportStep.tsx`（约 L1-L58）只渲染主 Capacitor 页面中的配置/说明/状态；它不拥有 Android Activity 内的 WebView，因此 Activity 打开后这部分 UI 在主 WebView 下方不可见。
- `app/components/dialog/ImportDialog.tsx`（约 L1-L87）把 `InAppImportStep` 放在 shadcn `Dialog`，底部按钮由 `StepperActions`（约 `app/components/stepper/StepperActions.tsx` L1-L46）渲染。Android Activity 当前完全绕过这些组件。
- `app/components/import-flow/useImportFlow.ts` 的 native 分支（约 L96-L181、L218-L298）只在 `courseImportPlugin.open()` resolve/reject 后更新 `opening`/`captured`/`failed`。因此 Activity 加载期间，React 侧只能显示“正在打开”，不能承载 Activity 内的网络错误或刷新按钮。
- `CourseImportActivity.createContentView()`（约 L80-L124）是 Java 动态 `LinearLayout` + 默认 Android `Button`/`TextView`/`ProgressBar`；它不能直接 import `app/components/ui/*`，也没有项目 CSS tokens。
- `app/app.css`（约 L1-L100+）和 `app/components/ui/card.tsx`、`button.tsx`、`badge.tsx`、`separator.tsx` 已有可复用 shadcn tokens/variants；当前没有 `Alert` 组件，所以错误区应组合 `Card`/`Badge`/`Button`/`Separator`，或新增一个小的 shared status component，而不是复制 Java 视觉。
- `app/routes.ts`（L1-L14）目前没有 native shell route；`react-router.config.ts` 使用 `ssr: false`，`vite.config.ts`（L1-L52）产出 `build/client` 并由 `capacitor.config.ts` 的 `webDir: 'build/client'` 同步到 Android。若 Android Activity 要加载 React shell，必须明确 bundle/asset URL 和 bridge，不应假定普通 MainActivity 的 Capacitor bridge 自动存在。
- `CourseImportPlugin.handleImportResult()`（约 L57-L105）和 `ScheduleResponseValidator` 已经建立“Intent 只传私有文件路径，插件读取后删除”的正确大 payload 边界；架构变更不应把原始 JSON 改塞回 JS bridge 或 Intent extra。

## 2. 候选方案比较

### 方案 A：单 WebView，local shell 与教务页面顺序切换

**形态**

1. `CourseImportActivity` 用 `WebViewAssetLoader` 加载 app-owned 的 React shell（例如 `/assets/index.html` 的专用入口/route）。
2. shell 通过窄桥发送 `startAcademic`, `retry`, `refresh`, `back`, `import` 命令。
3. native 收到 `startAcademic` 后在同一个 WebView `loadUrl(ENTRY_URL)`；在受控教务页面 `onPageFinished` 后注入 XHR/fetch hook。
4. native 把加载/错误/捕获状态保留在 Java 状态机中；需要显示 ClassTrack UI 时重新加载 local shell，并把**状态枚举和安全字段**传给 shell；成功则仍写 cache 文件并 finish Activity。

**优点**

- 登录 Cookie、DOM storage、页面历史、hook 和补抓 fetch 都在一个 WebView session 中，最不容易丢失登录态。
- 一个 WebView，内存和销毁路径最小；可避免两套 Cookie/生命周期协调。
- local shell 本身就是 React/shadcn，可直接共享 `Card`, `Button`, `Badge`, `Separator`, `ImportStepDescription` 和 `app.css`（前提是建立可加载的专用入口）。
- 教务页面永远不被 iframe 父页面读取，XHR/fetch hook 仍在同源页面上下文运行。

**代价/失败模式**

- 切到教务 URL 时 React shell 的 DOM 被替换；登录过程中不能同时显示 ClassTrack toolbar/status。若要求始终有 shadcn chrome，需要额外原生 overlay 或改成双 WebView，已经不是最小实现。
- 同一个 `addJavascriptInterface` 会随 WebView 暴露给 local shell 和教务页面；每个 bridge 方法必须根据当前 URL/origin、session token、命令 schema 分流。不能因为 local shell 是自家页面就放宽 remote 校验。
- local shell 再加载依赖 SPA 路由/静态 asset fallback；`WebViewAssetLoader` 的 MIME、base URL、font/CSS/JS 相对路径、route fallback 任一错误都会造成新的本地白屏。
- 从远程页面返回 shell 时，若使用 `loadUrl` 而不是保存状态/显式状态机，可能重复初始化、丢失 error/capture 状态或误把 WebView history 当成 shell history。
- `onPageFinished` 不应把任何 `https://` 当作允许页；local asset origin 与登录 host 要有不同的 policy 分支。

**适用判断**：如果“完全一致”允许 ClassTrack UI 只在初始/错误/成功态显示，而登录中显示金智页面，这是最小且最稳的首选。若要求教务内容区域上方始终保留 shadcn 操作栏，方案 A 不够。

### 方案 B：双 WebView，同一 Activity 中保留 local shell 和 academic WebView

**形态**

- `FrameLayout` 中有一个 app-owned shell WebView 和一个 academic WebView；shell WebView 永久承载 shadcn 状态/操作，academic WebView 永久承载登录/课表页面。
- 最低复杂度版本在两者之间切换可见性：打开/登录时显示 academic，初始/错误/成功时显示 shell。更完整版本让 shell 只占固定 chrome 区域、academic WebView 放在内容区；这需要处理 window insets、旋转和点击透传。
- shell 与 native 使用 `CourseImportShell` 窄桥；academic 使用单独的 capture bridge。两个 bridge 不共享 raw body。

**优点**

- shell React 状态不会因远程导航消失，可在加载/失败/刷新/返回/成功期间维持同一视觉和文案。
- academic WebView 不需要暴露 Capacitor 主 WebView 的完整插件接口；可以只注入捕获桥。
- academic WebView 保持同一实例，登录页、验证码、课表页和页面 history 连续；shell 只控制它。
- 适合实现“ClassTrack 自有 chrome 完全 shadcn，教务页面在内容槽中”的产品要求。

**代价/失败模式**

- Android WebView 资源占用加倍；低内存/后台恢复/销毁要同时管理两个实例。
- Android `CookieManager` 通常在同一 app profile 共享 cookie，但不能依赖 shell WebView 自己发起教务请求；所有请求仍必须由 academic WebView 页面上下文发起。DOM/window/session state 不因 Cookie 共享而共享。
- 如果用一个完整 shell WebView 覆盖 academic WebView，透明区域仍可能拦截触摸；如果用坐标/固定 dp 把 academic WebView 放入 shell 的“slot”，必须测试字体缩放、横屏、刘海和键盘 inset。
- 旋转/重建时要保持 academic WebView，不要为 shell state 重建其 cookie/history；否则登录态看似“随机丢失”。
- 两个 WebView 的 bridge 必须区分：shell 只能收到 status enum/安全路径，academic 只能发送目标捕获候选；禁止 academic 页面调用 shell 的完成/返回接口。

**适用判断**：这是满足“ClassTrack UI 在教务操作期间仍一致”的最小可行架构，但相比方案 A 多了布局和内存风险。若用户的“完全一致”明确包含 Activity 内始终可见的返回/刷新/错误 chrome，应选 B 的切换版作为 MVP，再决定是否做固定 chrome overlay。

### 方案 C：Android 原生外壳 + 受限 WebView（当前方向的修补版）

**形态**：继续 `CourseImportActivity` Java 动态布局；增加 token 对齐的颜色、间距、圆角、状态卡片和错误按钮；WebView 保持单实例。

**优点**：不增加 React asset pipeline；首屏最快；生命周期、WebView、hook 和 Activity Result 都集中在现有 Java；最容易先修白屏。

**缺点**：不能复用 shadcn 组件/React tokens 的实际 CSS；以后 React UI 与 Java 外壳会继续漂移；用户已选择“两边完全一致”时，它只能算视觉近似，不是满足要求的方案。不要把 Android Java 中复制一份 shadcn markup 当成解决方案。

**适用判断**：只适合在 React shell bundle 无法在当前迭代稳定加载时的安全回退；即便采用，也应将 Java 外壳最小化为错误/返回兜底，并把完整 ClassTrack-owned 交互迁移到 local HTML。

### 方案 D：直接复用 Capacitor 主 WebView 路由

**形态 1：主 WebView 直接导航到金智 URL**。React route 被远程页面替换，返回时再导航回 ClassTrack。

**形态 2：主 WebView 保留 React route，同时由 MainActivity 原生加一个 academic WebView 子视图/overlay**。

**优点**：形态 2 可直接复用现有 React `InAppImportStep`、shadcn CSS 和 Capacitor 生命周期；不需要另一个 Activity 的结果回调。

**代价/失败模式**

- 形态 1 丢失 React runtime/router/UI，且 remote page 可能接触到 Capacitor bridge；返回/进程恢复复杂，不建议。
- 形态 2 实际上退化成“主 Capacitor WebView + academic WebView”的自定义双 WebView，需要改 `MainActivity`/插件 view 管理、Activity lifecycle、safe area 和返回键；比独立 `CourseImportActivity` 更侵入主应用。
- Capacitor bridge 不应对未信任的教务 origin 保持完整可用；如果主 WebView 导航到了 remote URL，不能仅靠 URL 判断就假设 bridge 安全。
- 主 WebView route 的 React 状态与 native Activity Result 的 pending call 需要在后台、返回和重建时一致；当前 `useImportFlow` 是一次性 Promise 流程，没有可恢复 session store。

**适用判断**：不是当前修复的最小方案。只有在产品决定把整个 native import 变成 MainActivity 内的一等 route，并愿意承担主 WebView view embedding 改造时才考虑。

## 3. 推荐决策

### 推荐：方案 B 的“两 WebView + 单 Activity + 共享 React shell”，以切换可见性作为第一阶段

理由：

1. 满足用户对 ClassTrack-owned UI 的“完全一致”：Android Activity 的加载、说明、错误、重试、返回、成功状态由同一套 React/shadcn shell 渲染，而非 Java 默认控件。
2. academic WebView 一旦创建就保持同一 session，登录/CAS/验证码/课表 history 和 XHR/fetch hook 不被 shell 的状态切换破坏。
3. shell 与 academic 的桥接边界可分开，避免把 Capacitor 主 bridge 或 raw course JSON 暴露给第三方页面。
4. 不改现有 parser/store/backup/parser JSON 路径；成功仍沿用 `CourseImportPlugin` 私有文件和 `useImportFlow` 的 `JSON.parse -> parser.parse -> importClasses`。
5. 方案 A 虽然更小，但不能在远程页面显示 ClassTrack shell；方案 C 不满足严格视觉要求；方案 D 会把风险带入主 Capacitor WebView。

### MVP 边界

- Shell WebView：只显示表单（term/date）、操作说明、隐私说明、状态卡片和按钮。它不请求教务接口、不接收课程 JSON、不读 Cookie。
- Academic WebView：只加载配置好的 HTTPS 登录/教务导航 host；只注入目标接口 XHR/fetch hook；不显示或记录响应正文。
- 在 academic 页面阶段可以先全屏显示 academic WebView，shell 在加载/失败/完成状态显示；如果验收明确要求 remote 页面上方也持续显示 ClassTrack chrome，再增加固定 chrome overlay，不改变 capture/data contract。
- Native controller 是唯一状态机 owner：`IDLE -> ACADEMIC_LOADING -> ACADEMIC_READY -> CAPTURE_WAITING -> CAPTURED -> HANDING_OFF -> ERROR/CANCELLED`。shell 和主 Capacitor React 都只消费状态/发命令，不能各自维护一套导航状态。

## 4. 登录态、hook、通信和返回数据的明确取舍

### 登录态

- 登录、验证码、菜单和目标课表请求必须发生在 academic WebView 的同一实例和同一页面上下文；不能由 shell WebView `fetch` 跨源读取。
- 两个 WebView 即使共享 `CookieManager`，也不代表共享 DOM/storage/window；shell 不得直接请求 target endpoint。
- Activity rotation/configuration change 优先保留 academic WebView 实例；若无法保留，应明确回到 `ACADEMIC_LOADING` 并要求用户重新登录，而不是静默地用新 WebView。
- 不实现自动填充、账号托管或服务端代理；是否在取消时清 cookie 应作为产品/隐私决定，不能在诊断修复中顺便改变。

### XHR/fetch hook

- 只在 academic WebView 的允许主文档 `onPageFinished` 注入；每次 remote document 导航重新注入，脚本使用 idempotent marker。
- XHR hook 在 `load` 读取 `responseText`；fetch 使用 `response.clone().text()`，不消费页面原响应。发送 native 前先按 target HTTPS host + exact path + byte limit 筛选。
- native bridge 再次校验：当前 top-level navigation host 在 login/navigation allowlist、候选 URL 在独立 capture allowlist、无 userinfo/非默认端口、JSON 有 `datas.cxxszhxqkb.rows` 和非空 `KCM`。
- shell 不能通过命令指定任意 hook URL；term 只用于已配置 adapter 的同源补抓 POST body，且不写日志。

### 桥接通信

建议两个名称/接口：

```text
CourseImportShell (只给 local shell)
  ready()
  startAcademic()
  retry()
  refreshAcademic()
  back()
  requestImport()

CourseImportBridge (只给 academic capture hook)
  onScheduleResponse(url, body, sessionNonce)
```

- 每个调用都在 Java 再验证状态、session、当前 top-level URL 和参数 schema；不要把 `url`/`body` 的可信性归因于 WebView。
- shell 从 native 接收 `{state, errorCode, messageKey, safePath?}`，不接收 raw JSON、Cookie、Authorization 或表单值。若用 `addJavascriptInterface`，只暴露少量 `@JavascriptInterface` 方法；更严格的实现可以用 AndroidX WebKit origin-scoped `WebMessage` listener 给 appassets origin。
- capture bridge 的错误只回传固定类别/状态；日志用脱敏 host/path/HTTP code/byte length，不打印 exception message 中可能带 URL query 的内容。
- Native 不把大 JSON 放入 Intent extra；继续写 app-private cache 文件，`CourseImportPlugin.handleImportResult()` 读取后在所有成功/失败路径删除。

### 返回课表 JSON

保持现有契约：

```text
academic response body (native memory)
  -> user explicitly requests import
  -> cacheDir/classtrack-course-import-*.json
  -> Activity.RESULT_OK { resultFile, sourceUrl }
  -> CourseImportPlugin reads, validates, deletes file
  -> TypeScript parser + importClasses
```

`sourceUrl` 传回前应使用无敏感 query 的规范化 URL，诊断日志仍只输出 safe host/path。不要为了 shell 状态把课程 JSON 注入 DOM 或 localStorage；不要改变 `MAX_PAYLOAD_BYTES = 512 KiB`、目标 path、JSON marker 或现有天津理工 parser。

### 资源加载

- local shell 优先用 `androidx.webkit.WebViewAssetLoader` 的 `https://appassets.androidplatform.net/...` app-owned HTTPS origin；避免 `file://`, `file://` universal access 和 `loadData` 的相对资源/MIME 陷阱。
- `build/client` 当前是 Capacitor Web 产物，但自定义 Activity 不自动拥有 MainActivity 的 Capacitor bridge。应先做一个 asset-loading spike：确认 `pnpm build && cap sync android` 后 shell HTML、hashed JS/CSS、Geist 字体、Lucide SVG 和 Tailwind/shadcn CSS 都能从 Activity WebView 加载。
- 最可维护的入口是抽取纯 `CourseImportShell` 组件和共享 UI，增加明确的 native-shell entry/route 或独立 Vite entry；不要从 Android Java 复制生成后的 HTML，亦不要手工提交 `android/app/src/main/assets/public` 构建产物。
- academic WebView 保持 `JavaScript`, `DOM storage`, 必要 Cookie，关闭 file/content access 和 mixed content；主框架非 allowlist URL 不加载，非 HTTPS/外部 intent 不交给系统浏览器。

## 5. 推荐方案的主要失败模式与预防

| 失败模式 | 早期信号 | 预防/回归 |
|---|---|---|
| 实际 CAS host 未配置 | `navigation_blocked` + safe host/path；shell 仍可见 | 真机先采集脱敏 host，再增加显式 login allowlist；capture allowlist 不变 |
| local shell 资源/route 白屏 | shell `ready` 不到达、Chrome console error、asset 404/MIME 错误 | WebViewAssetLoader asset smoke test；记录 route/asset status，不记录 query/body |
| 两 WebView 误以为共享 session | academic 登录成功但 shell fetch 失败 | shell 永不 fetch academic；只验证 academic WebView 自己的补抓 |
| academic 页面调用 shell bridge | remote 页面触发未知命令/错误状态 | 分离 bridge 名称；当前 top-level origin + state + session 校验；未知命令拒绝 |
| hook 重复注入 | 同一响应多次 capture、导入按钮竞态 | 脚本 marker + native response de-dup/session id；测试 page finished/reload |
| bridge 传递敏感信息 | logcat 出现 query/Cookie/body；shell DOM 有 raw JSON | source sanitizer、固定 error enum、静态 grep/日志审计；只传私有 file path |
| overlay/切换造成返回错乱 | Android back 一次退出 Activity 或 shell history 被误回退 | 明确 back 状态机：academic history -> academic exit -> shell/Activity cancel；instrumentation 覆盖 |
| Activity destroy 警告 | `WebView.destroy()` attached | parent remove + stop/clear callback + destroy；真机 logcat 回归 |
| 低内存/进程杀 | 两实例丢状态、pending PluginCall 没回调 | `onSaveInstanceState`/session marker 或可恢复错误；cache TTL/cleanup；真实设备后台恢复 |
| Capacitor 主 WebView 被污染 | remote 页面可调用 Capacitor API、返回后 router 错误 | 不选方案 D 形态 1；academic WebView 独立于 MainActivity |

## 6. 外部文档依据

- Capacitor 8 Android plugin guide：<https://capacitorjs.com/docs/plugins/android>。v8 文档明确支持 `startActivityForResult` + `@ActivityCallback(PluginCall, ActivityResult)`，所以继续保留现有独立 Activity Result contract 是合理的。
- Android WebViewAssetLoader：<https://developer.android.com/reference/androidx/webkit/WebViewAssetLoader>。用于从 app-owned HTTPS origin 提供本地资源，适合 shell 的 CSS/JS/font 相对资源；比 `file://` 更适合保持 WebView 的文件访问关闭。
- Android `addJavascriptInterface`：<https://developer.android.com/reference/android/webkit/WebView#addJavascriptInterface(java.lang.Object,%20java.lang.String)>。接口对象暴露给页面/框架且没有天然的可靠 origin callback，故必须在 native 端做来源、状态、大小和 schema 校验。
- Android `WebViewClient.shouldOverrideUrlLoading`：<https://developer.android.com/reference/android/webkit/WebViewClient#shouldOverrideUrlLoading(android.webkit.WebView,%20android.webkit.WebResourceRequest)>。`true` 表示宿主处理并阻止 WebView 继续加载；白名单策略必须对返回值和用户错误状态成对设计。
