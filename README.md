# ClassTrack

ClassTrack 是一个面向学生的课程管理 Web 应用，用于从高校教务系统导入课程表，并围绕课程出勤、备注和统计分析提供本地化管理能力。

## 功能特性

- **课程表查看**：按周展示课程，支持切换周次、查看课程时间、教室、教师等信息。
- **出勤标记**：支持标记单节课程是否上课，也支持批量标记本周课程。
- **课程备注**：可为课程在指定周次添加备注，便于记录请假、调课或其他事项。
- **数据看板**：展示课程完成度、缺勤率、周趋势、课程排名、课程分布和风险课程分析。
- **数据导入导出**：支持导出 ClassTrack 备份 JSON，也支持重新导入备份数据。
- **教务系统导入**：Android App 支持在应用内打开天津理工大学金智教务系统，登录并捕获课表响应后直接导入；普通浏览器/PWA 保留书签脚本 + JSON 降级流程。
- **本地持久化**：应用数据保存在浏览器本地 `localStorage` 中，无需后端服务。

## 已支持学校

当前已配置课程解析器和书签脚本导出器的学校：

- 天津理工大学
- 天津工业大学

## 技术栈

- React 19
- React Router 7
- TypeScript
- Vite
- Tailwind CSS 4
- shadcn/ui + Radix UI
- Zustand + Immer
- Recharts
- Sonner
- date-fns

## 项目结构

```text
app/
├── components/          # 通用组件、UI 组件、导入流程组件、步骤条组件
├── features/            # 业务页面模块
│   ├── dashboard/       # 数据看板
│   ├── data-management/ # 数据管理
│   ├── layout/          # 应用布局
│   ├── profile/         # 个人中心
│   └── schedule/        # 课程表
├── lib/                 # 课程解析器、书签脚本适配器、工具函数和类型
├── routes/              # React Router 页面路由
├── store/               # Zustand 状态管理
├── app.css              # 全局样式
├── root.tsx             # 应用根组件
└── routes.ts            # 路由配置

docs/                    # 解析器与书签脚本导入系统设计文档
public/                  # 静态资源
```

## 快速开始

### 环境要求

- Node.js 22（CI 使用的版本）
- pnpm

