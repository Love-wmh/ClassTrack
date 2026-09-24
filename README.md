# ClassTrack

ClassTrack 是一个面向学生的课程管理 Web 应用，用于从高校教务系统导入课程表，并围绕课程出勤、备注和统计分析提供本地化管理能力。

## 功能特性

- **课程表查看**：按周展示课程，支持切换周次、查看课程时间、教室、教师等信息。
- **出勤标记（可选）**：可在个人中心打开「出勤统计」，然后标记单节课程是否上课、批量标记本周课程；默认关闭。
- **课程备注**：可为课程在指定周次添加备注，便于记录请假、调课或其他事项（与出勤统计无关，始终可用）。
- **数据看板**：展示课程完成度、缺勤率、周趋势、课程排名、课程分布和风险课程分析；其中完成度、缺勤率与风险课程依赖出勤统计，关闭时只展示课程分布类分析。
- **数据导入导出**：支持导出 ClassTrack 备份 JSON，也支持重新导入备份数据。
- **教务系统导入**：Android App 支持在应用内打开天津理工大学金智教务系统，登录并捕获课表响应后直接导入；普通浏览器/PWA 保留书签脚本 + JSON 降级流程。
- **本地持久化**：应用数据保存在浏览器本地 `localStorage` 中，无需后端服务。
- **应用更新提示**（仅 Android）：启动或回到前台时按可配置间隔查询 GitHub Release，发现更新就弹窗并（可选）发系统通知；更新通道可在「仅正式版 / 仅测试版 / 全部」之间切换，默认值由安装包类型决定。

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
- 版本号形如 `1.0.<序号>-beta`，序号自动取已有测试版标签的最大值 +1，因此可以直接覆盖安装上一个测试版。

发布流程在 `.github/workflows/android-release.yml`，两条轨道：

