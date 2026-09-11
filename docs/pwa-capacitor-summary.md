# ClassTrack PWA 与 Capacitor 移动端交付总结

> 关联方案：`docs/pwa-capacitor-android.md`  
> 关联任务：`docs/pwa-capacitor-tasks.md`  
> 变更记录：`docs/pwa-capacitor-changes.md`  
> 完成时间：2026-09-11

## 交付结果

- Web/PWA 已支持安装到桌面、独立窗口启动、应用壳离线缓存和提示式版本更新。
- Android 已接入 Capacitor 8，应用 ID 为 `com.classtrack.app`，与 Web 共用 React 页面和本地数据逻辑。
- iOS 本期未生成 Xcode 工程，但已完成 Apple PWA 元信息、安全区和动态视口兼容设计。
- 应用图标统一由 `public/favicon.ico` 派生，覆盖 PWA、Apple Touch Icon 和 Android launcher 图标。

## 构建产物

- Android Debug APK：`android/app/build/outputs/apk/debug/app-debug.apk`
- 文件大小：7,012,430 bytes（约 6.69 MiB）
- SHA-256：`755c912a12044e4945a1a6ddd8597bc61bbe069bd9a5fcd0a55450368809cc3b`
- 构建命令：`pnpm cap:build:android`

Android 构建需使用包含 `jlink` 的完整 JDK 21，并配置可用的 Android SDK。当前本机构建使用 `/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` 和 `/Users/wangminghuang/Library/Android/sdk`。

## 验证结论

- `pnpm typecheck`：通过。
- 本次变更涉及文件的定向 ESLint：通过。
- `pnpm build`：通过，包含 Manifest、Service Worker 和 SPA 入口。
- `cap sync android`：通过。
- `pnpm cap:build:android`：通过，Gradle 输出 `BUILD SUCCESSFUL`。
- APK 文件类型与 SHA-256 已验证。

全量 `pnpm lint` 仍受仓库中开发前已存在的问题阻塞，详见变更记录。本期尚未在真实 Android 设备或模拟器上完成人工安装和交互验收，因此安装启动、路由、数据持久化、文件导入导出及安全区显示仍保留为人工验证项。

## 后续范围

- 在 Android 设备或模拟器安装 Debug APK，完成任务清单中的人工验收。
- 正式发布前配置 release signing、版本号、应用商店素材和隐私说明，并构建签名 AAB/APK。
- 进入 iOS 实施阶段时再添加 `@capacitor/ios` 和 Xcode 工程，验证 WKWebView、文件分享和主屏幕安全区。
