# 技术设计：更新检测的调度记账与 release 正文渲染

> 对应 `prd.md` 的 F1 / F2 / F3。实现前置阅读：`.trellis/spec/frontend/app-update.md`（既有跨层契约）。

## 1. 边界与职责划分

改动集中在两层，**不新增模块间契约**：

```
app/lib/app-update/schedule.ts      纯函数：档位换算 + 「这次触发该不该真的联网」的唯一判决
app/lib/app-update/check.ts         检查内核：闸门 → 记账 → 取远端 → 判定，依赖全部注入（可纯单测）
app/lib/app-update/settings.ts      纯函数：持久化设置的收窄 + 一次性的存量间隔提升
app/store/updateStore.ts            persist 落盘字段与动作（新增 lastAttemptAt / intervalPinned）
app/components/app-update/useAppUpdate.ts   调度壳：读 store → 问 schedule → 记账 → 发请求
app/components/app-update/releaseNotes.tsx  纯函数：markdown 字符串 → React 元素（唯一渲染入口）
app/components/app-update/UpdateAvailableDialog.tsx  只有它消费 releaseNotes
```

新增/修改的公共契约（签名即契约）：

```ts
// schedule.ts
export type CheckInterval = 'launch' | '1h' | '1d' | '3d' | '7d'
export const CHECK_INTERVALS: readonly CheckInterval[]
export const CHECK_INTERVAL_LABELS: Record<CheckInterval, string>
export const DEFAULT_CHECK_INTERVAL: CheckInterval          // '1h'
export const FAILURE_RETRY_COOLDOWN_MS: number              // 60_000
export function checkIntervalMs(interval: CheckInterval): number
export function normalizeCheckInterval(value: unknown): CheckInterval | null

export type ShouldCheckArgs = {
  interval: CheckInterval
  /** 上一次**成功**拿到结果的时间；驱动间隔窗口。 */
  lastCheckAt: number | null
  /** 上一次**尝试**的时间（成功或失败都记）；只驱动失败冷却。 */
  lastAttemptAt: number | null
  now: number
  /** 有一次检查还在进行中：任何触发都不放行。 */
  inFlight?: boolean
  /** 手动「立即检查」：忽略间隔、失败冷却与 inFlight。 */
  manual?: boolean
}
export function shouldCheckNow(args: ShouldCheckArgs): boolean
```

```ts
// settings.ts（新增字段 + 迁移，均为纯函数）
export type AppUpdateSettings = {
  channel: UpdateChannel | null
  autoCheck: boolean
  notify: boolean
  interval: CheckInterval
  lastCheckAt: number | null       // 语义改为「上次成功」
  lastAttemptAt: number | null     // 新增
  skippedVersion: string | null
  /** 用户是否手动选过间隔。`true` 之后默认值的变化永不改写该设备。 */
  intervalPinned: boolean          // 新增
}
export function normalizeUpdateSettings(stored: unknown, fallback?: AppUpdateSettings): AppUpdateSettings
export function applyLegacyIntervalMigration(settings: AppUpdateSettings): AppUpdateSettings
```

```ts
// releaseNotes.tsx
export function renderReleaseNotes(notes: string): ReactNode
```

```ts
// check.ts —— 检查内核。所有副作用（存储读写、网络、时钟、版本读取）都由调用方注入，
// 因此「什么情况下算成功、什么情况下记账」可以被真单测钉住，而不是靠读代码。
export type CheckOutcome =
  | { kind: 'skipped' }                       // 被闸门拦住（间隔未到 / 失败冷却 / 检查中 / 总开关关闭）
  | { kind: 'version-unavailable' }           // 读不到安装版本名（插件不可用）
  | { kind: 'failed'; reason: FetchReleasesFailure }
  | { kind: 'up-to-date' }
  | { kind: 'found'; candidate: UpdateCandidate }

export type RunUpdateCheckArgs = {
  manual: boolean
  supported: boolean
  autoCheckEnabled: boolean
  interval: CheckInterval
  lastCheckAt: number | null
  lastAttemptAt: number | null
  inFlight: boolean
  currentVersion: string | null
  channel: UpdateChannel | null
  skippedVersion: string | null
  now: number
  loadVersion: () => Promise<string | null>
  markAttempted: (at: number) => void
  markChecked: (at: number) => void
  fetchCandidates: () => Promise<FetchReleasesResult>
}
export async function runUpdateCheck(args: RunUpdateCheckArgs): Promise<CheckOutcome>
```

