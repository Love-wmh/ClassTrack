# 验收记录：五档 provider + 尺寸自动匹配 + 失败即弹醒目标态框

> 任务 [prd.md](./prd.md) / [design.md](./design.md) / [implement.md](./implement.md)
> 环境：**AOSP 模拟器**（Medium_Phone，Android 16 / google_apis_playstore，1080×2400，密度 420）+ 单元测试。
> 真机（PKR110 / ColorOS）本轮未使用——用户要求在模拟器上验。
> 实施方式：主线程直接改（用户明确要求不使用子代理）。

## 结论

原生侧（五档 provider 注册、跨 provider 的 pin 链路、配置页归属校验、AUTO 尺寸匹配）**已完成并在模拟器上验过关键路径**；
Web 侧（醒目标态框）的纯逻辑由 vitest 钉住，但**模态框的真实交互（点击即弹 / 探针命中切态）本轮没有在设备上走完** ——
模拟器上 AOSP launcher 会正常弹确认界面，探针那条失败路径需要 ColorOS 那种"丢请求"的现场才能触发（真机项）。
**拖动改尺寸的自动匹配**也只做了单元测试级验证：设备上的拖动手势本轮未执行。

## A1 模态状态机与文案 ⏳（逻辑已测，设备交互未验）

- vitest：`resolvePinModalState`（进行中永远显示 / 失败态可关 / 成功态自动收起）、`resolvePinProbeOutcome`、
  `pinOutcomeMessage`（含「requesting 文案绝不含『已添加』」「no_confirmation 文案含推断说明」）全部通过。
- Web 用例数 **91**（上一轮 80 → +11）。
- 未验：点击后模态是否真的立刻出现、探针命中后是否立刻切失败态（需要真机 ColorOS 现场）。

## A2 快探针 ⏳（逻辑已测，现场未触发）

- `PinAttemptTest` / `PinAttemptStateTest` 全绿（未退后台且过窗口 → 判失败；退过后台 / 时钟回拨 / 无尝试 → 不判）。
- 模拟器现场：pin 时 AOSP launcher **会**把确认界面置前 → 我们的 Activity 被 pause → 探针**正确地不判失败**
  （日志里没有出现 `no_confirmation` 路径），这正是期望行为，但它没有覆盖失败分支。

## A3 五档 provider 注册 ✅

- `WidgetProviderRegistryTest` 全绿（恰好五个、类名唯一、预设有效、旧类名仍是 4×3、每个预设都有 provider）。
- 设备实测（`dumpsys appwidget`）：五个 provider 全部注册 ✓
  `ClassTrackWidgetReceiver`（4×3，旧类名）+ `Cell2x2/Cell2x3/Cell4x2/Cell6x3WidgetReceiver`。
- 跨层断言（vitest 读**真实文件**）：`WidgetProviderRegistry.java` ↔ 五份 `widget_info_*.xml` ↔ `strings.xml` ↔ Web 预设表，逐字一致 ✓。
- 资产门禁：`scripts/check-android-assets.js` 新增 `assertWidgetProviders`（五份元数据存在 + `targetCell` 匹配 +
  各自指向自己的预览 + 清单五条 `APPWIDGET_UPDATE` + 旧类名仍在），`cap:build:android` 通过 ✓。

### 拾取器实测（A7c 的一部分）

| 观察 | 证据 |
|---|---|
| 搜索 "ClassTrack" 只出现**一个分组条目**，展开后按尺寸列出各档 | 截图 `picker-list.png` |
| 各档**各有自己的预览**（2×2 只画 hero + 「今天还有 2 节」；4×3 画 hero + 汇总 + 三行；6×3 画双栏） | 同上 |
| 4×3 档的尺寸标签显示 「4 × 3」、2×2 档显示 「2 × 2」、2×3 档显示 「2 × 3」 | 同上 |
| **6×3 档的尺寸标签显示成了 「2 × 2」** | 截图 `picker-6x3-label.png` |

最后一条是 launcher 行为，不是我们的声明错：`aapt2 dump xmltree --file res/xml/widget_info_6x3.xml <apk>` 显示
`targetCellWidth=6 / targetCellHeight=3` ✓。已写进 spec：拾取器显示的尺寸由 launcher 按自己的网格夹取。

## A4 放置即带样式 / 实例归属 ✅（部分）

- pin 请求 `preset=cell_6x3` → 新实例 `id=13` **落在正确的 provider**：`dumpsys appwidget` 显示
  `id=13 → Cell6x3WidgetReceiver` ✓（即 `WidgetProviders.rendererFor` 把预设映射到了正确的组件）。
- 日志：`phase=pin_confirmed widget=0`（回调 id 依旧不可信，两级判决生效）、无 `pin_confirmed_unresolved`、
  无 `style_write_failed` → 预设写入成功 ✓。
