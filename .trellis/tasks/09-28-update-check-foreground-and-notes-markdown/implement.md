# 实施计划：更新检测调度修复 + release 正文渲染

> 依据 `prd.md`（F1/F2/F3）与 `design.md`（判决顺序、白名单表、迁移表）。每步都有可执行的验证命令；
> 门禁命令一律 `pnpm …`。默认在 `master` 上直接改（本仓库既有惯例：单条提交收尾）。

## 步骤顺序（按依赖排序，每步都可单独回滚）

### 0. 前置：确认既有门禁干净

```bash
pnpm typecheck && pnpm test && pnpm lint && pnpm format:check
```

基线不干净就先报告，不要开始改（避免把已有失败混进本次改动）。

### 1. 调度档位与判决 —— `app/lib/app-update/schedule.ts` + `schedule.test.ts`

- `CheckInterval` 增加 `'1h'`，`CHECK_INTERVALS = ['launch','1h','1d','3d','7d']`，
  `CHECK_INTERVAL_LABELS` 增加 `'1h': '1 小时'`，`DEFAULT_CHECK_INTERVAL = '1h'`。
- `checkIntervalMs` 增加 `'1h' → 3_600_000`；其余不变。
- 新增 `FAILURE_RETRY_COOLDOWN_MS = 60_000`。
- `ShouldCheckArgs` 增加 `lastAttemptAt` / `inFlight` / `manual`，`shouldCheckNow` 按 design.md 的 6 步顺序实现。
- 测试：把 `schedule.test.ts` 的「失败也参与节流」这条**改写**为新语义，并按 prd 的判决矩阵逐条补齐
  （从未检查 / 未到间隔 / 到间隔 / 失败冷却内外 / launch / 未来时间戳 / manual / inFlight / 非法值）。

```bash
pnpm vitest run app/lib/app-update/schedule.test.ts
```

### 2. 存储字段与存量提升 —— `app/lib/app-update/settings.ts` + `settings.test.ts`

- `AppUpdateSettings` 增加 `lastAttemptAt: number | null`、`intervalPinned: boolean`；`lastCheckAt` 文档改为「上次成功」。
- `DEFAULT_UPDATE_SETTINGS` 同步（`lastAttemptAt: null`、`intervalPinned: false`）。
- `normalizeUpdateSettings` 逐字段收窄新字段（`lastAttemptAt` 非 number → `null`；`intervalPinned` 非 boolean → `false`）。
- 新增 `applyLegacyIntervalMigration(settings)`：按 design.md 的迁移表执行一次性提升。
- 测试：新增迁移用例（无标记 `1d`→`1h` 且 `intervalPinned` 变真、有标记保持、`launch/3d/7d` 保持、缺失→`1h`、非法→`1h`、幂等）。

```bash
pnpm vitest run app/lib/app-update/settings.test.ts
```

### 3. store 落盘 —— `app/store/updateStore.ts`

- `partialize` 增加 `lastAttemptAt`、`intervalPinned`。
- 新增动作 `markAttempted(at)`（写 `lastAttemptAt`）；`markChecked` 保留（写 `lastCheckAt`）。
- `setCheckInterval(interval)` 同时置 `intervalPinned: true`。
- `merge` 改为 `applyLegacyIntervalMigration(normalizeUpdateSettings(persistedState, currentState))`。

```bash
pnpm typecheck
```

### 4. 检查内核 —— `app/lib/app-update/check.ts`（新增）+ `check.test.ts`（新增）

- 按 design.md 的 `RunUpdateCheckArgs` / `CheckOutcome` 实现 `runUpdateCheck`：
  平台与总开关短路 → 闸门 → 读版本 → `markAttempted` → 取远端 → 失败即返回（**不记账**）→ `markChecked` → `resolveUpdate`。
- 循环依赖注意：`check.ts` 从 `schedule.ts` / `channels.ts` / `releases-api.ts`（仅类型）取依赖，不得 import store 或 React。
- 测试（假依赖）：`failed` 三种原因 → `markChecked` 0 次 / `markAttempted` 1 次且 `kind === 'failed'`；
  `found` / `up-to-date` → `markChecked(now)` 1 次；`skipped`（间隔未到、失败冷却中、inFlight、总开关关）→ 两个都不调用且不 fetch；
  版本读不到 → `version-unavailable` 且不 fetch；`manual` 下被跳过的版本仍返回 `found`。

```bash
pnpm vitest run app/lib/app-update/check.test.ts
```

### 5. hook 收薄 —— `app/components/app-update/useAppUpdate.ts`

- `runCheck` 只保留：平台/DEV 短路、`setIsChecking` 包裹、调用 `runUpdateCheck`、消费 `CheckOutcome` 做 UI 副作用
  （手动失败 toast / 已是最新 toast / `setPendingCandidate` / 通知链路）。
- 闸门参数改为 `{ interval, lastCheckAt, lastAttemptAt, now, inFlight: store.isChecking, manual }`；
  **删除**原来「先 `markChecked` 再请求」的写法。
