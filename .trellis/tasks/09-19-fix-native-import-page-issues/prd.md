# 回归并修复教务导入页显示异常与 404

## Goal

在 Android 上真实启动 ClassTrack，进入天津理工大学应用内教务导入流程，使用截图和脱敏 logcat 复现并修复两个已知问题：

1. 打开教务导入页后 ClassTrack 自有 UI 显示不正常（白屏、布局错位、内容槽不可见或触控区域异常）。
2. 打开教务导入页直接显示 404。

修复后，用户应能看到打包的 React/shadcn 导入 shell；在点击开始后，受限 academic WebView 应显示在 shell 的 content slot 中。现有 Web/PWA 导入、天津理工 parser、`importClasses` 和学期/第一周日期数据流必须保持不变。

## Background / confirmed facts

- 当前分支为 `fix/native-import-white-screen-ui`，上一轮实现已提交为 `dd7e2e3`；工作树在本任务开始时干净。
- 当前 native 入口为 `CourseImportPlugin` → `CourseImportActivity`；Activity 使用本地 React shell WebView 和受限 academic WebView。
- shell 设计 URL 为 `https://appassets.androidplatform.net/index.html?native-shell=1`，由 `WebViewAssetLoader` 映射到 `android/app/src/main/assets/public/`。
- 当前 `PublicAssetsPathHandler` 将匹配到的 suffix 映射为 `public/<suffix>`，并且 shell WebView 对非 appasset origin 返回 404/阻止网络回退。
- 本地已有 `android/app/build/outputs/apk/debug/app-debug.apk`，但其时间戳早于当前 `android/app/src/main/assets/public/index.html`；不能用旧 APK 判断当前 shell 资产是否正确打包。
- 当前环境发现 AVD `Medium_Phone` 和 emulator 工具，但宿主 `/dev/kvm` 不存在；运行 x86_64 AVD 会失败：`x86_64 emulation currently requires hardware acceleration` / `/dev/kvm is not found`。原始 AVD 所在目录也为只读，因此实验性启动需要使用 `/tmp` 的可写 AVD clone；即便如此，当前宿主缺少硬件加速，设备验收仍被阻塞。
- 远程 `K8s-1` 主机同样没有 `/dev/kvm`，且没有可用 Android emulator/adb；不能把它当作本机模拟器替代。
- 已存在的 native-course-import spec 要求：导航 allowlist 与精确 capture allowlist 分离；不传递 raw URL/query/body/Cookie/Authorization；WebView 必须 detach 后再 destroy；ClassTrack-owned UI 必须由 React/shadcn 资产渲染。

## Requirements

### R1. 可观察的 Android 回归

- [ ] 在具备硬件加速的 Android 模拟器或真实 Android 设备上安装本次构建的 debug APK。
- [ ] 通过 `adb` 启动主 Activity，进入天津理工大学应用内导入，保存至少以下脱敏截图：普通导入 shell、点击开始后的 shell + academic content slot、出现 404 时的错误页面（若仍可复现）。
- [ ] 采集限定于 `ClassTrack.CourseImport`、WebView/Activity 相关 tag 的脱敏 logcat；不得把账号、密码、Cookie、Authorization、表单值、query、响应正文或 raw JSON 写入任务资料。
- [ ] 记录模拟器 API、WebView 版本、APK 校验和、启动命令、截图路径和每个场景的实际结果。

### R2. 修复 shell 资产 404

- [ ] fresh `cap sync` 和 Android 构建生成的 APK 必须包含最新 `assets/public/index.html` 以及其引用的所有 `/assets/*` 文件。
- [ ] `https://appassets.androidplatform.net/index.html?native-shell=1` 在 shell WebView 中返回有效 HTML/JS，不得被 WebView 当作网络 URL 产生 404，不得静默回退到网络。
- [ ] 资源不存在、origin 不安全或 URL 不符合 shell 约束时仍返回受控失败，不得为了绕过 404 放开任意远程资源。
- [ ] 增加至少一个可自动执行的回归断言，验证资源映射/打包入口与实际 APK 资产一致；如果根因只是旧 APK 或未同步资产，必须把构建顺序和验证步骤固化到实现/文档中而不是修改安全边界。

