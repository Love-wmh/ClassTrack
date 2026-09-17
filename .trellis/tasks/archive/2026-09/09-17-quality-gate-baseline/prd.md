# 清理质量门禁：清零 lint、建立 CI 与测试基线

## Goal

把仓库的质量门禁从「部分不可用」推进到「四项全绿且由 CI 强制执行」：清零既有 11 个 lint 问题、建立 typecheck/build/lint/format 四项 CI、引入 vitest 覆盖四个高风险纯逻辑区、统一 `getMarkKey` 来源，并清理已合并分支与沙箱设备文件。

## Background

上一轮（PR #1）已让 `eslint.config.js` 与 `.prettierignore` 排除 `trellis init` 生成的 Agent 配置目录，`pnpm lint` 从 1021 problems 降到 11。这 11 个是**长期存在的既有问题**，不是新引入的，且其中 3 个是 `error` 级别——在 CI 接入后必须先清零，否则 CI 无法成为可信门禁。

同时仓库存在三个结构性缺口：

1. **没有 CI**：所有检查只靠 husky 本地钩子，而本地钩子只对 staged 文件生效，挡不住「推上去才发现构建坏」。
2. **没有任何测试**：`app/store/migrations.ts`、`app/lib/parsers/*`、`app/store/utils.ts`、`app/features/dashboard/utils.ts` 四个纯逻辑区完全无保护，包含时区敏感的日期推算与 schema 迁移逻辑，一旦回归只能靠人工发现。
3. **`getMarkKey` 有三处重复实现**：出勤标记键是跨课表/看板/store 的隐式契约，重复实现意味着任何一处改动都可能静默破坏数据一致性。

## Requirements

### R1 清零既有 11 个 lint 问题

| 规则 | 数量 | 位置 |
|---|---|---|
| `react-hooks/refs` | 1 | `app/components/stepper/Stepper.tsx` |
| `react-hooks/set-state-in-effect` | 2 | `app/hooks/use-mobile.ts`、`app/components/stepper/useStepper.ts` |
| `prettier/prettier` | 2 | `commitlint.config.cjs` |
| `react-refresh/only-export-components` | 3 | `app/components/ui/badge.tsx`、`button.tsx`、`sidebar.tsx` |
| `@typescript-eslint/no-explicit-any` | 3 | `app/lib/parsers/*/parser.ts` |

- 必须通过**真实重构**或**有明确依据的规则配置**解决。
- **禁止**使用 `eslint-disable`、`@ts-ignore`、`@ts-expect-error`、`as any` 等抑制手段（仓库当前对四者零使用，须保持）。
- `react-refresh/only-export-components` 的 3 个 warning 已确认是 shadcn 固有模式（组件与常量/hook 同文件导出），通过**对 `app/components/ui/**` 关闭该规则**解决。

### R2 建立 CI

新增 `.github/workflows/ci.yml`，在 PR 与 master push 时运行四项检查，全部必须通过：

- `pnpm typecheck`
- `pnpm build`
- `pnpm lint`
- `pnpm format:check`

### R3 引入 vitest 并覆盖四个高风险纯逻辑区

- 新增 `vitest` 为 **devDependency**，提供 `pnpm test` 脚本。
- 覆盖范围（每个模块至少 3 个用例，含边界与非 happy path）：
  1. `app/store/migrations.ts` —— schema 迁移、归一化、学期代码推断与命名
  2. `app/lib/parsers/*` —— `parseWeeks`、`generateClassId`、`parse` 的解析与异常路径
  3. `app/store/utils.ts` —— `createPastClassMarks` 两条判定路径（有/无 `firstWeekStartDate`）
  4. `app/features/dashboard/utils.ts` —— `getDashboardRange`、`expandCourseSessions`、`safeRate`、`formatPercent`、`toChineseWeekday`
- `pnpm test` 接入 CI。

### R4 统一 `getMarkKey`