- `addAppResumeListener` 与 `loadVersion().then(runCheck)` 两条触发保持不变（冷启动 + 回前台）。

```bash
pnpm typecheck && pnpm lint
```

### 6. markdown 渲染 —— `app/components/app-update/releaseNotes.tsx`（新增）+ `releaseNotes.test.ts`（新增）

- `renderReleaseNotes(notes: string): ReactNode` 用 `marked.lexer(notes)` 取 token 流，按 design.md 的白名单表映射；
  私有 `renderTokens` / `renderToken` / `safeHref`；未知 token 兜底递归或 raw 文本。
- 顶部的文档注释必须写清安全边界（为什么不是 `dangerouslySetInnerHTML`、原 HTML/图片/表格为什么降级）。
- 测试（`renderToStaticMarkup`，用 `createElement`）：覆盖 prd 验收清单里的每一条 markdown 断言，含
  `javascript:` / `data:` 链接、`<script>` / `<img onerror>`、表格与图片降级、未知 token、空正文。

```bash
pnpm vitest run app/components/app-update/releaseNotes.test.ts
```

### 7. 接进模态框 —— `UpdateAvailableDialog.tsx` / `updateDialogCopy.ts` / `UpdateAvailableDialog.test.ts`

- `UpdateAvailableDialog.tsx` 用 `{renderReleaseNotes(candidate.notes)}` 替换 `{notes}`，容器 class 去掉 `whitespace-pre-wrap`，
  空判定改 `candidate.notes.trim() === ''`。
- `updateDialogCopy.ts` 删除 `formatReleaseNotes`（三个动作常量保留）。
- 测试：删掉「按纯文本渲染」「纯文本清理」两组用例，改为断言真实 release 正文（用现网 beta-18 的正文当夹具）渲染出列表/强调/行内代码，
  且结果里没有字面量 `**` / `##`、没有 `<script`。

```bash
pnpm vitest run app/components/app-update
```

### 8. 设置卡片文案 —— `app/features/profile/AppUpdateSettings.tsx`

- 「上次检查」行的小标题改为「上次检查成功」（值语义已变成「上次成功」），其余结构不动。
- 间隔下拉由 `CHECK_INTERVALS` / `CHECK_INTERVAL_LABELS` 驱动，无需改代码，只需确认新档位出现。

### 9. 全量门禁

```bash
pnpm typecheck && pnpm test && pnpm lint && pnpm format:check && pnpm build
grep -rn "dangerouslySetInnerHTML" app/components/app-update app/lib/app-update   # 期望 0 命中
```

### 10. 规格更新（Phase 3.3）

- `.trellis/spec/frontend/app-update.md`：
  - 「节流记的是『尝试』」这条契约**改写**为「间隔以上一次**成功**为准；失败只写尝试时间用于 60 秒冷却」；
  - 新增间隔档位表（含新默认 1 小时）与存量提升规则；
  - 把「release 正文按纯文本渲染」改写为「release 正文经 token → React 元素渲染，禁止 `dangerouslySetInnerHTML`，
    原 HTML/图片/表格降级」；
  - Common Mistakes 增补两条：不要用 `markChecked` 记失败、不要在渲染 markdown 时回到 `dangerouslySetInnerHTML`。
- `get_context.py` 的 spec 索引无需改（文件路径未变）。

## 评审点与回滚

| 回滚点 | 动作 |
| --- | --- |
| 步骤 1–3 后 | `git checkout app/lib/app-update/schedule.ts app/lib/app-update/settings.ts app/store/updateStore.ts`，其余未动 |
| 步骤 4–5 后 | 回滚 `check.ts` / `useAppUpdate.ts`，调度行为回到修复前（仍是「手动才能查」），渲染改动独立可用 |
| 步骤 6–7 后 | 回滚 `releaseNotes.tsx` 与模态框用例，回到纯文本渲染（注意 `formatReleaseNotes` 也要一起回来） |
| 整体 | 改动集中在一个提交，`git revert` 即可；存储新增字段对旧版本无害（见 design.md 第 4 节） |

## 验收自检清单（提交前逐条核对）

- [ ] `pnpm typecheck` / `test` / `lint` / `format:check` / `build` 全绿，且 `test` 用例数不少于改动前。
- [ ] `grep -rn "dangerouslySetInnerHTML=" app/` 0 命中（说明文字里的裸标识不计入，见实现报告）。
- [ ] `schedule.test.ts` 覆盖 prd 里的判决矩阵（含未来时间戳与 inFlight）。
- [ ] `check.test.ts` 证明三种失败原因都不写 `lastCheckAt`。
- [ ] `settings.test.ts` 证明存量 `1d`（无标记）会被提升、有标记的不动。
- [ ] `releaseNotes.test.ts` 覆盖 `javascript:` / `<script>` / 表格 / 图片 / 未知 token。
- [ ] 模态框正文用的是「上次检查成功」这类与实现一致的文案，没有留下描述纯文本渲染的注释。
- [ ] 残留风险（无真机验收、失败冷却、存量提升）写进 `check.jsonl` 之后的完成报告。
