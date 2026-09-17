# 实测证据：构建环境现状

本文件记录规划阶段实际跑出来的结果，不是推断。实现与复核都以这里的命令输出为准。

## 1. 宿主环境（2026-09-17 实测）

| 项 | 值 | 命令 |
|---|---|---|
| Docker | Client/Server 29.1.3，驱动 overlayfs，RootDir `/var/lib/docker` | `docker version`、`docker info` |
| 当前用户 | `yetongy`，在 `docker` 组内（无需 sudo 用 docker） | `id` |
| Node | **v22.23.1** | `node -v` |
| pnpm | **9.15.9** | `pnpm -v` |
| JDK | **openjdk 21.0.12.1 LTS**（2026-08-18） | `java -version` |
| 磁盘 | `/`（含 `/var/lib/docker`）可用 **148G**；移动卷可用 274G | `df -h` |

> 容器镜像的 Node / pnpm 版本应与上表对齐，且与 CI（`.github/workflows/ci.yml`：`node-version: 22`、`pnpm/action-setup@v4 version: 9`）一致。

## 2. 宿主 Android SDK 的缺口（正是要固化的部分）

```
~/Android/Sdk/
├── build-tools/     34.0.0  36.0.0
├── emulator/
├── licenses/        android-sdk-license
├── platforms/       android-37.0        ← 只有这一个
├── platform-tools/
├── skins/ sources/ system-images/
```

- **缺 `platforms;android-36`**，而 `android/variables.gradle` 第 3 行要求 `compileSdkVersion = 36` → 宿主上直接跑 gradle 会尝试联网补下载。
- `ANDROID_HOME` / `ANDROID_SDK_ROOT` **均未设置**，`android/local.properties` **不存在** → 宿主上 gradle 定位不到 SDK。
- gradle wrapper 需要 **8.14.3**（见 `android/gradle/wrapper/gradle-wrapper.properties`），而 `~/.gradle/wrapper/dists/` 里只有 `gradle-8.9-bin`、`gradle-9.4.1-bin` → 首次构建要下载约 200MB。
- `scripts/install-android.sh` 的默认路径写死 macOS：`/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`、`$HOME/Library/Android/sdk`。在 Linux 上只能靠 `JAVA_HOME` / `ANDROID_HOME` 环境变量兜，否则脚本直接报「未找到可用的 JDK / Android SDK」并退出 1。

## 3. `android/` 工程事实（不改动，只作对齐依据）

| 项 | 值 |
|---|---|
| appId / appName | `com.classtrack.app` / `ClassTrack` |
| compileSdk / targetSdk / minSdk | 36 / 36 / 24 |
| Gradle wrapper | 8.14.3（`gradle-wrapper.jar` 已入库） |
| 被跟踪文件数 | 53 |
| Capacitor 插件 | `@capacitor/android` 8.5.1、`@capacitor/filesystem` 8.1.3、`@capacitor/share` 8.0.1 |
| 权限 | 仅 `INTERNET` |
| 签名配置 | **无**（只能出 debug 包） |

`android/app/capacitor.build.gradle` 已入库；`android/app/src/main/assets/public`、`capacitor.config.json`、`capacitor.plugins.json` 是 `cap sync` 的生成物且已被 gitignore → 容器内必须先 `pnpm build` 再 `cap sync`（`pnpm cap:build:android` 已封装）。

## 4. 根 `Dockerfile` 的硬伤（逐条对应行）

```dockerfile
FROM node:20-alpine AS development-dependencies-env
COPY . /app
WORKDIR /app
RUN npm ci                                 # ← ② npm 与 pnpm 不符
FROM node:20-alpine AS production-dependencies-env   # ← ③ Node 20 与项目 Node 22 不符
COPY ./package.json package-lock.json /app/          # ← ① package-lock.json 不存在，COPY 直接失败
```

实测：`ls package-lock.json` → 不存在（仓库用 `pnpm-lock.yaml` + `pnpm-workspace.yaml`）。

死掉的 `CMD`：

```dockerfile
CMD ["npm", "run", "start"]   # ← ④ start 脚本本身是死路，见第 5 节
```

`.dockerignore` 现状只排除 4 项（`.react-router`、`build`、`node_modules`、`README.md`），未排除 `android/`、`.git`、`.trellis`、agent 配置目录等。

## 5. `pnpm start` 死路的实测证据

```
$ node_modules/.bin/react-router-serve
  Usage: react-router-serve <server-build-path> - e.g. react-router-serve build/server/index.js
```

- `@react-router/serve@7.15.1` 已安装且可用，但**必须**传入 server 构建产物路径。
- 本项目 `react-router.config.ts` 是 `ssr: false`，`pnpm build` 后 `build/` 下**只有 `client/`**（实测 `ls build/` → `client`；`[ -d build/server ]` → 否）。
- 因此 `pnpm start` 必然失败，而 README 第 112–116 行「启动生产服务」正教用户跑它。

## 6. 会被本次改动影响的仓库约束

| 约束 | 实测 |
|---|---|
| `format:check` 扫描范围 | `prettier --check "**/*.{ts,tsx,js,jsx,json,css}"` → **`.devcontainer/devcontainer.json` 会被检查**，必须过 prettier |
| `lint` 扫描范围 | `eslint .`，`eslint.config.js` 的 `files` 只针对 `**/*.{ts,tsx,js,jsx}` 与 `**/*.cjs` → Dockerfile / JSON 不受影响 |
| `prepare` 钩子 | `package.json` 的 `prepare` 是 `husky`；生产镜像构建上下文没有 `.git`，需 `HUSKY=0` |
| 运行期依赖 | `dependencies` 不得新增（C9）；`vite` 已在 devDependencies，可作 `preview` 用 |
| `.prettierignore` | 已排除 `.pi`/`.trellis`/`android`/`ios` 等；沙盒设备文件的 8 条根锚定条目**按 C6 保留不动** |

