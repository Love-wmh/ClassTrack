# design.md — 导入后使用引导 + 安卓导入方式收窄

> 需求见 `prd.md`；执行顺序见 `implement.md`。本文件只写技术设计：边界、契约、数据流、取舍与回滚。

## 1. 改动面总览（全部在 Web 层，`app/**`）

| 文件 | 动作 | 作用 |
|---|---|---|
| `app/lib/import-methods.ts` | 新增 | 导入方式可用性策略（纯函数）+ 提示文案表 |
| `app/lib/import-methods.test.ts` | 新增 | 策略矩阵 + 文案非空 |
| `app/lib/widget-guide.ts` | 新增 | 引导「已读」标记 + 是否该弹的纯函数 + 引导文案 |
| `app/lib/widget-guide.test.ts` | 新增 | 标记读写（含 storage 抛异常）/ 判定矩阵 / 文案 |
| `app/lib/native-platform.ts` | 改 | 加 `isAndroidApp()`（Web 端口径，供策略调用方判定平台） |
| `app/components/native-widget/WidgetGuideDialog.tsx` | 新增 | 引导弹窗容器 + 可静态渲染的 `WidgetGuideBody` |
| `app/components/native-widget/WidgetGuideDialog.test.ts` | 新增 | `WidgetGuideBody` 静态渲染断言 |
| `app/components/import-flow/ImportMethodList.tsx` | 新增 | 方式卡片列表 + 收窄提示（named export，可静态渲染） |
| `app/components/import-flow/ImportSchoolStep.tsx` | 改 | 删掉本地过滤逻辑，改为消费策略；学校选择器不变 |
| `app/components/import-flow/useImportFlow.ts` | 改 | 计算策略、归一化默认方式、切校收敛、导入成功后触发引导 |
| `app/components/dialog/ImportDialog.tsx` | 改 | 把策略透给 `ImportSchoolStep` |
| `app/store/slices/uiSlice.ts` | 改 | 加两个**非持久化**运行期 UI 状态：`showWidgetGuide`、`widgetPinSheetOpen` |
| `app/features/schedule/WidgetPinEntry.tsx` | 改 | Sheet 改受控 + 渲染尺寸提示 |
| `app/features/schedule/widgetPinPresets.ts` | 改 | 加共享常量 `WIDGET_PIN_SIZE_TUNING_HINT` |
| `app/features/schedule/widgetPinPresets.test.ts` | 改 | 补该常量的非空/含「尺寸」断言 |
| `app/root.tsx` | 改 | 在非 native-shell 时挂载 `<WidgetGuideDialog />` |
| `.trellis/spec/frontend/native-course-import.md` | 改（Phase 3.3） | 记录「安卓端方式收窄」这条现行契约 |
| `.trellis/spec/frontend/android-home-widget.md` | 改（Phase 3.3） | 记录「尺寸提示单一来源 + 导入后引导入口」 |

**不动**：`android/**` 任何文件、pin 链路与其状态机、`WIDGET_PIN_PRESETS` 两档内容、解析器/书签脚本实现、备份导入实现。

## 2. 契约

### 2.1 导入方式策略（`app/lib/import-methods.ts`）

```ts
import type { ImportMethod } from '~/store/slices/uiSlice'

export type ImportMethodNoticeCode = 'ANDROID_UNSUPPORTED_SCHOOL'

export type ImportMethodPolicy = {
  /** 该环境该学校**可选**的方式，顺序固定为规范序 backup → parser → native-webview。 */
  methods: ImportMethod[]
  /** 进入第 1 步时应选中的方式；一定在 `methods` 里。 */
  defaultMethod: ImportMethod
  /** 非 null 时在方式列表下方显示一条如实提示。 */
  noticeCode: ImportMethodNoticeCode | null
}

export function resolveImportMethodPolicy(input: {
  /** 是不是 Android 客户端（`Capacitor.getPlatform() === 'android'`），不是「插件是否注册」。 */
  android: boolean
  /** `isNativeCourseImportAvailable()`：安卓且插件已注册。 */
  nativeImportAvailable: boolean
  /** 所选学校是否有原生适配器（`getNativeCourseImportAdapter()`）。 */
  hasNativeAdapter: boolean
}): ImportMethodPolicy

export const IMPORT_METHOD_NOTICE: Record<ImportMethodNoticeCode, string>
```

判定表（`native-webview` 记作 `native`）：

| android | nativeImportAvailable | hasNativeAdapter | methods | defaultMethod | noticeCode |
|---|---|---|---|---|---|
| false | false | false | `[backup, parser]` | `parser` | null |
| false | true | true | `[backup, parser, native]` | `parser` | null |
| false | true | false | `[backup, parser]` | `parser` | null |
| true | true | true | `[backup, native]` | `native` | null |
| true | true | false | `[backup]` | `backup` | `ANDROID_UNSUPPORTED_SCHOOL` |
| true | false | * | `[backup]` | `backup` | 按 hasNativeAdapter 同上 |

