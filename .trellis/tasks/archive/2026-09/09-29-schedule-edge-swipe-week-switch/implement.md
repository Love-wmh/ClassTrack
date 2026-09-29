# 执行计划：课表边缘阻尼手势切换上下周

> 设计见 `design.md`，需求见 `prd.md`。**顺序是刻意的**：先把纯函数钉死（阶段 1）与开关落实（阶段 2），再接手势（阶段 3–4），最后才动真机与门禁（阶段 5–6）。
>
> 本项目为 **inline 模式**（不派生子代理），因此 `implement.jsonl` / `check.jsonl` 保持为空是**有意**的，不是遗漏。
>
> **执行结果（2026-09-29）**：阶段 0–4、6 全部完成；**阶段 5 只有 5.0 之后的浏览器侧替代验证完成了，真机部分因环境不可用未做**（详见 `verification.md` 的 AC-18 与残余风险 R1/R2）。

---

## 阶段 0：冻结基线（无代码改动）✅

**目的**：给 AC-15「零回归」留下可比的数字。手势会新增一层 DOM 包装，这一步是唯一能事后判定「尺寸分配没变」的依据。

- [x] 0.1 `pnpm dev` 起服务，确认可访问
- [x] 0.2 用 `mobile-schedule-layout.md` Verification Recipe 的种子数据法灌夹具（**必须** `storage local set` → `reload`，直接 eval 写 localStorage 会被运行中的应用回写覆盖），视口 412×915
- [x] 0.3 记录基线到 `research/baseline-before.md`：`[data-schedule-scroll]` 的 `clientWidth/clientHeight/scrollWidth/scrollLeft`、`[data-schedule-grid]` 的 computed `grid-template-columns` 与 `data-zoom-level`、`[data-course-cell]` 数量、首个课程格的 `[data-course-name]` computed `font-size`/`line-height`、`[data-schedule-zoom-control]` 是否存在
- [x] 0.4 记录 `useScheduleZoom` 触摸双击路径现状 —— 桌面浏览器覆盖不到该路径（`dblclick` 走鼠标分支），改为以代码路径 + 浏览器事实（`research/gesture-feasibility.md` 的 R1）留证，改后行为在浏览器侧用「连续两次横滑 + 渲染计数」验

**门禁**：`research/baseline-before.md` 存在且字段齐全 → 已满足。

---

## 阶段 1：纯函数核 `weekSwipe.ts`（唯一数值真源）✅

- [x] 1.1 新建 `app/features/schedule/weekSwipe.ts`：`dampedOffset` / `resolveSwipeAxis` / `sideAllowsRubber` / `weekStepFor` / `canSwitchWeek` / `shouldSwitchWeek` / `switchTravelOffset` / `gestureVelocity` / `isTapSizedMove` 与全部常量
- [x] 1.2 边缘判定复用 `~/lib/scroll-edges` 的 `resolveScrollEdges`（只引用，未修改该文件）
- [x] 1.3 新建 `app/features/schedule/weekSwipe.test.ts`：阻尼单调/有界/阈值位移、方向判定、四值映射、边界、松手三态、滑出滑入方向自检、速度窗口、tap 容差 —— **32 例**
- [x] 1.4 实测修正：达到切周阈值需要 **82px**（不是设计初稿写的 81px），已同步 `design.md` / `weekSwipe.ts` 注释与本文件

**验证**：`pnpm vitest run app/features/schedule/weekSwipe.test.ts`（32 通过）+ `pnpm typecheck`

---

## 阶段 2：可选开关（默认开启）✅

- [x] 2.1 `scheduleDisplayStore.ts`：`edgeSwipeWeekSwitch`（初始 `true`）+ setter；`ScheduleDisplayPersisted` / `partialize` / `merge` 三处同步
- [x] 2.2 `ScheduleDisplaySettings.tsx`：新增开关行（`id="schedule-display-edge-swipe-week"`、`aria-label="左右边缘滑动切换周"`）
- [x] 2.3 `scheduleDisplayStore.test.ts`：默认值、`partialize` 四键、`merge` 缺字段回落 `true` + 显式 `false` 保留、key 不变
- [x] 2.4 新增 `ScheduleDisplaySettings.test.ts`（SSR）：开关存在、`aria-label`、默认 `data-state="checked"`（Radix 在 SSR 下确实输出 `data-state`，无需退化）

**验证**：`pnpm vitest run` 两个文件（11 通过）+ 浏览器实测开关在 DOM 且默认勾选（截图 `research/web-settings-edge-swipe-toggle.png`）

---

## 阶段 3：手势层与组件接线 ✅

- [x] 3.1 新建 `hooks/useWeekSwipeGesture.ts`：被动 touch 监听（只订阅一次）、轴判定、每帧互斥规则（重锚 + 位移归零）、位移写入去重、三段切周动画、`reset()` 单一清理入口、`prefers-reduced-motion` 降级、任何路径都不 `preventDefault`
- [x] 3.2 `ScheduleTable.tsx`：新增 `[data-schedule-swipe-stage]` 包装（`flex min-h-0 flex-1 flex-col overflow-hidden`），滚容器 class 逐字符不变；读 `edgeSwipeWeekSwitch`；接 `useWeekSwipeGesture`
- [x] 3.3 `ScheduleTable.tsx` 新增 `maxWeek` / `onWeekChange` props，`SchedulePage.tsx` 传入
- [x] 3.4 `ScheduleHeader.tsx`：「第 N 周」span 补 `data-current-week={currentWeek}`

