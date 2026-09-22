# implement.md — 执行计划

> 需求 `prd.md`、设计 `design.md`、现场 `research.md`。
> 顺序：先纯逻辑与测试（可独立验证）→ 组件 → 流程接线 → 门禁 → 设备验证 → 规格与提交。
> 每个阶段末尾都有**可验证的出口**；出口没过不许进下一阶段。

## 0. 前置

- [ ] 工作分支确认（基线 `master`）；只动 `app/**` 与两份 spec。
- [ ] `pnpm install` 完成，`pnpm test` 在改动前是绿的（基线）。
- [ ] 读 `.trellis/spec/frontend/native-course-import.md`、`android-home-widget.md`、`component-guidelines.md`、`quality-guidelines.md`（已在 `implement.jsonl` 登记）。

**回滚点 R0**：工作区干净（`git status` 只有 Trellis 任务目录）。

## 1. 纯逻辑：导入方式策略

- [ ] 新增 `app/lib/import-methods.ts`：`ImportMethodNoticeCode` / `ImportMethodPolicy` / `resolveImportMethodPolicy` / `IMPORT_METHOD_NOTICE`，
  判定表逐行照 `design.md §2.1` 实现（顺序恒为 `backup → parser → native-webview` 的子序列）。
- [ ] 新增 `app/lib/import-methods.test.ts`：
  - 六行判定矩阵逐行断言（methods / defaultMethod / noticeCode）；
  - 不变量：`methods.length >= 1`、`methods.includes(defaultMethod)`、顺序为规范序子序列；
  - 每个 `ImportMethodNoticeCode` 都有非空文案（把枚举值列成数组遍历，漏一个即红）；
  - 非 Android 三行 = 现状回归护栏。

**出口 1**：`pnpm test -- import-methods` 全绿。**回滚点 R1**：只涉及两个新文件，删掉即可。

## 2. 纯逻辑：引导标记与文案

- [ ] `app/lib/native-platform.ts` 加 `isAndroidApp()`（`Capacitor.getPlatform() === 'android'`）。
- [ ] 新增 `app/lib/widget-guide.ts`：`WIDGET_GUIDE_STORAGE_KEY`、`GuideStorage`、`hasSeenWidgetGuide`、`markWidgetGuideSeen`、
  `shouldShowWidgetGuide`、`WIDGET_GUIDE_TITLE/DESCRIPTION/PRIMARY_ACTION/SECONDARY_ACTION`、`widgetGuideSteps()`。
  - 读写必须 try/catch（storage 缺失或抛异常 → 视为「没读过」，标记写入失败静默）。
  - `widgetGuideSteps()` 的档位名从 `WIDGET_PIN_PRESETS`（`name` + `cell`）派生，尺寸提示用 §3 的共享常量。
- [ ] 新增 `app/lib/widget-guide.test.ts`：
  - 未读 / 已读 / storage 抛异常 / storage 为 null 四种情况；
  - `shouldShowWidgetGuide` 四象限（可用性 × 已读）；
  - 步骤文案：非空、包含两档卡片名（`接下来 3×2`、`紧凑 1×2`）、包含尺寸提示原文。

**出口 2**：`pnpm test -- widget-guide` 全绿。**回滚点 R2**：同上（新增文件 + 一行 helper）。

## 3. 共享文案常量（尺寸可调）

- [ ] `app/features/schedule/widgetPinPresets.ts` 新增 `WIDGET_PIN_SIZE_TUNING_HINT`，中文 JSDoc 写明
  「**唯一**的『尺寸可调』文案源，面板与导入后引导共用；改这里就是改两处」。
- [ ] `app/features/schedule/widgetPinPresets.test.ts` 增补断言：非空、含「尺寸」、且被引导步骤引用（`widgetGuideSteps()` 里出现该常量原文）。

**出口 3**：`pnpm test -- widgetPinPresets` 全绿（含既有断言全绿）。**回滚点 R3**：单常量 + 一条测试。

## 4. 展示组件：方式列表

