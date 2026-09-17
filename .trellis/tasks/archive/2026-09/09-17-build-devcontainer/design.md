# 技术设计：无状态构建容器与生产镜像修复

> **落地状态（2026-09-18 终版）**：devcontainer 方案（第 1、3、4、5 节）两度实现并验证通过，
但按用户决定**彻底放弃、不入库**，本节保留作历史记录。最终交付：第 6、7 节（生产镜像与
`pnpm start` 标注，均已验证）+ 本机 Android 构建依赖补全（见 README「本机 Android 构建环境」段，
`scripts/install-android.sh` 已支持 Linux，`scripts/gradle-mirrors.init.gradle` 入库为可选镜像）。

## 1. 职责边界（先划清，实现时不得越界）

**devcontainer 负责**：把仓库里的源码变成构建产物。即 `pnpm build` 的 web 产物、`pnpm cap:build:android` 的 debug APK。

**devcontainer 不负责**：

| 不负责 | 具体表现 |
|---|---|
| 开发服务器 | 不 `pnpm dev`、不转发端口（`forwardPorts` 不出现） |
| 凭据与身份 | 不挂载 `~/.ssh`、`~/.gitconfig`、`~/.config/gh`；容器内不做 `gh auth login` |
| Agent 运行 | 不装 pi / claude / codex，不挂它们的登录态 |
| 发布 | 不 push、不部署、不碰 Vercel |
| 工具库 | 不**主动安装** `gh`、`python3`、`ripgrep`；基础镜像自带的通用 CLI（`jq` 等）不逐个清理 |
| 模拟器 | 不装 Android 模拟器与系统镜像，不处理 USB 直通 |

判断标准：**如果一个工具删掉之后 `pnpm install`、五项门禁、`pnpm cap:build:android` 仍然能跑通，它就不该由我们装进镜像里。** 注意此条只约束「我们装什么」：基础镜像自带的通用 CLI（`jq`、`wget`、`vim`、`sudo` 等）不逐个清理——要做到那一步得改用裸 `ubuntu` 基座，与 3.1 选择 `devcontainers/base` 的理由（`vscode` 用户体系、git/curl 基础件）直接冲突，得不偿失。

## 2. 交付物组成

| 文件 | 性质 | 作用 |
|---|---|---|
| `.devcontainer/Dockerfile` | 新增 | 构建工具链镜像 |
| `.devcontainer/devcontainer.json` | 新增 | 容器编排：缓存卷、自动装依赖、资源要求 |
| `Dockerfile`（根） | **改写** | 生产镜像：修掉 `npm ci` / Node 20 / 死 `CMD` |
| `.dockerignore` | 改写 | 收窄构建上下文 |
| `docker/nginx.conf` | 新增 | 生产镜像的 SPA 回退与缓存策略 |
| `package.json` | **不改动** | `start` 脚本保持原样（用户决定），仅改文档标注 |
| `README.md` | 改写相关段 | Docker 段、生产服务段、新增 devcontainer 段 |

## 3. 构建容器镜像设计

### 3.1 基础镜像

选 `mcr.microsoft.com/devcontainers/base:ubuntu-24.04`，理由：

- 自带非 root 的 `vscode` 用户（uid 1000），与 devcontainer 的 `remoteUser` 约定一致，避免权限踩坑。
- Ubuntu 24.04 的 apt 源里有 `openjdk-21-jdk`（noble 自带 JDK 21），不需要额外第三方源。
- 已含 git、curl、sudo 等基础件，减少自装量。

不用 `node:*` 官方镜像作基座：那样要反过来补 devcontainer 的用户体系与 Java/Android，且 Node 版本升级时会牵动整条链路。

### 3.2 各组件安装方式

