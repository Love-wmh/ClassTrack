# ClassTrack PWA 与 Capacitor 移动端代码变更记录

> 关联方案：`docs/pwa-capacitor-android.md`  
> 关联任务：`docs/pwa-capacitor-tasks.md`  
> 生成时间：2026-09-11

## 变更概览

- Web/PWA：增加安装清单、离线缓存、可控更新提示、Apple 主屏幕元信息和安全区适配。
- Android：增加 App ID 为 `com.classtrack.app` 的 Capacitor 8 原生工程，并将 React Router 的 `build/client` 作为 Web 资源目录。
- 图标：使用现有 `public/favicon.ico` 派生 PWA、Apple Touch Icon 和 Android 启动器图标。
- 工具链：增加 pnpm 的 Android 同步、打开和 Debug APK 构建命令，并修正 Gradle Wrapper 调用方式，使脚本可从仓库根目录直接执行。
- iOS：本期不生成 Xcode 工程，但 Web 元信息、视口、安全区和 Capacitor 配置保持跨平台兼容。

## 主要新增文件

| 文件路径 | 说明 |
|---|---|
| `app/components/pwa/PwaUpdatePrompt.tsx` | 注册 Service Worker 并在发现新版本时提示用户更新。 |
| `capacitor.config.ts` | 定义跨平台应用标识、名称和 Web 构建目录。 |
| `android/` | Capacitor Android 原生工程、Gradle Wrapper 与应用资源。 |
| `public/pwa-192x192.png` | PWA 192×192 图标。 |
| `public/pwa-512x512.png` | PWA 512×512 与 maskable 图标。 |
| `public/apple-touch-icon.png` | iOS 主屏幕图标。 |

## 主要修改文件

| 文件路径 | 变更摘要 |
|---|---|
| `vite.config.ts` | 配置 PWA Manifest、预缓存、SPA 导航回退和提示更新。 |
| `app/root.tsx` | 增加移动/PWA 元信息并挂载更新提示。 |
| `app/app.css` | 增加动态视口和安全区适配。 |
| `app/features/layout/AppLayout.tsx` | 使用 `app-viewport` 代替固定 `h-screen`。 |
| `package.json` | 增加固定版本依赖和 Capacitor Android 脚本。 |
| `tsconfig.json` | 加载 `vite-plugin-pwa/client` 类型。 |

## 验证记录

- `pnpm typecheck`：通过。
- 本次改动定向 ESLint：通过。
- `pnpm build`：通过，生成 `build/client/manifest.webmanifest`、`build/client/sw.js` 和 SPA `index.html`。
- `pnpm exec cap sync android`：通过。
- `pnpm cap:build:android`：通过，生成 `android/app/build/outputs/apk/debug/app-debug.apk`（7,012,430 bytes）。
- APK SHA-256：`755c912a12044e4945a1a6ddd8597bc61bbe069bd9a5fcd0a55450368809cc3b`。
- Android 构建环境要求：Capacitor 8 需要包含 `jlink` 的完整 JDK 21；本机默认 Java 17 和 IDE 精简 JRE 21 均不满足要求，因此安装完整 OpenJDK 21 后执行 Gradle。
- 全量 `pnpm lint`：未通过，问题来自开发前已存在的 `Stepper.tsx`、`useStepper.ts`、`use-mobile.ts`、`commitlint.config.cjs` 及既有 warning；本次新增/修改 TypeScript 文件无 Lint 错误。
