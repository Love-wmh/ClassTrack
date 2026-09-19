# 实施计划：修复 Android 教务导入页白屏、布局与 404

任务目录：`.trellis/tasks/09-19-verify-and-fix-android-import-page`
基线 commit：`e1a10a3`
分支：`fix/native-import-white-screen-ui`
根因证据：`research/native-shell-404-root-cause.md`

## 阶段 0：准备

- [ ] 0.1 确认工作树干净、分支正确；记录 `git rev-parse HEAD` 作为回滚点
- [ ] 0.2 确认模拟器可启动且 fresh APK 可通过 `pnpm android:check-assets`

**校验**

```bash
git status --short
git rev-parse HEAD
pnpm android:check-assets
adb devices -l
```

**回滚点**：`git reset --hard <阶段0记录的 HEAD>`

## 阶段 1：修复 shell 引导路径（P1 根因）

- [ ] 1.1 新增 `android/app/src/main/java/com/classtrack/app/CourseImportShellUrl.java`
      - `SHELL_HOST = "appassets.androidplatform.net"`
      - `SHELL_BOOT_PATH = "/"`
      - `SHELL_QUERY = "native-shell=1"`
      - `SHELL_URL = "https://" + SHELL_HOST + SHELL_BOOT_PATH + "?" + SHELL_QUERY`
      - `isShellOriginUrl(String)`：保留 https + host + 默认端口 + 无 userinfo 判定
      - `isShellUrl(String)`：`isShellOriginUrl` 且 path 为根路径且 query 精确等于 `SHELL_QUERY`
      - 不得扩大 scheme、host、端口、路径或 query 的允许范围
- [ ] 1.2 新增 `PublicAssetPathResolver.java`
      - `resolveSuffixPath(null | "" | "/")` → `index.html`
      - 以 `/` 结尾的路径补 `index.html`
      - 其余路径原样返回（保持 `index.html`、`assets/*.js` 等行为不变）
      - `toAssetPath(suffixPath)` → `"public/" + resolveSuffixPath(suffixPath)`
- [ ] 1.3 改造 `CourseImportActivity`
      - 删除本地 `SHELL_URL`、`SHELL_HOST`、`isShellOriginUrl`、`isShellUrl` 重复实现，改用 `CourseImportShellUrl`
      - `PublicAssetsPathHandler.handle` 委托 `PublicAssetPathResolver.toAssetPath`
      - 不改动 academic WebView、导航 allowlist、capture 校验、生命周期与数据流

**校验**

```bash
cd android && ./gradlew :app:compileDebugJavaWithJavac
```

**回滚点**：`git checkout -- android/app/src/main/java/com/classtrack/app/CourseImportActivity.java && rm -f` 新增的两个类

## 阶段 2：修复原生环境 Service Worker（P2）

- [ ] 2.1 新增 `app/lib/native-platform.ts`
      - `isNativeApp()`：浏览器环境用 `@capacitor/core` 的 `Capacitor.isNativePlatform()`；SSR/无 `window` 返回 `false`
- [ ] 2.2 `app/root.tsx` 把 `PwaUpdatePrompt` 的渲染条件收紧为 `!nativeShell && !isNativeApp()`
      - 不改变 `native-shell` 语义
      - 不改变 Web/PWA 的 SW 与更新提示行为

**校验**

```bash
pnpm typecheck
pnpm build
grep -c "registerSW\|sw.js" build/client/index.html || true
```

**回滚点**：`git checkout -- app/root.tsx && rm -f app/lib/native-platform.ts`

## 阶段 3：自动化回归测试（P3）

- [ ] 3.1 新增 `app/lib/native-shell-url.test.ts`
      - 用 `matchRoutes` 对从 `app/routes.ts` 推导的路由树断言：shell 引导路径匹配到路由
      - 断言 `/index.html` 不匹配任何路由（锁死本次缺陷）
      - 断言 shell URL 携带 `native-shell=1`
- [ ] 3.2 新增 `android/app/src/test/java/com/classtrack/app/CourseImportShellUrlTest.java`
      - 断言 `SHELL_URL` 的 scheme/host/port/path/query
      - 断言 `isShellUrl` 接受自身 URL
      - 断言 `isShellUrl` 拒绝：`/index.html`、http、外部 host、带端口、带 userinfo、错误 query、空值
      - 断言 `isShellOriginUrl` 对同 origin 的其他路径仍返回 true（资源子请求依赖它）
- [ ] 3.3 新增 `PublicAssetPathResolverTest.java`
      - 空、`""`、`"/"` → `public/index.html`
      - `"assets/app.js"` → `public/assets/app.js` 不变形
      - `"nested/"` → `public/nested/index.html`
- [ ] 3.4 新增 `app/lib/native-platform.test.ts`
      - Web 环境返回 false；原生环境返回 true
- [ ] 3.5 扩展 `scripts/check-android-assets.js`
      - 断言 `CourseImportShellUrl.SHELL_BOOT_PATH` 为根路径
      - 断言 `SHELL_URL` 中不出现 `.html` 路径
      - 断言引导路径能被 `app/routes.ts` 的 index 路由匹配
      - 断言失败信息不得回显敏感内容

**校验**

```bash
pnpm test
pnpm test:android-assets
cd android && ./gradlew :app:testDebugUnitTest
```

**回滚点**：删除新增测试文件并 `git checkout -- scripts/check-android-assets.js`

## 阶段 4：全量静态校验