| 组件 | 方式 | 理由 |
|---|---|---|
| Node 22 | 从 `nodejs.org` 下载官方 tarball 解到 `/usr/local`，版本用 ARG 固定 | 比 `curl \| bash` 加 NodeSource 源更确定，且能精确对齐本机实测的 22.23.1 |
| pnpm 9.15.9 | `npm install --global pnpm@9.15.9` | 不依赖 corepack 的签名校验链路（该链路在部分 Node 版本上会失败）；版本精确可控 |
| JDK 21 | `apt-get install --no-install-recommends openjdk-21-jdk` | 必须含 `jlink`（`scripts/install-android.sh` 会 `test -x "$JAVA_HOME/bin/jlink"`） |
| Android SDK | 官方 `commandlinetools` + `sdkmanager` 安装 `platform-tools`、`platforms;android-36`、`build-tools;36.0.0` | 与 `android/variables.gradle` 的 `compileSdkVersion = 36` 严格对齐 |
| git | apt | husky 的 `prepare` 钩子与 pnpm 都需要 |

### 3.3 环境变量：单一来源

`JAVA_HOME` / `ANDROID_HOME` / `ANDROID_SDK_ROOT` / `PATH` **只写在 Dockerfile 的 `ENV` 里**，不在 `devcontainer.json` 的 `containerEnv` 里重复。两处都写会产生两个真相来源，改一处漏一处就会出「本地能跑容器不能跑」的怪问题。

`JAVA_HOME` 不硬编码 `java-21-openjdk-amd64`（arm64 上是 `-arm64` 后缀），改为在构建期解析真实路径后落一个稳定符号链接：

```dockerfile
RUN ln -s "$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")" /usr/lib/jvm/current
ENV JAVA_HOME=/usr/lib/jvm/current
```

并在同一阶段加断言，让镜像自己保证「构建所需的东西真的在」：

```dockerfile
RUN test -x "$JAVA_HOME/bin/jlink" && test -x "$JAVA_HOME/bin/javac" \
 && command -v pnpm && command -v node && command -v sdkmanager
```

**这是本设计的关键手法**：与其在文档里写「请确保装了 JDK 21」，不如让镜像构建在缺件时直接失败。

### 3.4 Android SDK 的权限处理

SDK 装在 `/opt/android-sdk`，由 root 安装，最后 `chown -R vscode:vscode`。必须做这一步：`remoteUser` 是 `vscode`，而 gradle 需要往 SDK 目录写 `licenses/` 与下载中间产物，属主不对会在首次构建时报权限错误。

`android/local.properties` **不生成**。设了 `ANDROID_HOME` 之后 AGP 会自己找到 SDK，而 `local.properties` 是 gitignore 的机器本地文件——写它等于往仓库里塞机器状态，违反无状态约束。

## 4. `devcontainer.json` 设计

```jsonc
{
  "name": "ClassTrack 构建容器",
  "build": { "dockerfile": "Dockerfile", "context": "." },  // context 只用 .devcontainer，Dockerfile 不 COPY 仓库内容
  "remoteUser": "vscode",
  "mounts": [
    { "type": "volume", "source": "classtrack-gradle-cache", "target": "/home/vscode/.gradle" },
    { "type": "volume", "source": "classtrack-pnpm-store", "target": "/home/vscode/.local/share/pnpm/store" }
  ],
  "postCreateCommand": "bash .devcontainer/post-create.sh",
  "hostRequirements": { "cpus": 4, "memory": "8gb", "storage": "24gb" },
  "customizations": { "vscode": { "extensions": ["dbaeumer.vscode-eslint", "esbenp.prettier-vscode", "redhat.java", "vscjava.vscode-gradle"] } }
}
```

逐项理由：

- **两个缓存卷**：`~/.gradle`（gradle 发行版 + maven 依赖，首次约 500MB~1GB）与 pnpm store。二者都是**纯缓存**：删掉只会变慢，不会让构建失败或产出不同结果。符合「允许纯缓存 volume」（C3）。
- **不挂 `node_modules`**：它是可再生产物，且落在宿主仓库里本来就会跨次复用。
- **`postCreateCommand` 只做 `pnpm install`**：这是 C5（自动装依赖）的唯一副作用，且结果可从 lockfile 完全重建。
- **不加 `forwardPorts`**：容器不承担 dev server 职责（R1.4）。将来若要加，是新增职责，需重新讨论。
- **不带 `containerEnv`**：见 3.3，环境变量单一来源在 Dockerfile。
- **`customizations.vscode.extensions` 只放四个构建相关扩展**：ESLint/Prettier 看 JS 侧构建与门禁报错，Java/Gradle 看 Android 侧构建报错。不放 Copilot 或任何 Agent 扩展——那属于「其他事情」。

