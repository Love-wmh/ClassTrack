# 实施计划：修复 Android Studio 启动配置

## 实施清单

1. **恢复 Android Gradle settings 基线**
   - 删除 `android/settings.gradle` 中新增的 Foojay resolver 插件声明。
   - 保留现有 `app`、Cordova plugin 和 Capacitor settings 导入，不重写生成模块结构。
2. **清理本机生成配置**
   - 删除未跟踪的 `android/gradle/gradle-daemon-jvm.properties`。
   - 确认 `android/local.properties`、`android/.idea`、`android/.gradle`、构建目录仍被忽略且不进入 diff。
3. **补充 Android Studio 使用说明**
   - 在 README 的 Android 环境章节说明应打开 `android/` 目录。
   - 说明 Gradle JDK 使用 Android Studio bundled JDK 21/完整 JDK 21，并在同步后选择 `app` 运行配置。
4. **静态配置检查**
   - 对比 `android/settings.gradle` 与 HEAD，确认只移除临时插件配置。
   - 搜索 Foojay、daemon criteria、绝对 SDK 路径和 Android Studio 运行模块，确认没有新的错误依赖或敏感配置。
5. **Capacitor 链路验证**
   - 运行 `pnpm exec cap sync android`，确认生成的 Capacitor 资产和模块路径仍正常。
   - 在可用 Gradle/JDK/SDK 缓存环境运行 `cd android && ./gradlew :app:assembleDebug`。
   - 运行 `pnpm cap:build:android`（如当前环境能完成 Gradle 依赖解析），确认根目录命令不回归。
6. **最终质量检查**
   - 运行相关 `git diff --check`、`git status --short` 和任务验收搜索。
   - 将网络/DNS 或缓存造成的验证阻塞与项目配置错误分开记录。

## 验证命令

```bash
# 配置与敏感文件检查
git diff --check
git status --short
rg -n "foojay|toolchains\.foojay|gradle-daemon-jvm|sdk\.dir|/home/|/Users/" android README.md

# Capacitor 同步
pnpm exec cap sync android

# Android Debug 构建
cd android && ./gradlew :app:assembleDebug
# 预期产物：android/app/build/outputs/apk/debug/app-debug.apk

# 根目录构建入口
cd .. && pnpm cap:build:android
```

## 风险文件与回滚点

- `android/settings.gradle`：误删模块声明会导致 Android Studio 不显示 `app`；修改后必须与 HEAD 的生成基线对比。
- `android/gradle/gradle-daemon-jvm.properties`：只删除本任务新增的未跟踪生成文件；若用户本地另有未提交需求，不覆盖其他配置。
- `README.md`：仅新增 Android Studio 入口说明，不修改已有构建命令。
- 回滚时恢复 settings 的三项原始内容并撤销 README 说明；不要恢复 Foojay/daemon 文件，除非有新的、可验证的环境需求。

## 执行与验证记录

- [x] 用户已批准规划，任务已启动并进入 `in_progress`。
- [x] `android/settings.gradle` 恢复为 Capacitor 标准基线；Foojay resolver 已移除。
- [x] 删除未跟踪的 `android/gradle/gradle-daemon-jvm.properties`。
- [x] README 与 `.trellis/spec/frontend/quality-guidelines.md` 已补充 Android Studio 打开入口和 JDK 21 约束。
- [x] `pnpm exec cap sync android`、`pnpm typecheck`、`pnpm test`（4 个文件 / 16 个用例）、`pnpm format:check`、`pnpm build` 和本地 ESLint 通过。
- [x] `git diff --check` 通过，未提交 `.idea`、`local.properties`、构建产物或缓存。
- [ ] `./gradlew :app:assembleDebug` 与 `pnpm cap:build:android`：当前 agent 环境无法写入默认 Gradle 缓存；切换临时缓存后又因 DNS 无法访问 `services.gradle.org`，属于外部环境阻塞。
- [ ] `pnpm lint`：项目命令解析到系统 ESLint 6.4.0；改用项目本地 ESLint 10.4.0 已通过。
