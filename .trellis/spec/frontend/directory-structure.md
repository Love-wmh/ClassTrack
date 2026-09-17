# Directory Structure

> ClassTrack 前端按路由壳、业务 feature、共享组件、框架无关工具和 Zustand store 分层组织。

---

## Overview

源码根目录是 `app/`，项目使用 React Router 的纯 SPA 配置（`react-router.config.ts` 中 `ssr: false`），没有服务端 loader/action 或后端数据层。业务页面主要放在 `app/features/`，持久化状态集中在 `app/store/`，共享类型和纯函数放在 `app/lib/`。

路由入口只负责注册或转发，不在其中堆放业务逻辑。顶层 `docs/` 是中文设计方案和修复记录，可用于了解历史决策。

---

## Directory Layout

```text
app/
├── routes.ts                 # 唯一路由注册处
├── routes/                   # 路由转发壳，不写业务逻辑
├── root.tsx                  # Layout、App、ErrorBoundary
├── app.css                   # 全局主题、变体和关键帧
├── components/
│   ├── ui/                   # shadcn/ui 组件
│   ├── common/               # 跨 feature 复用的业务组件
│   ├── dialog/               # 全局弹窗
│   ├── import-flow/          # 导入向导及其 hook
│   ├── markdown/             # Milkdown Markdown 封装
│   ├── stepper/              # 步骤条及其子组件
│   └── pwa/                  # PWA 组件
├── features/<feature>/       # 业务模块
│   ├── <Feature>Page.tsx
│   ├── components/
│   ├── hooks/
│   ├── constants.ts
│   └── utils.ts
├── hooks/                    # 全局 hook
├── lib/                      # 类型、工具、导出、解析器和书签脚本
└── store/                    # Zustand store、slice、迁移和工具
```

例如 `app/routes/_layout.tsx` 只做转发：

```tsx
export { default } from '~/features/layout/AppLayout'
```

解析器和书签适配器按学校成对放置，并分别通过索引注册；例如学校目录使用 `app/lib/parsers/<school>/` 与 `app/lib/bookmarklets/<school>/`。注册表的真实入口分别是 `app/lib/parsers/index.ts` 中的 `parsers`/`schools` 和 `app/lib/bookmarklets/index.ts` 中的 `bookmarkletAdapters`：

```ts
// app/lib/parsers/index.ts
export const parsers: ClassParser[] = [tianjinUniversityOfTechnologyParser, tianjinPolytechnicUniversityParser]
```

---

## Module Organization

当前 feature 包括 `schedule`、`dashboard`、`course-management`、`substitute-management`、`data-management`、`profile` 和 `layout`。页面根组件直接位于 feature 根目录并以 `Page.tsx` 结尾；只被一个 feature 使用的组件放在该 feature 的 `components/`，被至少两个 feature 使用的业务组件才提升到 `app/components/`。

feature 内的纯计算放在该 feature 的 `utils.ts`，字面量和调色板放在 `constants.ts`（目前 `schedule` 使用）。框架无关且跨业务的能力放在 `app/lib/`，而不是放入某个页面目录。

不要把逻辑重新放入 `app/routes/*.tsx`。例如 `app/routes/dashboard.tsx` 等入口是 re-export 壳，实际页面实现位于 `app/features/dashboard/`。

---

## Naming Conventions

- 组件文件使用 PascalCase，如 `ScheduleTable.tsx`、`ScheduleCourseCell.tsx`。
- 页面组件使用 `<Feature>Page.tsx`，并由页面模块 default export。
- hook 函数使用 `useXxx`；文件名实际同时存在驼峰和连字符形式，例如 `app/features/dashboard/hooks/useDashboardStats.ts` 与 `app/hooks/use-mobile.ts`，不要为了统一而批量改名。
- 纯函数和常量使用 camelCase 文件名，store slice 使用 `xxxSlice.ts`。
- 学校目录使用全小写连字符。

---

## Examples

- `app/features/schedule/ScheduleTable.tsx`：feature 内页面组件，使用 `./ScheduleCourseCell` 引入私有子组件，并在本模块中处理网格布局。
- `app/features/dashboard/hooks/useDashboardStats.ts`：dashboard 私有 hook，统计计算留在 feature hook/utils 中。
- `app/components/stepper/`：共享步骤条及 `useStepper`，因为它跨页面复用而不归属于单一 feature。
- `app/store/slices/dataSlice.ts`：业务状态 mutation 集中在 data slice，`app/store/migrations.ts` 负责状态版本迁移。
- `app/features/substitute-management/export.ts`：该 feature 的导出逻辑就近放在 feature 根目录；`export.ts` 不是所有 feature 都有。
