# 执行计划：清理质量门禁

> 决策依据全部在 `design.md`，本文件只排执行顺序、校验命令与回滚点。
> 全程遵守：不直推 master；分支 + PR；提交信息正文每行 ≤100 字符。

## 阶段 A：准备

- [ ] **A1** 确认工作区干净、master 与远端一致
  ```bash
  git status --short          # 期望：无输出（沙箱设备文件将在 A2 之后被 ignore）
  git rev-parse --short master origin/master
  ```
- [ ] **A2** 从 master 拉出工作分支
  ```bash
  git checkout -b chore/quality-gate-baseline
  ```
- [ ] **A3** 确认 `node_modules` 存在（缺失则 `TMPDIR=/tmp pnpm install --frozen-lockfile --prefer-offline`）

**回滚点 R0**：`git checkout master && git branch -D chore/quality-gate-baseline`

---

## 阶段 B：按 design.md 逐项实施

每个子项一个 commit，保证可单独 revert。**顺序不可调**：lint 必须在全部 5 项修复后才能全绿，因此校验放在 B6 之后。

### B1 配置与格式层面的 lint 问题（D5 + D6）

- [ ] `eslint.config.js`：在 `ignores` 块之后新增仅作用于 UI 生成物的覆盖块
  ```js
  {
    files: ['app/components/ui/**/*.{ts,tsx}'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  ```
- [ ] `npx eslint --fix commitlint.config.cjs`
- [ ] 校验：
  ```bash
  npx eslint app/components/ui commitlint.config.cjs
  ```
  期望：无输出、退出码 0
- [ ] 提交 `fix(lint): 补齐配置与格式层面的 lint 问题`

### B2 `use-mobile` 改用 `useSyncExternalStore`（D1）

- [ ] 按 design.md D1 重写 `app/hooks/use-mobile.ts`（保留 `MOBILE_BREAKPOINT = 768`、导出名 `useIsMobile`）
- [ ] 校验：
  ```bash
  npx eslint app/hooks/use-mobile.ts
  ```
  期望：退出码 0
- [ ] 提交 `fix(hooks): use-mobile 改用 useSyncExternalStore`

**回滚点 R1**：`git revert <B2 sha>`（单独 revert 不影响其他项）

### B3 步进状态重构（D2 + D3）—— 本任务风险最高的改动

- [ ] 读 `app/components/stepper/useStepper.ts`、`Stepper.tsx`、`StepperItem.tsx`、`app/components/dialog/ImportDialog.tsx`、`app/components/import-flow/useImportFlow.ts` 全文后再动手
- [ ] `useStepper.ts`：按 design.md D3 把 `current` / `previous` 合并为单个 `StepState`，在纯 updater 内原子更新；删除 clamp effect；暴露 `previousStep` 与读取时 clamp 后的 `currentStep`
- [ ] `Stepper.tsx`：props 增加 `previousStep: number`，删除 `useRef` / `useEffect` 与相关逻辑，改为纯展示
- [ ] `ImportDialog.tsx`：传入 `previousStep={importFlow.previousStep}`
- [ ] `useImportFlow.ts`：按 design.md D2 包一层 `handleImportMethodChange`，并对 `setSelectedImportMethod` 的对外暴露做替换
- [ ] 校验：
  ```bash
  pnpm typecheck
  npx eslint app/components/stepper app/components/import-flow app/components/dialog/ImportDialog.tsx
  rg -n 'useRef|useEffect' app/components/stepper/Stepper.tsx    # 期望：无输出
  ```
- [ ] **行为校验（必做）**：实际走一遍导入向导，两种导入方式都要覆盖
  - 打开导入弹窗 → 连点「下一步」到末步 → 确认无法再前进
  - 连点「返回」到首步 → 确认无法再后退
  - 在 parser 流程第 3 步切换到 backup 方式 → 确认落在第 1 步且不报错、不越界
  - 在 backup 第 1 步切回 parser → 确认停在第 1 步
  - 关闭再打开弹窗 → 确认复位到第 0 步
  - 优先用 `agent-browser` skill 做浏览器端验证；若该环境不可用，**必须如实报告为未验证**并在 PR 中标注需人工确认，不得声称已验证
- [ ] 提交 `fix(stepper): 重构步进状态以消除 ref 与 effect 违规`

**回滚点 R2**：`git revert <B3 sha>`

### B4 解析器去 `any`（D4）

- [ ] tjut：`app/lib/parsers/tianjin-university-of-technology/types.ts` 增加 `RawClassPayload`；`parser.ts` 改 `parse(data: unknown)` + `generateClassId(rawClass: RawClass)` + `readRawClasses` 辅助函数
- [ ] tjpu：新建 `app/lib/parsers/tianjin-polytechnic-university/types.ts`（`RawClass` + `RawClassPayload`，字段名沿用现有 parser 用到的 14 个），`parser.ts` 同构改造
- [ ] **禁止**新增任何类型强制转换或默认值兜底（`Number()`/`String()`/`??` 兜底一律不许）
- [ ] 校验：
  ```bash
  npx eslint app/lib/parsers
  rg -n ': any|as any' app/lib/parsers          # 期望：无输出
  git diff --stat -- app/lib/parsers            # 确认只动了 parser/types，未动映射逻辑的值
  ```
