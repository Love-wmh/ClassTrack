# 技术设计：清理质量门禁

## 决策总览

| # | 决策 | 触及文件 | 行为是否改变 |
|---|---|---|---|
| D1 | `use-mobile` 改用 `useSyncExternalStore` | `app/hooks/use-mobile.ts` | 是（首帧即为正确值，属修复） |
| D2 | `useStepper` 删除 clamp effect，clamp 收敛到「读取时 + method 切换事件」 | `app/components/stepper/useStepper.ts`、`app/components/import-flow/useImportFlow.ts` | 否（逐条论证见下） |
| D3 | `previousStep` 从 ref 上移到 `useStepper` 的 state，`Stepper` 变纯展示组件 | `useStepper.ts`、`Stepper.tsx`、`ImportDialog.tsx` | 否 |
| D4 | 解析器去掉 `any`，改为类型化 payload + 运行时校验 | `app/lib/parsers/*/parser.ts`、`*/types.ts` | 否（禁止引入任何类型强制转换） |
| D5 | 对 `app/components/ui/**` 关闭 `react-refresh/only-export-components` | `eslint.config.js` | 否 |
| D6 | `commitlint.config.cjs` 走 prettier 自动修复 | `commitlint.config.cjs` | 否 |
| D7 | 新增四项 CI | `.github/workflows/ci.yml` | 否 |
| D8 | 引入 vitest 5 + `vitest.config.ts`（独立于 `vite.config.ts`） | `package.json`、`vitest.config.ts`、4 个 `*.test.ts` | 否 |
| D9 | `getMarkKey` 收敛到 `app/store/utils.ts` | `dashboard/utils.ts`、`ScheduleTable.tsx` | 否 |
| D10 | 沙箱设备文件写入 `.gitignore` + `.prettierignore` | 两个 ignore 文件 | 否 |
| D11 | 删除 4 个已合并分支 | 远端 + 本地引用 | 否 |

---

## D1 `use-mobile` 改用 `useSyncExternalStore`

现状（`app/hooks/use-mobile.ts:12-15`）在 effect 内同步 `setIsMobile`，触发 `react-hooks/set-state-in-effect`：

```ts
const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)
React.useEffect(() => {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  const onChange = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
  mql.addEventListener('change', onChange)
  setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)   // ← 违规点
  return () => mql.removeEventListener('change', onChange)
}, [])
```

改为 `useSyncExternalStore`（React 官方推荐的「订阅外部系统」原语）：

```ts
import { useSyncExternalStore } from 'react'

const MOBILE_BREAKPOINT = 768
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onStoreChange: () => void) {
  const mediaQueryList = window.matchMedia(MOBILE_QUERY)
  mediaQueryList.addEventListener('change', onStoreChange)
  return () => mediaQueryList.removeEventListener('change', onStoreChange)
}

function getSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches
}

function getServerSnapshot() {
  return false
}

export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
```

**行为差异（可接受且属修复）**：原实现首帧返回 `false`（`undefined` → `!!undefined`），随后 effect 才纠正。移动端首帧因此会短暂渲染桌面布局。新实现首帧即返回真实值。`react-router.config.ts` 是 `ssr: false`，`getServerSnapshot` 仅在无 DOM 的降级路径使用。

**保持**：断点常量 `768`、返回类型 `boolean`、导出名 `useIsMobile` 不变（`AppLayout`、`SchedulePage` 等调用方无需改动；已确认调用方只关心布尔结果）。

---

## D2 `useStepper` 的 clamp：删除 effect

现状（`app/components/stepper/useStepper.ts:19-21`）：

```ts
useEffect(() => {
  setCurrentStep((step) => Math.min(step, maxStep))
}, [maxStep])
```

### 关键约束

本仓库 `eslint.config.js` 启用了新版 `eslint-plugin-react-hooks` 的编译器规则集，其中：

- `react-hooks/set-state-in-effect = [2]`
- `react-hooks/set-state-in-render = [2]` ← **React 官方文档推荐的「渲染期调整 state」写法同样被禁**
- `react-hooks/refs = [2]`

