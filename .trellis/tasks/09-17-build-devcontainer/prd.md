# 无状态构建容器与生产镜像修复

> **决策变更（2026-09-18，用户拍板，最终版）**：彻底放弃 devcontainer 方案，不做任何保留。
该方案曾两度完整实现并验证通过（镜像可构建、`devcontainer up` outcome=success、五项门禁容器内
全绿、容器内产出 APK、国内镜像生效；证据见 research/environment-findings.md 第 9 节），最终因宿主
环境摩擦放弃：沙箱回收跨调用后台进程、docker 基础镜像拉取依赖不稳定的镜像站链、宿主 DNS 摇摆
（事后查明共同根因是宿主连错了网络）。
R1 最终落地为**本机项目级补全 Android 构建依赖**，已在宿主实测通过（`pnpm cap:build:android` 直接产出 APK）：
`install-android.sh` 支持 Linux（OS 感知默认路径 + 从 PATH 的 javac 反推 JAVA_HOME）；宿主 SDK 补齐
`platforms;android-36`；`android/local.properties` 写入 sdk.dir（gitignore 的机器本地文件，无需环境变量）；
gradle 8.14.3 从华为云预置（sha256 校验）；`scripts/gradle-mirrors.init.gradle` 入库为可选启用的国内镜像。
AC1–AC6 相应替换为：宿主上 `pnpm cap:build:android` 直接产出 APK。R2/R3 不变。

## Goal

让「构建 ClassTrack」这件事在任何一台机器上都可复现：提供一个**只负责构建、可随时丢弃**的 devcontainer（Node 22 + pnpm 9.15.9 + JDK 21 + Android SDK），同时修好当前根本跑不通的根 `Dockerfile` 与已经失效的 `pnpm start` 及其文档。

## Background

### 构建能力目前散落在开发机的手工环境里

Android 构建依赖「本机恰好装好了」的一组东西：完整 JDK 21、Android SDK、`ANDROID_HOME`、gradle 发行版缓存。换一台机器就要手工补一遍。实测已经暴露过具体缺口（沙箱环境）：

- `ANDROID_HOME` / `ANDROID_SDK_ROOT` 均为空，`android/local.properties` 也不存在 → gradle 定位不到 SDK。
- `~/Android/Sdk/platforms/` 里只有 `android-37.0`，而 `android/variables.gradle` 要求 `compileSdkVersion = 36`。
- gradle wrapper 要的是 8.14.3，缓存里只有 8.9 / 9.4.1。
- `scripts/install-android.sh` 的默认路径写死 macOS（`/opt/homebrew/opt/openjdk@21/...`、`$HOME/Library/Android/sdk`），在 Linux 上必须靠环境变量兜。

也就是说：**构建能力没有被固化在仓库里**，而 `android/` 工程本身是健全的（53 个被跟踪文件、配置齐全、`gradlew` 与 `capacitor.build.gradle` 都已入库）。

### 根 `Dockerfile` 从未被验证过，且第一步就会失败

```dockerfile
FROM node:20-alpine AS development-dependencies-env
COPY . /app
RUN npm ci
```

三处硬伤：

1. `npm ci` + `COPY ./package-lock.json`，但仓库用的是 **pnpm**（`pnpm-lock.yaml`），**不存在 `package-lock.json`** → `COPY` 这一步就失败。
2. `node:20-alpine` 与项目实际使用的 Node 22 不一致（CI 用 22，本机实测 22.23.1）。
3. 最终镜像 `CMD ["npm", "run", "start"]`，而 `start` = `react-router-serve ./build/server/index.js`——项目是 `ssr: false`，`build/` 下**只有 `client/`，没有 `server/`**。

而 README 第 158 行仍在教用户执行 `docker build -t classtrack .`。

### `pnpm start` 是死路

`@react-router/serve@7.15.1` 确实装了，但 `react-router-serve` 要求传入一个 server 构建产物路径（`Usage: react-router-serve <server-build-path> - e.g. react-router-serve build/server/index.js`）。SPA 模式下该产物不存在，命令必然失败。README 的「启动生产服务」一节却在教用户跑它。

## Requirements

### R1 devcontainer：只负责构建，且无状态

- **R1.1** 镜像内提供构建所需的全部工具链：Node 22、pnpm 9.15.9、JDK 21（含 `jlink`，`install-android.sh` 会校验）、Android SDK（`platform-tools` + `platforms;android-36` + `build-tools;36.0.0` + `cmdline-tools`）、git。
- **R1.2** **只主动安装**构建工具链，不额外安装开发工具。实测镜像内 `gh` / `python3` / `ripgrep` 均不存在。基础镜像 `devcontainers/base` 自带的通用 CLI（`jq`、`wget`、`vim`、`sudo` 等）不逐个清理——它们是基座的一部分，且 `sudo`/`git`/`curl` 被 devcontainer 自身与 husky 依赖。本约束约束的是「我们额外装了什么」，不是「把基座削成裸系统」。
- **R1.3** 不挂载宿主机的任何配置或凭据：无 `~/.ssh`、无 `~/.gitconfig`、无 `~/.config/gh`、无 agent CLI 登录态。
- **R1.4** 不承担构建以外的职责：不启动 dev server、不转发端口、不运行 agent CLI、不做部署。
- **R1.5** 容器必须可随时删除重建而不损失任何不可再生数据。所有权威状态都在容器之外（仓库工作区 + 远端）。**允许纯缓存卷**（gradle / pnpm 下载缓存），缓存丢失只影响速度，不影响正确性。
- **R1.6** 创建后自动执行 `pnpm install --frozen-lockfile`。依赖是可再生产物，不算状态。
- **R1.7** 容器内无需任何手工配环境变量即可跑通：五项门禁，以及 `pnpm cap:build:android` 产出 debug APK。
- **R1.8** 不改变现有五项门禁与 CI 的行为。新增的 `.devcontainer/**` 中的 JSON 必须通过 `pnpm format:check`。

