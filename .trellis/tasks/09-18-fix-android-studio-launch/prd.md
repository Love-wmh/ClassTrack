# 修复 Android Studio 启动配置

## Goal

让开发者从 Android Studio 直接打开 `android/` 工程后，可以完成 Gradle 同步、选择 `app` 运行配置，并将 ClassTrack Debug 应用部署到模拟器或已连接设备，而不依赖工作区中未提交的机器专属配置。

## Background / Confirmed Facts

- Capacitor Android 工程位于仓库的 `android/` 子目录，Gradle 根工程包含 `app` 与 `capacitor-cordova-android-plugins`，并通过生成的 `capacitor.settings.gradle` 引入 Capacitor 模块。
- 应用模块已有 `com.classtrack.app.MainActivity`、`MAIN`/`LAUNCHER` intent filter、`android:exported="true"` 和 Debug 构建类型，基础启动入口存在。
- 当前 Android 工具链版本为 Gradle Wrapper 8.14.3、Android Gradle Plugin 8.13.0、compile/target SDK 36，Capacitor 生成的 Java 编译级别为 21。
- `android/local.properties` 当前存在但被忽略，包含本机 SDK 绝对路径；这是正常的本机配置，不应提交。
- 当前工作区有两项与 Android Studio 启动相关的未提交变更：
  - `android/settings.gradle` 顶部新增 Foojay toolchain resolver 插件；HEAD 中不存在该配置。
  - 未跟踪的 `android/gradle/gradle-daemon-jvm.properties` 强制 JETBRAINS JDK 21，并包含 Foojay 下载 URL。
- Android Studio 目录下的 `.idea` 配置被忽略；当前本机生成的配置使用 `jbr-21`，并已有 `android.app` 的 Android App 运行配置，但不能作为仓库的可移植配置。
- 本次 agent 环境无法通过 Gradle Wrapper 完成新下载：默认 Gradle 缓存位置只读，使用临时缓存时访问 `services.gradle.org` 又被当前网络环境的 DNS 阻断。仓库历史会话记录过同一工程在完整 JDK 21、Android SDK 36 和 Gradle 8.14.3 缓存齐全时成功产出 APK。

## Requirements

### R1：恢复可移植的 Android Gradle 工程配置

移除或调整会让 Android Studio 同步依赖 Foojay 网络下载、JDK vendor 或本机绝对路径的非必要配置；保留 Capacitor 生成工程的结构和版本约束。Android Studio 使用其内置 JDK 21 或用户配置的完整 JDK 21 即可完成同步。

### R2：支持 Android Studio 直接运行 app

`android/` 工程同步后应能识别 `app` 模块、解析 `MainActivity` 为默认启动 Activity，并允许 Android Studio 的 Android App 运行配置部署 Debug APK 到模拟器或真机。

### R3：不破坏命令行构建入口

修复后不得破坏现有 `pnpm cap:sync:android`、`pnpm cap:build:android` 及 Capacitor 生成文件的使用方式；不提交 `local.properties`、`.idea`、构建产物或依赖缓存。

### R4：补充必要的使用约束说明

如果 Android Studio 不能从仓库根目录自动识别 Android 工程，应明确 Android Studio 的打开入口是 `android/`，并说明 Gradle JDK 需要使用完整 JDK 21；文档变更只限于消除当前配置与实际用法的不一致。

## Acceptance Criteria

- [ ] `android/settings.gradle` 不再包含不必要的 Foojay resolver 依赖，且与 Capacitor 生成工程的标准结构一致。
- [ ] 不再将本机生成的 `android/gradle/gradle-daemon-jvm.properties` 作为项目启动前提；工作区不产生需要提交的机器专属 Android Studio/Gradle 配置。
- [ ] Android Studio 打开 `android/` 后能识别 `app` 模块和 Debug 构建类型；运行配置的模块为 `android.app`，启动 Activity 为 `MainActivity`。
- [ ] 在 JDK 21、Android SDK 36、Gradle 8.14.3 依赖可用的开发机上，`cd android && ./gradlew :app:assembleDebug` 通过并生成 `android/app/build/outputs/apk/debug/app-debug.apk`。
- [ ] `pnpm cap:build:android` 的同步与构建链路仍可用，且不需要提交本机绝对路径、`.idea` 或构建产物。
- [ ] 变更后的 git diff 只包含本任务必要的配置/文档文件，不包含密钥、SDK 路径、下载缓存或生成产物。

## Out of Scope

- 不修改应用业务代码、Manifest 权限、包名、签名策略或 Release 发布流程。
- 不替用户安装 Android Studio、JDK、Android SDK、模拟器，也不处理 USB 调试授权。
- 不把 IDE 的 `.idea`、`local.properties`、Gradle 缓存或 Foojay 下载产物纳入版本控制。
- 不把当前 agent 网络受限导致的 Gradle 下载失败误判为项目源码构建失败；验证时将区分环境阻塞与配置错误。

## Open Questions

无。当前需求可按标准 Capacitor Android 工程入口和 JDK 21 约束落地；若修复后 Android Studio 仍报错，再根据具体同步日志继续定位。