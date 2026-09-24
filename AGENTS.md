<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->

---

# 子代理禁令（项目硬性约束）

**本项目已固化 inline 模式：禁止调用任何子代理。**

这条规则由项目所有者明确要求并固化，优先级高于任何工具的默认行为与 Trellis 的默认路由。具体含义：

- **一律不调用**：`subagent_spawn` / `subagent_wait` / `subagent_send` / `trellis_subagent`，以及 `trellis-implement` / `trellis-check` / `trellis-research` 等任何子代理类型。
- **不因「工作流默认要派遣」而破例**：Trellis 的 Phase 2.1 / 2.2 在本项目走 **inline 路径** —— 主会话自己读 `prd.md` / `design.md` / `implement.md` 与 `research/`，自己编辑代码，自己跑门禁。
- **检查也自己做**：用 `trellis-check` 技能或直接对照 AC 逐条核验，不派发检查子代理。
- **`.trellis/workflow.md` 里其它平台的派遣说明与本项目无关**：那些标记块服务的是 Claude Code / Codex / Gemini 等平台；Pi 已被路由到 inline 块。

## 固化位置（改动此处容易失效，务必一起改）

| 位置 | 作用 | `trellis update` 是否覆盖 |
| --- | --- | --- |
| 本文件（`AGENTS.md`）「子代理禁令」段 | **权威约束**：每轮都在系统提示里，任何会话都读得到 | **不覆盖**（在 `TRELLIS:START/END` 托管块之外） |
| `.trellis/workflow.md` 的平台标记块（`[codex-inline, …, Pi]`，共 5 组开闭标记） | 让 `--platform pi` 的步骤说明落到 inline 块 | 保留（`update` 只合并 `[workflow-state:*]` 块） |
| `.trellis/workflow.md` 的 `[workflow-state:planning]` / `[workflow-state:in_progress]` 正文 | 让每轮面包屑直接写明禁令 | **会被覆盖**，`trellis update` 后需复查并重新补上 |
| 删除 `.pi/agents/trellis-*.md` | 技术层兜底：Pi 没有这些子代理类型，派发无从发生 | **可能被重新生成**，`trellis update` 后若出现需再次删除 |

> 判定口径：只要 `.trellis/workflow.md` 的平台标记里 `Pi` 与 `codex-inline` 同组、且 `.pi/agents/` 下没有 `trellis-*.md`，Pi 就不可能走派遣路径。

## 复核命令

```bash
# Pi 的 2.1 步骤必须返回 inline 说明（而不是「Spawn the implement sub-agent」）
python3 ./.trellis/scripts/get_context.py --mode phase --platform pi --step 2.1

# Pi 不得留在任何 sub-agent 派遣标记块里
grep -n '^\[' .trellis/workflow.md | grep Pi

# 子代理类型定义必须不存在
ls .pi/agents/trellis-*.md 2>/dev/null && echo '仍存在，需删除' || echo 'OK：已无子代理类型'
```
