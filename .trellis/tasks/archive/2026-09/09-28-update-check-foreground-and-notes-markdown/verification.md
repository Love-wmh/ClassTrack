# 验收证据与残余风险

任务：`09-28-update-check-foreground-and-notes-markdown`（更新检测：回前台自动检查失效与更新说明按纯文本渲染）
形态：`prd.md` + `design.md` + `implement.md`；实现由主会话 inline 完成（项目固化口径：不派任何子代理）。
口径：**本轮不做模拟器真机验收**（用户 2026-09-28 明确选择），验收 = 单测 + 静态检查 + 全量门禁。

---

## 1. 门禁（本机实测，全绿）

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `pnpm typecheck` | 通过（`react-router typegen && tsc`，无输出） |
| 前端单测 | `pnpm test` | **38 个文件 / 351 个用例全过**（改动前基线：36 文件 / 295 用例 → 新增 2 个文件、56 个用例） |
| Lint | `pnpm lint` | 通过，0 problems（`--max-warnings 0`） |
| 格式 | `pnpm format:check` | 通过 |
| 构建 | `pnpm build` | 通过（`✓ built in 8.77s`） |
| 静态：注入面 | `grep -rn "dangerouslySetInnerHTML=" app/` | **0 命中**（全仓库）。裸标识另有 2 处，均在 `releaseNotes.tsx` / `UpdateAvailableDialog.tsx` 的文档注释里作为「禁止这么做」的说明文字 |

基线在动工前先跑过一遍（`typecheck` + `test`），确认没有把既有失败混进本次改动。

---

## 2. prd 验收清单逐条核对

**单测（`pnpm test`）**

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| 间隔换算：`1h` = 3600000ms，其余不变，`DEFAULT_CHECK_INTERVAL` = `1h`，档位齐全且顺序稳定 | ✅ | `schedule.test.ts`「检查间隔」4 例 |
| 调度判决：从未检查 / 未到间隔 / 到间隔 / 失败冷却内外 / `launch` / 未来时间戳 / 手动 / 重入 / 非法值 | ✅ | `schedule.test.ts`「节流判定」「失败不消耗间隔窗口」「时钟与重入」共 19 例 |
| 存量提升：无标记 `1d`→`1h`；有标记保持；`launch`/`3d`/`7d` 保持；字段缺失→`1h`；非法→`1h`；幂等 | ✅ | `settings.test.ts`「存量间隔提升」7 例（含照抄真机 dump 的那一条） |
| 成功才记账：三种失败原因都不写 `lastCheckAt`、只写 `lastAttemptAt`；成功（无新版本 / 被通道过滤 / 被跳过）会写 | ✅ | `check.test.ts`「记账：成功才消耗间隔窗口」6 例 |
| markdown 渲染：真实 release 正文出元素且无 `**`/`##` 字面量；行内码/围栏码；链接白名单；`javascript:`/`data:` 降级；`<script>`/`<img onerror>` 不成元素；表格/图片降级；未知 token 兜底；空正文占位 | ✅ | `releaseNotes.test.ts` 4 组共 20 例 + `UpdateAvailableDialog.test.ts` 6 例 |
| 静态：注入形态 0 命中 | ✅ | 见第 1 节（判据从「裸标识 0 命中」改成「`dangerouslySetInnerHTML=` 0 命中」—— 见第 4 节偏差 1） |
| 「跳过此版本」仍只抑制自动提示 | ✅ | `check.test.ts` 两条（自动 → `up-to-date`；手动 → `found`）+ 既有 `channels.test.ts` |

**门禁**：`typecheck` / `test` / `lint` / `format:check` / `build` 全过 ✅

**已知取舍（不作为门槛）**：见第 5 节残余风险。

---

## 3. 实现期发现并修掉的问题（都留下了抓手）

1. **判决顺序第一版写错了（本轮缺陷的镜像）**：第一版实现把「失败冷却」写成「冷却内拦住、冷却外继续走间隔判定」，
   于是「上次失败 + 1 天档 + 距上次成功只有 5 分钟」仍然不放行 —— 正好是本次要修的老毛病。
   自己的第 5 个用例（`上一次失败且刚过冷却 → 立即放行`）当场变红，随后改成
   **「上次尝试失败 ⇒ 只受冷却约束、不看间隔」**。这条顺序现在写进了 spec 的 Contracts。
2. **`marked` 的 `list` token 子项字段是 `items`，不是 `tokens`**：初版 `readChildren` 只读 `tokens`，
   于是**整类列表渲染成空 `<ul></ul>`**（release 正文的主体就是列表，等于渲染了个寂寞）。
   断言 `<li>` 的用例把它抓出来；现在两个字段都读，并把这条写进 spec 的 Common Mistakes 与渲染契约。
3. **`isChecking` 的所有权**：如果被闸门拦下的调用也在 `finally` 里清标志，会把正在跑的那一轮误标成结束
   （按钮提前解禁 + 放进第三个并发请求）。改成「只有真正开始这一轮的调用才置位/清除」。