## 2. 调度判决（F1 / F2）

### 2.1 两个时间戳，各管一件事

- `lastCheckAt` = **上一次成功拿到结果**的时刻 → 间隔窗口。设置卡片展示的就是它。
- `lastAttemptAt` = **上一次尝试**的时刻（成功失败都写） → 只为失败冷却。

「上次尝试是失败的」的判据（纯函数内部推导，不再落第三个字段）：

```
failedAttemptPending(lastCheckAt, lastAttemptAt)
  = lastAttemptAt !== null && (lastCheckAt === null || lastAttemptAt > lastCheckAt)
```

`shouldCheckNow` 的判决顺序（顺序本身是契约，测试逐条钉住）：

```
1. manual            → true（手动忽略一切节流；UI 按钮在检查中已 disabled）
2. inFlight          → false
3. 失败冷却：failedAttemptPending 且 now - lastAttemptAt < 60_000 → false
4. 从未成功过（lastCheckAt === null）→ true
5. 时间戳在未来（lastCheckAt > now）→ true      // 改系统时间不得永久静默
6. now - lastCheckAt >= checkIntervalMs(interval)
```

为什么这样够用：

- **上报的现象消失**：失败不再写 `lastCheckAt`，所以「冷启动那次失败 → 切前台被拦」不会发生；切前台立刻重试（60s 冷却之后）。
- **`每次启动` 仍然可用**：`checkIntervalMs('launch') === 0` → 第 6 步恒为真，但第 2、3 步仍拦得住「检查中」与「刚失败」。
- **冷启动的双触发不再翻倍请求**：`onResume` 的 `fireStatusChange(true)` 与 effect 里的 `loadVersion().then(runCheck)` 都会走闸门；
  第一次调用在 await 之前就写 `lastAttemptAt`，第二次调用落在失败冷却窗口内 —— 第 3 步拦住（因为此时 `lastAttemptAt > lastCheckAt` 成立）。
  这只是「顺手」的重复保护，真正的重入保护是第 2 步。
- **限流额度受控**：最坏情况是「每次回到前台 1 次请求 + 每次失败后至少间隔 60 秒」，远低于匿名 60 次/小时。

### 2.2 记账点（`useAppUpdate.runCheck`）

```
// check.ts 的 runUpdateCheck（内核，全部依赖注入）
if (!supported || !autoCheckEnabled) return { kind: 'skipped' }
if (!shouldCheckNow({ interval, lastCheckAt, lastAttemptAt, now, inFlight, manual })) return { kind: 'skipped' }

const version = currentVersion ?? (await loadVersion())
if (!version) return { kind: 'version-unavailable' }

markAttempted(now)                     // 先写尝试时间：失败也要冷却
const result = await fetchCandidates()
if (!result.ok) return { kind: 'failed', reason: result.reason }   // ← 不写 lastCheckAt（核心修复）
markChecked(now)                       // ← 成功才消耗间隔窗口（含「无新版本」「被通道/跳过过滤」）

const found = resolveUpdate({ candidates: result.candidates, channel: seedChannel(channel, version),
  currentVersion: version, skippedVersion, ignoreSkipped: manual })
return found ? { kind: 'found', candidate: found } : { kind: 'up-to-date' }

// useAppUpdate 的壳：只负责平台判定、DEV 短路、isChecking 与 UI 副作用
store.setIsChecking(true)
try {
  if (!manual && import.meta.env.DEV) return      // 开发环境不自动打真接口（既有行为）
  const outcome = await runUpdateCheck({ ...store 快照, loadVersion, markAttempted, markChecked,
    fetchCandidates: fetchReleaseCandidates, now: Date.now() })
  if (outcome.kind === 'failed' && manual) toast.error('检查更新失败，请稍后再试')
  if (outcome.kind === 'up-to-date' && manual) toast.success('已是最新版本')
  if (outcome.kind === 'found') { store.setPendingCandidate(outcome.candidate); 自动检查才发通知 }
} finally {
  useUpdateStore.getState().setIsChecking(false)
}
```

