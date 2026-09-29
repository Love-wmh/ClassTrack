# 验收记录：恢复 `html, body` 的高度锚点

> 逐条核对 `prd.md` 的 AC-1…AC-6。**AC-6（真机）按用户口径本次不做**，已显式标注为未验证。
>
> 环境：本机 Node 22 / pnpm（仓库对齐版本）、`agent-browser`（Chrome）+ 视口 412×915 / 1440×900（dpr 2）、
> 种子数据复用归档夹具 `09-20-mobile-schedule-week-grid/research/seed-schedule-fixture.js`
> （`currentWeek = 3`、`maxWeek = 16`、18 个课程格），灌种子走 `research/make-seed.mjs` + `--init-script`。

## 门禁

| 命令 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过 |
| `pnpm lint`（`--max-warnings 0`） | 通过（0 problems） |
| `pnpm format:check` | 通过（All matched files use Prettier code style） |
| `pnpm test` | 通过：**41 文件 / 392 用例**（基线 40 / 388；新增 `appCssViewportAnchor.test.ts` 4 例） |
| `pnpm build` | 通过 |
| `pnpm webview:check-css`（本任务新增） | 通过：`anchor in root-BhioNxaj.css` |
| `pnpm test:webview-css`（本任务新增） | 通过：12 / 12 |

## 改动清单

| 文件 | 内容 |
| --- | --- |
| `app/app.css` | `html, body` 的高度改为「`height: 100%` 兜底（块外）+ `@supports (height: 100dvh)` 独立升级块」，并写明为什么不能同规则双写 |
| `app/appCssViewportAnchor.test.ts`（新增） | 源码结构契约单测（4 例）：只有一条 `height` 且为 `100%`；`@supports (height: 100dvh)` 块覆盖 `html, body` 且写在兜底之后；`overflow` / dark 模式块保持原样 |
| `scripts/check-webview-css-fallback.js`（新增） | 真产物守卫：兜底在升级块之外、`dvh` 升级块存在、兜底在升级块之前 |
| `scripts/check-webview-css-fallback.test.js`（新增） | 守卫的 12 条单测（含「兜底被删」「同规则双写」「兜底误放进 @supports」「顺序颠倒」四种反例） |
| `package.json` | 新增 `webview:check-css` / `test:webview-css`；`cap:build:android` 链尾接上 `webview:check-css` |
| `.github/workflows/ci.yml` | `pnpm build` 之后新增 `pnpm webview:check-css`；测试段新增 `pnpm test:webview-css` |
| `.trellis/spec/frontend/quality-guidelines.md` | 新增「构建产物的兼容性契约（视口高度锚点）」：基线、无兜底特性清单、写法契约、两条防回归检查 |
| `.trellis/spec/frontend/mobile-schedule-layout.md` | Layout Contract 加前置依赖说明；验收配方新增「视口高度锚点的等价条件验收」与器械清单 |

## 逐条结论

### AC-1 产物/工具链锚点 ✅

`build/client/assets/root-BhioNxaj.css` 里同时存在（`pnpm build` 后实测 grep）：

```css
html,body{background-color:var(--background);color:var(--foreground);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;height:100%;overflow:hidden}
@supports (height:100dvh){html,body{height:100dvh}}
```

`pnpm webview:check-css` 通过。**反证见下方「反证」第 2、3 条**（还原旧写法后产物只剩 `height:100dvh`，守卫变红）。

### AC-2 / AC-3 等价条件（`dvh` 不可用）✅

器械：`research/cdp-dvh-equivalent.mjs` —— 把页面里所有 `height: 100dvh` **声明**从 CSSOM 里
`removeProperty` 掉（= 旧引擎忽略该声明；不删整条规则，所以 `overflow:hidden` 等仍然生效），
再用 CDP `Input.dispatchTouchEvent` 派发真实单指纵向拖动（650 → 350，14 步）。

| 指标（412×915） | 修复前 · 等价旧引擎 | 修复后 · 等价旧引擎 | 判据 |
| --- | --- | --- | --- |
| `html` / `body` 计算高度 | 963px | **915px**（= `innerHeight`） | AC-3 |
| `document.body.scrollHeight` | 963 | **915 ≤ 915** | AC-3 ✅ |
| `[data-schedule-scroll]` clientHeight | 780（= 内容高度） | **732** | — |
| `maxScrollTop` | **0** | **48** | AC-2 ✅ |
| 纵向拖动后 `scrollTop` | **0（纹丝不动）** | **48 = maxScrollTop** | AC-2 ✅ |
| 第 12 节底边 | 885 | 885 ≤ 915 | AC-3 ✅ |

同一份器械在**修复前**跑出的对照数据见 `research/dvh-fallback-evidence.md` §3 —— 因此这不是纸面推演。

### AC-4 支持基线 + 可执行防回归 ✅

- spec：`quality-guidelines.md` 的「构建产物的兼容性契约（视口高度锚点）」写明基线
  （Chrome 111+ / Safari 16.4+）、无兜底特性清单（`dvh/svh`、`oklch`/`color-mix`、`cqw/cqh`，
  并标出本次未修的 `.h-svh` 与三处 `calc(100dvh-2rem)` 对话框）、写法契约与不可行写法清单。
- 可执行检查两条：`app/appCssViewportAnchor.test.ts`（随 `pnpm test` / CI）、
  `scripts/check-webview-css-fallback.js`（`pnpm webview:check-css`，挂 `cap:build:android` 与 CI）。
- **两条都做过反证**（见下）。

### AC-5 布局基线 ✅

`research/layout-probe.js` 采集，与 `research/dvh-fallback-evidence.md` §5 逐项对比：

