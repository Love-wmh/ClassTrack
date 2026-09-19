# Quality Guidelines

> 类型检查、构建、lint、格式与单元测试都是可信门禁，且由 CI 在 PR 与 master push 上强制。

---

## Overview

工具链是 ESLint 10 flat config（typescript-eslint recommended、react、react-hooks、react-refresh、prettier recommended）和 Prettier。格式配置为 `semi: false`、`singleQuote: true`、`printWidth: 140`、`tabWidth: 2`、`trailingComma: es5`。

可信门禁共五项，全部实测通过：`pnpm typecheck`（`react-router typegen && tsc`）、`pnpm build`（`react-router build`）、`pnpm lint`（`eslint . --report-unused-disable-directives --max-warnings 0`）、`pnpm format:check`、`pnpm test`（vitest）。`.github/workflows/ci.yml` 在 PR 与 master push 上运行同一组命令。

`pnpm lint` 当前为 **0 problems**。`eslint.config.js` 的 `ignores` 与 `.prettierignore` 都排除了 `.pi/`、`.agents/`、`.claude/`、`.codebuddy/`、`.codex/`、`.trellis/`（这些目录**已被 git 跟踪**，所以 `.gitignore` 管不到，必须写进各自工具的 ignore 文件；否则会扫出 `.pi/extensions/trellis/index.ts` 的千余条生成物告警）。

根目录那几个由执行环境 bind mount 的 `/dev/null` 设备文件（`.bashrc`、`.mcp.json` 等）**只在 `.gitignore` 里列了一次**，没有重复写进 `.prettierignore`。原因是 prettier 的 `--ignore-path` 默认值就是 `[.gitignore, .prettierignore]`——`.gitignore` 本来就会被读取。实测：两处都没有时 `format:check` 会因 `.mcp.json` 的 `EACCES` 以退出码 2 失败，只保留 `.gitignore` 一处则为退出码 0。

---

## Forbidden Patterns

不要提交与现有 TypeScript 规则冲突的代码：普通位置不要 `any`，不要使用 `@ts-ignore`/`@ts-expect-error`/`eslint-disable`，不要写 effect 内同步 setState、渲染期调整 state 或渲染期访问 ref。这三类写法曾出现在 `app/hooks/use-mobile.ts`、`app/components/stepper/useStepper.ts`、`app/components/stepper/Stepper.tsx`，已于 2026-09 全部清除，替代写法见 `hook-guidelines.md`；不要改回去。

不要为 agent 配置目录（`.pi/`、`.agents/`、`.claude/`、`.codebuddy/`、`.codex/`）新增 lint 规则或放宽现有规则 —— 它们已由 `eslint.config.js` 的 `ignores` 排除，规则只应对 `app/` 等源码生效。也不要把刻意注入教务页面的 `app/lib/bookmarklets/*/script.ts` 中的 console 调用误判为普通调试代码。

目前唯一的规则级例外是 `app/components/ui/**` 关闭了 `react-refresh/only-export-components`：这是 shadcn 同文件导出组件与常量/hook 的固有形态，拆文件会在 `shadcn add` 重新生成时被覆盖。该目录的其余规则（含 `react-hooks` 全套）仍然生效，因此不要往这个覆盖块里继续加规则。

---

## Required Patterns

代码保持无分号、单引号和 140 列；复杂算法、日期、迁移逻辑用中文 JSDoc（包含 `@param`、`@returns`），简单展示组件通常不写注释。UI 文案使用中文，根文档语言为 `zh-CN`。

交互反馈统一使用 `sonner`：

```ts
import { toast } from 'sonner'

toast.success('数据导入成功')
```

条件 Tailwind 类名通过 `cn()`：

```tsx
<div
  key={day}
  className={cn(
    'flex items-center justify-center border-b border-border bg-muted/60 text-xs font-medium text-muted-foreground sm:text-sm',
    day !== 7 && 'border-r'
  )}
>
  <span>{dayNames[day]}</span>
  {date && <span className="ml-1.5 text-[10px] font-normal sm:text-xs">{format(date, 'MM.dd')}</span>}
</div>
```

上述写法分别与项目的 toast 调用和 `app/features/schedule/ScheduleTable.tsx` 的 Tailwind/cn 风格一致；图标使用 `lucide-react`，响应式采用移动优先断点。

---

## Testing Requirements

测试使用 vitest：`pnpm test`（= `vitest run`）与 `pnpm test:watch`，配置在独立的 `vitest.config.ts`（刻意不复用 `vite.config.ts`，以免加载 reactRouter、tailwind、PWA 插件），`environment: 'node'`，`include: ['app/**/*.test.ts']`。测试文件与被测模块**同目录**（co-located），只覆盖纯逻辑，不覆盖组件与 hook。

**注意**：`include` 只匹配 `*.test.ts`。以后若要加 `.test.tsx` 组件测试，必须同步扩展该配置，否则测试会被静默跳过并让门禁产生虚假安全感。

已覆盖的四个纯逻辑模块是 `app/store/migrations.ts`、`app/lib/parsers/*`、`app/store/utils.ts`、`app/features/dashboard/utils.ts`（4 个文件 16 个用例）。它们最容易回归：包含时区敏感的日期推算、schema 迁移和学校 payload 解析，因此改动这些模块时必须同步补测试。