- 按尺寸解析可见（新加的 per-instance 日志）：`widget=13 w=179 h=210 → wide=adaptive`、
  `widget=13 w=419 h=108 → wide=adaptive`（最近邻分别命中 2×2 与 4×2 档）；
  `widget=10 w=850 h=169 → wide=two_column dual=true`（最近邻命中 4×3 档、几何允许分栏）✓。

## A5 配置页与 pin 链路对多 provider ✅

- 配置页对 **Cell6x3** 的实例（id=13）正常打开：`preview_sized w=179 h=108`，无 `config_rejected` ✓
  —— 归属校验已接受全部五档（此前单 provider 硬编码会把新四档全拒掉）。
- 配置页里新增的 **「自动（按尺寸）」是默认选中项**，并带如实说明「选了下面某一项就不再自动变」✓（截图 `config-auto.png`）。
- pin 基线/回调集合已改为跨 provider 并集（代码 + `WidgetPinTargetsTest`/`WidgetPinBaselineTest` 覆盖）。
- 拒绝原因拆成白名单枚举（`invalid_widget_id` / `unknown_instance` / `foreign_provider`），
  `WidgetDiagnostics` 白名单同步 ✓。

## A6 尺寸变化自动匹配 ⏳（单测通过，设备拖动未验）

- `WidgetStyleResolverTest` 全绿：显式样式原样返回（手动优先）、AUTO 按尺寸匹配样式与宽格表现、
  「已上完策略」不被覆盖、尺寸不可用时退回 provider、都没有时落到最小档、解析结果永不为 AUTO。
- `WidgetPresetTest` 全绿：标识↔格子一致、标定样本自命中、清晰边界（2×3 vs 4×3 vs 6×3）、非法尺寸回退、极端尺寸。
- 未验：设备上拖动改尺寸后样式是否随之变化（需 launcher 拖拽手势）。

## A8 门禁 ✅

| 门禁 | 结果 |
|---|---|
| `./android/gradlew -p android testDebugUnitTest` | **186 例全绿**（上轮 167 → +19） |
| `pnpm test -- --run` | **91 例全绿** |
| `pnpm lint` | 0 error |
| `pnpm typecheck` | 通过 |
| `pnpm cap:build:android` | 通过（245 assets + 五 provider 元数据断言） |
| `assembleDebug` + 安装到模拟器 | 通过 |

## 残余风险与待办

1. **真机（PKR110 / ColorOS）复验顺延**：模态的失败分支（探针命中 → 立刻切失败态）只有那台机器能触发；
   拾取器五条目的尺寸标签也可能与 AOSP 不同（ColorOS 自己的夹取规则）。
2. **拖动改尺寸未在设备上验**：逻辑由单测覆盖，尺寸变化时的重合成走 Glance 既有路径
   （`onAppWidgetOptionsChanged` → 立即刷新），但"手指拖完样式真的变了"这一条还没看到。
3. **6×3 在手机上会被 launcher 夹到更小的格子**（实测标签显示 2×2）：手机网格放不下 6 列是客观限制，
   用户仍能拖到更大；文案已避免承诺尺寸。
4. **`preview_sized w=179 h=108`**：pin 出来的实例此刻的测量尺寸很小（可能是 launcher 尚未最终摆放），
   配置页预览因此按小格子渲染 —— 属现场状态，不是缺陷，但值得在真机上再看一次。
5. **五份预览是"生成的手写 mock"**：由脚本从度量公式产出，`--check` 可校验一致性；但脚本里的常量是
   **抄**自 `WidgetLayoutMetrics` 的，改了 Kotlin 侧不会自动同步（靠注释与 `--check` 提醒，不是编译期保证）。

## 过程缺陷（本轮踩到并记录的）

1. **`replace` 工具按"最近一次 `read` 的文件"解析锚点，而参数里没有路径** —— 我因此把一处本该改
   `WidgetStyleConfig.java` 的编辑落到了 `WidgetPreset.java`（已回滚）。教训：**每次 replace 前先 read 目标文件**。
2. **`adb install -r` 不会重新同步 Web 资源**：第一次在模拟器上打开面板，卡片名还是旧文案
   （`手机 · 极简` 而不是 `极简 2×2`），因为 APK 里的 `assets/public` 来自上一次 `cap:sync`。
   必须走 `pnpm cap:build:android`（含 `cap:sync`）再安装。
3. **XML 注释里不能出现连续两个连字符**：生成器的注释里写了 `--check`，aapt 直接报
   「注释中不允许出现字符串 "--"」。已在生成器里加断言。
4. **我自己把测试参数写错了**（用 `appwidget_id` 而不是 `appWidgetId` 作为 extra），于是 `getIntExtra`
   读到 `INVALID_APPWIDGET_ID`，看起来像"安全校验把合法实例拒了"。为此顺手把拒绝原因拆成白名单枚举 ——
   这个歧义以后不会再浪费一轮（spec 里也记了这一条）。
5. **`WidgetContent` 里插入样式解析时误删了一行**（`val context = ...`），靠紧接着的 `read` 发现并补回。