## 7. PWA 相关（决定生产镜像的缓存策略）

`vite.config.ts` 的 `VitePWA` 配置：

- `registerType: 'prompt'` → 更新由页面提示，不自动刷新。
- `workbox.navigateFallback: '/index.html'` → 与生产镜像的 SPA 回退是同一语义。
- 生成物含 `sw.js` 与 manifest；**它们若被长缓存，`prompt` 更新机制会失效** → nginx 必须给 `no-cache`。

## 8. 本任务不覆盖的范围（避免实现时越界）

- 沙盒设备文件的 ignore 残留（C6 保留）。
- `android/` 工程自身（`variables.gradle`、签名配置）。
- Android 模拟器、USB 真机直通、release 签名与发布。
- 容器内 Docker（docker-in-docker）。
- Agent CLI 运行环境、`gh` / `python3` / `ripgrep` 等非构建工具。

---

## 9. 实现期实测补充（2026-09-17 深夜；devcontainer 两度验证通过，最终按用户决定彻底放弃、不入库）

devcontainer 方案两度完整实现并验证通过（第二次连 `devcontainer up` 编排也 outcome=success、容器内门禁与 APK 构建全绿），最终按用户决定彻底放弃。以下实测事实仍有复用价值：

### 国内镜像源实测（2026-09-17，宿主与容器内分别验证）

| 镜像 | 可用性 | 证据 |
|---|---|---|
| `repo.huaweicloud.com/ubuntu`（arm64 用 `ubuntu-ports`） | ✅ | apt deb822 源实测可装 openjdk-21 |
| `repo.huaweicloud.com/nodejs/v22.23.1/...tar.xz` | ✅ | HEAD 200 |
| `repo.huaweicloud.com/repository/npm/` | ✅ | pnpm 全量安装经此源成功 |
| `repo.huaweicloud.com/gradle/gradle-8.14.3-all.zip` | ✅ | 容器内 92MB/s 下完；宿主下过慢时用 `-C -` 断点续传多轮收敛，sha256 校验通过 |
| `repo.huaweicloud.com/repository/maven/`（中央仓库） | ✅ | POM 返回真 XML；gradle 构建实测大量命中 |
| `repo.huaweicloud.com/maven/google/` | ❌ **不可用** | 301 到 mirrors.huaweicloud.com 后返回 HTML 页面（`data-critters-container`），gradle 报 “Already seen doctype”。教训：探测镜像必须看**内容**（`<?xml`），不能只看 200 |
| `maven.aliyun.com/repository/google/` | ✅ | POM 返回真 XML，google 构件走这里 |
| `mirrors.cloud.tencent.com/AndroidSDK/` | ✅ 但慢 | repository2-3.xml 可读；大文件 ~256KB/s 中途 reset |
| 华为云无 Android SDK 镜像 | — | `/android/repository/` 404 |

### 工具行为实测

- **gradle init 脚本注入镜像仓库**：`~/.gradle/init.d/*.gradle` 里 `allprojects { addMirrors(buildscript.repositories); addMirrors(repositories) }` 可行；镜像在前、工程自身 `google()/mavenCentral()` 在后兜底，404 会顺延，解析失败（HTML）则整体失败。
- **pnpm 9 跨文件系统自动迁移 store**：store 卷（docker volume）与工作区（bind mount）不同设备时，pnpm 不用全局 store，自动在仓库根建 `.pnpm-store/`（本例 585MB）。命名卷成死重 → 已从设计撤除，`.pnpm-store/` 已加入 `.gitignore` 与 `.dockerignore`。
- **pnpm 在非交互环境遇到「node_modules 将被重装」提示会永久挂起**：`CI=true pnpm install` 自动按默认（是）继续。
- **devcontainer CLI `up` 会持续挂住流式输出容器 stdout**，不会自己返回；编排验证要用分离+轮询。
- **沙箱（bwrap `--die-with-parent`）开着时，工具调用结束会回收其派生的后台进程**（`nohup` 也挡不住整组被杀）；容器内长任务用 `docker exec -d`（进程活在容器 PID 命名空间，不受宿主回收影响）。
- **legacy docker builder 读构建上下文遇到字符设备文件**（沙箱 bind mount 的 `/dev/null` 遮蔽：`.bash_profile` 等 8 个）直接以 exit 1 失败 → 这些文件名必须进 `.dockerignore`。
- **`pkill -f <模式>` 的模式若出现在自己命令行里会自杀**（本次两次 exit 143）；用 `pkill -f '^<进程名开头>'` 锚定。
- **断点续传日志里的 “out of N bytes” 是剩余区间长度，不是文件全长**；完成判定要用 sha256，别用字节数比较。

### 网络根因

当夜 DNS 摇摆、镜像变慢、docker pull 卡死的共同根因是**宿主连错了网络**（用户确认并切换后一切恢复）。次要因素：校园网 DNS（59.67.148.5/202.113.64.3）对突发解析限流，gradle 构建的并发查询会触发；以及 Tailscale MagicDNS 接管部分域。


