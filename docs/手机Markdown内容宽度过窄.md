# 手机 Markdown 内容宽度过窄

> 发生时间：2026-09-15  
> 复现环境：Android Capacitor App（`com.classtrack.app`）真机  
> 关联页面：代课管理  
> 状态：已修复，并安装到真机验证

## 现象

手机打开代课管理后，Markdown 编辑区看起来像被挤到卡片中间：

- 标题被拆成「年9月 / 16日 / 星期三」
- 列表项提前换行，例如「互联网应用 / 开发」「08:00- / 09:40」
- 卡片左右仍有大块空白，实际可读宽度远小于屏幕宽度

期望结果是：编辑区占满卡片可用宽度，标题和列表按正常中文换行，不再被挤成中间一窄列。

## 根因

这不是卡片本身太窄，而是 Milkdown 主题默认内边距压过了我们自己的覆盖样式。

### 1. Crepe 主题给编辑器留了桌面级左右边距

`@milkdown/crepe` 的 `reset.css` 默认是：

```css
.milkdown .ProseMirror {
  padding: 60px 120px;
}
```

这是给桌面宽屏准备的。手机卡片大约 360px 宽时，左右各扣 120px，正文只剩大约 120px。标题和列表因此被强制折成一字一换行。

### 2. 覆盖写在 `@layer utilities` 里，优先级不够

原先在 `app/app.css` 里已经写过移动端覆盖：

```css
@media (max-width: 767px) {
  .substitute-management-page .markdown-editor-shell .ProseMirror {
    padding: 12px 16px;
  }
}
```

但这段规则放在 `@layer utilities` 中。Tailwind v4 的分层样式优先级低于未分层的第三方 CSS。Milkdown 主题是普通选择器，因此 `padding: 60px 120px` 始终生效，覆盖等于没写。

`useIsMobile()` 首屏还会短暂是 `false`，`compact` 类也可能晚一拍才加上，不能作为宽度约束的唯一来源。

## 无效方案

下面这些改法都不能稳定压过主题默认值：

- 只给 `.ProseMirror` 加 `min-width: 0` / `max-width: 100%`，不改 padding
- 继续把覆盖留在 `@layer utilities`
- 只给代课管理页写覆盖，课程备注弹窗仍走同一套默认边距

它们都没有改变这件事：未分层的 `padding: 60px 120px` 比分层 utilities 更强。

## 有效方案

把 Markdown 编辑器覆盖移出 `@layer`，让选择器优先级真正压过 Crepe 主题。

`app/app.css`：

```css
.markdown-editor-shell .milkdown,
.markdown-editor-shell .milkdown .editor,
.markdown-editor-shell .milkdown .ProseMirror {
  box-sizing: border-box;
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

@media (max-width: 767px) {
  .markdown-editor-shell .milkdown .ProseMirror,
  .markdown-editor-shell .milkdown .editor {
    padding: 12px 16px;
  }
}
```

这样做的结果是：

- 手机上内容区只留 `12px 16px`，占满卡片宽度
- 桌面端仍可保留主题原来的大边距和预览分栏
- 代课管理和课程备注弹窗共用同一套宽度规则，不再各写一份容易失效的覆盖
