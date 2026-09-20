# 本机构建环境与阶段状态

> 本文件是 `implement.md` 的配套文件，只承载「怎么在这台机器上跑起来」与「各阶段实际推进到哪一步」。
> 拆分原因是 `implement.md` 超过 `.trellis/config.yaml` 的 `context_injection.max_file_bytes`（32768 字节）。

## P-1. 本机构建环境（**先读这一节，否则 Gradle 跑不起来**）

本机根文件系统只读、且没有可用 DNS。所有 `./android/gradlew` 调用都必须先做下面两步，否则会分别报
「`gradle-8.14.3-all.zip.lck` Read-only file system」/「Name or service not known」/「Unable to create debug keystore … not writable」。

```bash
# 1) 可写的 GRADLE_USER_HOME + 代理 + 镜像（都在仓库外，绝不写进版本库）
GH=/home/yetongy/.cache/gradle-home
mkdir -p "$GH/caches" "$GH/wrapper/dists" "$GH/init.d"
cp -a ~/.gradle/wrapper/dists/gradle-8.14.3-all "$GH/wrapper/dists/"
cp -a ~/.gradle/caches/modules-2 "$GH/caches/"
cp -a ~/.gradle/caches/jars-9 "$GH/caches/"
cp -a ~/.gradle/caches/8.14.3 "$GH/caches/"
cp scripts/gradle-mirrors.init.gradle "$GH/init.d/"
# 并在 $GH/gradle.properties 写 systemProp.http(s).proxyHost=localhost / proxyPort=3128 / proxyUser / proxyPassword（凭据取自 $HTTPS_PROXY）

# 2) 可写的 Android 用户目录（AGP 要在其中创建 debug keystore）
AH=/home/yetongy/.cache/android-home
mkdir -p "$AH" && cp -a ~/.android/. "$AH/"

export GRADLE_USER_HOME=$GH ANDROID_USER_HOME=$AH
```

**代理凭据与本机路径属于环境信息，禁止写入仓库任何文件**（包括 `android/gradle.properties`、`android/local.properties`）。

## 阶段状态（每次推进后更新）

| 阶段 | 状态 | 实测结论 |
|---|---|---|
| P0 基线 | ✅ 完成 | Web 五项门禁全绿（vitest 29 用例）；`testDebugUnitTest` 16 用例通过；`android:check-assets` 通过 |
| P1 工具链 | ✅ 完成 | KGP 2.1.20 + compose 编译器插件 + Glance 1.2.0 + WorkManager 2.11.2 可编译出 APK；**不需要** `buildFeatures.compose`；Java/Kotlin jvmTarget 统一 21（见 design.md D1.2） |
| P2 Web 契约 | ✅ 完成 | `app/lib/widget-snapshot.ts`（+18 用例）、`native-widget-snapshot.ts`（+5 用例）落地；全量 vitest 52 用例通过 |
| P3 Android 通道 | ✅ 完成 | 新增 6 个 Java 类 + 2 个 JUnit 测试类；Android 单测 16 → **47** 全绿（parser 14 / resolver 17）；`assembleDebug` 通过；`WidgetSnapshotPlugin` 已在 `MainActivity` 注册（比原计划提前，使该提交自成闭环） |
| P4 Glance + 调度 | ✅ 完成 | Kotlin widget 包 8 个文件 + provider XML/布局/配色/字符串 + manifest 三接收器；`pnpm cap:build:android` 与 `android:check-assets` 通过；APK 内实测 `updatePeriodMillis=1800000`、`targetCellWidth=4/targetCellHeight=2`、三个接收器齐全；Android 单测 47 全绿。已完成里程碑：**小工具可被安装到桌面**（端到端放置待 P6） |
| P5 Web 接入 | ✅ 完成 | 新增 `useWidgetSnapshotSync`（去抖 1.5s + 启动推送 + `resumed` 监听）、`WidgetSnapshotSync` 挂载组件、`useWidgetPrecision` 与 `WidgetPrecisionSettings`；Web 五项门禁全绿。**D5 已用真实 Chrome（CDP）取证**：`platform: "web"`、页面完整渲染、`exceptions: []`、仅两条既有的 DialogContent 警告（本次未新增任何 Dialog 代码）、无任何 WidgetSnapshot 桥调用。附带发现：Web 上 `isPluginAvailable('WidgetSnapshot')` 为 true（WebPlugin 兜底自己注册），因此平台判断是承重的。 |
| P6 端到端 | ✅ 完成 | 沙盒关闭后环境恢复（`~/.gradle` 可写、`/dev/kvm` 存在），回归用**项目原生命令**全绿（Web 5 项退出码 0、Android 56 用例、APK + 资源一致）。设备端在 `Medium_Phone`（SDK 37 + KVM）上完成验收，并**发现并修复 3 个静态检查无法发现的真实缺陷**：`initialLayout` 用了 RemoteViews 不允许的 `android.view.View`、接收器 `goAsync()` 返回 null 导致 NPE 崩溃（小工具反复空白的真因）、点击路由常量写成不存在的 `/schedule` 导致渲染 404 且连带卸载同步组件。除 B2（2x1 紧凑像素布局）为部分验证外，其余验收项均有证据；逐项见 [verification.md](./verification.md)
| P7 样式/配置/预览 | ✅ 完成（B12 与放置时 configure 弹窗为部分验证） | 需求变更后二次验收：三种样式、可滚动列表、每实例配置页、选择器预览全部在真机取证（Android 17）；新增 **8 个策略/配置用例 → Android 单测 71 用例**；门禁全绿。发现并修复 **1 个新真缺陷**：`provideGlance` 只执行一次、旧状态闭包导致时间推进后画面不更新 → 引入 `WidgetRenderCache`（合成读最新解析结果）后复验通过。B12（最小 2x2 像素）与「拖放放置时 configure 自动弹窗」为部分验证（adb 无法合成 launcher 缩放句柄/拖放），见 [verification.md](./verification.md) §3.5-3.6 与 §4 |
---