| 项 | 412×915（实测 = 基线） | 1440×900（实测 = 基线） |
| --- | --- | --- |
| `[data-schedule-scroll]` clientW / clientH | 379 / 732 | 1142 / 798 |
| `[data-schedule-scroll]` scrollW / scrollH | 379 / 780 | 1142 / 798 |
| `gridTemplateColumns` | `32px 49.5625px 49.5781px 49.5625px 49.5781px 49.5625px 49.5781px 49.5781px` | `64px 154px ×7` |
| `gridTemplateRows` | `36px 62px ×12` | `36px 63.5px ×12` |
| 首个课程格 clientW / clientH | 47 / 121 | 151 / 124 |
| 首个课名字号 / 行高 | 10.1108px / 11.6274px | 15px / 17.25px |
| `[data-course-cell]` 数量 | 18 | 18 |
| `[data-schedule-zoom-control]` 是否在 DOM | 是 | 否 |

另核对不变量：`body` 的 `overflow` 仍为 `hidden`、滚动容器 `touch-action` 仍为 `pan-x pan-y`、
滚动容器父元素仍是 `[data-schedule-swipe-stage]`（`flex min-h-0 flex-1 flex-col overflow-hidden`）。

### AC-6 真机验收 ❌ 未验证

用户口径（2026-09-29）：**本次不跑真机测试**。本沙盒无 `/dev/kvm` 且 `~/.android` 只读，也无法用模拟器，
因此这一条既没做、也不能在这里补做。设备侧要确认的是：装新 APK 到报告问题的 Android 12 设备 →
课表能否上下滑动（并顺带补 `09-29-schedule-edge-swipe-device-verify` 的 AC-18「纵向滚动零回归」）。

**若设备上仍滑不动**，说明还有第二个原因，按 `prd.md`「待确认」小节的清单取数回报：
`navigator.userAgent` 里的 `Chrome/xxx`、`getComputedStyle(html/body).height`、`document.body.scrollHeight`、
`[data-schedule-scroll]` 的 `clientHeight/scrollHeight`、纵向拖动时 `scrollTop` 是否变化。

## 反证（证明守卫真的挡得住回归）

把 `app/app.css` 还原成修复前的写法（`git show HEAD:app/app.css`，即同一条规则里 `height: 100%` +
`height: 100dvh`），然后：

| # | 操作 | 期望 | 实测 |
| --- | --- | --- | --- |
| 1 | `npx vitest run app/appCssViewportAnchor.test.ts` | 变红 | **3 failed \| 1 passed** ✅ |
| 2 | `pnpm build` 后看产物 | 兜底消失 | `html,body{…height:100dvh;overflow:hidden}`，**无 `@supports` 块** ✅ |
| 3 | `pnpm webview:check-css` | 失败并指出原因 | 退出码 1：`缺少 html,body 的 height:100% 兜底（构建器很可能又把它当冗余声明删了）—— 不支持 dvh 的 WebView（Chromium ≤ 107）上应用会失去视口高度锚点，课表完全无法上下滑动` ✅ |

第 2 条同时是**根因的端到端确认**：源码双写 → 构建器删前一条 → 产物只剩 `dvh`。
反证结束后已用备份恢复修复版，并重跑门禁与 AC-2/AC-3（均在恢复后的状态上通过）。

## 残余风险

| 编号 | 风险 | 缓解 / 现状 |
| --- | --- | --- |
| R1 | 报告设备修完后仍滑不动（存在第二个原因） | 未验证；取数清单已写在 `prd.md` 与本节，本次不掩盖该可能 |
| R2 | Tailwind / Vite / lightningcss 升级后再次改变「冗余声明」策略 | 两条守卫：源码结构单测 + 真产物断言，任一红即挡在 CI 前；`research/lightningcss-fallback-matrix.mjs` 可复跑定位 |
| R3 | `.h-svh` / `.min-h-svh` 与三处 `calc(100dvh-2rem)` 对话框仍无兜底 | 用户明确不在本次范围；已进入 spec 的「无兜底特性清单」，不再当成未知问题排查 |
| R4 | Chromium < 111 上 `oklch` / `color-mix` / 容器查询单位的降级 | 出范围；课程格配色是硬编码 hex，因此课表本身仍可读，但应用外壳颜色会退化 |
| R5 | 只按「等价条件」验证，未覆盖 Android WebView 真实内核差异 | 器械用的是同一套 Blink 触摸/滚动管线（CDP 真实触摸事件，非构造事件）；真机差异只能由 AC-6 覆盖 |

## 复现/验收命令

```bash
export XDG_RUNTIME_DIR=/tmp/ab-runtime
cd <repo root>
node .trellis/tasks/09-29-fix-schedule-scroll-legacy-webview/research/make-seed.mjs   # 产出 /tmp/ct-seed-write.js
(nohup pnpm dev --port 5173 > /tmp/ct-dev.log 2>&1 &)
for i in $(seq 1 60); do curl -sf -o /dev/null http://localhost:5173/ && break; sleep 1; done

agent-browser --session ct --init-script /tmp/ct-seed-write.js set viewport 412 915
agent-browser --session ct --init-script /tmp/ct-seed-write.js open http://localhost:5173/
sleep 2
WS=$(agent-browser --session ct get cdp-url)
node .trellis/tasks/09-29-fix-schedule-scroll-legacy-webview/research/cdp-dvh-equivalent.mjs "$WS" /tmp/ct-equiv.png

pnpm build && pnpm webview:check-css && pnpm test:webview-css
node .trellis/tasks/09-29-fix-schedule-scroll-legacy-webview/research/lightningcss-fallback-matrix.mjs
```
