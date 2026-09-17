# 执行计划：无状态构建容器与生产镜像修复

约定：

- 每步都给出**验证命令**，不通过不进入下一步。
- **回滚点**用 `git checkout --` 或删除新增文件即可，所有改动都在独立分支上，master 不受影响。
- 提交信息用中文，遵循 conventional commits；body 每行 ≤100 字符。

---

## 阶段 0：前置核查（只读，不改文件）

### 0.1 确认 docker 与磁盘余量

```bash
docker version --format '{{.Server.Version}}'
df -h /var/lib/docker /media/yetongy/64E8E38AE8E358B65 | tail -3
```

- 期望：docker server 可用；磁盘余量 ≥ 15GB。
- 不足则先 `docker system prune` 并报告，不要硬上。

### 0.2 确认外部依赖的包名/标签真实存在

```bash
# Node 22 具体小版本
curl -fsSL https://nodejs.org/dist/index.json | head -c 2000 | rg -o '"version":"v22\.[0-9]+\.[0-9]+"' | head -3
# commandlinetools 最新包名
curl -fsI "https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip" | head -1
# nginx 标签
docker manifest inspect nginx:1.29-alpine >/dev/null 2>&1 && echo "nginx:1.29-alpine 存在" || echo "需换标签"
```

- 任一不存在就在本步确定替代值，并记入任务记录（对应 design.md 风险表的对策）。

### 0.3 建分支

```bash
git checkout -b chore/build-devcontainer
```

- **回滚点**：`git checkout master && git branch -D chore/build-devcontainer`。

---

## 阶段 1：构建容器（对应 R1 / AC1–AC6）

### 1.1 写 `.devcontainer/Dockerfile`

按 design.md 第 3 节实现：Node 22 tarball、pnpm 9.15.9、`openjdk-21-jdk`、Android SDK 到 `/opt/android-sdk`、`chown vscode`、`JAVA_HOME` 稳定符号链接、结尾断言。

必须包含的断言（镜像自证）：

```dockerfile
RUN test -x "$JAVA_HOME/bin/jlink" && test -x "$JAVA_HOME/bin/javac" \
 && command -v node && command -v pnpm && command -v git && command -v sdkmanager
```

### 1.2 构建镜像

```bash
docker build -f .devcontainer/Dockerfile -t classtrack-build .devcontainer
```

- 验证：退出码 0。首次预计 5~15 分钟（Android SDK 下载占大头）。
- **回滚点**：删除 `.devcontainer/`。

### 1.3 运行时断言（AC5）

```bash
docker run --rm classtrack-build bash -lc '
  set -e
  node -v; pnpm -v; java -version 2>&1 | head -1
  test -x "$JAVA_HOME/bin/jlink" && echo "jlink OK"
  echo "ANDROID_HOME=$ANDROID_HOME"
  test "$ANDROID_HOME" = /opt/android-sdk
  sdkmanager --list_installed | rg -e "platforms;android-36|build-tools;36.0.0|platform-tools"
'
```

- 验证：三条 SDK 包都出现在 `--list_installed` 中，且不需要手工 export 任何变量。

### 1.4 写 `.devcontainer/devcontainer.json`

按 design.md 第 4 节：两个缓存卷、`postCreateCommand: pnpm install --frozen-lockfile`、`hostRequirements`、四个构建相关扩展；**不得出现** `forwardPorts`、宿主机挂载、`containerEnv`。

```bash
pnpm format            # 确保 JSON 过 prettier
pnpm format:check      # 验证：退出码 0
```

### 1.5 真实编排验证 + 五项门禁（AC2、AC3）

优先用 devcontainer CLI：

```bash
npx -y @devcontainers/cli up --workspace-folder . 2>&1 | tail -20
npx -y @devcontainers/cli exec --workspace-folder . bash -lc '
  pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
'
```

- 验证：`outcome=success`，且五项门禁退出码全 0。
- 降级路径：CLI 不可用或有阻塞时，用等价的 `docker run -v "$PWD:/workspaces/ClassTrack" -w /workspaces/ClassTrack classtrack-build bash -lc 'pnpm install --frozen-lockfile && ...'`，并在任务记录里写明降级原因（不能默默跳过 AC2）。

### 1.6 Android 构建（AC4）

```bash
npx -y @devcontainers/cli exec --workspace-folder . bash -lc 'pnpm cap:build:android'
ls -la android/app/build/outputs/apk/debug/app-debug.apk
```

- 验证：退出码 0；APK 存在且大小合理（预期几 MB）。首次需下载 gradle 8.14.3 与 maven 依赖，预计 10~20 分钟。

### 1.7 无状态验证（AC6）

```bash
docker rm -f $(docker ps -aq --filter ancestor=classtrack-build) 2>/dev/null || true
docker volume rm classtrack-gradle-cache classtrack-pnpm-store 2>/dev/null || true
# 重新 up + 再跑五项门禁
```

- 验证：缓存卷删除后五项门禁仍全绿（证明「缓存丢了只是变慢」）。
- Android 二次构建视耗时决定；若跳过，必须在任务记录中写明该 AC 的覆盖范围。

---

## 阶段 2：生产镜像（对应 R2 / AC7–AC8）

### 2.1 写 `docker/nginx.conf`

