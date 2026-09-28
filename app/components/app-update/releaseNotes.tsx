import type { ReactNode } from 'react'
import { marked } from 'marked'
import type { Token } from 'marked'

/**
 * 更新说明（GitHub Release 正文）的渲染。
 *
 * **安全边界（这是本模块存在的理由）**：正文是**远端内容**，而这个 WebView 的 localStorage 里放着
 * 用户的全部课程数据。所以这里的做法是 `marked.lexer()` 拿 token 流，再把 token 逐个映射成
 * **React 元素** —— React 会对文本子节点自动转义，远端字符串进入 DOM 的唯一路径因此被消除。
 *
 * 与之对应的两条硬约束：
 * 1. 全程**不得**出现 `dangerouslySetInnerHTML`，也不得把远端字符串拼进 HTML 字符串；
 * 2. 原始 HTML、图片、表格一律**降级**：按文本渲染 / 不产生元素 / 不加载任何远端资源。
 *
 * 2026-09-28 之前这里是「去掉 `**` + `whitespace-pre-wrap`」的纯文本展示（当时的 prd 决策 T5），
 * 安全目标相同，但用户看到的 `## 本次改动` / `- 条目` 全是字面量。
 *
 * 与组件分文件：`UpdateAvailableDialog.tsx` 只导出组件（`react-refresh/only-export-components`
 * 在本仓库是 `warn`，而 lint 跑 `--max-warnings 0`）。
 */

/** 行内 token 的递归渲染结果。 */
function renderInline(tokens: Token[]): ReactNode[] {
  return tokens.map((token, index) => renderToken(token, `i${index}`))
}

function field(token: Token, name: string): unknown {
  return (token as unknown as Record<string, unknown>)[name]
}

function readStringField(token: Token, name: string): string {
  const value = field(token, name)
  return typeof value === 'string' ? value : ''
}