- [ ] 逐字段 diff 复核 `rawClass.X → 字段` 的映射未被改动（这是「运行期行为不变」的直接证据）
- [ ] 提交 `fix(parsers): 用类型化 payload 替换 any`

### B5 统一 `getMarkKey`（D9）

- [ ] 先确认所有导入点：
  ```bash
  rg -n 'getMarkKey' app
  ```
- [ ] 唯一实现保留在 `app/store/utils.ts`；`app/features/dashboard/utils.ts` 删除本地实现，`expandCourseSessions` 改用 `~/store/utils` 的导入；所有外部导入点同步改路径
- [ ] `ScheduleTable.tsx` 的 `` classMarks[`${classId}-${week}`] `` 改用 `getMarkKey(classId, week)`
- [ ] **不得**改动 `${course.dayOfWeek}-${section}`（那是课表网格坐标，不是出勤标记键）
- [ ] 校验：
  ```bash
  rg -n 'function getMarkKey' app        # 期望：仅 1 处，位于 app/store/utils.ts
  pnpm typecheck
  ```
- [ ] 提交 `refactor(store): 统一 getMarkKey 的唯一来源`

### B6 lint 总门禁（阶段 B 的收口）

- [ ] 校验：
  ```bash
  pnpm lint
  ```
  **期望：`0 problems`，退出码 0。这是本任务 R1 的验收点。**
  若仍有问题，定位并回到对应 B 子项修复，不得用抑制手段绕过。
- [ ] 校验：
  ```bash
  pnpm typecheck
  rg -n 'eslint-disable|@ts-ignore|@ts-expect-error|as any' app   # 期望：无输出
  ```

### B7 引入 vitest 并补测试（D8）

- [ ] 安装：`pnpm add -D vitest`（记录实际安装版本；确认 `vite` 未被降级，`pnpm-lock.yaml` 的 vite 仍为 8.x）
- [ ] `package.json` 增加脚本：`"test": "vitest run"`、`"test:watch": "vitest"`
- [ ] 新增 `vitest.config.ts`（内容见 design.md D8）
- [ ] 新增 4 个测试文件（与被测模块同目录）：
  - `app/store/migrations.test.ts`
  - `app/lib/parsers/tianjin-university-of-technology/parser.test.ts`（另一所学校可合并或各建一个）
  - `app/store/utils.test.ts`
  - `app/features/dashboard/utils.test.ts`
- [ ] 用中文写测试描述（`describe` / `it`）
- [ ] **时区硬要求**：`createPastClassMarks` 的用例必须显式传入 `importedAt` 与 `firstWeekStartDate`，不得依赖 `new Date()` 的当前时刻
- [ ] 校验：
  ```bash
  pnpm test
  npx eslint app/**/*.test.ts
  pnpm typecheck
  ```
  期望：用例全部通过；4 个目标模块各有 ≥3 个用例（用 `pnpm test --reporter=verbose` 核对用例数）
- [ ] 提交 `test: 引入 vitest 并覆盖四个纯逻辑模块`

### B8 CI（D7）

- [ ] 新增 `.github/workflows/ci.yml`（内容见 design.md D7）
- [ ] 校验：
  ```bash
  node -e "const y=require('fs').readFileSync('.github/workflows/ci.yml','utf8'); ['typecheck','lint','format:check','test','build'].forEach(s=>{if(!y.includes('pnpm '+s)) throw new Error('缺少 '+s)}); console.log('五个步骤均已包含')"
  npx prettier --check .github/workflows/ci.yml || true   # yml 不在 format 脚本的 glob 内，仅参考
  ```
- [ ] 提交 `ci: 新增 typecheck/build/lint/format 检查`

### B9 忽略沙箱设备文件（D10）

- [ ] `.gitignore` 与 `.prettierignore` 各追加 8 条**根锚定**条目（见 design.md D10）
- [ ] **禁止**尝试删除这些文件（已确认是 bind mount，`rm` 返回 `Device or resource busy`）
- [ ] 校验：
  ```bash
  git status --short                     # 期望：不再出现那 8 个路径
  git check-ignore -v .mcp.json .bashrc  # 期望：命中两处新增规则
  pnpm format:check                      # 期望：退出码 0（这是 D10 的真正验收点）
  ```
  **注意**：`format:check` 在 D10 之前必然以退出码 2 失败（`.mcp.json` EACCES），这是本次要解决的问题本身。
- [ ] 提交 `chore: 忽略执行环境 bind mount 的设备文件`

---

## 阶段 C：整体校验门

- [ ] **C1** 五项命令全绿（逐条执行并记录退出码）：
  ```bash
  pnpm typecheck
  pnpm lint
  pnpm format:check
  pnpm test
  pnpm build
  ```
