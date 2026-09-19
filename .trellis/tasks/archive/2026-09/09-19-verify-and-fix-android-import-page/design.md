# 技术设计：修复 Android 教务导入页白屏、布局与 404

## 1. 现状与契约

### 1.1 相关组件

| 组件 | 位置 | 职责 |
|---|---|---|
| `CourseImportActivity` | `android/app/src/main/java/com/classtrack/app/CourseImportActivity.java` | 承载双 WebView、生命周期、安全边界 |
| `PublicAssetsPathHandler` | 同上（私有静态内嵌类） | 把 shell origin 的路径映射到 `assets/public` |
| AndroidX `WebViewAssetLoader` | 依赖 `androidx.webkit:1.14.0` | shell WebView 的本地资产服务 |
| Capacitor `WebViewLocalServer` | `@capacitor/android@8.5.1` | 主应用 WebView 的本地资产服务（host `localhost`） |
| `root.tsx` | `app/root.tsx` | React Router 根路由、`Layout`、`App`、`ErrorBoundary` |
| `routes.ts` | `app/routes.ts` | 客户端路由表 |
| `PwaUpdatePrompt` | `app/components/pwa/PwaUpdatePrompt.tsx` | 通过 `useRegisterSW()` 注册 Service Worker |

### 1.2 失败链路

```text
CourseImportActivity.onCreate
  → shellWebView.loadUrl("https://appassets.androidplatform.net/index.html?native-shell=1")
  → WebViewAssetLoader 命中 "/" 前缀 → PublicAssetsPathHandler("index.html")
  → assets/public/index.html 返回 200（文件本身正常）
  → 浏览器路径 = /index.html
  → React Router 路由表匹配 /index.html → 无匹配 → 404 route error
  → root.tsx ErrorBoundary 渲染整棵文档 → "404 / The requested page could not be found."
  → App() 不再渲染 CourseImportShellEntry → 桥接、content slot、操作按钮全部缺失
```

### 1.3 必须保持的既有边界

- shell 只允许 `https`、host `appassets.androidplatform.net`、默认端口、无 userinfo。
- shell 只允许加载自身 origin 的资源；其余一律 404（`blockedShellResource`）。
- shell 不允许导航离开自身 origin。
- academic WebView 的导航 allowlist 与 capture allowlist 不变。
- 数据流仍是 private `cacheDir` → `CourseImportPlugin` → parser → `importClasses`。

## 2. 设计决策

### D1：shell 引导路径改为 origin 根路径 `/`

**决定**：`SHELL_URL` 从 `https://appassets.androidplatform.net/index.html?native-shell=1` 改为 `https://appassets.androidplatform.net/?native-shell=1`。

**理由**：
- React Router 路由表以 `/` 作为 index 路由，浏览器路径必须是 `/` 才能匹配成功。
- 根路径是 Web 语义上的自然入口，与主应用 `https://localhost/` 的行为一致。
- 不需要改动任何 React 路由、组件或 Web/PWA 行为。

**代价**：`isShellUrl()` 的路径判定需要相应调整，见 D3。

**被否决的方案**：
- 在 `routes.ts` 中新增 `index.html` 路由：污染路由表，且让 web 端出现无意义路径。
- 把 Capacitor `server.hostname` 改成 `appassets.androidplatform.net`：改变主 WebView origin，会使既有用户 localStorage/IndexedDB 数据失配，风险不可接受。

### D2：资源处理器支持根路径 index 映射

**决定**：`PublicAssetsPathHandler.handle` 在 suffix path 为空或以 `/` 结尾时补 `index.html`。

**理由**：AndroidX `AssetsPathHandler.handle(path)` 直接 `openAsset(path)`，不会做目录索引（`webkit-1.14.0-sources.jar`，`WebViewAssetLoader.java:183-194`）；`PathMatcher.getSuffixPath` 对 `mPath="/"` 会把 URL `/` 变成空字符串 `""`，当前实现产出 `public/` 并抛 `IOException`，返回空 body 404。不补这一步，D1 会把当前 404 页面换成**空白** 404，问题更隐蔽。

**边界**：只影响空路径与以 `/` 结尾的路径；对 `index.html`、`assets/*.js` 等既有路径行为完全不变。

### D3：抽出可测的 shell URL 契约类

**决定**：新增 `CourseImportShellUrl.java`，承载：

```java
static final String SHELL_HOST = "appassets.androidplatform.net";
static final String SHELL_BOOT_PATH = "/";
static final String SHELL_QUERY = "native-shell=1";
static final String SHELL_URL = "https://" + SHELL_HOST + "/?native-shell=1";

static boolean isShellOriginUrl(String url);  // https + host + 默认端口 + 无 userinfo
static boolean isShellUrl(String url);        // 上面 + 根路径 + 精确 query
```

`CourseImportActivity` 改为调用这两个静态方法，删除自身重复实现。

**理由**：
- `CourseImportActivity` 继承 `AppCompatActivity`，在 JVM 单元测试中加载会受 android.jar stub 限制；把纯字符串契约独立出来才能被现有 JVM 测试套件覆盖。
- 单一事实来源，避免 URL 字面量与校验谓词漂移——这次缺陷正是两者都写死了 `"/index.html"`，改一处不改另一处就会静默失效。

