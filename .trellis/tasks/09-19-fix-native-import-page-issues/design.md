# 技术设计：教务导入页 Android 回归与 404/显示修复

## 1. 设计边界

本任务只修复当前天津理工 native import 的可见性和本地 shell 资源交付问题。`CourseImportPlugin`、`CourseImportActivity`、本地 React shell、受限 academic WebView 和现有 parser 数据流继续保留；不把 academic 页面的任意网络内容交给 React shell。

最小行为缺口是：用户打开导入 Activity 时必须稳定看到有效的 ClassTrack shell，并且 shell 的所有静态资源必须从 fresh APK 的 `assets/public` 返回；开始教务导航后，academic WebView 只能占据 shell chrome 下面的 content slot，不能遮挡 shell 操作区。

## 2. 当前数据流与验证点

```text
React ImportDialog
  -> Capacitor CourseImport.open(adapterId, entryUrl, term, firstWeekStartDate)
  -> CourseImportActivity
       -> WebViewAssetLoader + shell WebView
            -> https://appassets.androidplatform.net/index.html?native-shell=1
       -> restricted academic WebView
            -> explicit navigation policy
            -> capture script / exact endpoint validator
  -> private cacheDir response file
  -> CourseImportPlugin
  -> existing Tianjin parser + importClasses
```

回归时按以下边界检查：

1. `pnpm cap:sync:android` 后，`android/app/src/main/assets/public/index.html` 与 `/assets/*` 依赖是同一 build 产物。
2. Android APK 中存在同名 `assets/public/index.html` 和所有静态引用资源；安装的 APK 校验和与检查对象一致。
3. shell WebView 对 root URL 的 `shouldInterceptRequest` 进入 `WebViewAssetLoader`，资源缺失时返回受控 404；非 `appassets.androidplatform.net` origin 不得网络回退。
4. shell 的 `onPageFinished` 只在安全 origin 成功时设置 `shellReady`，状态通过固定字段送到 React；资源错误不会把 raw URL/body 放进 bridge。
5. initial/error/cancelled 时 academic WebView `GONE` 且 shell 为完整容器；active 状态 shell 只保留自然 chrome 高度，academic WebView 的 top margin 等于 shell 高度。
6. shell 的 `ResizeObserver`/`resize` 只上报 bounded height；native 更新布局时不得出现 full-screen academic WebView 覆盖 shell。

## 3. 404 诊断与修复策略

按证据顺序处理，禁止先放宽 origin 或 URL：

- **旧 APK / 未同步资产**：比较源码 `index.html`、Capacitor 同步目录、APK zip entries、APK mtime/hash；若不一致，修复构建/安装顺序或添加资产一致性检查。
- **AssetLoader 映射失败**：检查 `WebViewAssetLoader.Builder` path、`PublicAssetsPathHandler` suffix、MIME、返回的 `WebResourceResponse` 和 `onReceivedHttpError`；必要时将映射改成清晰的 `/` 或显式 `/assets/`/root handler，但保持只读 APK asset 映射与非安全 origin 拦截。
- **资源依赖遗漏**：解析 fresh `index.html` 的 `src`/`href`，逐一确认 APK entries 存在；不可通过网络加载缺失 bundle 来掩盖打包问题。
- **academic 404**：若 logcat 显示 404 实际来自 academic host，保留 shell 资产策略，按导航 allowlist 和 page error 分类处理；只有真实设备的脱敏证据证明入口/路径配置错误时才提出最小显式配置调整。

所有候选修复必须同时有一个自动检查或单元测试，且不得将 query、fragment、Cookie、Authorization 或响应正文记录到日志。

## 4. 显示/布局修复策略

- 继续复用 `CourseImportShell` 和 shadcn 组件；Java 只管理两个 WebView 的位置与生命周期。
- 初始/错误/取消：shell `MATCH_PARENT`、academic `GONE`。
- active：shell height 使用最近一次 bounded `resize` 值，未收到值时使用最小 fallback；academic `VISIBLE`，顶部 margin 为 shell height，操作区不在 academic WebView 范围内。
- 处理资源加载失败时，shell 仍显示可恢复错误，而不是让空白 WebView 占据 Activity；`shellReady` 与状态更新必须具备 destroyed/session guard。
- 对窄屏 portrait、旋转、IME、字体缩放检查操作区是否仍可见和可点击。若固定 slot 在真实设备上不可靠，采用 spec 已允许的显式 visibility-switching downgrade，并记录触发条件，不扩大本任务范围。

## 5. 兼容性与安全

- 保持 `/jwapp/sys/wdkb` 和 `/authserver` 导航 allowlist 与精确课表 endpoint capture allowlist 分离。
- 不允许任意远程 shell、`file:`、`content:`、HTTP、userinfo、非默认端口或路径穿越。
- 不改变 private cache file → plugin → parser/`importClasses` 数据流。
- `onDestroy`、retry、back、cancel 的顺序仍为 invalidate callback/session → stop loading → remove interface/client → detach → destroy。
- 设备验收失败时，不用前端测试代替；记录 KVM/Gradle/adb 的精确阻塞。

## 6. 回滚与可观测性

- 每个代码变更保持单一职责，优先回滚到 `dd7e2e3` 再重新应用最小修复。
- 临时 APK、截图和脱敏 logcat 放在任务 research 目录或外部临时目录，避免把账号/响应数据提交到仓库。
- 诊断只保留安全 host/path、HTTP 状态、错误分类、进度、字节数和布尔值；不得用异常文本或 `WebResourceRequest` 原文作日志。