因此「effect 内 clamp」和「渲染期 clamp」两条常规出路都被堵死，必须改变 clamp 的发生位置。

### 唯一会缩小 `maxStep` 的路径

`useStepper` 全仓只有一个调用方：`app/components/import-flow/useImportFlow.ts:46`，`stepCount = steps.length`，而 `steps` 在 `backupImportSteps`（2 步）与 `parserImportSteps`（4 步）之间切换。缩小只可能由**用户切换导入方式**引起，即 `ImportDialog` 的 `onImportMethodChange` 事件。

**实测补充（2026-09-17，浏览器交互验证后）**：该夹取路径**在真实 UI 中不可达**。切换导入方式的控件（`ImportSchoolStep` 的两个 `OptionCard`）只在 `currentStep === 0` 时渲染（见 `ImportDialog.renderStepContent` 的首个分支），而 `currentStep = 0` 对 2 步与 4 步流程都合法。经 `rg` 穷举，`onImportMethodChange` 仅由 `ImportSchoolStep` 触发、`setSelectedImportMethod` 仅由本次新增的包装器调用，因此不存在「`currentStep > 0` 时缩小 `maxStep`」的路径。
结论：原 clamp effect 是纯防御性代码；本次把它下沉到事件处理中不会改变任何可观测行为，读取时夹取则作为不变量保险保留。

### 方案

1. **删除 effect**。`useStepper` 不再对 `stepCount` 变化做反应。
2. **读取时 clamp**：对外暴露的 `currentStep` 改为 `Math.min(currentStep, maxStep)`，保证不变量「暴露值恒有效」。
3. **method 切换事件里显式 clamp**：在 `useImportFlow` 包一层 handler，把原 effect 的「永久 clamp」语义搬到事件处理器（事件处理器内 setState 不受任何规则限制）：

```ts
const handleImportMethodChange = useCallback(
  (method: ImportMethod) => {
    setSelectedImportMethod(method)
    const nextStepCount = (method === 'backup' ? backupImportSteps : parserImportSteps).length
    stepper.goToStep(Math.min(stepper.currentStep, nextStepCount - 1))
  },
  [setSelectedImportMethod, stepper]
)
```

### 行为等价性论证

`goToStep` 内部按**当前**（尚未切换的）`maxStep` 再夹一次，两个方向都正确：

| 切换 | 目标值 | 当前 maxStep | `goToStep` 结果 | 原 effect 结果 |
|---|---|---|---|---|
| parser(第 3 步) → backup | `min(3, 1) = 1` | 3 | 1 | 1 ✅ |
| backup(第 1 步) → parser | `min(1, 3) = 1` | 1 | 1 | 1 ✅ |

**为什么两个机制都要**：只有读取时 clamp 的话，内部 state 仍保留超界值，若之后 `stepCount` 变大（parser → backup → parser）会「跳回」旧步；只有事件 clamp 的话，任何未来新增的直接改 `stepCount` 的调用方都会绕过不变量。两者叠加才既保住旧语义又保住不变量。

### 被否决的替代方案

| 方案 | 否决原因 |
|---|---|
| 渲染期 `if (currentStep > maxStep) setCurrentStep(maxStep)` | 被 `react-hooks/set-state-in-render` 判为 error |
| 在 `setCurrentStep` 的 updater 内顺带 `setPreviousStep` | updater 必须是纯函数；`react-hooks/purity` / `immutability` 会报错，且 StrictMode 下可能重复执行 |
| 保留 effect + `eslint-disable` | 违反 PRD 约束（禁止抑制手段） |
| 干脆不 clamp，交给调用方 | 会静默产生超界步数，`isLastStep` 等派生值失真 |

---

## D3 `previousStep` 上移到 `useStepper`

现状（`app/components/stepper/Stepper.tsx:10-15`）在渲染期读 ref：

```ts
const previousStepRef = useRef(currentStep)
const previousStep = previousStepRef.current     // ← react-hooks/refs：渲染期访问 ref
useEffect(() => { previousStepRef.current = currentStep }, [currentStep])
```

`previousStep` 的唯一用途是给 `StepperItem` 判断连接线的动画方向（`movingForward = currentStep > previousStep`）。