- 不变量（测试断言）：`methods.length >= 1`、`methods.includes(defaultMethod)`、顺序恒为规范序子序列。
- **非 Android 行与非 Android 现状逐字一致**（当前过滤规则就是「有插件且有适配器才出 native」）。

### 2.2 引导模块（`app/lib/widget-guide.ts`）

```ts
export const WIDGET_GUIDE_STORAGE_KEY = 'class-track-widget-guide-seen'

/** 只依赖 getItem/setItem，便于注入假 storage；真实调用点是 `window.localStorage`。 */
export type GuideStorage = Pick<Storage, 'getItem' | 'setItem'>

/** storage 缺失/抛异常一律当「没读过」，且绝不向上抛。 */
export function hasSeenWidgetGuide(storage?: GuideStorage | null): boolean
export function markWidgetGuideSeen(storage?: GuideStorage | null): void

/** 触发判定（纯函数）：只在 Android 原生小工具可用、且没读过时弹。 */
export function shouldShowWidgetGuide(input: { nativeWidgetAvailable: boolean; seen: boolean }): boolean

export const WIDGET_GUIDE_TITLE = '把课表放到桌面'
export const WIDGET_GUIDE_DESCRIPTION: string
export const WIDGET_GUIDE_PRIMARY_ACTION = '去添加'
export const WIDGET_GUIDE_SECONDARY_ACTION = '知道了'
/** 步骤文案；档位名与尺寸提示都从既有常量派生，禁止手抄。 */
export function widgetGuideSteps(): string[]
```

- `widgetGuideSteps()` 里第 1 步派生于 `WIDGET_PIN_PRESETS`（`name` + `cell`），第 2 步就是 `WIDGET_PIN_SIZE_TUNING_HINT`，第 3 步说明「一键添加不生效时面板底部有手动步骤」。
- 标记写在**决定要弹的时刻**（不是关闭时刻）：崩溃/被杀不会导致二次打扰，语义仍是「至多一次」。

### 2.3 运行期 UI 状态（`uiSlice`）

```ts
showWidgetGuide: boolean
widgetPinSheetOpen: boolean
setShowWidgetGuide: (show: boolean) => void
setWidgetPinSheetOpen: (open: boolean) => void
```

两者都在 `persist.partialize` 白名单**之外** ⇒ 不落盘、不随备份迁移（与 `showImportDialog`、`selectedImportMethod` 同类）。

### 2.4 加桌面板与引导的联动

```
导入成功(三条路径任一条)
  → shouldShowWidgetGuide({ nativeWidgetAvailable: isNativeWidgetSnapshotAvailable(), seen: hasSeenWidgetGuide() })
  → true: markWidgetGuideSeen() + setShowWidgetGuide(true)
  → <WidgetGuideDialog/>（挂在 root Layout，非 native-shell）
        「去添加」→ setShowWidgetGuide(false) + setWidgetPinSheetOpen(true) + navigate('/')
        「知道了」/ESC/点遮罩 → setShowWidgetGuide(false)
  → <WidgetPinEntry/>（课表页顶栏）读 widgetPinSheetOpen 决定 Sheet 开合
```

- 引导挂 `root.tsx` 而不是 `ImportDialog`：`ImportDialog` 在导入成功时会随 `showImportDialog=false` 卸载，挂在它里面等于自毁。
- `WidgetSnapshotSync` 已证明「非 native-shell 的 Layout 全局挂载点」是既有模式，引导沿用同一处。

## 3. 关键取舍