function readNumberField(token: Token, name: string): number | null {
  const value = field(token, name)
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readBooleanField(token: Token, name: string): boolean {
  return field(token, name) === true
}

/**
 * 子 token。
 *
 * **`list` 用 `items`、其余块级/行内 token 用 `tokens`** —— 只读一个字段就会让整类 token 渲染成空壳
 * （初版只读 `tokens`，于是 release 正文里的列表全变成了空的 `<ul></ul>`）。字段形态不认识时退化成
 * 空数组，交给「按文本渲染」的兜底，而不是抛错。
 */
function readChildren(token: Token): Token[] {
  for (const name of ['tokens', 'items']) {
    const value = field(token, name)
    if (Array.isArray(value)) return value as Token[]
  }

  return []
}

/** 只取 token 的可见文本：优先 `text`，退回 `raw`。 */
function readText(token: Token): string {
  const text = readStringField(token, 'text')
  return text || readStringField(token, 'raw')
}

/**
 * 外链白名单：只认 `http:` / `https:`。
 *
 * `javascript:` / `data:` 之类的协议、以及相对地址，一律返回 `null`，调用方退化成纯文本
 * （远端内容不允许变成任意跳转地址）。
 */
export function safeReleaseHref(href: string): string | null {
  try {
    const url = new URL(href)
    return url.protocol === 'http:' || url.protocol === 'https:' ? href : null
  } catch {
    return null
  }
}

function renderLink(token: Token, key: string): ReactNode {
  const children = renderInline(readChildren(token))
  const href = safeReleaseHref(readStringField(token, 'href'))
  if (!href) return <span key={key}>{children}</span>

  // 不加 `target="_blank"`：Capacitor 把非同源导航交给系统浏览器，而 `_blank` 在新窗口被禁用时
  // 可能什么都不发生（与「去下载」按钮同一个坑，见 spec 的 app-update 契约）。
  return (
    <a key={key} href={href} rel="noreferrer" className="text-primary underline underline-offset-2">
      {children}
    </a>
  )
}

/** 表格降级：每行一段文本、单元格用 ` ｜ ` 连接（远端表格不生成 `<table>`，避免布局被远端支配）。 */
function renderTable(token: Token, key: string): ReactNode {
  const header = readCellsText(field(token, 'header'))
  const rows = field(token, 'rows')
  const body = (Array.isArray(rows) ? rows : []).map((row) => readCellsText(row)).filter((line) => line !== '')

  return (
    <div key={key} className="my-2 space-y-1">
      {header ? <p className="font-medium text-foreground">{header}</p> : null}
      {body.map((line, index) => (
        <p key={`r${index}`}>{line}</p>
      ))}
    </div>
  )
}

function readCellsText(cells: unknown): string {
  if (!Array.isArray(cells)) return ''
  return cells
    .map((cell) => {
      const text = (cell as { text?: unknown } | null)?.text
      return typeof text === 'string' ? text : ''
    })
    .join(' ｜ ')
}

function renderListItem(token: Token, key: string): ReactNode {
  const children = readChildren(token)
  const content = children.length > 0 ? renderInline(children) : readText(token)

  // 任务列表：不产生 `<input>`（模态框里不需要勾选交互），用文本前缀表达勾选状态。
  if (readBooleanField(token, 'task')) {
    return (
      <li key={key} className="pl-0.5">
        {readBooleanField(token, 'checked') ? '☑ ' : '☐ '}
        {content}
      </li>
    )
  }

  return (
    <li key={key} className="pl-0.5">
      {content}
    </li>
  )
}

function renderList(token: Token, key: string): ReactNode {
  const items = readChildren(token)
  const content = items.map((item, index) => renderToken(item, `l${index}`))

  if (readBooleanField(token, 'ordered')) {
    const start = readNumberField(token, 'start')
    return (
      <ol key={key} start={start ?? undefined} className="my-1.5 list-outside list-decimal space-y-0.5 pl-5">
        {content}
      </ol>
    )
  }

  return (
    <ul key={key} className="my-1.5 list-outside list-disc space-y-0.5 pl-5">
      {content}
    </ul>
  )
}

function renderToken(token: Token, key: string): ReactNode {
  switch (token.type) {
    case 'space':
      return null

    case 'hr':
      return <hr key={key} className="my-3 border-border" />

    case 'paragraph':
      return (
        <p key={key} className="my-1.5 first:mt-0 last:mb-0">
          {renderInline(readChildren(token))}
        </p>
      )

    // 标题不用 `<h1..h6>`：模态框里已有 Radix 的 `DialogTitle`（h2），再塞标题元素会污染标题层级。
    // 语义靠 `role="heading"` 表达，视觉靠字重区分。
    case 'heading': {
      const depth = readNumberField(token, 'depth') ?? 3
      const isMajor = depth <= 2
      return (
        <p
          key={key}
          role="heading"
          aria-level={Math.min(depth, 6)}
          className={isMajor ? 'mt-3 mb-1.5 font-semibold text-foreground first:mt-0' : 'mt-2 mb-1 font-medium text-foreground first:mt-0'}
        >
          {renderInline(readChildren(token))}
        </p>
      )
    }

    case 'blockquote':
      return (
        <blockquote key={key} className="my-2 border-l-2 border-border pl-3">
          {readChildren(token).length > 0 ? renderInline(readChildren(token)) : readText(token)}
        </blockquote>
      )

    case 'list':
      return renderList(token, key)

    case 'list_item':
      return renderListItem(token, key)

    // 围栏 / 缩进代码块：原样文本，不高亮、不执行。
    case 'code':
      return (
        <pre key={key} className="my-2 overflow-x-auto rounded bg-muted p-2 font-mono text-xs whitespace-pre">
          <code>{readText(token)}</code>
        </pre>
      )

    case 'text': {
      const children = readChildren(token)
      return <span key={key}>{children.length > 0 ? renderInline(children) : readText(token)}</span>
    }

    // 原始 HTML：整段按文本渲染（React 转义），绝不解析成标签。
    case 'html':
      return <span key={key}>{readText(token)}</span>

    case 'strong':
      return (
        <strong key={key} className="font-semibold text-foreground">
          {renderInline(readChildren(token))}
        </strong>
      )

    case 'em':
      return <em key={key}>{renderInline(readChildren(token))}</em>

    case 'del':
      return <del key={key}>{renderInline(readChildren(token))}</del>

    case 'codespan':
      return (
        <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
          {readText(token)}
        </code>
      )

    case 'br':
      return <br key={key} />

    case 'link':
      return renderLink(token, key)

    // 图片：**不渲染**，只留替代文本 —— 远端内容不允许让 WebView 去拉任意资源。
    case 'image':
      return <span key={key}>{readText(token)}</span>

    case 'table':
      return renderTable(token, key)

    case 'escape':
      return <span key={key}>{readText(token)}</span>

    // 链接定义：`marked` 已经把 href 解析进 `link` token，这里不展示。
    case 'def':
      return null

    // 任务列表的勾选框由 `list_item` 处理。
    case 'checkbox':
      return null

    // marked 升级带来陌生 token 时的兜底：能递归就递归，否则按文本渲染，绝不抛错。
    default: {
      const children = readChildren(token)
      if (children.length > 0) return <span key={key}>{renderInline(children)}</span>

      const text = readText(token)
      return text ? <span key={key}>{text}</span> : null
    }
  }
}

/**
 * 把 release 正文渲染成 React 节点。
 *
 * @param notes GitHub Release 的 `body` 原文（远端内容，可能为空、可能是任意字符串）。
 * @returns 渲染结果；空正文返回 `null`（调用方负责给占位文案）。
 */
export function renderReleaseNotes(notes: string): ReactNode {
  if (notes.trim() === '') return null

  // gfm 默认开、breaks 关：与 GitHub 上的呈现口径一致（段内换行不折行，列表靠空行区分松散度）。
  const tokens = marked.lexer(notes, { gfm: true, breaks: false })
  return renderNoteTokens(tokens)
}

/**
 * 块级 token 列表 → React 节点。
 *
 * 单独导出是为了能被直接单测：`marked` 升级后才会出现的陌生 token、原始 HTML、图片、表格这些
 * 降级路径都没法用一段 markdown 稳定地造出来，只能从这一层喂进去。
 *
 * @param tokens `marked` 的 token 列表（远端内容的解析结果，形态不可信）。
 * @returns 渲染结果。
 */
export function renderNoteTokens(tokens: Token[]): ReactNode {
  return renderInline(tokens)
}
