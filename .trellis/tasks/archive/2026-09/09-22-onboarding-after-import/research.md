# research.md — 落地现场（代码位置与既有约束）

> 本轮不需要外部调研（无新库、无平台 API 变更）；这份文件是**实现前的现场勘测记录**，
> 供实现/校验子代理直接按图施工，不必重新摸索。

## 1. 改动落点（行号为 2026-09-22 勘察时的实际值）

| 位置 | 现状 | 本轮要做的 |
|---|---|---|
| `app/components/import-flow/useImportFlow.ts:92-120` | 弹窗打开沿 `wasImportDialogOpenRef` 边沿做一次性重置（`stepper.reset()` / 清文件 / 清状态） | 在同一个边沿里把「当前方式」归一化到策略允许值 |
| 同上 `:77-86` | `handleImportMethodChange` 按方式切 steps 并 clamp 步序号 | 不改（策略收窄后仍走这条路） |
| 同上 `:138-146` | `handleSchoolChange`：换校后重算 term；若 `native-webview` 无适配器则退回 `parser` 并 `goToStep(0)` | 改为「按新策略归一化」：不合法的当前方式 → `policy.defaultMethod` |
| 同上 `:172-188` | `handleBackupImport` 成功 → `toast` + `setShowImportDialog(false)` | 成功后触发引导 |
| 同上 `:190-265` | `handleNativeImport` 成功（`:252-253` 同款收尾） | 同上 |
| 同上 `:266-303` | `handleParserImport` 成功（`:293-294` 同款收尾） | 同上 |
| 同上 `:355-380` | 返回对象（含 `activeSchool` / `nativeImportAvailable` / `nativeImportAdapter`） | 补 `importMethodPolicy` |
| `app/components/import-flow/ImportSchoolStep.tsx:56-58` | `availableImportMethods = importMethods.filter(有插件且有适配器才出 native-webview)`（**本地判定**） | 判定上移到策略模块；本组件改为消费 `policy` |
| 同上 `:60-118` | 学校 Select + 方式卡片列表 | 列表抽成 `ImportMethodList`，并在策略给出 `noticeCode` 时渲染提示 |
| `app/components/dialog/ImportDialog.tsx:15-27` | 把 `nativeImportAvailable` 传给 step 0 | 改为传 `policy` |
| `app/store/slices/uiSlice.ts:24-96` | 运行期 UI 状态（`showImportDialog` 等），且全部在 `store/index.ts` 的 `partialize` 白名单之外 | 加 `showWidgetGuide` / `widgetPinSheetOpen` 两个布尔与 setter |
| `app/features/schedule/WidgetPinEntry.tsx:80-90` | `<Sheet>` **非受控**，靠 `SheetTrigger` 切换 | 改受控：`open`/`onOpenChange` 接 store |
| 同上 `:92-98` | `SheetHeader`：标题 + 「选一种摆法…可以自己拖动调整」 | 补一条共享的尺寸提示（来自 `widgetPinPresets`） |
| `app/features/schedule/widgetPinPresets.ts:47` | `WIDGET_PIN_PRESETS`（两档：`cell_3x2` 接下来 / `cell_1x2` 紧凑，含 `name`/`cell`） | 引导步骤文案从这里派生档位名 |
| 同上 `:244-262` | `widgetPinSizeList()` / `manualSteps()`（已含「再按卡片上的格子数调整大小」） | 不改；新增 `WIDGET_PIN_SIZE_TUNING_HINT` 作为**唯一**的「尺寸可调」文案源 |
| `app/root.tsx:39-45` | Layout 在非 native-shell 时挂 `MarkdownEditorDialog` / `PwaUpdatePrompt` / `WidgetSnapshotSync` | 同处挂 `<WidgetGuideDialog />` |
| `app/lib/native-platform.ts` | 只有 `isNativeApp()`（`Capacitor.isNativePlatform()`） | 加 `isAndroidApp()`（`Capacitor.getPlatform() === 'android'`） |

