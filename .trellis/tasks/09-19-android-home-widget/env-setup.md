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
| P6 端到端 | ⚠️ 部分完成 | 设备相关的端到端**未完成**：`/dev/kvm` 不存在（x86_64 模拟器要求硬件加速）且无真机连接，模拟器直接拒绝启动。不依赖设备的验收项已全部取证（含新增的 9 个跨层用例，用 Web 侧真实产出的快照喂给原生解析器）；逐项证据与未验证清单见 [verification.md](./verification.md) |
---
