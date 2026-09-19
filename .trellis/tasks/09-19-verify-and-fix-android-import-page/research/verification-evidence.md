# 设备验收证据

环境：Android Emulator `37.1.11.0`，AVD `Medium_Phone`，Android `37.1` `google_apis_playstore_ps16k` `x86_64`，宿主具备 `/dev/kvm`，WebView `151.0.7922.199`，screen 1080x2400 @ DPR 2.625。

安装包：`android/app/build/outputs/apk/debug/app-debug.apk`，SHA-256 `62e183fd328a50d669e4c5915bfe3b64c02b278e6081be3cd1d40276f7e81f87`。
资源校验：`pnpm android:check-assets` 通过，245 个资源、27 个 index 引用。

所有截图保存在 `/tmp/ct-fix-*.png`，不入库。日志仅保留 `ClassTrack.CourseImport`、`Capacitor` 与 WebView 相关行，已确认不含账号、密码、Cookie、Authorization、表单值、响应正文或原始 JSON。

## A 组：修复验收

| 项 | 结论 | 证据 |
|---|---|---|
| A1 shell 首帧渲染外壳，无 React Router 404 | 通过 | shell URL 为 `https://appassets.androidplatform.net/?native-shell=1`；`bodyText` 为真实外壳文案，不再出现 `The requested page could not be found.`；截图 `/tmp/ct-fix-03-native.png` |
| A2 标题/状态/输入/操作按钮可见可点 | 通过 | DOM 按钮为 `2026年09月01日`、`返回`、`刷新`、`打开教务系统`、`取消`；ready 态为 `返回`、`刷新`、`请求导入`、`取消` |
| A3 桥接就绪，content slot 尺寸上报 | 通过 | `window.CourseImportShell` 暴露 `back`、`cancel`、`ready`、`refreshAcademic`、`requestImport`、`resize`、`retry`、`startAcademic`；academic 可见后 content slot 生效 |
| A4 academic 加载教务页面 | 通过 | `navigation_started allowed=true url=https://authserver.tjut.edu.cn/authserver/login` 且 `page_finished progress=100`；截图 `/tmp/ct-fix-05-academic.png` 中 CAS 登录表单可交互 |
| A5 返回/刷新/重试/取消 | 通过（重试未点击） | 刷新后 shell 存活；返回 → `phase=back_pressed` → `phase=cancelled` → `phase=activity_destroyed`；取消同路径；重试在失败态渲染为唯一按钮并有测试覆盖，但未在设备上点击 |
| A6 旋转/布局不重叠 | 部分验证（仅旋转） | 横屏截图 `/tmp/ct-fix-07-landscape.png` 中标题、状态卡片与四个按钮完整，无裁切；竖屏 `/tmp/ct-fix-08-portrait.png`。软键盘弹出与系统字体缩放**未验证**，见「未完成与残留」 |
| A7 无 shell 引导失败与销毁告警 | 通过 | shell 引导的 `console_error level=ERROR`（`TypeError: window.__classTrackNativeState is not a function`）已消除；`grep -ic 'WebView.destroy() called while WebView is still attached'` = 0 |

### A7 残留（非失败）

修复后 shell 仍产生一条 `phase=console_error level=LOG category=script line=2 url=https://appassets.androidplatform.net/`。经 CDP console 捕获确认其内容为 React Router 注入到 `index.html` 的开发提示：

```text
💿 Hey developer 👋. You can provide a way better UX than this when your app is loading JS modules
and/or running `clientLoader` functions. ...
```

这是 `LOG` 级别的框架提示，不是引导失败。已在本任务中保留原样，未改动应用渲染行为。

### 修复前/后对照

| 项 | 修复前 | 修复后 |
|---|---|---|
| shell URL | `https://appassets.androidplatform.net/index.html?native-shell=1` | `https://appassets.androidplatform.net/?native-shell=1` |
| shell 画面 | 整屏白底 `404` + 英文提示 | 完整 ClassTrack 外壳 |
| 桥接 | 不存在 | 8 个方法就绪 |
| CAS 登录页 | 被 allowlist 拦截（`reason=host`） | `allowed=true`，加载到 100% |
| shell console ERROR | `TypeError: __classTrackNativeState is not a function` | 无 |