## 5. 无状态性论证

逐个说明「容器删掉后会失去什么」：

| 位置 | 内容 | 删掉容器后 | 是否可再生 |
|---|---|---|---|
| 镜像层 | 工具链 | 由 Dockerfile 重建 | ✅ |
| 仓库工作区（宿主 bind mount） | 源码、`node_modules`、`build/`、APK | 不随容器消失 | ✅（`pnpm install` / `pnpm build`） |
| `classtrack-gradle-cache` | gradle 发行版与依赖 | 消失，需重下 | ✅ |
| `classtrack-pnpm-store` | pnpm 下载缓存 | 消失，需重下 | ✅ |
| 容器内其它路径 | 临时文件 | 消失 | ✅ |

**没有任何一格是「不可再生」的**，因此满足 R1.5。特别地：容器里没有凭据、没有数据库、没有待发布的产物副本。

反过来说，**产物是构建的输出而非容器的状态**：APK 落在宿主仓库的 `android/app/build/outputs/apk/debug/app-debug.apk`（已被 gitignore），容器删掉它也还在。

## 6. 生产镜像设计

### 6.1 两阶段结构

```dockerfile
# 阶段一：构建 web 产物（Node 22 + pnpm，与 CI 同版本）
FROM node:22-bookworm-slim AS build
ENV HUSKY=0                      # 构建上下文里没有 .git，必须跳过 husky prepare
RUN npm install --global pnpm@9.15.9
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# 阶段二：静态托管（无 Node 运行期）
FROM nginx:1.29-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build/client /usr/share/nginx/html
EXPOSE 3000
```

关键点：

- **`HUSKY=0`**：`package.json` 的 `prepare` 是 `husky`，而 `.dockerignore` 排除了 `.git`，husky 在无 git 仓库时可能让 `pnpm install` 失败。用 husky 自己的开关跳过，比 `--ignore-scripts` 安全（后者会连 esbuild 的安装脚本一起跳过）。
- **先 copy 依赖清单再 install**：让依赖层可被 docker 缓存，改源码不触发重装。
- **运行期换 nginx**：SPA 构建产物是纯静态文件，继续跑 Node 只是白背一个几百 MB 的运行时和一堆 `node_modules`。用 nginx 后最终镜像不含任何 JS 运行时，也不需要新增任何运行期依赖（R2.5）。
- **监听 3000**：保住 README 已有的 `docker run --rm -p 3000:3000 classtrack`（R2.2）。

### 6.2 nginx 配置的三个必要行为

1. **SPA 回退**：`try_files $uri $uri/ /index.html`。否则直接访问 `/timetable` 这类深层路由会 404。这与 `vite.config.ts` 里 PWA 的 `navigateFallback: '/index.html'` 是同一个语义（R2.3）。
2. **Service Worker 不长缓存**：`sw.js` 与 manifest 必须 `Cache-Control: no-cache`。否则浏览器一直用旧 SW，PWA 的「提示更新」机制会失效（R2.4）。带内容哈希的 `/assets/` 则给 `immutable` 长缓存。
3. **`index.html` 不长缓存**：它是引用哈希资源的入口，被长缓存会导致发版后拿到旧入口。

## 7. `pnpm start` 的处理：脚本不动，只在文档标注

现状：`react-router-serve ./build/server/index.js`。已实测该 CLI 必须传入 server 构建产物路径，而 `ssr: false` 的构建只产出 `build/client`，所以必然失败。

**用户决定：`package.json` 完全不动**，本次不改任何运行期脚本，只修 README——把「启动生产服务 → `pnpm start`」这段改为说明现状：该脚本对应 SSR 模式，本项目是 `ssr: false`，用它必然失败；生产托管请用容器镜像。

这样本次对 `package.json` 是**零改动**，风险面最小。代价是仓库里留着一个已知不可用的脚本，因此 README 的标注必须写清原因，避免下一个人再踩这个坑。