- **测试版**（prerelease）：merge 进 `master` 且改动可能影响 APK 时自动跑（也可在 Actions 页手动触发，`release_kind` 保持 `beta`）。
  触发路径见 `on.push.paths`，判据是**只算能改变 APK 内容的路径**：`app/**`、`public/**`、`android/**`，
  以及决定产物内容或打包方式的根配置（`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`capacitor.config.ts`、
  `vite.config.ts`、`react-router.config.ts`、`tsconfig.json`）。
  **进不了 APK 的改动一律不发版**：`scripts/**`（只有资产守卫会被发布步骤调用，改它只改校验）、`.github/**`（发布链路本身）、
  纯文档（`docs/**`、`.trellis/**`、README）。要验证发布链路的改动时手动触发一次即可（`release_kind` 保持 `beta`）。
  跑完编译、原生单元测试、APK 内 Web 资源与 `build/client` 的字节一致性校验后，把 APK 挂到预发布版本上。
  **历史测试版一律保留、不再清理**（2026-09-23 起）：测试者只需要 `ClassTrack-beta-latest.apk` 这一个名字，
  应用内也会自己提示新版本，所以当初「避免测试者在一堆旧包里挑」的理由不再成立。代价是资产会一直累积 ——
  每条约 21 MB（APK + `-latest` 副本），换来的是随时能装回任意一个旧测试版。
- **正式版**（非 prerelease，标记 Latest）：**只能手动触发** —— Actions → Android Release → Run workflow →
  `release_kind` 选 `stable` 并填写版本号（如 `1.2.0`）。tag **由工作流自己创建**（`v1.2.3`），不需要手工打 tag；
  推送 tag 不会触发任何发布。

  发布前工作流会校验：本次运行的提交在 `master` 上、版本号形如 `X.Y.Z`、`tag v<版本号>` 尚不存在。

两条轨道的 versionCode 都取构建时刻的 epoch 秒：跨轨道、跨 workflow 重命名都单调递增，
因此测试机能一路覆盖安装（beta → 正式版 → beta）。**不要改回 `run_number`** —— 它按 workflow
各自计数，重命名 workflow 文件就会归零并与已有标签撞名（2026-09-20 实测过一次发布失败）。

### 发布与签名

**两条轨道都只发签名包**：没有签名凭据时工作流直接失败，不会回退 debug 包。
原因很实在——debug 包与 release 包签名不同，Android 不允许互相覆盖安装，测试机只能卸载重装（App 数据会丢，得重新导入）。

签名凭据只从 4 个仓库 Secrets 读，`android/app/build.gradle` 在四个都齐备时才注册 `signingConfigs.release`：

| Secret | 内容 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | 密钥库文件（`.jks` / `.keystore`）的 base64 全文 |
| `ANDROID_KEYSTORE_PASSWORD` | 密钥库口令 |
| `ANDROID_KEY_ALIAS` | 密钥别名（本项目用 `classtrack`） |
| `ANDROID_KEY_PASSWORD` | 该别名对应私钥的口令（PKCS12 密钥库通常与库口令相同） |

生成密钥库并上传（本仓库当前使用的密钥库在本机 `~/.classtrack-secrets/classtrack-release.jks`，
口令在同目录 `keystore-password.txt`，两者都已 `chmod 600`，**请自行备份到密码管理器**）：

```bash
# 1) 生成密钥库（一次性；4096-bit RSA，有效期约 27 年）
keytool -genkeypair -keystore classtrack-release.jks -storetype PKCS12 \
  -alias classtrack -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=ClassTrack, OU=Android, O=ClassTrack, L=Tianjin, ST=Tianjin, C=CN"

# 2) 上传为仓库 Secrets（从文件读，不经命令行参数，避免出现在进程列表里）
base64 -w0 classtrack-release.jks | gh secret set ANDROID_KEYSTORE_BASE64
gh secret set ANDROID_KEYSTORE_PASSWORD < 口令文件
gh secret set ANDROID_KEY_PASSWORD < 口令文件
printf '%s' classtrack | gh secret set ANDROID_KEY_ALIAS
gh secret list   # 确认四个都在
```

也可以走网页：仓库 → **Settings → Secrets and variables → Actions → New repository secret**。
任何时候都不要把密钥库或口令提交进仓库（`.gitignore` 已排除 `*.jks` / `*.keystore`）。

**本地出签名包**（与 CI 等价）：

```bash
export CLASSTRACK_KEYSTORE_FILE=~/.classtrack-secrets/classtrack-release.jks
export CLASSTRACK_KEYSTORE_PASSWORD=$(cat ~/.classtrack-secrets/keystore-password.txt)
export CLASSTRACK_KEY_ALIAS=classtrack
export CLASSTRACK_KEY_PASSWORD=$(cat ~/.classtrack-secrets/keystore-password.txt)
export CLASSTRACK_VERSION_CODE=$(date +%s)      # 必须比已装的版本大
export CLASSTRACK_VERSION_NAME=1.0.0-local
pnpm cap:sync:android && ./android/gradlew -p android :app:assembleRelease
# 产物：android/app/build/outputs/apk/release/app-release.apk
```

核对签名方（指纹可与 `keytool -list -v` 的 SHA256 对照）：

```bash
~/Android/Sdk/build-tools/36.0.0/apksigner verify --print-certs \
  android/app/build/outputs/apk/release/app-release.apk
```

**首次切到签名包会有一次性的卸载**：此前用 debug 签名的测试包无法被覆盖安装，需要先在 App 里
「数据管理 → 导出数据」保存备份，卸载旧包、装上第一个签名包后再导入备份。此后所有测试版与正式版共用同一把密钥，
**升级安装不再冲突、数据保留**。

### 应用更新提示（仅 Android）

安装过的 APK 会自己去 GitHub Release 找新版本，不需要用户手动回仓库看。实现在 `app/lib/app-update/`（纯逻辑）
与 `app/components/app-update/`（UI），个人中心的「应用更新」卡片提供三个开关：总开关、通知栏开关、更新通道。

| 行为 | 口径 |
| --- | --- |
| 检查时机 | 冷启动 + 回到前台，按「检查间隔」节流（默认 1 天，可改为每次启动 / 3 天 / 7 天） |
| 数据源 | 一次匿名请求 `GET /repos/Love-wmh/ClassTrack/releases?per_page=20`（限流 60 次/小时，1 天 1 次远低于上限） |
| 版本判定 | 标题 `ClassTrack Android <版本>`，取不到就用 tag 反推（`v1.2.0` / `android-beta-7`），再按数字三元组比较 |
| 通道默认值 | **只在首次读到版本名时按安装包类型播种一次**：测试版包 → 全部，正式版包 → 仅正式版。之后**永久保持**，升级成另一种包也不会被重置 |
| 关闭总开关 | 不再联网检查、不再提示，「立即检查」也一并禁用 |
| 通知 | Android 13+ 需要通知权限；被拒时开关自动回退为关，卡片里给出入口 |
| 通知设置入口 | 「前往系统设置」走本应用自己的原生插件（`AppUpdatePlugin`），优先直达「应用更新」渠道页；Android 16 上系统会把这类意图统一落到应用信息页，通知行就在那里 |
| 不做的事 | 不在应用内下载或静默安装 APK，「去下载」交给系统浏览器打开 release 页面 |

验收时现网最新版本往往**等于**手头要装的版本（真机天然触发不了「有新版本」），所以判定逻辑全部由 `pnpm test` 里的纯函数用例覆盖，
真机全链路则用调试注入：先在设备上写好假数据，再用带开关的构建装包。

```bash
# 1) 让构建把 localStorage 里的假 release 数据当作 GitHub 响应（正式包不设这个变量，故不生效）
VITE_UPDATE_DEBUG=1 pnpm cap:sync:android
./android/gradlew -p android :app:assembleDebug   # 或按 README「发布与签名」出签名包

# 2) 造一条比当前安装版本更新的假 release（在设备上用 WebView 调试 / adb 注入 localStorage）
#    key = class-track-update-debug，value = GitHub Releases API 的数组形态
```

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
- 对课程进行上课/缺勤标记（需先在个人中心打开「出勤统计」）。
- 为课程添加备注。
- 在数据看板查看课程分布；打开「出勤统计」后还能看到出勤趋势、风险课程与完成度。

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
