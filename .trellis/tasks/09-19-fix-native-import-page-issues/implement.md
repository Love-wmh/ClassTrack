# 实施计划：Android 模拟器回归与教务导入页修复

## 0. 进入执行前的审查门

- [ ] 用户明确批准本任务的最终规划摘要。
- [ ] 仅在批准后运行 `python3 ./.trellis/scripts/task.py start .trellis/tasks/09-19-fix-native-import-page-issues`。
- [ ] 开始编码前执行 `trellis-before-dev`，读取 native course import spec、frontend indexes、quality/type/state/component/hook guidelines 和 shared thinking guides。
- [ ] 变更边界保持为：fresh Android asset delivery + import shell/content-slot rendering + regression coverage；不扩大导航/capture allowlist 或 parser 范围。

## 1. 建立可重复的设备/构建基线

- [ ] 记录 `git status --short --branch`、commit、`adb version`、emulator version、AVD/API/WebView 版本和 `/dev/kvm` 状态。
- [ ] 运行 `pnpm cap:sync:android`，检查源码 `index.html`、同步资产和 manifest 的 hash/引用。
- [ ] 尝试使用当前可用的 Gradle 缓存构建 `:app:assembleDebug`；若失败，记录完整的权限、网络或依赖错误。
- [ ] 解压 fresh APK，验证 `assets/public/index.html` 和其引用的每个 `/assets/*` 文件存在，并记录 APK SHA-256。
- [ ] 若宿主有 KVM，启动 `Medium_Phone`；若 AVD 源目录只读，使用不改动源 AVD 的可写 clone。等待 `sys.boot_completed=1` 后执行 `adb devices -l`。
- [ ] 如果没有 KVM/设备，停止声称设备回归已完成，保存确切阻塞，继续静态/APK/单元验证。

## 2. 复现并保存证据

- [ ] 安装 fresh APK：`adb install -r <apk>`；清除旧安装数据，避免旧 shell asset 或旧 WebView 状态污染。
- [ ] 启动主 Activity，使用 UI dump/截图确定学校、导入方式、term/date 输入和应用内导入按钮的实际坐标或 resource-id。
- [ ] 场景 A：打开应用内导入页，截图首帧，检查 shell 标题、输入框、日期选择、操作区、状态卡、ActionBar 和触控边界。
- [ ] 场景 B：点击开始教务导入，截图 shell + academic WebView content slot，检查 chrome 高度、WebView 顶部 margin 和按钮是否仍可点击。
- [ ] 场景 C：若出现 404，保存错误态截图和经过脱敏过滤的 `ClassTrack.CourseImport`/WebView logcat；区分 shell asset 404、资源子请求 404、academic host 404 和 plugin error。
- [ ] 场景 D：执行返回、取消、重试、刷新；如可用，测试旋转、IME 和字体缩放，保存结果和截图。

## 3. 修复 404 根因

- [ ] 根据 APK/日志证据决定是旧 APK/未同步资产、AssetLoader root mapping、缺失 bundle，还是 academic URL；不要先放宽网络或 URL。
- [ ] 若是资产交付，修复 build/sync 顺序或加入最小的 APK asset consistency test/script；确保安装测试总是使用 fresh APK。
- [ ] 若是 `WebViewAssetLoader`/`PublicAssetsPathHandler`，保持 appasset origin-only、安全拒绝和缺失资源 404，修正 path/suffix/MIME/404 callback 的最小实现。
- [ ] 若是 academic 404，只在日志证明配置错误时修正显式入口或 path；更新对应 allowlist 测试和 spec，不接受 wildcard。
- [ ] 增加回归断言覆盖根 URL、关键 JS/CSS 资产和非安全 origin 不回退。

## 4. 修复显示异常与 content-slot

- [ ] 用截图和 layout/logcat 证据定位 shell 首帧、shellReady、状态更新、WebView visibility、height resize 或 topMargin 中的实际缺口。
- [ ] 修复 React shell 或 native layout 的最小范围问题；ClassTrack UI 继续只由 `CourseImportShell`/shadcn 渲染。
- [ ] 确认 initial/error/cancelled 为完整 shell + academic `GONE`，active 为 bounded shell chrome + academic content slot，操作区不被 academic WebView 覆盖。
- [ ] 增加或更新 React/Java 单元测试，覆盖显示状态、contentSlotActive、resize bound、retry/back/cancel 和资源错误恢复。
- [ ] 保持 session/nonce/callback gating、private file handoff、parser/importClasses、Web/PWA fallback 不变。

## 5. 验证与安全审计

- [ ] `pnpm test`
- [ ] `pnpm typecheck`
- [ ] `PATH="$(pwd)/node_modules/.bin:$PATH" pnpm exec eslint . --report-unused-disable-directives --max-warnings 0`
- [ ] `pnpm format:check`
- [ ] `pnpm build`
- [ ] `pnpm cap:sync:android`
- [ ] `git diff --check`
- [ ] Android `./gradlew :app:testDebugUnitTest` 和 `:app:assembleDebug`（能运行时）；若不能运行，保留确切错误。
- [ ] 解压最终 APK 再做资产一致性检查；如有设备，重装最终 APK 后重复场景 A-D。
- [ ] 检查所有 `Log`、console bridge、Intent extras、shell state 和任务输出，确认无账号、密码、Cookie、Authorization、query、fragment、表单值、响应正文或 raw JSON。
- [ ] 使用 `trellis-check` 做 spec、cross-layer、security、tests、build 和 fallback 全量检查。

## 6. 完成门

- [ ] 设备截图/日志证据完整，或 KVM/设备阻塞已明确记录且没有把静态结果冒充设备验收。
- [ ] 用户 review 最终行为与已知限制。
- [ ] 运行 `trellis-update-spec`，仅在发现可复用的 404/asset 或 content-slot 契约时补充 spec。
- [ ] 提交实现 commit；随后使用 `trellis-finish-work` 记录日志并归档任务。

## 风险与回滚点

- APK 资产检查和代码修复分开提交/检查；若布局修复引入 regressions，可先回滚布局 diff，保留资产证据。
- 不修改源 AVD；只使用 `/tmp` clone。设备启动失败时清理临时 clone/进程，不删除用户 AVD。
- 若 404 仅因 stale APK，优先修复验证/打包流程，不改变 `WebViewAssetLoader` 的安全 origin 逻辑。
- 若真实设备证明 fixed content slot 在特定旋转/IME/inset 下不可维持，按 spec 记录显式降级并保留安全 shell，不扩大为重写 UI 架构。