| 决策 | 备选 | 理由 |
|---|---|---|
| 收窄逻辑放**纯函数模块**，组件只消费结果 | 在 `ImportSchoolStep` 里加 `if (android)` 过滤 | 平台/学校/插件三维组合有 6 种，埋在 JSX 里无法被 vitest 钉住；本项目「纯逻辑必须单测」是既有规格 |
| 平台判定用 `getPlatform() === 'android'` 新增 `isAndroidApp()` | 复用 `isNativeCourseImportAvailable()` | 后者要求插件已注册，天工场景拿不到适配器时判定会失真；而收窄必须覆盖天工 |
| 方式卡片抽成 `ImportMethodList`（named export） | 继续写在 `ImportSchoolStep` 里 | 该列表要新增提示区且要能被静态渲染断言（含 Radix `Select` 的父组件不适合 SSR 断言） |
| 引导弹窗拆 `WidgetGuideDialog`（容器）+ `WidgetGuideBody`（内容） | 只写一个组件 | Radix `Dialog` 走 Portal，`renderToStaticMarkup` 渲染不出内容；拆出 body 才能有 SSR 断言，且仓库测试只跑 `*.test.ts`（node 环境） |
| `Sheet` 改**受控**（`open`/`onOpenChange` 来自 store） | 用 ref 调 Radix 内部方法 / 在引导里重复渲染面板 | 受控是 Radix 的公开 API，改动面只在 `open`；重复渲染面板会把 pin 状态机抄第二份 |
| 引导「已读」用**独立 localStorage 键** | 塞进 Zustand persist（跟备份走） | 这是设备本地的一次性打扰标记，不该随备份迁移到新设备后再也不弹；也不该进 `migrateClassTrackSchema` 的版本管理 |
| 尺寸提示做成**共享常量** | 引导与面板各写一句 | 两处文案必然漂移（本项目已有「同一段文案改过一次」的先例） |

## 4. 兼容性与回归口径

- `WIDGET_PIN_PRESETS`、`manualSteps()`、`pinOutcomeMessage()`、pin 状态机、原生桥接全部不改 ⇒ `widgetPinPresets.test.ts` 现有断言应逐条保持绿。
- 非 Android 的导入流程（三张卡、四步书签脚本、`primaryDisabled` 规则）不改 ⇒ A1 的策略矩阵里非 Android 行就是回归护栏。
- 备份 JSON 的 schema、`migrateClassTrackState` 不动 ⇒ 无迁移风险。
- 旧 APK 用户首次打开新前端时：`showWidgetGuide` / `widgetPinSheetOpen` 初始为 `false`，无读写冲突。

## 5. 回滚形态

- 全部改动为 Web 层，回滚 = revert 这批提交（或 `git revert` 单个 commit）；无数据迁移、无原生版本门槛，因此**不需要**双写或开关。
- 唯一的「半成品」风险是引导弹窗与面板联动的 store 字段：若只回滚 UI，字段残留无副作用（默认 `false`）。
- 若上线后发现引导打扰过多，最小回滚点是停止触发（`shouldShowWidgetGuide` 返回 `false` 或去掉调用），面板与收窄逻辑可独立保留。

## 6. 验证策略

| 层 | 手段 | 覆盖的验收点 |
|---|---|---|
| 纯逻辑 | vitest：`import-methods.test.ts`、`widget-guide.test.ts`、`widgetPinPresets.test.ts` 增补 | A1、A2、A3、A6 |
| 展示层 | vitest（`renderToStaticMarkup`）：`ImportMethodList`（含通知/无通知两种）、`WidgetGuideBody` | A4（部分）、A7（部分） |
| 门禁 | `pnpm typecheck` / `pnpm lint` / `pnpm format:check` / `pnpm test` / `pnpm build` | A8 |
| 设备 | 模拟器/真机：`pnpm cap:build:android` + install，用 WebView CDP 断言方式列表与引导触发（手法见 `.pi` 记忆里的 `classtrack-android-webview-verify`） | A4、A5、A7 |
| 规格 | Phase 3.3 更新两份 spec | A9 |

**设备验证的具体做法（含兜底）**

1. 用 CDP 连到主 WebView，`Runtime.evaluate` 清掉引导标记 + 清空 `class-track-storage`，重启应用让它进「空态 → 自动弹导入框」。
2. 断言方式列表：天理 = 「导入已有数据 + 应用内打开教务系统」，选天工 = 「导入已有数据 + 天工提示」。
3. 触发导入：优先用 CDP `DOM.setFileInputFiles` 给备份文件输入框塞一个合成备份 JSON 后点「导入数据」；
   失败则 `adb push` 到 `/sdcard/Download/` 并用 `adb shell input` 驱动系统选择器；
   再失败则如实记录「引导触发未在设备上验证，仅有单测覆盖」。
4. 断言引导出现 → 点「去添加」→ 断言已跳到课表页且面板展开 → 关掉面板。
5. 证据：截图 + `verification.md` 记录命令与结论（本任务不改原生，logcat 不是必需项）。

## 7. 评审结论（2026-09-22，两个未决项均已确认）

1. 天工提示**定稿**（两行显示）：
      `安卓暂不支持天津工业大学的应用内导入。`
      `请改用「导入已有数据」恢复课程表。`
      ⇒ 文案落在 `IMPORT_METHOD_NOTICE.ANDROID_UNSUPPORTED_SCHOOL`，测试断言其非空且含「导入已有数据」。
2. 「安卓端天工新用户没有首次导入路径」**确认接受**：本轮只写进规格作为已知限制，
      不改前端口径（将来支持天工必须新增原生适配器）。
