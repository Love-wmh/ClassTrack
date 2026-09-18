# 最终架构决策：按“完全一致”验收的推荐形态

## 决策

用户已明确选择“两边完全一致”。因此最终验收不能采用“remote WebView 全屏、React shell 只在加载/错误时切回”的纯可见性切换版；那只能是白屏修复的中间里程碑。最终推荐是：

> **一个 `CourseImportActivity`、两个 WebView、一个 native session controller；React/shadcn shell 始终负责 ClassTrack chrome，受限 academic WebView 位于 shell 的内容槽内。**

布局由 Activity 的 `FrameLayout` 组合，但 ClassTrack-owned chrome 不由 Java 绘制：

```text
CourseImportActivity / FrameLayout
  ├─ React shell WebView (appassets origin)
  │    ├─ shadcn header: 返回/刷新/当前阶段
  │    ├─ shadcn status/error/success cards
  │    └─ transparent/content slot region
  └─ academic WebView (restricted HTTPS navigation)
       └─ JinZhi login/CAS/验证码/课表页面
```

更低风险的实现方式是让 shell React bundle 只渲染固定高度的 chrome 与状态层，native 依据已测量/约定的 content-slot bounds 放置 academic WebView；不要让整个 shell WebView 透明覆盖 academic 内容并拦截触摸。若实现 spike 证明动态 slot bounds 在旋转、字体缩放、键盘和 safe-area 下不可靠，则退回“shell/academic 切换可见性”的安全降级，但必须在设计文档和验收记录中标明“不满足 remote 页面期间持续 chrome 的严格版本”。

## 为什么不是其他方案

- **单 WebView 页面切换**：登录态和 hook 最简单，但切到 JinZhi 后 React shell 被替换，不能满足持续一致的 ClassTrack chrome；还会把 shell bridge 暴露给 remote page。
- **Android 原生外壳**：最容易修白屏，但 Java 默认控件无法复用 shadcn；token 对齐只能是近似，不满足用户选择。
- **Capacitor 主 WebView 路由**：若直接导航 remote，可能把 Capacitor bridge 带到第三方页面；若另加 child WebView，实质上是更侵入主 Activity 的双 WebView，收益不如独立导入 Activity。
- **iframe/跨源 fetch**：不能可靠获得 JinZhi 页面 Cookie、DOM 或 XHR/fetch 结果，也不符合已归档研究结论。

## UI/bridge 分工

### React shell WebView

- 复用 `app/components/ui/*` 与 `app/app.css`；抽取 `CourseImportShell`，供主 `InAppImportStep` 与 native shell entry 共用。
- 只接收固定 `state`, `errorCode`, `messageKey`, `safePath?`；不接收 raw JSON、Cookie、Authorization、表单值或完整 URL。
- 只发 `ready`, `retry`, `refreshAcademic`, `back`, `requestImport` 等 typed commands；不能指定任意 URL、target path 或脚本。
- 在 loading、blocked navigation、network/SSL/HTTP error、capture timeout、success/cancel 上显示可恢复 shadcn 状态。

### Academic WebView

- 保留登录、验证码、菜单和课表操作的同一个 WebView 实例与 Cookie/DOM storage。
- 只允许显式配置的 HTTPS navigation hosts；金智目标接口 capture 仍只允许精确 `jwxt.tjut.edu.cn` + `TARGET_PATH`。
- `onPageFinished` 后幂等注入 `ScheduleCaptureScript`；XHR/fetch candidate 先在脚本和 native 两端筛选。
- 只暴露独立的 capture bridge；native 必须根据 top-level page host、target URL、session token、大小和 JSON marker 再校验。

## 状态与数据边界

```text
native controller state
  -> shell status enum / safe message
academic WebView request
  -> XHR/fetch hook
  -> native validator (target host/path/size/JSON)
  -> in-memory candidate
  -> user requestImport
  -> private cache file
  -> Activity Result { private path, sanitized source URL }
  -> CourseImportPlugin reads/deletes
  -> existing TypeScript parser + importClasses
```

Shell 与 academic WebView 之间不直接通信；两者都只与 native controller 通信。成功/失败时 shell 只知道状态，课程 JSON 不进 DOM、localStorage、console 或 React state。

## 资产加载决策

- 优先使用 `WebViewAssetLoader` 的 `https://appassets.androidplatform.net/...` app-owned origin，继续关闭 file/content access；不要把 `file://` 当作 shell 方案。
- 先做 asset-loading spike：`pnpm build` 和 `cap sync android` 后确认 shell HTML、hashed JS/CSS、Geist 字体、Lucide 图标和 Tailwind/shadcn variables 可由自定义 Activity 加载。自定义 Activity 不会自动获得 MainActivity 的 Capacitor bridge，所以 shell 使用窄的 `CourseImportShell` bridge。
- 以专用 route 或独立 Vite entry 产生 shell；不得手工复制生成 HTML 到 Java，也不得提交同步生成的 `android/app/src/main/assets/public`。

## 最终验收特有测试

1. **视觉/布局**：shell chrome 在首次加载、academic 登录、课表导航、HTTP/SSL/网络错误、capture timeout、成功和取消阶段保持同一 tokens；content slot 在 portrait/landscape、字体缩放、IME、刘海/导航栏 inset 下不遮挡 JinZhi 页面。
2. **登录态**：从 login -> CAS -> 验证码 -> schedule 始终使用同一个 academic WebView；shell 的 fetch/刷新不能代替 academic fetch。
3. **安全**：unknown host、HTTP、非默认端口、userinfo、外部 intent 被阻止并显示 shell 错误；允许 auth host 不会令任意 host/target path 可捕获。
4. **桥接**：remote page 不能触发 shell commands；shell 不能提交任意 URL/body；bridge message 只包含固定 enum/安全 path。
5. **生命周期**：返回先处理 academic history，再回到 shell/取消；刷新不重复 hook；旋转/重建不产生 attached-to-window destroy 警告或并发 Activity Result。
6. **数据回归**：成功 body 只沿 private cache + existing parser/importClasses 路径，backup/parser/bookmarklet 和 Web/PWA native option 过滤不变。

## 与中间里程碑的关系

实现顺序可先修现有单 academic WebView 的导航诊断和 detach-before-destroy，用来验证真实 CAS host/白屏根因；这不是最终 UI 架构。随后做 shell asset spike，再接入双 WebView fixed-chrome。若资产 spike 或 slot layout 受环境阻塞，应明确记录为验收阻塞，不应把 Java token 近似外壳误报为“完全一致”。
