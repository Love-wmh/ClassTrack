# 原生导入页 404 / 白屏根因

## 复现环境

- 分支 `fix/native-import-white-screen-ui`，任务基线 commit `e1a10a3`
- 模拟器 `Medium_Phone`，Android Emulator `37.1.11.0`，Android `37.1` `google_apis_playstore_ps16k` `x86_64`
- 宿主已具备 `/dev/kvm`，Gradle home 可写，JDK 21，可访问 gradle 分发站
- 首次冷启动耗时约 24s，`adb devices -l` 可见 `emulator-5554`
- 安装包：`android/app/build/outputs/apk/debug/app-debug.apk`，SHA-256 `7f4e8d3552ec3095dc10518e80a1ec75a2dc111fe9957ec8387dccd0508d9ba6`
- 资源校验：`pnpm android:check-assets` 通过，245 个资源、27 个 index 引用，index SHA-256 `e30f1a89d30038f383dcf5c50c14983ce2599bafb6e889d7f4dfe4d0a748193d`

## 复现步骤

1. `adb install -r` 安装 fresh APK
2. `adb shell pm clear com.classtrack.app`，`adb shell am start -W -n com.classtrack.app/.MainActivity`
3. 无课表时空状态自动弹出导入对话框（`SchedulePage` 设计行为，非缺陷）
4. 选择学校 `天津理工大学`，导入方式选 `应用内打开教务系统`
5. 填写 `学年学期代码` 默认 `2026-2027-1`，选择 `第一周第一天` = `2026-09-01`
6. 点击 `打开教务系统并导入`

## 观测结果

`CourseImportActivity` 正常启动，`topResumedActivity=com.classtrack.app/.CourseImportActivity`。

界面呈现为整屏白底，仅有：

```text
404
The requested page could not be found.
```

脱敏 logcat（已确认不含账号、Cookie、表单值、响应正文）：

```text
I ClassTrack.CourseImport: phase=activity_created session=<redacted> adapter=tianjin-university-of-technology
I ClassTrack.CourseImport: phase=navigation_started mainFrame=true allowed=true url=https://appassets.androidplatform.net/index.html
I ClassTrack.CourseImport: phase=page_started mainFrame=true url=https://appassets.androidplatform.net/index.html
W ClassTrack.CourseImport: phase=console_error level=LOG category=script line=2 url=https://appassets.androidplatform.net/index.html
```

CDP（`adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`）读取到三个 WebView target：

- shell：`https://appassets.androidplatform.net/index.html?native-shell=1`
- 主应用：`https://localhost/`
- academic：空白 target

对 shell target 求值：

```json
{
  "href": "https://appassets.androidplatform.net/index.html?native-shell=1",
  "title": "ClassTrack",
  "readyState": "complete",
  "bodyText": "404\n\nThe requested page could not be found.",
  "rootHtml": "NO ROOT"
}
```

## 根因

该 404 不是 Capacitor 本地服务器错误页，也不是教务服务器响应，而是 **ClassTrack 自己渲染的 React Router 404 ErrorBoundary**。证据：该文本来自 `app/root.tsx` 的 `ErrorBoundary`：

```tsx
message = error.status === 404 ? '404' : 'Error'
details = error.status === 404 ? 'The requested page could not be found.' : error.statusText || details
```

完整链路：

1. `CourseImportActivity.java:42` 将 shell 指向 `https://appassets.androidplatform.net/index.html?native-shell=1`，路径为文件路径 `/index.html`。
2. shell WebView 使用 AndroidX `WebViewAssetLoader`，`PublicAssetsPathHandler` 把 `/index.html` 映射到 `assets/public/index.html`，静态文件本身**加载成功**（`readyState=complete`，`title=ClassTrack`）。
3. 但浏览器地址栏路径是 `/index.html`。React Router 客户端路由在 `app/routes.ts` 中只注册了 `/`（index）、`dashboard`、`course-management`、`substitute-management`、`data-management`、`profile`，**`/index.html` 不匹配任何路由**。
4. 路由匹配失败 → 抛出 404 route error → `root.tsx` 的 `ErrorBoundary` 接管整棵渲染树，输出 `404` + 英文提示。
5. 因为 ErrorBoundary 替换了 `App()`，`CourseImportShellEntry` 从不渲染，`CourseImportShell` 桥接、content slot、重试/返回/刷新控件全部不存在。

这同时解释了用户报告的全部现象：

| 现象 | 解释 |
|---|---|
| 白屏 | ErrorBoundary 输出的是纯白底两行文字页面 |
| 布局异常 | shell 的 React 外壳完全没有渲染，没有标题栏和 content slot |
| 无响应 | `window.CourseImportShell` 桥接未就绪，没有任何可点击控件 |
| 404 | 就是 React Router 的 404 路由错误页 |

## 为什么不能简单改成 `/`

AndroidX `WebViewAssetLoader.AssetsPathHandler.handle(path)` 直接 `openAsset(path)`，**不会**把目录路径补成 `index.html`（源码 `webkit-1.14.0-sources.jar`，`WebViewAssetLoader.java:183-194`）。

同时 `PathMatcher.getSuffixPath` 对 `mPath = "/"` 做 `path.replaceFirst("/", "")`，因此 URL `/` 传给 handler 的是空字符串 `""`，当前 `PublicAssetsPathHandler` 会把 `""` 变成 `"public/"`，`openAsset("public/")` 抛 `IOException`，返回空 body 的 404。

所以仅把 `SHELL_URL` 改成 `/?native-shell=1` 会得到一个**空白 404**，比现在更糟。必须同时让 `PublicAssetsPathHandler` 把空路径映射到 `public/index.html`。

## 影响面

- 需要改：`SHELL_URL` 路径、`isShellUrl()` 中 `"/index.html".equals(uri.getPath())` 的判定、`PublicAssetsPathHandler.handle` 的目录索引映射。
- 不需要改：`SHELL_HOST` 与 `isShellOriginUrl` 的安全边界、academic WebView、导航 allowlist、capture allowlist、parser、`importClasses`、Web/PWA 书签脚本。
- 主应用 WebView 走 Capacitor 本地服务器 `https://localhost/`，路径本来就是 `/`，不受影响，也说明修复不会改变 Web/PWA 行为。

## 次要发现（待评估）

主应用 `https://localhost/` 冷启动日志中存在与 shell 404 无关的资源问题：

```text
chromium: "Uncaught (in promise) non-precached-url: non-precached-url :: [{"url":"/index.html"}]"
chromium: "Uncaught (in promise) bad-precaching-response: bad-precaching-response :: [{"url":"https://localhost/favicon.ico","status":404}]"
Capacitor/Console: Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}
```

- `favicon.ico` 在 APK 资产中不存在，仅在浏览器/PWA 用于图标，不影响 app 功能。
- Workbox 预缓存清单与实际静态文件不完全一致；Service Worker 在 Capacitor 内运行本身收益有限。
- `DialogContent` 缺少 `aria-describedby` 是可访问性告警。

这些属于独立问题，是否在本任务内处理需要确认。

## 尚未验证

修复后仍需在真机/模拟器完成：shell 首帧、content slot 尺寸、academic 页面加载与登录、capture 成功路径、返回/刷新/重试/取消、旋转、IME、字体缩放，以及主应用各页面功能回归。