**验证**：`pnpm typecheck` + `pnpm lint` + `pnpm test`；浏览器复核基线数字逐项相同（AC-15）

---

## 阶段 4：修 `useScheduleZoom` 的 tap 误判（AC-12）✅

- [x] 4.1 `containerProps` 拆出 `onPointerCancel: handlePointerCancel`：只做记账，不参与 tap 判定
- [x] 4.2 `handlePointerEnd` → `endPointer(event, allowTap)`：`pointerup` 增加「按下点 → 抬起点」位移校验（`isTapSizedMove`，容差与手势层同源）
- [x] 4.3 既有双击去抖（400ms）与双指缩放逻辑未改动
- [x] 4.4 顺手收敛常量真源：删除 `useScheduleZoom` 里本地的 `DOUBLE_TAP_MOVE_TOLERANCE_PX = 24`，改用 `weekSwipe.ts` 的 `TAP_MOVE_TOLERANCE_PX`

**验证**：`pnpm test` + `pnpm lint`；渲染计数实测「连续两次横滑」0 次 React commit、`data-zoom-level` 不变

---

## 阶段 5：触摸验收 ⚠️ 部分完成（真机部分环境不可用）

按项目 skill `classtrack-android-webview-verify` 执行：

- [ ] 5.0 **先验 F1**（`design.md` §2 的技术赌注）：2x 缩放下把课表横向滚到最右边缘，再用 CDP `Input.dispatchTouchEvent` 继续左拖，读 `transform` —— **改在浏览器侧完成**（`s7bScrolledThenEdgeDrag`：未到边缘无位移、到底后出现阻尼），Android WebView 的真机复验未做
- [x] 5.1 1x：CDP 单指横滑，拖动中读 `transform` / `data-week-swipe-state`，松手后读 `data-current-week`（`s1`/`s2`/`s3`）
- [x] 5.2 1x 未过阈值：短距横滑后周次不变、`transform` 清空（`s1SmallRightDrag`）
- [x] 5.3 边界：第 1 周右滑 → 有位移但周次仍为 1（`s6bBoundaryDrag`）；`maxWeek` 方向未单独跑（同一分支，`canSwitchWeek` 有单测）
- [x] 5.4 2x：先在中间横滑只滚动（`transform` 为 0）→ 滚到边缘后出现位移（`s7b`）
- [ ] 5.5 `adb shell input tap` 点课程格打开弹窗、纵向拖动 `scrollTop` 变化 —— **未做**（无可用模拟器/真机）；纵向拖动「无位移」这半已验（`s4VerticalDrag`）
- [ ] 5.6 `adb shell input tap` 双击切缩放档位与「连续两次横滑不切档」 —— 后半在浏览器侧已验（`s5` + 渲染计数），**双击本身未在触摸路径上验**
- [x] 5.7 关闭开关：3 次横滑全程无位移、周次不变（`web-touch-scenarios-off.json`）
- [x] 5.8 复位：每个场景 `inlineTransform === ''`、`computedTransform === 'none'`、`opacity === '1'`、`swipeState === 'idle'`
- [x] 5.9 证据归档 `research/`：截图 2 张 + 三份 JSON + 脚本 + 可行性调研

**门禁**：AC-6 / AC-7 / AC-8 / AC-11（半边）/ AC-12（半边）已有证据；AC-18 在 `verification.md` 里**显式标为未验证**，并写清环境阻塞原因与残余风险。

---

## 阶段 6：门禁五项 + 规格更新 + 归档

- [x] 6.1 仓库的五项可信门禁全绿：`pnpm lint`、`pnpm typecheck`、`pnpm format:check`、`pnpm test`、`pnpm build`
- [x] 6.2 逐条核对 AC-1…AC-19 → `verification.md`（AC-18 标注未验证）
- [x] 6.3 规格更新：`mobile-schedule-layout.md`（手势契约 + 新开关一节 + 三个测试挂钩 + 6 条 Common Mistakes + 触摸验收配方）、`state-management.md`（两个 store 清单补 `scheduleDisplayStore` 与四个字段）
- [ ] 6.4 按仓库格式提交（`feat(schedule): ...`，中文主题）
- [ ] 6.5 `task.py archive`（用户确认后再推分支 / 开 PR）

---

## 回滚点

| 改动 | 回滚方式 |
|---|---|
| **阶段 3 的 stage 包装层**（唯一有布局回归风险） | 删掉包装层与 hook 调用即可回到原结构；纯函数与开关可原地保留 |
| 任一开关相关改动 | 把初始值 / `partialize` / `merge` / 设置项一起回退（三者必须同步，只退其一会在旧数据上丢值） |
| 阶段 4 的 tap 修复 | 独立于手势，可单独保留（它是真缺陷修复，不建议随手势一起回退） |