按 design.md 6.2 实现：监听 3000、SPA 回退、`/assets/` long-cache + immutable、`sw.js`/manifest `no-cache`、`index.html` 不缓存。

### 2.2 改写根 `Dockerfile`

按 design.md 6.1：多阶段、`HUSKY=0`、pnpm 9.15.9、`pnpm build`、nginx 托管 `build/client`。

### 2.3 改写 `.dockerignore`

必须排除：`node_modules`、`build`、`.react-router`、`android`、`ios`、`.git`、`.github`、`.devcontainer`、`.trellis`、`.pi`、`.claude`、`.codex`、`.codebuddy`、`.agents`、`docs`。

### 2.4 构建并验证（AC7、AC8）

```bash
docker build -t classtrack .
docker run -d --rm --name classtrack-smoke -p 3000:3000 classtrack
sleep 2
curl -s -o /dev/null -w '首页 %{http_code}\n'            http://127.0.0.1:3000/
curl -s -o /dev/null -w '/timetable %{http_code}\n'      http://127.0.0.1:3000/timetable
curl -sI http://127.0.0.1:3000/sw.js        | rg -i 'cache-control'   # 期望 no-cache
curl -sI http://127.0.0.1:3000/            | rg -i 'cache-control'   # index 不缓存
ASSET=$(curl -s http://127.0.0.1:3000/ | rg -o '/assets/[^"]+\.js' | head -1)
curl -sI "http://127.0.0.1:3000$ASSET"     | rg -i 'cache-control'   # 期望 immutable
docker stop classtrack-smoke
```

- 验证：两个路由均 200，且 `/timetable` 返回的 HTML 与首页同为 SPA 入口；三处 `Cache-Control` 符合预期。

---

## 阶段 3：文档（对应 R3 / AC10）

### 3.1 固化 `pnpm start` 现状（脚本不改）

```bash
pnpm start 2>&1 | head -5     # 期望：报找不到 build/server/index.js
```

- 用户已决定 **`package.json` 完全不动**，因此本步只产出证据，供 README 标注引用。
- **不得**顺手删掉或改写 `start`，也**不得**新增 `preview`（两者都是被否决的方案）。

### 3.2 README

- 修「启动生产服务」段：**保留 `pnpm start` 脚本不动**，把这段改为说明现状（该脚本对应 SSR 模式，本项目 `ssr: false`、无 `build/server` 产物，执行必然失败），并把生产托管指向容器镜像。
- 修 Docker 段：说明实际流程与端口 3000。
- 新增「构建容器（devcontainer）」段：用途、如何启动、能跑什么、**明确的边界**（只负责构建、无状态、不含凭据）。

---

## 阶段 4：收尾（对应 R1.8 / AC9–AC10）

### 4.1 宿主门禁（AC9）

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
```

### 4.2 更新 spec（Phase 3.3）

在 `.trellis/spec/frontend/quality-guidelines.md` 增补一节「构建环境」，写明：五项门禁可用构建容器执行、容器只负责构建且无状态、生产镜像的构建方式与端口。**不复制 design.md 的取舍过程**，只留结论与使用方式。

### 4.3 提交与 PR（C7）

- 提交分组（每笔一个主题，conventional commits + 中文）：
  1. `build(devcontainer): 新增只负责构建的无状态容器`
  2. `fix(docker): 修正生产镜像的 pnpm 流程与静态托管`
  3. `docs: 修正 README 中失效的生产服务与 Docker 说明`（不改任何脚本）
- 分支 `chore/build-devcontainer` → PR → 等 CI 绿 → **rebase 合并** → 删远端分支（git 网络不通时用 `gh api -X DELETE .../git/refs/heads/<branch>`）。
- journal 记录本会话。

---

## 复核结论（已完成，进入实现前确认）

1. `pnpm start`：**保留脚本不动，只改文档标注**。删脚本与新增 `preview` 两个方案均被否决，见 design.md 第 7 节。
2. CI：**不新增构建容器可用性任务**，保持现状（仅宿主五项门禁）。
3. 阶段 1.5 使用 `@devcontainers/cli` 作为本地验证工具，不进仓库依赖，已确认。
4. 沙盒设备文件的 ignore 残留：按 C6 保留不动。

## 终版执行结果（2026-09-18）

- 阶段 1（devcontainer）：两度完整实现并验证通过，最终按用户决定**彻底放弃、不入库**（决策记录见 prd.md 首部）。
- 替代落地（本机依赖补全）：宿主 SDK 补 `platforms;android-36`、`android/local.properties` 写入 sdk.dir、
  gradle 8.14.3 华为云预置（sha256 校验）、`scripts/install-android.sh` 支持 Linux、`scripts/gradle-mirrors.init.gradle` 入库。
  宿主上 `pnpm cap:build:android` 实测 BUILD SUCCESSFUL，APK 7155869 字节。
- 阶段 2（生产镜像）：已验证。`docker build -t classtrack .` 成功；首页与 `/timetable` 均 200 且返回 SPA 入口；
  `/sw.js` 与 `/` 返回 `Cache-Control: no-cache`，`/assets/*` 返回 `immutable`。nginx 标签由 1.29 改为本机已有的 1.27-alpine。
- 阶段 4.1 宿主门禁：五项全绿。提交分组调整为：①fix(android) 本机构建依赖 ②fix(docker) 生产镜像 ③docs README 与 ignore ④chore(task) 任务资料。