### 方案：把「上一步」交给真正拥有步进状态的一方

`useStepper` 才是状态的 owner，且它的状态变更**全部发生在事件处理器内**（`goToStep` / `goBack` / `goNext` / `reset`），因此可以在那里合法地记录 `previousStep`。

关键实现细节：把 `current` 与 `previous` 合并为**一个 state 对象**，在同一个纯 updater 里原子更新，既避免「updater 内 setState」的副作用，又保住原有的函数式更新语义：

```ts
type StepState = { current: number; previous: number }

const [stepState, setStepState] = useState<StepState>({ current: initialStep, previous: initialStep })

const goToStep = useCallback((step: number) => {
  setStepState((state) => {
    const next = Math.max(0, Math.min(step, maxStep))
    return next === state.current ? state : { current: next, previous: state.current }
  })
}, [maxStep])

const goBack = useCallback(() => {
  setStepState((state) => (state.current === 0 ? state : { current: state.current - 1, previous: state.current }))
}, [])

const goNext = useCallback(() => {
  setStepState((state) => (state.current >= maxStep ? state : { current: state.current + 1, previous: state.current }))
}, [maxStep])

const reset = useCallback(() => {
  setStepState((state) => (initialStep === state.current ? state : { current: initialStep, previous: state.current }))
}, [initialStep])
```

返回值新增 `previousStep: stepState.previous`，`currentStep` 取 `Math.min(stepState.current, maxStep)`（D2 的读取时 clamp）。

### 连带改动

- `Stepper.tsx`：props 增加 `previousStep: number`，删除 `useRef` / `useEffect` / `useRef` 导入。组件变成**纯展示组件**，不再自己记状态——这本来就是更正确的边界划分。
- `ImportDialog.tsx:72`：`<Stepper steps={...} currentStep={...} previousStep={importFlow.previousStep} />`。
- `useStepper` 的返回 `useMemo` 依赖数组需补 `previousStep`。

### 行为差异（可忽略）

实测更正（2026-09-17，浏览器交互验证后）：原先推断「新实现可能多播一次方向动画」**不成立**。原实现在 clamp effect 生效后同样会渲染出 `(currentStep=1, previousStep=3)`，与改造后的计算结果一致，因此两者的连接线动画表现相同。
真正被消除的差异是**中间帧**：原实现会先以未夹取的 `currentStep` 渲染一次（此时 `currentStep` 可能超过当前可见步骤数，属于越界渲染），再由 effect 纠正；新实现从第一次渲染起就是夹取后的合法值。这是改进，不是回归。

---

## D4 解析器去 `any`

现状 `parse(data: any)` 与 `generateClassId(rawClass: any)`（tjut 1 处、tjpu 2 处）。

### 目标契约

`app/lib/types.ts` 已声明 `ClassParser.parse: (data: unknown) => Class[]`——`any` 与这个契约自相矛盾，改为 `unknown` 才是正解。

### 方案

为每所学校补一个 payload 类型（tjut 已有 `types.ts`，tjpu 需新建），并用结构校验 + 单次断言收敛：

```ts
// types.ts
export interface RawClass { /* 字段同现状，保持中文行内注释风格 */ }

export interface RawClassPayload {
  datas?: {
    cxxszhxqkb?: {
      rows?: RawClass[]
    }
  }
}
```

```ts
// parser.ts
export function parse(data: unknown): Class[] {
  const rawClasses = readRawClasses(data)
  if (rawClasses.length === 0) throw new Error('未解析到课程数据')
  return rawClasses.map(toClass)
}

function readRawClasses(data: unknown): RawClass[] {
  const payload = data as RawClassPayload | null | undefined
  const rows = payload?.datas?.cxxszhxqkb?.rows
  return Array.isArray(rows) ? rows : []
}
```

边界处单次 `as` 断言 + 紧随其后的 `Array.isArray` 运行时校验，与仓库既有做法一致（`app/store/migrations.ts` 的 `normalizeClasses` 就是 `Array.isArray(value) ? (value as Class[]) : []`）。

### 行为等价性的硬要求

