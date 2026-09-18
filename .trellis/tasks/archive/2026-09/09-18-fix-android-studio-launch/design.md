# 技术设计：恢复 Android Studio 可直接启动

## 1. 变更边界

最小行为缺口是：Android Studio 打开 `android/` 后，项目配置不应因为当前工作区新增的 Foojay toolchain resolver 和生成的 daemon JVM criteria 而引入额外的网络下载/厂商约束；工程应回到 Capacitor 生成的、由 IDE 本地 JDK 21 驱动的 Gradle 配置。

涉及边界：

- Gradle settings：`android/settings.gradle` 是 Android 工程入口，负责模块和 Capacitor settings 导入。
- Gradle daemon：`android/gradle/gradle-daemon-jvm.properties` 是本机生成的 JVM criteria，不是 Capacitor 工程源配置。
- IDE 使用说明：README 需要明确打开目录和 JDK 版本，避免用户从 Web 根工程进入 Android Studio 后得到错误的项目模型。

明确不修改：业务代码、Manifest、`variables.gradle`、Capacitor 生成的 `capacitor.settings.gradle`/`capacitor.build.gradle`、签名和 Android Studio 的被忽略 `.idea`。

## 2. 方案

### 2.1 恢复 `settings.gradle` 的生成基线

删除顶部的 `org.gradle.toolchains.foojay-resolver-convention` 插件声明，保留：

1. `:app` 模块；
2. `:capacitor-cordova-android-plugins` 模块及其目录映射；
3. `apply from: 'capacitor.settings.gradle'`。

原因：该 Foojay 声明不是原始 Capacitor 工程的一部分，会使 Gradle settings 阶段依赖 Plugin Portal/网络；Android Studio 已自带可用的 JBR 21，项目不需要通过仓库配置自动下载 JDK。

### 2.2 删除生成的 daemon JVM criteria

删除 `android/gradle/gradle-daemon-jvm.properties`，不把本机的 JETBRAINS vendor、操作系统下载 URL 和 JDK 21 criteria 作为项目启动前提。

Android Studio 的 Gradle JDK 应由 IDE 设置使用内置 JBR 21；命令行构建则使用开发机完整 JDK 21。这样既满足 AGP/Capacitor 的 Java 21 要求，也避免固定某台机器的路径和下载源。

### 2.3 明确 IDE 打开入口

在 README 的 Android 环境段增加 Android Studio 操作说明：打开仓库内的 `android/` 目录而不是仓库根目录；在 Gradle settings 中确认 Gradle JDK 为 Android Studio bundled JDK 21；同步后选择 `app` 运行配置。说明 `android/local.properties` 仍由本机生成，不提交。

不提交 `.idea` 运行配置：Android Studio 在同步后能够从 `app` 模块生成 Android App 配置，模拟器/真机属于每台开发机的本地选择。

## 3. 数据流与启动契约

```text
Android Studio
  → 打开 android/
  → settings.gradle
  → :app + capacitor.settings.gradle
  → app/build.gradle
  → Debug APK
  → MainActivity (MAIN/LAUNCHER)
```

契约保持不变：

- `applicationId`/包名为 `com.classtrack.app`；
- Java source/target compatibility 为 21；
- compile/target SDK 为 36；
- Debug variant 使用默认 debug 签名；
- `MainActivity` 已通过 Manifest 的 `MAIN`/`LAUNCHER` 作为启动入口。

## 4. 兼容性与回滚

- 兼容 Android Studio 内置 JDK 21、系统完整 JDK 21；不承诺 JDK 17 或 JDK 24。
- 需要本机具备 Android SDK 36、build-tools 36.0.0 和 Gradle 8.14.3 所需依赖；这些是环境依赖，不通过提交绝对路径解决。
- 若 Android Studio 仍无法同步，保留修复后的标准 settings，优先根据 Sync 日志补齐 SDK/Gradle 依赖或调整 IDE Gradle JDK，不重新引入 Foojay 自动下载配置。
- 回滚点为恢复 `android/settings.gradle` 的 HEAD 内容和删除本任务新增的文档说明；不涉及业务数据或 APK 签名。

## 5. 风险与取舍

- 删除 daemon criteria 后，使用错误 JDK 的开发机可能在同步时得到 Java 版本错误；README 的 JDK 21 检查和 Android Studio Gradle JDK 设置说明承担提示责任。相比之下，提交 Foojay 配置会把项目绑定到额外网络服务并可能阻塞离线同步。
- Android Studio 根目录项目模型仍是 Web 工程；本设计不把 Web 与 Android 强行合并为一个 IDE 工程，避免污染根项目的 Node/React 工具链。Android Studio 的标准入口明确为 `android/`。
- 当前 agent 无法下载 Gradle 发行版，最终构建验证需要使用已有的本地缓存或网络可用的开发环境；验证报告应记录这一环境限制。