涉及日期的测试必须**显式传入** `importedAt` 与日期字符串，不得依赖 `new Date()` 的当前时刻，否则会在 CI（UTC）与本地（UTC+8）得出不同结果。

---

## Code Review Checklist

- 是否只改了任务范围内的目录，路由是否仍只是 re-export 壳？
- 是否遵循 `import type`、非导出 `type XxxProps`、Tailwind 原子类和 `cn()`？
- 是否检查 Zustand 的扁平投影与 `semesters` 同步、持久化 `partialize` 和 schema 迁移？
- 是否运行 `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm test`、`pnpm build`？五项当前全绿，其中任何一项失败都属于本次改动引入的问题，不得用抑制手段绕过。
- 是否对测试未覆盖的区域（组件、hook、页面）说明了手工验证方式或残余风险，而不是把「类型检查通过」当成行为验证？
- 是否保留中文 UI 文案和中文复杂逻辑注释，避免无关的格式或技术债重构？

---

## 提交信息（Commit Message）

**主题必须用中文写**，由 `commitlint.config.cjs` 里的内联插件规则强制，不靠自觉：

| 位置 | 规则 | 级别 |
|---|---|---|
| 主题 | 必须含中文（否则拒绝提交） | error（`subject-chinese`） |
| 正文 | 非空时应含中文 | warning（`body-chinese`，`Refs: #12` 这类英文脚注不拦） |
| `type` | 仍限定在 `build \| chore \| ci \| docs \| feat \| fix \| perf \| refactor \| revert \| style \| test` | error（`type-enum`） |
| `scope` | 保持英文标识（`widget`、`android`、`import`…），便于工具与检索 | 约定 |

```text
fix(widget): 修掉点卡片打不开 App 的问题      ✅
ci(android): 自动发布测试版 APK                ✅
fix(widget): keep card clicks working          ❌ 主题没有中文
```

- 本地：husky 的 `.husky/commit-msg` → `pnpm commitlint --edit`，`git commit` 时即被拦下；
- CI：`.github/workflows/ci.yml` 的 `commitlint` job 校验 PR 范围内的每个提交，因此 `--no-verify` 绕不过去；
- 手工自查：`pnpm exec commitlint --edit <文件>`，或对一段范围 `pnpm exec commitlint --from <A> --to <B> --verbose`；
- **不回改历史**：2026-09-20 之前的提交信息是英文的，规则从该日起对新提交生效。

## 构建环境

五项门禁在本机直接执行即可（Node 22 + pnpm 9.15.9 是当前对齐版本）。

Android 构建（`pnpm cap:build:android` 产出 debug APK）需要本机一次性补齐：JDK 21（含 `jlink`）、Android SDK（`platforms;android-36` + `build-tools;36.0.0` + `platform-tools`）、以及写入 `sdk.dir` 的 `android/local.properties`（gitignore 的机器本地文件）。步骤与排坑见 README「本机 Android 构建环境」段；`scripts/install-android.sh` 同时支持 Linux 与 macOS。

Android Studio 直接启动时，必须打开仓库内的 `android/` 目录，而不是仓库根目录；后者是 Web 工程。Gradle JDK 选择 Android Studio bundled JDK 21 或本机完整 JDK 21，完成同步后选择 `app` 运行配置。不要提交 `.idea`、`android/local.properties`、`android/gradle/gradle-daemon-jvm.properties` 或 Foojay toolchain resolver 配置：这些属于本机 IDE/缓存环境，可能让同步依赖机器路径或额外网络下载。

网络不畅时有两个入库的逃生通道：gradle 发行版可从华为云预置到 wrapper dists 目录；依赖镜像可复制 `scripts/gradle-mirrors.init.gradle` 到 `~/.gradle/init.d/`（华为云中央仓库优先、阿里云 Google Maven 其次、官方仓库兜底）。注意华为云**没有**可用的 Google Maven 镜像（实测返回 HTML）。

Android 测试版由 `.github/workflows/android-beta.yml` 自动发布（merge 进 `master` 且改动涉及 `android/**`、`app/**`、`scripts/**`、`package.json`、`pnpm-lock.yaml` 时触发，也可手动 dispatch）：跑 `pnpm cap:sync:android`、原生单元测试、编译 APK、用 `CLASS_TRACK_ANDROID_APK_PATH` 指向**本次要发布的那个包**做资产一致性校验，然后创建 `android-beta-<run_number>` 预发布并把 APK 挂上（保留最近 10 个）。签名凭据只从 Secrets 读（`ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD`），`android/app/build.gradle` 只在四个变量齐备时注册 `signingConfigs.release`；缺任一变量则工作是发 debug 包并在日志里告警，**不要**把签名密钥或 `android/local.properties` 提交进仓库。版本号由 `CLASSTRACK_VERSION_CODE` / `CLASSTRACK_VERSION_NAME` 注入（取 Actions 的 run_number），保证测试机可覆盖安装。

生产镜像是两阶段构建（Node 22 + pnpm 构建 → nginx 托管 `build/client`，监听 3000）：`docker build -t classtrack .` 与 `docker run --rm -p 3000:3000 classtrack`。SPA 深层路由回退 `index.html`，`sw.js`/manifest/`index.html` 均为 `no-cache`，哈希资产长缓存。`pnpm start` 是 SSR 模式的模板残留脚本，本项目 `ssr: false` 下必然失败，不要使用。