**禁止引入任何类型强制转换**：不得写 `Number(rawClass.SKXQ)`、`String(rawClass.KCH)`、默认值兜底等。原实现是把原始值**原样**透传给 `Class` 字段，改类型只是给这些原样透传的值加注解。一旦加入转换，畸形数据的行为就会改变——这超出了本次清理的范围。

`throw new Error('未解析到课程数据')` 的触发条件必须与原来完全相同（`rows` 不是数组，或数组为空）。

### 残余风险（如实记录，不掩盖）

`RawClass` 的字段类型是**从使用处推断**的，没有教务系统 schema 佐证。若真实 payload 把 `SKXQ` 等字段给成字符串，类型注解会与运行时不符——但这一状况在 tjut 的 `types.ts` 里**早已存在**，本次不新增风险，也不在本轮修复范围。

---

## D5 `react-refresh/only-export-components` 的配置化处理

3 个 warning 全部来自 shadcn 生成物同文件导出组件 + 常量/hook：

- `app/components/ui/badge.tsx` → `badgeVariants`
- `app/components/ui/button.tsx` → `buttonVariants`
- `app/components/ui/sidebar.tsx` → `useSidebar`

这是 shadcn 的固有组织方式。拆文件会让这些文件与上游模板脱节，`pnpm dlx shadcn@latest add` 重新生成时会被覆盖，且 `sidebar.tsx` 有 702 行、`useSidebar` 被大量组件引用。

**方案**：在 `eslint.config.js` 增加一个仅作用于 UI 生成物的覆盖块，关闭该规则；其余规则（含 `react-hooks` 全套）对 `app/components/ui/**` 依然生效：

```js
{
  files: ['app/components/ui/**/*.{ts,tsx}'],
  rules: {
    'react-refresh/only-export-components': 'off',
  },
},
```

**不采用**把 `app/components/ui/**` 加进全局 `ignores`（会连带放弃对该目录的其他规则检查，包括正在生效的 `react-hooks` 编译器规则）。

---

## D6 `commitlint.config.cjs`

2 个 `prettier/prettier` error（`type-enum` 数组需折成一行、`;` 需删除）。直接：

```bash
npx eslint --fix commitlint.config.cjs
```

---

## D7 CI 设计

`.github/workflows/ci.yml`：

```yaml
name: CI

on:
  pull_request:
    branches: [master]
  push:
    branches: [master]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm test
      - run: pnpm build
```

要点：

- **必须显式固定 pnpm 版本**：`package.json` 没有 `packageManager` 字段，`pnpm/action-setup` 无版本会报错。本地实测 pnpm 为 `9.15.9`，与仓库 `pnpm-lock.yaml` 的 lockfileVersion 一致。
- Node 22（本地 `v22.23.1`）。
- `--frozen-lockfile` 保证 CI 不会偷偷改依赖。
- 沙箱那 8 个 bind mount 文件在 GitHub runner 上不存在，`format:check` 只要 `.prettierignore` 正确即可通过。
- `concurrency` 取消被取代的运行，避免排队。

---

## D8 vitest 接入

### 兼容性已验证

`vitest@5.0.1` 的 peer 声明为 `vite: '^6.4.0 || ^7.0.0 || ^8.0.0'`，仓库当前 `vite@8.0.14` 落在范围内；`@types/node` peer 为 `^22.0.0 || >=24.0.0`，与仓库 `@types/node@^22` 匹配。**无需**降级 Vite，也无需退回 `node:test`。

### 配置隔离