### R3. 修复导入页显示与 content-slot

- [ ] 初始、错误、取消状态显示完整 React/shadcn shell，不出现空白、默认 ActionBar、异常遮挡或无法点击的透明 WebView 层。
- [ ] academic 页面激活后，shell chrome 高度、academic WebView 顶部位置和可见区域一致；academic WebView 不覆盖 shell 操作区，shell 仍能使用返回、刷新、重试、请求导入和取消。
- [ ] 在至少一个窄屏 portrait 配置上验证首帧、active slot、错误恢复和返回；如设备验证发现旋转、IME、字体缩放或 inset 不能保持固定 slot，必须记录可见性切换降级及原因，不得宣称未验证的布局保证。
- [ ] 404、网络错误、超时和无课表响应均进入可恢复错误状态，保留现有 JSON/书签脚本/备份导入降级路径。

### R4. 保持现有数据和安全契约

- [ ] 成功响应继续只经过 private `cacheDir` 临时文件、现有 Capacitor plugin、现有 parser 和 `importClasses`；不把响应正文放入 React shell、Intent 普通字段或 localStorage。
- [ ] 不扩大 academic navigation host/port/path allowlist，不扩大 capture endpoint allowlist，不引入任意 URL、任意脚本或外部浏览器插件。
- [ ] 重试、返回、取消、Activity destroy 清理旧 callback/session/WebView，避免 stale result 或 attached-to-window destroy 警告。
- [ ] 普通 Web/PWA 流程不受影响。

## Acceptance Criteria

- [ ] 在可用设备上完成并保存回归截图，且截图能证明导入页 shell 首帧、active content slot 和错误态的实际布局。
- [ ] 404 根因有证据（APK 资产、WebView 资源回调或 logcat），修复后 fresh APK 安装验证不再出现同一 404；若环境阻塞无法运行，必须保留确切阻塞和静态/APK 验证结果，不得用前端测试冒充设备验收。
- [ ] 显示异常有证据和修复前后对比；shell 与 academic WebView 分层、操作区触控边界和恢复态通过自动化或设备检查。
- [ ] `pnpm test`、`pnpm typecheck`、本地项目 ESLint 10、`pnpm format:check`、`pnpm build`、`pnpm cap:sync:android`、`git diff --check` 通过。
- [ ] Android 单元测试、可执行的 APK/资产检查通过；若 Gradle、KVM、设备或网络仍不可用，记录命令、完整错误和未覆盖项。
- [ ] 最终敏感信息审计确认日志、bridge state、Activity Result、APK 资产和任务截图/日志没有账号、密码、Cookie、Authorization、query、表单值或 raw JSON。

## Out of scope

- 不更换 `CourseImportPlugin`/`CourseImportActivity`/WebView 架构，不引入 `@capacitor/browser`、服务端代理或第三方浏览器插件。
- 不重写天津理工课表 parser、`importClasses`、学期/第一周日期算法。
- 不扩展到其他学校、其他 CAS host 或未知教务路径；只有设备证据证明当前显式配置错误时才允许在本任务内提出最小的 allowlist 变更。
- 不把无法启动模拟器的问题伪装成代码修复；宿主硬件加速缺失时，设备验收是明确阻塞，需在报告中说明需要的外部环境。

## Open questions / deferred verification

- 当前宿主没有 `/dev/kvm`，无法在本轮直接启动 x86_64 `Medium_Phone`。代码实现可先依据 APK/静态测试推进，但 R1/R3 的真实截图验收必须等具备 KVM 的宿主或真实设备。
- 404 究竟来自旧 APK/未同步资产、shell root 资源回调还是 academic 页面，必须通过 fresh APK 安装后的脱敏 logcat 和截图确认，不在没有证据时放宽 URL 或资源策略。