### R2 修好生产镜像

- **R2.1** 根 `Dockerfile` 改为 pnpm + Node 22 的正确流程，`docker build` 能真正成功。
- **R2.2** 运行方式保持 README 现有约定：`docker run --rm -p 3000:3000 classtrack`。
- **R2.3** SPA 深层路由必须回退到 `index.html`（与 `vite.config.ts` 里 PWA 的 `navigateFallback: '/index.html'` 一致），否则刷新子路由会 404。
- **R2.4** Service Worker（`sw.js`）与 manifest 不能被长缓存，否则 PWA 更新会失效。
- **R2.5** 不新增运行期依赖。
- **R2.6** `.dockerignore` 正确排除 `node_modules`、`android` 构建产物等，避免污染构建上下文。

### R3 消除失效的文档与脚本

- **R3.1** `pnpm start` 脚本**保持原样不改**（用户决定），但 README 必须标注它当前不可用及其原因（`start` 对应 SSR 模式，本项目 `ssr: false`、无 `build/server` 产物），并指向容器镜像作为生产托管方式。不得保留「文档教用户跑一条必然失败的命令」这种不一致。
- **R3.2** README 的 Docker 段与生产服务段必须与实现一致，并补一节 devcontainer 用法。

## Acceptance Criteria

- [ ] **AC1** `.devcontainer/Dockerfile` 与 `.devcontainer/devcontainer.json` 存在，配置中不含宿主机挂载、端口转发、非构建职责。
- [ ] **AC2** 镜像可构建成功（`docker build` 或 `devcontainer up` 返回 0）。
- [ ] **AC3** 容器内 `pnpm typecheck` / `pnpm lint` / `pnpm format:check` / `pnpm test` / `pnpm build` 全部退出码 0。
- [ ] **AC4** 容器内 `pnpm cap:build:android` 退出码 0，且 `android/app/build/outputs/apk/debug/app-debug.apk` 存在、大小合理。
- [ ] **AC5** 容器内不需要手工 `export` 任何变量（`ANDROID_HOME` / `JAVA_HOME` 由镜像提供）。
- [ ] **AC6** 删除容器与缓存卷后重新创建，AC3 与 AC4 仍成立（验证无状态）。
- [ ] **AC7** `docker build -t classtrack .` 成功，`docker run --rm -p 3000:3000 classtrack` 后能取到首页。
- [ ] **AC8** 深层路由（如 `/timetable`）直接请求返回 200 且内容为 SPA 入口（验证 fallback）；`/sw.js` 响应头不含长缓存。
- [ ] **AC9** 仓库五项门禁在宿主上仍然全绿，CI 仍通过。
- [ ] **AC10** README 中不再出现任何指向失效命令的说明。

## Constraints

用户已明确决定的事项，规划与实现都必须遵守：

- **C1** devcontainer **只负责构建**，不负责任何其他事情。
- **C2** devcontainer **必须无状态**。
- **C3** 允许使用纯缓存 volume。
- **C4** 只主动安装构建工具链：不额外安装 `python3` / `gh` / `ripgrep` 这类开发工具。基础镜像自带的通用 CLI 不逐个清理（准确口径见 R1.2）。
- **C5** 容器创建后自动安装依赖。
- **C6** 沙盒设备文件的 ignore 残留**保留不动**（本次不清理）。
- **C7** 禁止直推 master：分支 + PR + **rebase 合并**，master 保持纯线性。
- **C8** 项目语言为中文：注释、文档、提交信息一律中文。
- **C9** 不新增运行期依赖（`package.json` 的 `dependencies` 不得增加）。
- **C10** 禁止 `eslint-disable` / `@ts-ignore` / `@ts-expect-error` / `as any` 等抑制手段。

## Non-Goals

- 不引入 docker-in-docker，不在容器内构建镜像。
- 不提供 Android 模拟器或系统镜像，不处理 USB 真机直通。
- 不提供 Agent CLI（pi / claude / codex 等）运行环境。
- 不改动 `android/` 工程本身（不动 `variables.gradle`、签名配置等）。
- 不做 release 签名与发布流程。
- 不清理沙盒设备文件的 ignore 残留（C6）。

## Notes

- 背景来自对仓库的实测：根 `Dockerfile`、`pnpm start`、README、`android/` 实际状态都已逐条验证过，不是推断。
- 任务拆分为单任务而非父子任务：devcontainer 与生产镜像虽可独立验证，但同属「构建能力固化」这一主题，且改动量都很小，合成一个 PR 更易复核。`implement.md` 会把两者的验证门禁分开，互不阻塞。
