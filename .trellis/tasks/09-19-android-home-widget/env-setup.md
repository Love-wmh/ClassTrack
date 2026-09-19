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
| P3 Android 通道 | ⬜ 待做 | |
| P4 Glance + 调度 | ⬜ 待做 | |
| P5 Web 接入 | ⬜ 待做 | |
| P6 端到端 | ⬜ 待做 | |
---