## 2. 既有跨层契约（不能破）

- **pin / 小工具**：`WidgetPresetId = 'cell_3x2' | 'cell_1x2'` 必须与原生 `WidgetPreset.java` 白名单逐字一致；
  `widgetPinPresets.test.ts` 会直接读 `android/**` 的 Java 与 `widget_info_*.xml` 对齐。
  ⇒ 本轮**不得**改预设 id、名称、`manualSteps()`、`pinOutcomeMessage()` 文案。
- **原生导入**：`app/lib/native-course-import.ts` 的适配器表只有 `tianjin-university-of-technology`（天理）；
  `isNativeCourseImportAvailable()` = 安卓 + 插件已注册。天工（`tianjin-polytechnic-university`）**没有**适配器。
- **备份导入**：`useDataExportImport().handleFileSelect(file)` 返回 `{ success, error }`；
  备份 JSON 由数据管理页导出，schema 见 `app/store/migrations.ts`（`CLASS_TRACK_SCHEMA_VERSION = 3`）。
- **持久化**：`persist.partialize` 只白名单数据字段（`school`/`classes`/`classMarks`/…`schemaVersion`），
  UI 状态一律不落盘 ⇒ 新增 UI 字段无迁移风险。

## 3. 测试基建现状（决定测试怎么写）

- `vitest.config.ts`：`environment: 'node'`、`include: ['app/**/*.test.ts']`（**只认 `.test.ts`**，`.test.tsx` 会被静默跳过）。
- 组件测试先例：`app/components/import-flow/CourseImportShell.test.ts` 用 `renderToStaticMarkup(createElement(...))`。
- **Radix Portal 在 SSR 下渲染不出内容**：`Dialog` / `Select` 的内容区走 Portal
  ⇒ 可断言的目标必须拆成**不走 Portal 的展示组件**（本轮：`ImportMethodList`、`WidgetGuideBody`）。
- 既有「文案非空」断言先例：`app/features/schedule/widgetPinPresets.test.ts:317`「每个厂商族都恰好有一条非空的手动引导文案」。

## 4. 设备验证现场（Android）

- 构建：`pnpm cap:build:android`（需要 JDK 21 + Android SDK，见 `.trellis/spec/frontend/quality-guidelines.md` 末尾）；
  安装：`bash scripts/install-android.sh` 或 `adb install -r`。
- 资产校验脚本 `scripts/check-android-assets.js` 会断言 `android/app/src/main/assets/public` 与构建产物一致
  —— 本轮不改原生，但重建后它必须仍通过。
- 主 WebView 可经 CDP 断言/驱动（项目记忆里有 `classtrack-android-webview-verify` 的做法：
  `adb forward` + `/json` 列表 + `Runtime.evaluate`；真实触摸用 `adb shell input motionevent`）。
- 本轮不改原生代码 ⇒ 不需要看 logcat 的原生日志，只需 WebView 断言 + 截图。

## 5. 已知事实/坑（避免重复踩）

- `WidgetPinEntry` 只在 `isNativeWidgetSnapshotAvailable()` 为真时渲染（浏览器里 `isPluginAvailable` 也会返回真，
  所以那个函数才同时判平台）——引导的可用性判定**必须**沿用同一个函数，不要自己写 `Capacitor.isNativePlatform()`。
- 导入成功时 `ImportDialog` 会被卸载（`showImportDialog=false`）⇒ 引导不能挂在它内部。
- `SchedulePage` 在「未初始化 / 无课程」时会自动打开导入弹窗（`app/features/schedule/SchedulePage.tsx:31-38`），
  设备上清空数据后无需手点就能进导入流程。
- 安卓 WebView 里 localStorage 可能因隐私模式抛异常 ⇒ 引导标记的读写必须 try/catch（测试要覆盖）。
