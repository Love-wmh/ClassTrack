# 手机 Markdown 无法插入图片

> 发生时间：2026-09-15  
> 复现环境：Android Capacitor App（`com.classtrack.app`）真机  
> 关联页面：代课管理 Markdown 编辑器  
> 状态：已修复，并安装到真机

## 现象

手机打开代课管理后，Markdown 编辑器里找不到插入图片的入口：

- 顶部没有插入图片按钮
- 输入 `/` 也不会弹出插入菜单
- 无法打开图片上传区域

期望结果是：手机上仍能插入图片，同时不把桌面端那套顶部工具栏和左侧拖拽手柄加回来。

## 根因

精简移动端编辑页时，把 `BlockEdit` 整项关掉了。

`MarkdownEditor` 原先在 compact 模式下写成：

```ts
[Crepe.Feature.TopBar]: !readonly && !compact,
[Crepe.Feature.BlockEdit]: !readonly && !compact,
```

`TopBar` 关了，只是去掉顶部工具栏。`BlockEdit` 却同时管两件事：

- 左侧块拖拽手柄
- 斜杠菜单 `/`

插入图片依赖斜杠菜单里的 Image 项。该项会插入空的图片块，再显示 Upload / 粘贴链接区域。关掉 `BlockEdit` 后，手机上既没有顶部插入按钮，也没有 `/` 菜单，上传界面因此进不去。

## 无效方案

继续只靠 compact 模式“少显示一点控件”，不能解决：

- 只隐藏 CSS 里的工具栏，但功能开关仍把 `BlockEdit` 关掉
- 指望用户用桌面端顶部工具栏插图
- 把完整 TopBar 加回手机，破坏已确认的精简布局

它们都没有把斜杠菜单这个真正入口还回去。

## 有效方案

手机上继续隐藏顶部工具栏和左侧手柄，但保留 `BlockEdit`，让 `/` 菜单可用。

```ts
[Crepe.Feature.TopBar]: !readonly && !compact,
[Crepe.Feature.BlockEdit]: !readonly,
```

同时给斜杠菜单和图片上传条补上窄屏宽度，避免菜单或 Upload 区域超出卡片。桌面端布局不变。