**安全等价性**：`isShellOriginUrl` 的 scheme/host/port/userinfo 判定逐条保留；`isShellUrl` 只把 path 判定从 `/index.html` 换成根路径，并保留 query 精确匹配。

### D4：路径映射抽成可测纯函数

**决定**：新增 `PublicAssetPathResolver.java`：

```java
static String resolveSuffixPath(String suffixPath);   // "" | "/" | null → "index.html"
static String toAssetPath(String suffixPath);         // → "public/index.html"
```

`PublicAssetsPathHandler.handle` 委托给它。

**理由**：把「空路径补 index」这一回归点变成可离线断言的纯函数。

### D5：原生环境下不注册 Service Worker

**决定**：`root.tsx` 中 `PwaUpdatePrompt` 的渲染条件从 `!nativeShell` 收紧为 `!nativeShell && !isNativeApp()`，其中 `isNativeApp()` 来自新增的 `app/lib/native-platform.ts`，内部使用 `@capacitor/core` 的 `Capacitor.isNativePlatform()`，并对 SSR/非浏览器环境返回 `false`。

**理由**：
- 证据：`build/client/index.html` 没有任何注入式 SW 注册脚本，SW 注册完全来自 `PwaUpdatePrompt` 的 `useRegisterSW()`，因此门控该组件即可。
- Android WebView 中 Service Worker 发起的请求**不经过** `WebViewClient.shouldInterceptRequest`，无法被 Capacitor 的本地资产服务器满足，于是预缓存请求落到真实网络并 404，产生 `bad-precaching-response` 与连锁的 `non-precached-url`。
- 原生应用的静态资产已随 APK 离线可用，SW 不带来离线收益，只会引入第二层缓存与 Capacitor 资产服务冲突。
- Web/PWA 仍是浏览器场景，`isNativeApp()` 返回 `false`，SW 与更新提示行为保持不变。

### D6：跨语言契约用测试锁定

**决定**：三层测试共同锁定本缺陷：

1. **Vitest（本缺陷直接回归）**：`app/lib/native-shell-url.test.ts` 用 `matchRoutes` 对从 `app/routes.ts` 推导出的路由树断言——shell 引导路径 `/` 必须匹配到路由，`/index.html` 必须不匹配。修复前该用例失败，修复后通过。
2. **JVM**：`CourseImportShellUrlTest.java` 断言 `SHELL_URL` 的 scheme/host/port/path/query，断言 `isShellUrl` 接受自身 URL，并拒绝 `/index.html`、外部 host、http、带 userinfo、带端口、错误 query 等变体；`PublicAssetPathResolverTest.java` 断言空路径与 `/` 结尾路径补 `index.html`，且既有路径不变形。
3. **Node 静态契约**：扩展 `scripts/check-android-assets.js`，增加对 shell 引导路径的断言——`CourseImportShellUrl.SHELL_BOOT_PATH` 必须是根路径，`SHELL_URL` 中不得出现 `.html` 文件路径，且引导路径必须是 `app/routes.ts` 中 index 路由能匹配的路径。

**理由**：单靠 Vitest 无法发现 Java 常量被改坏；单靠 JVM 测试无法知道路由表。三者叠加才真正锁住「shell 引导路径必须同时满足原生资产映射与客户端路由匹配」这一契约。

## 3. 数据流（修复后）

```text
CourseImportPlugin.open
  → CourseImportActivity.startAcademic
  → shellWebView.loadUrl("https://appassets.androidplatform.net/?native-shell=1")
      → WebViewAssetLoader "/" 前缀匹配 → suffixPath ""
      → PublicAssetPathResolver → "public/index.html" → 200
      → 浏览器路径 "/" → React Router index 路由匹配
      → root.tsx App() 因 native-shell=1 渲染 CourseImportShellEntry
      → window.CourseImportShell.ready() → 桥接就绪
  → academicWebView.loadUrl(ENTRY_URL)  （allowlist 不变）
  → 捕获有效响应 → private cacheDir → CourseImportPlugin 回传 → parser → importClasses
```

## 4. 兼容性

- **Web/PWA**：`routes.ts`、`root.tsx` 的 `native-shell` 分支、Service Worker、书签脚本均不变。
- **既有原生用户数据**：主 WebView origin 仍为 `https://localhost`，localStorage/IndexedDB 不受影响。
- **academic 流程**：导航与捕获范围不变，login/CAPTCHA/菜单导航行为不变。
- **APK 资产门禁**：`pnpm android:check-assets` 的语义不变（仍要求 web build、同步目录与 APK 三方逐字节一致）。

## 5. 回滚形态

改动集中在 2 个新增 Java 类、1 处 Activity 接线、1 个新增 TS 模块、1 处 `root.tsx` 条件、3 组测试与 1 个校验脚本扩展。任一步失败可独立回滚：

- 若 shell 仍白屏：回滚 `CourseImportShellUrl` + `PublicAssetPathResolver` 接线，恢复原 `SHELL_URL`（会回到已知的 404 行为，不引入新故障）。
- 若 SW 门控影响 Web 端：回滚 `root.tsx` 条件与 `native-platform.ts` 即可。

## 6. 验证策略

见 `implement.md` 的分阶段校验命令与 `prd.md` 的 A/B/C/D 验收标准。设备侧验收必须在模拟器或真机完成，静态测试不替代。