注意 `manual` 仍走同一路径（`markChecked` 会写），所以「手动检查过之后 1 小时内自动检查不再联网」是**有意保留**的行为
（既省额度，也不影响「手动随时能查」）。

### 2.3 存量间隔提升（F2 的关键：不改默认值等于没修）

`updateStore.merge` 从 `normalizeUpdateSettings(persistedState, currentState)` 变成：

```ts
merge: (persistedState, currentState) => ({
  ...currentState,
  ...applyLegacyIntervalMigration(normalizeUpdateSettings(persistedState, currentState)),
})
```

`applyLegacyIntervalMigration` 的规则（单一出口，可单测）：

| 存储里的值 | `intervalPinned` | 结果 |
| --- | --- | --- |
| `'1d'`（旧默认，且没有标记） | 缺失 / `false` | **`'1h'` + `intervalPinned: true`** |
| `'1d'` | `true`（用户手动选过） | 保持 `'1d'` |
| `'launch'` / `'3d'` / `'7d'` | 任意 | 保持（这些值只可能来自显式选择） |
| `'1h'` | 任意 | 保持 |
| 缺失 / 非法 | 任意 | 已是 `normalizeUpdateSettings` 的默认 `'1h'` |

- 幂等：提升后存的是 `'1h'`，下次启动不再命中 `'1d'` 分支。
- `intervalPinned` 同时由 `setCheckInterval`（用户改档）置真，所以默认值以后再变也不会反复挪动老设备。
- 旧版本 App 读新存储：`normalizeCheckInterval('1h')` 在旧代码里返回 `null` → 回落旧默认 `'1d'`（降级安全，只是又变回 1 天）。

### 2.4 store 改动

`partialize` 增加 `lastAttemptAt`、`intervalPinned`；新增动作 `markAttempted(at)`；
`setCheckInterval(interval)` 同时写 `intervalPinned: true`；`markChecked` 语义不变（写 `lastCheckAt`），但调用点只剩成功分支。

## 3. release 正文渲染（F3）

### 3.1 安全边界

**不生成 HTML 字符串**：`marked.lexer(notes)` 只用来拿 token 流，token 逐个映射成 React 元素。
React 对文本子节点自动转义，因此「远端字符串进入 DOM」的唯一路径被消除，`dangerouslySetInnerHTML` 全程为 0 命中。
这替代了原来的「干脆按纯文本渲染」，安全目标不变，代价只是多一层映射。

### 3.2 token 白名单与降级表（映射表即契约）

| token | 渲染 |
| --- | --- |
| `space` | `null`（纯空白，丢弃） |
| `paragraph` | `<p>`，子 token 递归 |
| `text` | 有 `tokens` 递归，否则 `{text}`（React 转义） |
| `heading` | `<p>` + 加粗/字号样式（`depth <= 2` 更重）。**不用 `<h1..h6>`**：模态框里已有 Radix `DialogTitle`（h2），再塞标题元素会污染标题层级 |
| `strong` / `em` / `del` | `<strong>` / `<em>` / `<del>` |
| `codespan` | `<code>`（等宽 + `bg-background` + 圆角） |
| `code`（围栏/缩进） | `<pre><code>`，`{token.text}` 原样文本；不做语法高亮、不执行 |
| `link` | `safeHref(href)` 通过 → `<a href rel="noreferrer">` + 子 token；不通过 → 只渲染子 token（纯文本） |
| `autolink` 的 `link` | 同上（`marked` 的 GFM 自动链接也走 `link` token） |
| `list` / `list_item` | `<ul>` / `<ol start={token.start}>` + `<li>`；嵌套列表靠递归天然成立 |
| `list_item.task` | 前缀 `☑ ` / `☐ ` 文本（不产生 `<input>`，模态框里也不需要勾选交互） |
| `blockquote` | `<blockquote>`（左边框 + 次要色） |
| `hr` | `<hr>` |
| `br` | `<br>` |
| `image` | **只渲染 `{token.text}`**（替代文本），不产生 `<img>`、不发任何请求 |
| `table` | 降级：表头 + 每行渲染成一段纯文本，单元格之间用 ` ｜ ` 连接（不产生 `<table>`） |
| `html`（块级/行内） | `{token.raw}` 作为**文本**渲染（React 转义 → 页面上是 `&lt;script&gt;`），永不解析 |
| `escape` | `{token.text}` |
| `def` | `null`（链接定义不展示；`marked` 已把 `href` 解析进 `link` token） |
| `checkbox` | `null`（由 `list_item` 处理） |
| 未知 token | 有 `tokens` → 递归；否则 `{raw}` 文本。**不得抛错**（marked 升级后 token 形态可能变） |