- [ ] **C2** 行为回归自查（对照 design.md「行为等价性要求」5 条，给出逐条证据）
- [ ] **C3** 确认 `app/` 下改动未触及 `AppData` / `CLASS_TRACK_SCHEMA_VERSION` / localStorage key：
  ```bash
  rg -n 'class-track-storage|CLASS_TRACK_SCHEMA_VERSION' app/store/index.ts app/store/migrations.ts
  ```
  期望：`schemaVersion` 仍为 3，两个 localStorage key 未变
- [ ] **C4** 未新增运行期依赖：
  ```bash
  git diff master -- package.json | rg '^\+' | rg -v '^\+\+\+'
  ```
  期望：只新增 `vitest`（devDependencies）与 `test` 脚本

**门禁**：C1 未全绿则不得进入阶段 D。

---

## 阶段 D：独立复核（子 agent）

- [ ] **D1** 派发 `trellis-check`，校验对象为阶段 B 的全部改动，并明确要求它：
  - 逐条对照 PRD 的 Acceptance Criteria
  - 核对 design.md 的「行为等价性要求」5 条是否成立（尤其是解析器映射值未被改动）
  - 核对未使用任何 lint 抑制手段
  - 独立复跑阶段 C1 的五项命令（不得采信主 agent 的转述）
- [ ] **D2** 处理复核 findings：属于真实缺陷的回到阶段 B 修复并重跑受影响的门禁；属于误报的给出反驳证据
- [ ] **D3** 若复核修改了实现，需重新执行 C1

---

## 阶段 E：spec 同步

- [ ] **E1** `.trellis/spec/frontend/quality-guidelines.md`：
  - `Testing Requirements` 从「当前没有 Vitest…」改写为「vitest + `pnpm test`，覆盖 4 个纯逻辑模块」
  - `Overview` 的 lint 现状从「仍剩 11 个既有问题」改为「0 problems」
  - `Forbidden Patterns` 保留 `react-refresh` 例外说明（UI 生成物已关闭该规则）
  - `Code Review Checklist` 增加 CI 四项检查与 `pnpm test`
- [ ] **E2** `.trellis/spec/frontend/hook-guidelines.md`：`use-mobile` 不再是「effect 内 setState」的反例，改为「用 `useSyncExternalStore` 订阅 `matchMedia`」的正例；同步更新 `Common Mistakes`
- [ ] **E3** `.trellis/spec/frontend/state-management.md`：`getMarkKey` 的「三处重复」改为已收敛到 `app/store/utils.ts`
- [ ] **E4** `.trellis/spec/frontend/type-safety.md`：解析器 `any` 边界改为「`parse(data: unknown)` + 类型化 payload + 运行时 `Array.isArray` 校验」
- [ ] **E5** `pnpm format:check` 复核（spec 是 `.md`，已由 `.prettierignore` 排除，此步仅确认无副作用）
- [ ] 提交 `docs(trellis): 同步质量门禁相关 spec`

---

## 阶段 F：PR 与合并

- [ ] **F1** 推送分支：`git push -u origin chore/quality-gate-baseline`
- [ ] **F2** 开 PR（base `master`），PR 说明必须包含：
  - 11 个 lint 问题逐条对应的修复方式
  - design.md 的「有意为之的行为差异」3 条
  - 阶段 B3 的行为校验结论（若未做浏览器验证，明确写出）
  - 阶段 C1 五项命令的实际退出码
- [ ] **F3** 等 CI 跑完并全绿（这是仓库第一个 CI run，需确认 `pnpm/action-setup` 的版本固定与 Node 22 实际可用）
- [ ] **F4** rebase and merge 合并，合并后确认 master 仍零 merge commit

---

## 阶段 G：收尾

- [ ] **G1** 同步本地：`git checkout master && git merge --ff-only origin/master`
- [ ] **G2** 清理分支（D11，**不可回滚，放最后**）：
  ```bash
  git push origin --delete chore/trellis-bootstrap chore/trellis-finish-bootstrap
  git branch -D chore/trellis-bootstrap chore/trellis-finish-bootstrap
  git push origin --delete chore/quality-gate-baseline
  git branch -D chore/quality-gate-baseline
  ```
- [ ] **G3** 归档任务 + 记录 journal（同样走分支 + PR，沿用上一轮的做法）：
  ```bash
  git checkout -b chore/quality-gate-finish
  python3 ./.trellis/scripts/task.py finish
  python3 ./.trellis/scripts/task.py archive 09-17-quality-gate-baseline
  python3 ./.trellis/scripts/add_session.py --title "..." --commit "<本轮 work sha 列表>" --summary "..."
  ```
- [ ] **G4** 提醒用户：branch protection 仍需仓库主授予 Admin 权限；四项检查此时已具备设为必需检查的前提

---

## 明确不做（避免范围蔓延）

- 不删除那 8 个沙箱设备文件（bind mount，做不到）
- 不改 `app/components/ui/**` 的实现
- 不给 UI 组件 / hook / 页面补测试
- 不把 `app/components/ui/**` 加入 eslint 全局 `ignores`
- 不处理 `RawClass` 字段类型与真实数据可能不符的既有风险（仅如实记录）
- 不启用 branch protection（无 Admin 权限）
