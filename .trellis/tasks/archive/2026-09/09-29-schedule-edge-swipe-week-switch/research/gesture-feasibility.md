# 调研：Android WebView 里「边缘阻尼跟手位移」的可行性事实

> 采集于 2026-09-29。用途：支撑 `design.md` §2 的方案选择与 §4 的互斥规则；其中 **F1 是真机验收的第一项**。

## 结论速览

| 编号 | 事实 | 出处 | 对设计的影响 |
|---|---|---|---|
| R1 | 浏览器一旦把触摸序列判成滚动接管，会给 pointer 序列发 `pointercancel`；**即使所在区域「根本不能滚动」也会发**（Flutter Web 嵌在页面里的 glasspane 就因此收到 `pointercancel` + `pointerleave`） | [flutter/engine PR #53647](https://github.com/flutter/engine/pull/53647)、[MDN `pointercancel`](https://developer.mozilla.org/en-US/docs/Web/API/Element/pointercancel_event)、[Chromium CL「Send pointercancel based on scroll capability of pointers」](https://chromium.googlesource.com/chromium/src/+/ca109349f4522f52aaf6b87e726ccf767a2f39d0) | **不能**用 pointer 事件做跟手位移；`useScheduleZoom` 现有 tap 判定会被 cancel 坐标污染 → 本任务 AC-12 的修复依据 |
| R2 | 原生滚动进行期间 **`touchmove` 仍会被派发**（被动监听器是官方推荐的滚动联动用法；「asynchronous touchmove processing」= 滚动期间照样发 touchmove） | [Chrome: A more compatible, smoother touch](https://developer.chrome.com/blog/a-more-compatible-smoother-touch)、[Making touch scrolling fast by default](https://developer.chrome.com/blog/scrolling-intervention)、[Improving scroll performance with passive event listeners](https://developer.chrome.com/blog/passive-event-listeners) | 方案 A 成立：用 `{passive:true}` 的 `touchmove` 观测手指位移 |
| R3 | 触摸序列里**第一个 `touchmove` 没有 `preventDefault`** 就会被当成被动，之后再 `preventDefault` 无效 | 同上（passive / scrolling-intervention 两篇） | 我们本来就不 `preventDefault`；但也意味着**不能**用「中途阻止原生滚动」来避免双重位移 → 必须靠 `design.md` §4 的互斥（重锚）规则 |
| R4 | `touch-action` 允许的轴由**手势开始时**决定，且不能在 `pointerdown` 之后改（「press-hold-drag」这类 UX 无法用 pointer 事件做） | [w3c/pointerevents #178](https://github.com/w3c/pointerevents/issues/178)、[pointerevents #303（railing）](https://github.com/w3c/pointerevents/issues/303) | 不尝试「运行时切换 `touch-action`」；保持 `pan-x pan-y` |
| R5 | Chrome 触摸滚动有**railing（方向锁定）**：以偏横向起手后，纵向移动不会滚动；纵向大幅移动会打断锁定 | [pointerevents #303](https://github.com/w3c/pointerevents/issues/303) | 我们的「一次手势只认一个轴」与浏览器行为一致；不必额外做轴的二次判定 |
| R6 | `overscroll-behavior: contain` **会关掉原生 overscroll 链、下拉刷新与横向滑动导航（swipe navigation）** | [MDN `overscroll-behavior`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overscroll-behavior)、[Chrome: customizing pull-to-refresh and overflow effects](https://developer.chrome.com/blog/overscroll-behavior) | 滚容器上已有的 `overscroll-contain` 正好是我们需要的：边缘继续拖不会牵动页面、不会有原生发光/回弹，阻尼完全由我们画 |
| R7 | 平台的语义化 overscroll 能力（drawer / swipe-to-action）**目前没有**语义化 API，官方也承认这类模式此前只能靠嵌套滚动容器或 JS 手势 polyfill | [Open UI: Declarative Overscroll Actions (Explainer)](https://open-ui.org/components/overscroll-actions.explainer/) | 自己实现是当前唯一现实路径，不需要为「没用原生 API」而犹豫 |
| R8 | CSS Overflow 规范把**被 transform 的后代**算进滚动溢出区域 | [CSS Overflow Module Level 3](https://drafts.csswg.org/css-overflow-3/) | `design.md` §5 的落点决策依据：位移必须写在滚容器自身 + 外层 `overflow-hidden`，否则会污染 `scrollWidth` → `resolveScrollEdges` 被自己污染 |

## F1（唯一的技术赌注）与验收顺序

R2 说明「原生滚动期间有 touchmove」，但它**没有**回答一个更窄的问题：**在「该方向根本不能滚动」的边缘上继续同向拖**时，下面两件事是否都成立：

1. `touchmove` 继续派发（R2 支持，但 R2 的语境是「正在滚动」）；
2. 合成器不会因为它已经接管了序列而停止派发 touchmove。

**验收顺序**：真机第一件事就是在 2x 缩放下滚到最右边缘后继续左拖，读 `[data-schedule-scroll]` 的 computed `transform`。

- 有位移 → 方案 A 成立，继续其余验收。
- 恒为 0 → **F1 成立**：停机上报，改用方案 B（`touch-action: pan-y` + 自己实现横向滚动与惯性衰减）前先与用户确认，**不得静默换实现**。

## 备选方案的已知代价（以备 F1 成立时快速切换）

| 方案 | 代价 |
|---|---|
| B：`touch-action: pan-y` + JS 实现横向滚动 | 失去缩放态原生的横向滚动与甩动惯性 → 必须自己写惯性衰减；代码量与回归面显著变大 |
| C：pointer 事件跟手 | 不可行（R1） |
| D：`overscroll-actions` / 语义化 overscroll | 仅有 explainer（R7），不可用 |