`safeHref` 只接受 `http:` / `https:`：

```ts
function safeHref(href: string): string | null {
  try {
    const url = new URL(href)
    return url.protocol === 'http:' || url.protocol === 'https:' ? href : null
  } catch {
    return null    // 相对地址 / 宿主给的畸形值一律降级
  }
}
```

### 3.3 组件与文案

- `UpdateAvailableDialog.tsx` 里的 `notes` 区块改为 `{renderReleaseNotes(candidate.notes)}`，
  容器 class 保留（`max-h-56 overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm leading-6 text-muted-foreground`），
  去掉 `whitespace-pre-wrap`（改由 token 映射控制换行）。
- `updateDialogCopy.ts` 的 `formatReleaseNotes` **删除**（连同它的单测），因为「剥 `**`」的手段已被真实渲染取代。
- 空正文判定改为 `notes.trim() === ''`，占位文案不变。

## 4. 兼容性、风险与回滚

| 项 | 说明 |
| --- | --- |
| 存储向后兼容 | 新增字段对旧版本无害（旧 `normalizeUpdateSettings` 忽略未知字段）；`interval:'1h'` 在旧版本被收窄成默认 `'1d'` |
| 存储向前兼容 | 未知 `interval` 值仍回落默认；`intervalPinned` 非 boolean 时按 `false` 处理 |
| 平台 | 判定与渲染都是纯 Web 层，非 Android 平台 `candidate` 恒为 null，行为不变 |
| 风险 1 | 失败不记账 → 离线时每个前台触发一次请求；由 60s 冷却 + `inFlight` 双闸门约束 |
| 风险 2 | 存量提升无法区分「显式选过 1 天」，会静默变 1 小时（更频繁，不会漏更新，用户可改回） |
| 风险 3 | `marked` 升级改变 token 形态：未知 token 走兜底递归/raw，单测各覆盖一条 |
| 风险 4 | 本轮无真机验收：`appStateChange` 的实际触发频率、真机上的模态框渲染效果未在设备上确认 → 写进残余风险 |
| 回滚 | 全部改动都在 app-update 相关文件与两个 spec 段内，`git revert` 单个提交即可；不涉及数据迁移不可逆 |

## 5. 测试挂钩

- 纯函数：`schedule.test.ts`（判决矩阵）、`settings.test.ts`（收窄 + 存量提升）、`releaseNotes.test.ts`（token 映射与安全用例）。
- 组件：`UpdateAvailableDialog.test.ts` 用 `renderToStaticMarkup` 断言真实 release 正文的渲染结果。
- 内核：`check.test.ts` 用假依赖断言「成功才记账」——`failed` 的三种原因下 `markChecked` 一次都不被调用、`markAttempted` 恰被调用一次；
  `found` / `up-to-date` 下 `markChecked(now)` 被调用；`skipped` 下两个都不被调用。
- 静态：`grep -rn "dangerouslySetInnerHTML=" app/` 必须为 0 命中（裸标识允许出现在「禁止这么做」的注释里）。