`vite.config.ts` 挂了 `reactRouter()`、`tailwindcss()`、`VitePWA()` 三个插件，直接复用会让单元测试走整套应用构建管线。因此新增独立的 `vitest.config.ts`（vitest 优先读 `vitest.config.*`）：

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['app/**/*.test.ts'],
  },
})
```

- `environment: 'node'`：四个目标模块都是纯逻辑（`store/utils.ts` 只用 date-fns，`dashboard/utils.ts` 只用 `Date`），不需要 jsdom，因此**不引入 jsdom/happy-dom 依赖**。
- 显式 alias 而非 `resolve.tsconfigPaths`：不依赖 Vite 8 专有特性，行为稳定。
- 显式 alias 生效后，测试文件里继续用 `~/store/utils` 这类仓库惯用导入。

### 测试文件位置

与被测模块同目录（co-located）：`app/store/migrations.test.ts` 等。`react-router build` 只打包被引用的模块，测试文件不会被带入产物；`tsc` 会检查它们（`tsconfig.json` 的 `include` 是 `**/*`），符合预期。

### 用例要求（每模块 ≥3，含边界与非 happy path）

| 模块 | 必测项 |
|---|---|
| `app/store/migrations.ts` | 空数据 → `createEmptyAppData`；旧扁平结构（无 `semesters`）→ 自动生成一个学期并投影；`inferSemesterCode` 取众数、`formatSemesterName` 把 `2025-2026-1` 转成中文名；`ensureUniqueSemesterId` 冲突时加后缀；`normalizeImportedData` 对非对象返回 `null` |
| `app/lib/parsers/*` | `parseWeeks('1010')` → `[1,3]`；`generateClassId` 拼接格式；`parse` 正常 payload 的字段映射；`parse` 对空/畸形 payload 抛 `'未解析到课程数据'` |
| `app/store/utils.ts` | `getMarkKey` 格式；`createPastClassMarks` 在有 `firstWeekStartDate` 时按真实日期判断；无起始日期时按 `currentWeek` + 星期 + 时刻回退判断；已过去的周次全部补标 |
| `app/features/dashboard/utils.ts` | `safeRate(0,0) === 0`；`formatPercent(NaN) === '0%'`；`toChineseWeekday` 1→一、7→日、越界回退数字；`getDashboardRange` 无起始日期时回退到 `fallbackWeek` 且 `hasDateBase === false`；`expandCourseSessions` 展开周次并挂上 mark |

**时区注意**：`createPastClassMarks` 依赖本地时区，测试必须用「显式传入 `importedAt` + 显式 `firstWeekStartDate`」构造，不得依赖 `new Date()` 的当前时刻，否则会在 CI（UTC）与本地（UTC+8）行为不一致。

---

## D9 `getMarkKey` 收敛

- 唯一实现保留在 `app/store/utils.ts`。
- `app/features/dashboard/utils.ts` 删除本地实现，改为从 `~/store/utils` 导入（`expandCourseSessions` 内部使用）。若该文件的 `getMarkKey` 已被外部导入，需一并改为从 `~/store/utils` 导入——**实现时必须先用 `rg` 确认所有导入点**。
- `app/features/schedule/ScheduleTable.tsx` 的 `classMarks[\`${classId}-${week}\`]` 改为 `classMarks[getMarkKey(classId, week)]`。
- 注意 `ScheduleTable` 里 `${course.dayOfWeek}-${section}` 是**课表网格坐标**，与出勤标记键无关，**不得**误改。

---

## D10 沙箱设备文件的 ignore

8 个路径：`.bash_profile`、`.bashrc`、`.gitconfig`、`.mcp.json`、`.profile`、`.ripgreprc`、`.zprofile`、`.zshrc`。

已实测确认**无法删除**：`rm` 返回 `Device or resource busy`，`findmnt -T .mcp.json` 显示 `udev[/null] devtmpfs ro` —— 是沙箱把这些路径 bind mount 到 `/dev/null`。

两个文件都要改，理由不同：

- `.gitignore`：阻止 git 把设备节点当作未跟踪文件（防止误 `git add -A`）。
- `.prettierignore`：**`format:check` 读的是 `.prettierignore` 而不是 `.gitignore`**。不加的话 prettier 会对 `.mcp.json` 报 `EACCES: permission denied`，退出码为 2，门禁永远红。

两个文件都使用**根锚定**写法（与 `.gitignore` 既有的 `/node_modules/` 风格一致），避免误伤未来可能出现在子目录里的同名文件：

```gitignore
# 执行环境 bind mount 的 /dev/null（字符设备），不是项目文件
/.bash_profile
/.bashrc
/.gitconfig
/.mcp.json
/.profile
/.ripgreprc
/.zprofile
/.zshrc
```

`.mcp.json` 是个取舍：它是 MCP 客户端的常规配置文件名，根锚定忽略会挡住未来真的要提交的 `.mcp.json`。当前仓库没有 MCP 配置，且该路径已被沙箱占用，因此接受此取舍并在此记录。

---

## D11 分支清理

删除 `chore/trellis-bootstrap`、`chore/trellis-finish-bootstrap` 的本地与远端引用。两者的提交均已通过 rebase 合并进 master（提交内容在 master 上以新 SHA 存在），删除分支不会丢失任何提交。

顺序：先删远端（`git push origin --delete`），再删本地（`git branch -D`，rebase 合并后 git 不认为它们「已合并」，`-d` 会拒绝，故需 `-D`）。

---

## 行为等价性要求（汇总）

以下运行期行为**必须与改动前一致**，任何不一致都视为缺陷：

1. `createPastClassMarks` 的两条判定路径与补标结果（D9 只改变调用的键函数来源，不改算法）。
2. `getDashboardRange` / `expandCourseSessions` 的统计范围与展开结果。
3. 解析器对合法 payload 的字段映射结果，以及对非法 payload 抛出的错误信息。
4. 解析器**不得**新增任何类型强制转换或默认值兜底（D4）。
5. `useStepper` 的步进边界：`goBack` 不越过 0，`goNext` 不越过 `maxStep`，`reset` 回到 `initialStep`（D2/D3 的重构必须保住）。

以下行为差异是**有意为之**，需在 PR 说明中列出：

1. `useIsMobile` 首帧即返回真实值（原来首帧返回 `false`）。
2. 原先记录为「method 切换时连接线可能多播一次方向动画」，**经浏览器实测已推翻**：两种实现的动画表现相同；实际差异是原实现会多一次越界中间帧，新实现没有。
3. 切换导入方式时步数被 clamp 的时机从「渲染后 effect」提前到「事件处理中」（对外可观测结果相同）。

---

## 兼容性与回滚

- **数据兼容性**：本设计不触碰 `AppData`、`CLASS_TRACK_SCHEMA_VERSION`、`localStorage` key 或持久化结构，`schemaVersion` 仍为 3，无需迁移。已有用户的本地数据不受影响。
- **依赖兼容性**：新增 1 个 devDependency（`vitest`）。已验证与 `vite@8.0.14`、`@types/node@^22` 的 peer 范围匹配。运行期依赖零新增。
- **回滚**：每项决策独立成一个 commit，任意一项可单独 revert 而不影响其余。
  - D1/D2/D3/D4/D9 的回滚需同时 revert 对应测试改动（若测试断言了新行为）。
  - D7/D8 回滚只需删除 workflow / 测试文件与 devDependency。
  - D10 回滚即删除两处 ignore 条目（沙箱文件会重新出现在 `git status`）。
  - D11 **不可回滚**（分支引用删除后需重新 push 才能恢复），但内容已全在 master，无信息损失——因此放在最后一步执行。

## 风险登记

| 风险 | 影响 | 缓解 |
|---|---|---|
| D2/D3 的 stepper 重构改变了步骤跳转行为 | 导入流程卡住或跳错步 | 保留 `goBack`/`goNext` 的函数式更新语义；按 implement.md 的清单手工走一遍两种导入方式的完整流程 |
| `vitest` 安装触发 pnpm 严格 peer 校验失败 | 无法执行 `pnpm test` | 已预先核对 peer 范围；若仍失败，改用 `node:test`（Node 22 内置，零依赖），并在 PR 中说明 |
| `.prettierignore` 的根锚定写法未生效 | `format:check` 仍报 EACCES | 改完立即跑 `pnpm format:check` 实测退出码，而非仅凭语法判断 |
| D4 的类型化掩盖了真实数据的类型不符 | 运行时字段类型与注解不符 | 已在 D4 记录为既有残余风险；本轮不做转换、不放宽校验 |
| CI 使用的 pnpm 版本与本地不一致 | CI 与本地 lockfile 行为差异 | workflow 固定 `version: 9`，与本地 `9.15.9` 同一大版本 |
