# 修复低版本 WebView 上课表无法上下滑动（html/body 的 height 兜底被构建删除）

## 现象（用户报告，2026-09-29）

- Android 12 等低版本设备上：应用内课表区域**无法上下滑动**。
- Android 16 设备上：**完全正常**。
- **关掉「左右边缘滑动切换周」后仍然滑不动** → 已排除边缘阻尼手势（用户实测）。

## 已确认的缺陷（构建产物层面，与具体设备无关）

1. `app/app.css` 的 `html, body` 高度写的是两行兜底：`height: 100%;` + `height: 100dvh;`。
2. **构建产物里只剩 `height: 100dvh`**（`build/client/assets/root-*.css`）：Tailwind v4 → lightningcss
   按当前浏览器目标把 `height: 100%` 当成「被覆盖的冗余声明」删掉了。
   实测：`targets: undefined` / `chrome 108` / `chrome 111` / `safari 16.4` 四种目标下都输出
   `html,body{height:100dvh;overflow:hidden}`；只有显式指定 `chrome 96` 才保留 `height:100%`。
3. `dvh` 需要 Chromium 108+。在不支持的 WebView 上，`html/body` 因此**一条 height 声明都没有** →
   计算值 `auto` → 应用外壳整条 `height:100%` 链（`.app-viewport` → `SidebarInset` → 页面根 →
   `ScheduleTable` → `[data-schedule-scroll]`）全部退化成内容高度。
4. 后果（桌面 Chrome 注入 `html,body{height:auto!important}` 精确模拟「不认识 dvh」的引擎 + CDP 真实触摸事件，
   视口 412×915 实测）：
   - 课表滚动容器 `clientHeight` 732 → **780**（= 内容高度），`scrollHeight` 780，
     **`maxScrollTop` 48 → 0 → 完全无法上下滑动**；
   - `html/body` 高度 915 → 963（超出视口），被 `body { overflow: hidden }` 裁掉 →
     底部内容既**滚不到**也**看不到**。
5. 同一类问题还有：
   - `.h-svh{height:100svh}` / `.min-h-svh{min-height:100svh}`（构建产物里同样没有 `100vh` 兜底）；
   - 三处对话框 `max-h-[calc(100dvh-2rem)]` / `h-[calc(100dvh-2rem)]`（`ImportDialog`、
     `MarkdownEditorDialog`、`ScheduleCourseDialog`）——在不支持 `dvh` 的引擎上整条声明失效。

## 待确认（阻塞根因认定）

- 用户决策（2026-09-29）：**拿不到那台 Android 12 设备的 WebView 版本，按 Chromium ≤ 107 推进**。
- 判定口径因此是「机制 + 等价复现」：`dvh` 缺失会让 `html/body` 失去高度锚点（已在浏览器里精确复现），
  修复后用同一手段验证；设备侧实测作为交付后的验收项（AC-6）。
- 若设备实测显示修复后仍滑不动，说明还有第二个原因，需回到实测重新定位
  （`[data-schedule-scroll]` 的 `clientHeight/scrollHeight`、`document.body.scrollHeight`、
  纵向拖动时 `scrollTop` 是否变化、`getComputedStyle(document.documentElement).height`）。

## Requirements

- **R1** `html, body` 的高度锚点在不支持 `dvh` 的引擎上必须仍然成立：兜底必须**活到构建产物里**
  （不能只写在源码里就被压缩器当冗余删掉），且在支持 `dvh` 的引擎上仍取 `dvh`（不改 PWA 动态视口语义）。
- **R2** **保持现有 CSS/JS 目标基线（Chrome 111+）不变**：不为了旧设备下调整体目标；
  但要把它连同「哪些特性没有兜底」记录成 spec 里的契约，并加可执行检查，防止构建工具再静默删兜底。
- **R3** 课表区域在内容超出容器时必须能上下滑动；**不允许**出现「内容被裁掉且滚不到」的状态。
- **R4** 修复不得改变现有视觉与尺寸分配。

## Acceptance Criteria

- [ ] **AC-1** 构建产物（`build/client/assets/*.css`）里对 `html, body` 同时存在：一条旧引擎可识别的
      高度兜底（`height: 100%`）与一条 `dvh` 升级（经 `@supports (height: 100dvh)` 包裹），且产物中 `dvh`
      仍对支持它的引擎生效。
- [ ] **AC-2** 在「不支持 `dvh`」的等价条件下（从产物样式中移除 `dvh` 规则 = 旧引擎行为），
      课表 `[data-schedule-scroll]` 的 `maxScrollTop > 0`，且 CDP 真实触摸的纵向拖动使 `scrollTop`
      增大到 `maxScrollTop`。
- [ ] **AC-3** 同等条件下 `getComputedStyle(document.body).height` 不再超出 `window.innerHeight`
      （内容不再被 `body{overflow:hidden}` 裁掉），且滚到底时第 12 节完全进入视口。
- [ ] **AC-4** 支持基线写进 spec，并有一条可执行检查（脚本/单测，接进 `pnpm test` 或复用既有
      `android:check-assets` 同款机制）断言「产物里兜底仍在」，防止再次被构建工具静默删除。
- [ ] **AC-5** 412×915 与 1440×900 的布局基线逐项与 `research/dvh-fallback-evidence.md` §5 一致
      （容器尺寸、行列模板、字号、课程格尺寸、课程格数量、缩放控件是否渲染）。
- [ ] **AC-6** 真机验收：在报告问题的 Android 12 设备上确认课表可上下滑动；顺带补上
      `09-29-schedule-edge-swipe-device-verify` 的 AC-18 中「纵向滚动零回归」一条。

## Non-goals

- **不在本次修**：`.h-svh` / `.min-h-svh`（sidebar 包装）与三处 `[calc(100dvh-2rem)]` 对话框
  —— 同类问题已记录在案（见 `research/dvh-fallback-evidence.md` §1/§5），本次只修 `html/body` 这条致命项。
- 不主动把整体 CSS/JS 目标降到更老的引擎；Chromium <111 上其它特性（`oklch`、`color-mix`、
  容器查询单位 `cqw/cqh`）的降级不在本次范围。
- 不修改课表交互与手势行为本身。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