- [ ] 新增 `app/components/import-flow/ImportMethodList.tsx`（named export）：
  props `{ policy, selectedMethod, onSelect }`；渲染 `policy.methods` 对应的卡片（标题/描述/图标从本文件的 `Record<ImportMethod, ...>` 取），
  `policy.noticeCode` 非空时在列表下方渲染 `IMPORT_METHOD_NOTICE[noticeCode]`（用 `rounded-md border bg-muted/30 p-3 text-sm` 等既有样式）。
- [ ] 新增 `app/components/import-flow/ImportMethodList.test.ts`：`renderToStaticMarkup` 断言
  - 只有备份时有 1 张卡 + 提示文案；
  - 应用内 + 备份时 2 张卡、无提示；
  - 三张卡时包含书签脚本那一张（非 Android 回归）。
- [ ] `app/components/import-flow/ImportSchoolStep.tsx`：删掉 `importMethods.filter(...)` 本地判定与 `nativeImportAvailable` prop，
  改为接 `policy: ImportMethodPolicy`，方式区渲染 `<ImportMethodList ... />`；学校 Select 部分**不动**。
- [ ] `app/components/dialog/ImportDialog.tsx`：step 0 传 `policy={importFlow.importMethodPolicy}`。

**出口 4**：`pnpm typecheck` + `pnpm test -- ImportMethodList` 通过。**回滚点 R4**：组件层改动，回滚不影响 §1-§3。

## 5. 接线：导入流程

- [ ] `app/store/slices/uiSlice.ts`：加 `showWidgetGuide` / `widgetPinSheetOpen` 与两个 setter（默认 `false`，不落盘）。
- [ ] `app/components/import-flow/useImportFlow.ts`：
  - `const policy = useMemo(() => resolveImportMethodPolicy({ android: isAndroidApp(), nativeImportAvailable, hasNativeAdapter: Boolean(nativeImportAdapter) }), [...])`；
  - 弹窗打开边沿（`:92-120` 那个 effect）里：当前方式不在 `policy.methods` → `setSelectedImportMethod(policy.defaultMethod)`；
  - `handleSchoolChange`：换校后按**新学校**的策略归一化，方式变了就 `stepper.goToStep(0)`；
  - 三条成功路径统一调用一个本地 `maybeShowWidgetGuide()`：
    `shouldShowWidgetGuide({ nativeWidgetAvailable: isNativeWidgetSnapshotAvailable(), seen: hasSeenWidgetGuide() })`
    → true 则 `markWidgetGuideSeen()` + `setShowWidgetGuide(true)`（**先 toast 再引导**）；
  - 返回值补 `importMethodPolicy: policy`。
- [ ] 自检：Android 分支下 `parser` 是否真的不可达（策略 + 归一化 + 切校三处都收敛）。

**出口 5**：`pnpm typecheck` + `pnpm lint` 通过；`rg "nativeImportAvailable" app/` 只剩策略调用点与 hook 内部。

**回滚点 R5**：到这里为止是「策略生效但没有任何引导 UI」的半成品态——功能上等价于 R3 需求已达成，可单独提交。

## 6. 引导弹窗 + 面板联动

- [ ] 新增 `app/components/native-widget/WidgetGuideDialog.tsx`：
  - named export `WidgetGuideBody`（**不**走 Portal：标题 / 描述 / 步骤列表 / 两个按钮）；
  - default export `WidgetGuideDialog`：读 store（`showWidgetGuide` + 两个 setter + `widgetPinSheetOpen` setter）与
    `isNativeWidgetSnapshotAvailable()`，用 `Dialog` + `DialogContent` 包 `WidgetGuideBody`；
    - 不可用时返回 `null`；
    - 任何关闭（`onOpenChange(false)` / ESC / 点遮罩 / 两个按钮）→ `setShowWidgetGuide(false)`；
    - 「去添加」额外 `setWidgetPinSheetOpen(true)` + `navigate('/')`。