- [ ] 4.1 `pnpm test`
- [ ] 4.2 `pnpm test:android-assets`
- [ ] 4.3 `pnpm typecheck`
- [ ] 4.4 本地 ESLint 10：`PATH="$(pwd)/node_modules/.bin:$PATH" pnpm exec eslint . --report-unused-disable-directives --max-warnings 0`
- [ ] 4.5 `pnpm format:check`
- [ ] 4.6 `pnpm build`
- [ ] 4.7 `pnpm cap:sync:android`
- [ ] 4.8 `pnpm cap:build:android`（含 `android:check-assets`）
- [ ] 4.9 `cd android && ./gradlew :app:testDebugUnitTest`
- [ ] 4.10 `git diff --check`

## 阶段 5：设备验收（P1/A 组 + B 组 + C 组）

- [ ] 5.1 安装 fresh APK 并清数据冷启动
      ```bash
      adb install -r android/app/build/outputs/apk/debug/app-debug.apk
      adb shell pm clear com.classtrack.app
      adb logcat -c
      adb shell am start -W -n com.classtrack.app/.MainActivity
      ```
- [ ] 5.2 主应用冷启动截图与日志：确认无 `non-precached-url`、无 `bad-precaching-response`（B1、B2、B3）
- [ ] 5.3 底部四个页签切换截图（C1）
- [ ] 5.4 走导入流程到「应用内导入」并点击「打开教务系统并导入」
      - 截图确认 shell 首帧渲染 ClassTrack 外壳而非 404（A1、A2）
      - 通过 CDP 确认 `window.CourseImportShell` 存在且 content slot 尺寸非零（A3）
- [ ] 5.5 确认 academic WebView 加载教务页面或明确错误态（A4）
- [ ] 5.6 依次验证返回、刷新、重试、取消（A5）
- [ ] 5.7 旋转、弹出软键盘、调整字体缩放后截图确认无重叠裁切（A6）
- [ ] 5.8 采集脱敏 logcat，确认无 shell 引导 `console_error`、无 `WebView.destroy() called while WebView is still attached`（A7）
- [ ] 5.9 手动新建/编辑课程、JSON 上传与备份导入入口可用性（C3、C4）

**证据要求**

- 截图保存在 `/tmp`，仅记录关键结论与路径，不写入仓库大文件
- logcat 只保留 `ClassTrack.CourseImport`、`Capacitor`、WebView 相关行，且必须确认不含凭据、Cookie、表单值、响应正文或原始 JSON
- 若某一场景在模拟器上无法完成（例如需要真实账号），如实记录为未验证，不得声称通过

## 阶段 6：收尾

- [ ] 6.1 更新 `.trellis/spec/frontend/native-course-import.md`，写入 shell 引导路径契约与原生 SW 约定
- [ ] 6.2 更新 `README.md`（若命令或流程有变化）
- [ ] 6.3 在任务目录补 `research/verification-evidence.md`，记录 A/B/C 组实测结果
- [ ] 6.4 提交实现 commit
- [ ] 6.5 Trellis finish：journal、归档任务

## 与阶段 2 的接口

`isShellUrl` 与 `isShellOriginUrl` 从 `CourseImportActivity` 迁出后必须保持行为等价，唯一差异是 path 判定由 `/index.html` 改为根路径。阶段 3.2 的测试是本条的验证手段。

## 已知风险与对策

| 风险 | 对策 |
|---|---|
| 改路径后 asset loader 仍 404 | 阶段 1.2 的 index 映射与阶段 3.3 的测试；阶段 5.4 的截图兜底 |
| `isShellUrl` 放宽导致安全边界削弱 | 阶段 3.2 的负向用例（http、外部 host、端口、userinfo、错误 query、`/index.html`） |
| `isShellOriginUrl` 被误改导致 shell 静态资源被拦成 404 | 阶段 3.2 显式断言同 origin 的 `assets/*` 路径仍为 true |
| 关闭 SW 破坏 Web/PWA 离线 | 阶段 3.4 断言 Web 环境返回 false；阶段 5.2 在 Web 构建上确认 SW 仍注册 |
| 模拟器内存不足导致长流程回归中断 | 先停 Gradle 守护进程释放内存；如实记录未完成场景 |

## 执行状态（收尾时追加）

已完成：阶段 0、1、2、3、4 全部条目；阶段 5 的 5.1–5.8；阶段 6 的 6.1、6.3。
未完成：5.9（C3 课程增删改、C4 JSON 上传与备份导入入口）、5.7 中的软键盘与字体缩放单独验证、5.6 中「重试」按钮的设备点击。未完成原因见 `research/verification-evidence.md` 的「未完成与残留」。

阶段 5 期间新增并修复了三个计划外的真实缺陷，均已纳入本任务：

1. CAS 登录 host `authserver.tjut.edu.cn` 不在导航 allowlist 中，导致登录页被拦截、导入无法完成。按 spec 要求以显式条目加入，并把 allowlist 收紧为 host + path 配对。
2. 失败态渲染两个重复的「重试」按钮。
3. 原生在 React 注册前调用 `window.__classTrackNativeState`，抛 `TypeError` 并丢失首次状态推送。

偏差说明：原计划阶段 2 只处理 Service Worker 与 `favicon.ico`，实际排查中确认 `favicon.ico` 的 404 来自 Service Worker 预缓存请求，关闭原生 SW 后即消失，未额外改动静态资源。