出勤标记键的唯一来源收敛到 `app/store/utils.ts`，消除 `app/features/dashboard/utils.ts` 的重复定义与 `app/features/schedule/ScheduleTable.tsx` 的手写字符串拼接。

### R5 清理沙箱设备文件

仓库根目录 8 个路径（`.bash_profile`、`.bashrc`、`.gitconfig`、`.mcp.json`、`.profile`、`.ripgreprc`、`.zprofile`、`.zshrc`）是执行环境 bind mount 上去的 `/dev/null` 字符设备：

- 必须写进 `.gitignore`（阻止 git 看见）
- 必须写进 `.prettierignore`（`format:check` 读的是 `.prettierignore` 而非 `.gitignore`，否则 `EACCES` 会让 `format:check` 退出码为 2）
- **删除不可行**：`rm` 返回 `Device or resource busy`，`findmnt` 显示 `udev[/null] devtmpfs ro` bind mount。本项**不要求**删除。

### R6 清理已合并分支

删除 4 个已完成分支：`chore/trellis-bootstrap`、`chore/trellis-finish-bootstrap`（各含本地与远端）。

## Constraints

- **不得直接提交或推送到 `master`**：全部改动走分支 + PR，合并方式为 rebase and merge，master 保持纯线性、零 merge commit。
- 提交信息遵循 conventional commits（`type-enum` 见 `commitlint.config.cjs`），正文用中文，**每行 ≤100 字符**（commitlint `body-max-line-length`）。
- **不新增运行期依赖**；`vitest` 只能进 `devDependencies`。
- 不改动 `app/` 下的业务行为：解析器、日期推算、出勤统计的**运行期结果必须与改动前一致**（详见 design.md 的行为等价性要求）。
- 不修改 `app/components/ui/**` 的实现（仅调整 lint 规则配置）。
- 项目语言为中文：新增注释、测试描述、文档一律用中文。

## Acceptance Criteria

- [ ] `pnpm lint` 退出码 `0`，输出 `0 problems`（含 warning，因脚本带 `--max-warnings 0`）
- [ ] `pnpm format:check` 退出码 `0`（含 8 个沙箱设备文件路径，靠 `.prettierignore` 排除）
- [ ] `pnpm typecheck` 退出码 `0`
- [ ] `pnpm build` 退出码 `0`
- [ ] `pnpm test` 退出码 `0`，且 4 个目标模块各有不少于 3 个用例
- [ ] `.github/workflows/ci.yml` 存在，包含 `typecheck`、`build`、`lint`、`format:check` 四个步骤
- [ ] `.gitignore` 与 `.prettierignore` 均覆盖 8 个沙箱设备文件名；`git status --short` 不再列出它们
- [ ] `rg -n "function getMarkKey" app` 只返回 1 处（`app/store/utils.ts`）
- [ ] `rg -n "eslint-disable|@ts-ignore|@ts-expect-error|as any" app` 无输出
- [ ] 4 个已合并分支的本地与远端引用均已删除
- [ ] `app/` 与 `commitlint.config.cjs` 的行为型改动可逐条对应到 design.md 中的决策项
- [ ] `.trellis/spec/frontend/quality-guidelines.md` 已更新：测试从「无」变为「vitest + `pnpm test`」，lint 从「11 个既有问题」变为「全绿 + CI 强制」
- [ ] 改动通过一个 PR 合并到 master，master 历史仍为纯线性

## Out of Scope

- 为 UI 组件、hook、页面补测试（本轮只覆盖纯逻辑区）
- 分支保护（需要仓库主授予 Admin 权限，另议）
- Android / Capacitor 构建进入 CI（需 JDK+SDK，成本另议）
- 把 `app/components/ui/**` 加入 `eslint.config.js` 的全局 `ignores`（会失去对 shadcn 组件的其他规则检查）

## Notes

- 沙箱设备文件是执行环境产物，不是项目文件；如果环境重建后又出现，ignore 配置可自动兜住。
- 清零 lint 后，四项检查才具备成为 master 必需状态检查的前提；启用 branch protection 仍需仓库主授权。