## B 组：资源 404 验收

| 项 | 结论 | 证据 |
|---|---|---|
| B1 无 Workbox 预缓存失败 | 通过 | `adb logcat -d` 中 `non-precached-url` 与 `bad-precaching-response` 计数为 0 |
| B2 原生内不注册 Service Worker，Web 端保留 | 通过 | 日志中不再出现 `Handling local request: https://localhost/sw.js` 与 `workbox-2fbc6a65.js`；Web/PWA 构建未做改动，`PwaUpdatePrompt` 在非原生环境仍渲染 |
| B3 favicon 不再 404 | 通过 | `favicon.ico` 由 `Capacitor: Handling local request` 正常处理，无 404 记录 |

## C 组：功能回归

| 项 | 结论 | 证据 |
|---|---|---|
| C1 四个底部页签 | 通过 | 依次得到 `/dashboard`（数据看板）、`/course-management`（课程管理）、`/substitute-management`（代课管理）、`/`（课程表），均正常渲染，无白屏 |
| C2 导入三步流程 | 通过 | 来源 → 应用内导入 → 原生 shell，全流程走通至 academic 可操作态 |
| C3 核心操作 | 部分验证 | 学校选择在应用进程被模拟器回收后仍保留，说明 store 持久化正常；未逐一验证课程手动增删改 |
| C4 JSON 上传与备份导入入口 | 未验证 | 未在设备上打开这两个入口 |

## D 组：自动化回归

| 项 | 结论 | 证据 |
|---|---|---|
| D1 shell 引导路径必须匹配客户端路由 | 通过 | `app/lib/native-shell-url.test.ts`，临时把引导路径改回 `/index.html` 时该用例失败，恢复后通过 |
| D2 资源处理器根路径 index 映射契约 | 通过 | `PublicAssetPathResolverTest`（2 例）、`CourseImportShellUrlTest`（3 例） |
| D3 原生不注册 SW / Web 仍注册 | 通过 | `app/lib/native-platform.test.ts` |
| D4 前端与脚本门禁 | 通过 | `pnpm test` 9 文件 29 例、`pnpm test:android-assets` 4 例、`pnpm typecheck`、本地 ESLint 10、`pnpm format:check`、`pnpm build`、`pnpm android:check-assets`、`git diff --check` |
| D5 Android JVM 单测 | 通过 | `:app:testDebugUnitTest` BUILD SUCCESSFUL，7 个测试类 15 例 0 失败 |

## 顺带发现并修复的缺陷

1. **CAS 登录 host 未在导航 allowlist 中**（阻断登录）。设备证据显示金智入口页会 CAS 跳转到独立 host `authserver.tjut.edu.cn`，而原策略只允许 `jwxt.tjut.edu.cn`。已改为显式 host + path 前缀配对清单，新增 `authserver.tjut.edu.cn` + `/authserver`，同时收紧为不再与其它 host 共享路径前缀。
2. **失败态重复「重试」按钮**。`status === 'failed'` 时 outline 按钮与主按钮都渲染 `重试`，而被替换掉的 `刷新` 在该状态下本就是禁用的，因此去重不损失能力。现失败态为 `返回` / `重试` / `取消`。
3. **原生过早调用 shell 状态回调**。`updateShellState()` 在 React 注册 `window.__classTrackNativeState` 之前调用它，抛 `TypeError` 并丢失首次状态推送。现改为仅当该函数存在时调用，由 `ready()` 触发权威推送。

## 未完成与残留

- C3 的课程增删改、C4 的 JSON 上传与备份导入入口未在设备上验证。
- A5 的「重试」按钮未在设备上点击（仅有失败态渲染与组件测试覆盖）。
- 软键盘弹出与系统字体缩放未单独截图验证（A6 只覆盖了旋转）。
- 模拟器可用内存约 2.5GB，回归过程中 `com.classtrack.app` 进程曾被系统回收重启一次；相关场景已重跑，结论不受影响。
- CAS 页面自身存在子资源 404（例如 `https://authserver.tjut.edu.cn/authserver/tjutTheme10/static/mobile/img/eyehide.png`，`mainFrame=false`），属教务侧静态资源，不在本任务范围。
- 登录后的课表捕获成功路径未验证，因为没有可用的测试账号。
