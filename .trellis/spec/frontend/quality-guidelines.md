# Quality Guidelines

> 当前可信验证以类型检查和构建为主，质量说明必须反映项目没有测试和 CI 的现实。

---

## Overview

工具链是 ESLint 10 flat config（typescript-eslint recommended、react、react-hooks、react-refresh、prettier recommended）和 Prettier。格式配置为 `semi: false`、`singleQuote: true`、`printWidth: 140`、`tabWidth: 2`、`trailingComma: es5`。

可信门禁是 `pnpm typecheck`（`react-router typegen && tsc`）和 `pnpm build`（`react-router build`）；二者当前实测通过。`pnpm lint` 当前不能视为全绿门禁：agent 目录未被 eslint ignores 排除，会扫描 `.pi/` 等生成文件而必然失败。判断自己的改动是否干净时应按文件过滤，例如 `npx eslint app/...`。

---

## Forbidden Patterns

不要提交与现有 TypeScript 规则冲突的代码：普通位置不要 `any`，不要使用 `@ts-ignore`/`@ts-expect-error`/`eslint-disable`，不要写 effect 内同步 setState 或渲染期访问 ref。后两类现有问题分别位于 `app/hooks/use-mobile.ts:14`、`app/components/stepper/useStepper.ts:21` 和 `app/components/stepper/Stepper.tsx:20`，并触发 react-hooks lint error；它们是待处理技术债，不是可复制范式。

不要在无关任务中修改 `eslint.config.js` 来掩盖 `.pi/`、`.claude/`、`.codex/`、`.agents/`、`.codebuddy/` 未忽略导致的全仓 lint 噪音，也不要把刻意注入教务页面的 `app/lib/bookmarklets/*/script.ts` 中的 console 调用误判为普通调试代码。

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

当前没有 Vitest、Jest、Playwright、测试文件、`test` script 或 GitHub Actions CI，因此不能声称项目要求所有改动必须新增单测。现行验证是 `pnpm typecheck`、`pnpm build`、`pnpm dev` 手测，Android 相关改动还可用真机命令 `pnpm cap:install:android` 验证。

没有测试保护、最容易回归的纯逻辑区域是 `app/store/migrations.ts`、`app/lib/parsers/*`、`app/store/utils.ts` 和 `app/features/dashboard/utils.ts`。改动这些文件时应重点做类型检查、构建和针对导入/迁移/统计边界的手工验证，并如实报告没有自动化覆盖。

---

## Code Review Checklist

- 是否只改了任务范围内的目录，路由是否仍只是 re-export 壳？
- 是否遵循 `import type`、非导出 `type XxxProps`、Tailwind 原子类和 `cn()`？
- 是否检查 Zustand 的扁平投影与 `semesters` 同步、持久化 `partialize` 和 schema 迁移？
- 是否运行 `pnpm typecheck` 与 `pnpm build`，并对自己改动的 app 文件单独运行 ESLint？全仓 `pnpm lint` 失败时要区分 agent 生成文件噪音和业务文件问题。
- 是否对无测试/无 CI 的区域说明了手工验证和残余风险，而不是编造测试结果？
- 是否保留中文 UI 文案和中文复杂逻辑注释，避免无关的格式或技术债重构？