4. **`NaN` / `Infinity` 时间戳**：`typeof x === 'number'` 会放过它们，而 `NaN` 参与比较恒为假 →
   间隔判定永远为否、检查静默停摆。收窄改成「有限数才算时间戳」，并加了一条单测。

> 前两条都不是「实现不仔细」，而是**纯函数化 + 单测**这条既有策略把两类静默失效当场变成了红色断言。
> 这也印证了 design.md 里把记账/判决从 hook 抽出来的决定。

---

## 4. 与 prd / design 的偏差

1. **静态检查判据**：prd 原写「`grep dangerouslySetInnerHTML`（含注释）0 命中」。实践下来，注释里点名这个
   API 正是安全边界的表达方式（「禁止 X」必须写出 X），所以判据改成只看**被使用**的形态
   （`dangerouslySetInnerHTML=`）。全仓库 0 命中，结论比原判据更准确。prd / design / implement 三处已同步。
2. **settings 卡片文案**：`lastCheckAt` 语义变成「上次成功」之后，「上次检查」这一行改为
   **「上次检查成功」**，值为空时显示「还没有成功检查过」（原来写「尚未检查」）。属于如实描述，不影响验收。
3. **`useAppUpdate` 里保留了 `import.meta.env.DEV` 短路**（自动检查在开发环境不打真接口）：
   它比 scheduling 判定更靠外，留在 hook 里并已注明；短路发生在记账之前，不会写任何时间戳。
4. **`launch` 档按评审门确认保留**（5 档），存量 `launch` 原样保留、不需要迁移。

---

## 5. 残余风险

- **没有真机验收**（用户口径）：`appStateChange` 在真机上的实际触发频率、以及新渲染在 WebView 里的排版
  都没有在设备上确认。判定与记账逻辑有单测钉住，但「回到前台真的会走这条路」仍只在代码层面成立。
  下一次出包时的最小验证动作：注入一条比已装版本新的 release → 冷启动弹框 → 切后台再回来（间隔设 `launch`）
  → 仍弹框；再把 `lastCheckAt` 手动改早 2 小时 → 切前台应重新联网。
- **失败不消耗间隔窗口**意味着离线时每次回到前台都会试一次：由 60 秒冷却 + `inFlight` 双闸门约束，
  最坏是「每次失败后至少间隔 60 秒一次请求」，远低于匿名限流 60 次/小时，但**离线长时间使用会比以前多打几次请求**。
- **存量提升无法区分「显式选过 1 天」与「一直是旧默认」**：这类设备会被静默提升到 1 小时（更频繁，不会漏更新），
  用户可随时改回。
- **降级路径**：旧版本 App 读到新存储时，`interval:"1h"` 会被旧代码收窄成旧默认 `1d`（不会崩，只是又回到 1 天）。
- **markdown 降级是有意的**：表格/图片不渲染、原 HTML 只当文本。若将来要支持表格排版，必须**同时**给出净化方案，
  不能退回 `dangerouslySetInnerHTML`。

---

## 6. 变更文件清单

新增：

```
app/lib/app-update/check.ts            检查内核（依赖全注入，可纯单测）
app/lib/app-update/check.test.ts       17 例：记账契约 + 闸门矩阵
app/components/app-update/releaseNotes.tsx      markdown → React 元素（0 处 dangerouslySetInnerHTML）
app/components/app-update/releaseNotes.test.ts 20 例：真实正文 + 白名单 + 降级 + 未知 token
```

修改：

```
app/lib/app-update/schedule.ts         新增 1h 档与新默认；shouldCheckNow 改为 6 步判决（含失败冷却/重入/未来时间戳）
app/lib/app-update/schedule.test.ts    19 例（改写「失败也参与节流」那条）
app/lib/app-update/settings.ts         新增 lastAttemptAt / intervalPinned；applyLegacyIntervalMigration
app/lib/app-update/settings.test.ts    15 例（含真机 dump 存量现场）
app/store/updateStore.ts               落盘新字段；markAttempted；setCheckInterval 置定档；merge 接迁移
app/components/app-update/useAppUpdate.ts   runCheck 改为消费检查内核；isChecking 所有权
app/components/app-update/UpdateAvailableDialog.tsx  正文改用 renderReleaseNotes；去掉 whitespace-pre-wrap
app/components/app-update/updateDialogCopy.ts        删除 formatReleaseNotes（只留三个动作常量）
app/components/app-update/UpdateAvailableDialog.test.ts  断言改为「按 markdown 渲染」
app/features/profile/AppUpdateSettings.tsx            「上次检查成功」文案
.trellis/spec/frontend/app-update.md    契约改写：记账语义 / 档位与存量提升 / 渲染与降级表 / 4 条新的 Common Mistakes
.trellis/spec/frontend/index.md         索引描述补上新增契约
```

未改动（有意）：`channels.ts`（通道判定与播种）、`releases-api.ts`（远端读取）、`native-update.ts`（原生适配）、
`version.ts`、通知与权限链路、下载跳转白名单。