- [ ] 新增 `app/components/native-widget/WidgetGuideDialog.test.ts`：断言 `WidgetGuideBody` 渲染出标题、步骤文案（含尺寸提示）、两个按钮文案。
- [ ] `app/features/schedule/WidgetPinEntry.tsx`：
  - `<Sheet open={widgetPinSheetOpen} onOpenChange={setWidgetPinSheetOpen}>`（`SheetTrigger` 保留）；
  - `SheetHeader` 下方渲染 `WIDGET_PIN_SIZE_TUNING_HINT`（放在卡片之前，样式与既有 `text-xs/ text-sm text-muted-foreground` 一致）；
  - 不动 pin 状态机与模态逻辑。
- [ ] `app/root.tsx`：`{!nativeShell && <WidgetGuideDialog />}`（与 `WidgetSnapshotSync` 同组）。

**出口 6**：`pnpm typecheck` / `pnpm lint` / `pnpm test` 通过；静态渲染测试绿。

**回滚点 R6**：引导 UI 是独立挂载点，可单独 revert §6 而不影响 §1-§5。

## 7. 门禁（本地全绿才算实现完成）

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

- [ ] 五项全部通过，`pnpm lint` 0 problems；**不得**用 `eslint-disable` / `@ts-ignore` 抑制。
- [ ] `pnpm test` 输出里确认新增用例确实执行（`include` 只认 `*.test.ts`，别写成 `.test.tsx`）。

## 8. 设备验证（Android 模拟器/真机）

- [ ] `pnpm cap:build:android`（含 `check-android-assets`）产出 debug APK 并安装。
- [ ] 清掉引导标记与 `class-track-storage` → 重启，确认空态自动弹导入框。
- [ ] 方式列表断言：天理 = 「导入已有数据 + 应用内打开教务系统」；切天工 = 「导入已有数据 + 天工提示」且无解析器卡。
- [ ] 触发引导：备份导入成功后引导出现（优先 CDP `DOM.setFileInputFiles`；兜底 `adb push` + `input` 驱动系统选择器）。
- [ ] 「去添加」→ 课表页 + 面板自动展开；「知道了」→ 只关闭且不跳转。
- [ ] 再导入一次 / 重启应用：确认引导**不再**自动弹。
- [ ] 截图存 `evidence/`，命令与结论写 `verification.md`；**未能验证的部分必须如实标注**。

## 9. 规格与提交

- [ ] Phase 3.3：`.trellis/spec/frontend/native-course-import.md` 增补「安卓端导入方式收窄」契约
  （方式清单、默认方式、天工提示、非 Android 不变 + 「天工安卓新用户无首次导入路径」这条已知限制）；
  `.trellis/spec/frontend/android-home-widget.md` 增补「尺寸提示单一来源」与「导入后引导入口」两条。
- [ ] `verification.md` 逐条对照 `prd.md` 的 A1-A9，写证据（命令 + 输出摘要 / 截图路径）。
- [ ] 提交（中文主题、`scope` 用英文）：
  - `feat(import): 安卓端收窄导入方式并给天工如实指路`
  - `feat(widget): 导入成功后一次性引导加桌，并提示尺寸可调`
- [ ] 归档任务前确认：`git status` 无意外文件、`verification.md` 无「TBD」、未验证项已标注。

## 10. 评审门（Phase 1.4 的人工确认点）

开工前请确认 `prd.md` 的两个未决项（`design.md §7`）：

1. 天工提示的**最终措辞**；
2. 「安卓端天工新用户没有首次导入路径」是否确实按本轮接受（只写进规格作为已知限制）。

## 11. 子代理分工建议

- `trellis-implement`：按 §1-§6 顺序落地；每阶段跑对应最小验证命令；不要跨阶段合并提交。
- `trellis-check`：对照 A1-A9 逐条核验，重点抓
  ① 非 Android 回归（三张卡、四步流程不变）；
  ② 共享文案常量是否真的只有一处来源；
  ③ 是否存在 effect 内同步 setState 等被禁写法；
  ④ 文档/规格是否与实现一致（尤其安卓方式清单口径）。