> 构建 Android 还需要 JDK 21 与 Android SDK，一次性补齐步骤见[本机 Android 构建环境](#本机-android-构建环境)。

### 安装依赖

```bash
pnpm install
```

### 启动开发服务

```bash
pnpm dev
```

启动后根据终端提示访问本地开发地址。

### 类型检查

```bash
pnpm typecheck
```

### 代码检查

```bash
pnpm lint
```

### 格式化

```bash
pnpm format
```

### 构建生产版本

```bash
pnpm build
```

### 提交信息

提交信息用中文写主题（`type(scope): 中文主题`），例如 `fix(widget): 修掉点卡片打不开 App 的问题`；`type` 与 `scope` 保持英文。
本地由 husky + commitlint 在 `git commit` 时校验，CI 也会校验 PR 里的每个提交，`--no-verify` 绕不过去。规则与例外见 `.trellis/spec/frontend/quality-guidelines.md` 的「提交信息」一节。

### 安装到 Android 手机

代码改完后，连接已开启 USB 调试的 Android 手机，执行：

```bash
pnpm cap:install:android
```

该命令会先执行 `cap sync` 和 Debug APK 构建，再校验 APK 内的 `assets/public` 与最新 `build/client` 完全一致，最后覆盖安装并重新打开 ClassTrack。需要本机有完整 JDK 21 和 Android SDK；校验失败时不会安装旧 APK。

本机还没有 JDK 21 或 Android SDK 时，先按[本机 Android 构建环境](#本机-android-构建环境)补齐。

### 下载测试版（beta）

不接手机、也不想自己编译时，可以直接下载 CI 出来的测试版 APK：

- 打开仓库的 **Releases**，找最新的 `android-beta-*` 预发布版本；
- 下载 `ClassTrack-beta-latest.apk`（这个文件名永远指向最新测试版）或带版本号的那个；
- 版本号形如 `1.0.<构建号>-beta`，构建号单调递增，因此可以直接覆盖安装上一个测试版。

发布流程在 `.github/workflows/android-release.yml`，两条轨道：

- **测试版**（prerelease）：merge 进 `master` 且改动可能影响 APK 时自动跑（也可在 Actions 页手动触发）。
  触发路径见 `on.push.paths`：`app/**`、`public/**`、`android/**`、`scripts/**`、`.github/**`，
  以及决定产物内容或打包方式的根配置（`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`capacitor.config.ts`、
  `vite.config.ts`、`react-router.config.ts`、`tsconfig.json`、`index.html`）。纯文档（`docs/**`、`.trellis/**`、`README`）改动不发版。
  跑完编译、原生单元测试、APK 内 Web 资源与 `build/client` 的字节一致性校验后，把 APK 挂到预发布版本上，只保留最近 10 个。
- **正式版**（非 prerelease，标记 Latest）：推送形如 `v1.2.3` 的 tag 时自动跑。

  ```bash
  git tag v1.2.3 && git push origin v1.2.3
  ```

  版本号取 tag 去掉前缀 `v`；工作流要求该 tag 指向 `master` 上的提交，且**必须**用签名包，
  否则直接失败 —— 正式版不会发未签名包。

两条轨道的 versionCode 都取自 Actions 的 `run_number`，它在两条轨道之间单调递增，
因此测试机能一路覆盖安装（beta → 正式版 → beta）。

签名凭据只从 Secrets 读：`ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD`。
四个都配好之前，测试版发的是 debug 包（日志里会有警告），正式版则会被上面的校验直接拦下。

### 启动生产服务

本项目是纯 SPA（`react-router.config.ts` 中 `ssr: false`），生产环境由 [Docker 镜像](#docker)托管静态产物。

仓库里的 `pnpm start`（`react-router-serve ./build/server/index.js`）**当前不可用**：该命令需要 SSR 模式的服务端产物 `build/server/index.js`，而本项目的 `pnpm build` 只产出 `build/client`，没有 `build/server`。它属于模板残留脚本，本次保留原样未改动，请勿按它启动服务。
## 使用说明

### 导入课程数据

1. 打开应用后选择学校。
2. 选择导入方式：
   - Android App 中选择“应用内打开教务系统”，在内嵌页面完成登录并进入课表详情后点击“导入当前课表”。
   - 普通浏览器/PWA 使用书签脚本从教务系统导出课程表 JSON。
   - 或导入已有的 ClassTrack 备份 JSON。
3. 如果使用 Android 应用内导入：
   - 确认学年学期代码和本学期第一周第一天。
   - 在应用内完成登录、验证码和课表导航；ClassTrack 不接触账号密码或 Cookie。
   - 若未捕获响应，刷新课表详情页后重试。
4. 如果使用浏览器书签脚本导入：
   - 确认学年学期代码。
   - 将“数据导出器”拖拽到浏览器书签栏/收藏栏，或复制脚本代码手动创建书签。
   - 打开学校教务系统课程表页面。
   - 点击书签栏中的“数据导出器”导出 JSON 文件。
   - 回到 ClassTrack 上传导出的 JSON 文件。

### 管理课程

- 在课程表页面切换周次查看不同周的课程。
- 对课程进行上课/缺勤标记。
- 为课程添加备注。
- 在数据看板查看出勤趋势、风险课程和课程分布。

### 数据备份

在“数据管理”页面可以导出当前数据备份。备份文件可在后续重新导入，用于迁移或恢复本地数据。

## 数据存储

ClassTrack 使用浏览器 `localStorage` 保存数据，存储键为 `class-track-storage`。数据不会自动上传到服务器。更换浏览器、清理浏览器数据或更换设备前，建议先在“数据管理”页面导出备份。

## 扩展学校适配

项目支持扩展新的学校课程解析器和书签脚本适配器：

- 课程解析器位于 `app/lib/parsers/`
- 书签脚本适配器位于 `app/lib/bookmarklets/`
- Android 应用内导入 bridge 位于 `android/app/src/main/java/com/classtrack/app/`，只允许天津理工大学固定 HTTPS 入口和课表接口。
- 相关设计文档位于 `docs/`

新增学校适配后，需要在对应的 `index.ts` 注册解析器、学校信息和书签脚本适配器；原生应用内导入还需要在 Android bridge 中增加经过白名单校验的 adapter。普通 Web/PWA 不能绕过同源策略获得原生捕获能力。

## Docker

`Dockerfile` 用两阶段构建生产镜像：第一阶段用 Node 22 + pnpm 构建 web 产物，第二阶段用 nginx 托管 `build/client`，最终镜像不含 Node 运行期。

```bash
docker build -t classtrack .
docker run --rm -p 3000:3000 classtrack
```

镜像监听 3000 端口，并且：

- 深层路由回退到 `index.html`，直接访问 `/timetable` 这类地址不会 404；
- `sw.js` 与 manifest 返回 `Cache-Control: no-cache`，保证 PWA 的“提示更新”机制生效；
- 带内容哈希的 `/assets/*` 使用长缓存加 `immutable`。

## 本机 Android 构建环境

在 Android Studio 中打开 Android 工程时，请直接打开仓库内的 `android/` 目录，不要打开仓库根目录。Gradle JDK 请选择 Android Studio bundled JDK 21，或本机配置的完整 JDK 21；工程同步完成后，选择 `app` 运行配置即可部署 Debug 应用到模拟器或已连接的设备。Android Studio 的 `.idea` 配置和 `android/local.properties` 均为本机文件，不提交到仓库。

在 Linux 或 macOS 上构建 Android，需要一次性补齐：

1. **JDK 21**（含 `jlink`）：Linux 用 `sudo apt install openjdk-21-jdk`，macOS 用 `brew install openjdk@21`。
2. **Android SDK**：需要 `platforms;android-36`、`build-tools;36.0.0`、`platform-tools`（Linux 默认路径 `~/Android/Sdk`，macOS 默认 `~/Library/Android/sdk`）。
3. **`android/local.properties`**：写入 `sdk.dir=<你的 SDK 绝对路径>`。该文件已被 gitignore，是机器本地配置；有了它 gradle 不需要任何环境变量。
4. gradle wrapper 首次运行会下载 gradle 8.14.3（约 200MB）。网络慢时可从国内镜像预置：

   ```bash
   mkdir -p ~/.gradle/wrapper/dists/gradle-8.14.3-all/10utluxaxniiv4wxiphsi49nj
   curl -fL -o ~/.gradle/wrapper/dists/gradle-8.14.3-all/10utluxaxniiv4wxiphsi49nj/gradle-8.14.3-all.zip \
     https://repo.huaweicloud.com/gradle/gradle-8.14.3-all.zip
   ```

5. 依赖下载慢或 `dl.google.com` 不通时，可启用国内镜像（华为云中央仓库优先、阿里云 Google Maven 其次，官方仓库仍保留为兜底）：

   ```bash
   cp scripts/gradle-mirrors.init.gradle ~/.gradle/init.d/
   ```

完成后：

```bash
pnpm cap:build:android    # sync、构建并校验 android/app/build/outputs/apk/debug/app-debug.apk
pnpm test:android-assets    # 运行资产一致性检查的回归测试
pnpm cap:install:android  # 构建、校验并安装到已连接的手机（脚本同时支持 Linux 与 macOS）
```