> 已否决的两个备选：① 删 `start` 并新增 `preview: vite preview`（零新增依赖，`vite` 已在 devDependencies）；② 保留 `start` 改名指向静态服务器（需新增依赖，与 C9 冲突）。

## 8. 验证策略

分两道互不阻塞的门禁，实现阶段逐步执行：

**门禁 A（构建容器）**

1. `df -h /var/lib/docker` 确认磁盘余量（Android SDK + gradle 缓存可能吃 6~10GB）。
2. `docker build -f .devcontainer/Dockerfile -t classtrack-build .` 构建成功（镜像内的 `test -x` 断言同时被验证）。
3. `docker run --rm classtrack-build bash -lc 'node -v; pnpm -v; java -version; test -x "$JAVA_HOME/bin/jlink" && echo jlink-ok; echo "$ANDROID_HOME"; sdkmanager --list_installed'` 验证 AC5。
4. 用 `npx -y @devcontainers/cli up --workspace-folder .` 做真实编排验证（校验 `devcontainer.json` 结构 + 跑通 `postCreateCommand`），随后 `exec` 进容器跑五项门禁（AC3）。若该 CLI 不可用或有阻塞，降级为 `docker run -v "$PWD:/workspaces/ClassTrack" -w ...` 等价验证，并在任务记录中说明降级原因。
5. 容器内 `pnpm cap:build:android` 产出 APK（AC4）——首次需下载 gradle 8.14.3 与 maven 依赖，预计 10~20 分钟。
6. **无状态验证（AC6）**：`docker rm` 容器 + `docker volume rm classtrack-gradle-cache classtrack-pnpm-store`，重新创建后再跑一遍五项门禁；Android 构建视耗时决定是否二次执行，若不执行需在任务记录中说明。

**门禁 B（生产镜像）**

1. `docker build -t classtrack .` 成功（AC7 前半）。
2. `docker run -d -p 3000:3000 classtrack`，然后：首页 200、`/timetable` 200 且返回 SPA 入口、`/sw.js` 的 `Cache-Control` 为 `no-cache`、`/assets/*.js` 为 `immutable`（AC8）。
3. 清理测试容器与镜像。

**门禁 C（仓库自身）**

宿主上跑五项门禁，确认新增文件没破坏 `format:check`（`.devcontainer/devcontainer.json` 是 JSON，会落入 prettier 的检查范围）。

## 9. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 镜像体积大（Android SDK 约 2GB+） | 首次构建慢、占磁盘 | 单一 `RUN` 内完成安装并清理 apt/zip 临时文件；接受体积，构建容器本就偏大 |
| gradle 8.14.3 + maven 依赖首次下载 | 门禁 A5 可能 10~20 分钟 | 用缓存卷保留，二次构建快；首次纳入预期耗时 |
| `platforms;android-36` 不可用 | Android 构建直接失败 | 实现时先 `sdkmanager --list` 确认包名存在再写入 Dockerfile |
| nginx 标签不存在 | 生产镜像构建失败 | 先用 `docker manifest inspect` 校验标签，再落盘 |
| 构建期解析 `JAVA_HOME` 的符号链接导致个别工具误判 | gradle/AGP 行为异常 | 构建期与运行期双重断言 `$JAVA_HOME/bin/jlink`、`javac`；容器内实际跑通 Android 构建才算通过 |
| 仓库保留已知不可用的 `start` 脚本 | 下一个人可能再踩 | README 明确标注「对应 SSR 模式，本项目 `ssr: false`，必然失败」并指向容器镜像 |

## 10. 未决问题（复核时确认）

1. **是否给 CI 增加一个「构建容器可用性」任务**：能防止容器配置腐化，但每次 CI 都要重下 Android SDK，成本高。本任务默认**不做**，仅提出。
2. ~~`pnpm start` 改为 `preview`~~：**已决定保留脚本不动、只改文档**，见第 7 节。
3. **沙盒设备文件 ignore 残留**：按 C6 保留不动。沙盒已关闭，这 8 条已成历史包袱，若将来确认不再回到 bwrap 沙盒，可另开小任务清理。
