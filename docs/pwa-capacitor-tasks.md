# ClassTrack PWA 与 Capacitor 移动端实现任务

> 基于方案文档：`docs/pwa-capacitor-android.md`  
> 本期实现：Web/PWA、Capacitor Android、Debug APK；iOS 仅保证兼容设计

## PWA 与移动端适配

- [x] 添加 PWA 与 Capacitor 精确版本依赖和 pnpm 构建脚本
  - 目标：`package.json`、`pnpm-lock.yaml`
  - 变更：安装 `vite-plugin-pwa`、`@capacitor/core`、`@capacitor/cli`、`@capacitor/android`，增加同步和 APK 构建命令。
- [x] 配置 PWA Manifest、Service Worker 与更新策略
  - 目标：`vite.config.ts`
  - 变更：实现应用安装、静态资源预缓存、SPA 导航回退和提示更新。
- [x] 生成跨平台应用图标
  - 目标：`public/favicon.ico`、`public/icons/`
  - 变更：由现有 favicon 派生 PWA 192/512、maskable 与 Apple Touch Icon；原始 favicon 保持不变。
- [x] 实现 PWA 更新提示并补充安装元信息
  - 目标：`app/components/pwa/PwaUpdatePrompt.tsx`、`app/root.tsx`
  - 变更：注册 Service Worker，提示用户加载新版本；增加 theme color、Apple PWA 元信息。
- [x] 完成移动端视口和安全区适配
  - 目标：`app/app.css`、`app/features/layout/AppLayout.tsx`
  - 变更：使用动态视口和安全区，兼容 Web、Android WebView 和后续 iOS WKWebView。

## Capacitor Android

- [x] 初始化 Capacitor 跨平台配置
  - 目标：`capacitor.config.ts`
  - 变更：使用 `com.classtrack.app`、`ClassTrack` 和 `build/client`，避免 Android 独占业务配置。
- [x] 生成并配置 Android 原生工程
  - 目标：`android/`
  - 变更：生成 Capacitor Android 工程，同步 Web 产物并使用 favicon 派生的启动器图标。

## 测试与验证

- [x] 执行 Web 静态验证
  - 命令：`pnpm typecheck`、`pnpm lint`、`pnpm build`
  - 验证：类型检查、生产构建和本次改动定向 ESLint 已通过，构建产物包含 Manifest 和 Service Worker；全量 Lint 仍受仓库既有错误阻塞。
- [x] 构建 Android Debug APK
  - 命令：`pnpm cap:sync:android`、`pnpm cap:build:android`
  - 产物：`android/app/build/outputs/apk/debug/app-debug.apk`（6.69 MiB，SHA-256：`755c912a12044e4945a1a6ddd8597bc61bbe069bd9a5fcd0a55450368809cc3b`）
- [ ] 验证手机端功能 ⚠️ 人工确认
  - Web/PWA：安装提示、独立窗口、离线启动、更新提示、安全区。
  - Android：APK 安装启动、路由、数据持久化、文件导入导出。
