# 移动端课表被底部导航栏遮挡

> 发生时间：2026-09-11  
> 复现环境：Android Capacitor App（`com.classtrack.app`）真机  
> 关联页面：课程表  
> 状态：已修复，并在真机确认第 12 节完整可见

## 现象

移动端打开课程表后，表格最后一行（第 12 节）被底部导航栏压住：

- 第 12 节左侧序号只露出上半截
- 课表格底部边框被导航栏盖住
- 课表本身不能继续往下滚动，因此被挡住的内容无法看到

期望结果是：课表占满导航栏上方的剩余高度，最后一行完整露出，并与底部导航栏保留一点间距。

## 根因

这不是单点样式写错，而是三层布局叠加后，底部导航栏占用的空间没有真正从课表高度里扣掉。

### 1. 底部导航是 `fixed`，不参与文档流

`MobileBottomNav` 原先使用：

```tsx
className="fixed inset-x-0 bottom-0 ..."
```

`position: fixed` 会把导航栏从文档流中拿出去，主内容区仍然按整屏高度计算。课表因此铺到屏幕最底部，导航栏再叠在上面。

### 2. 给父容器加 `padding-bottom` 对 `h-full` 子元素无效

当时尝试过在 `SidebarInset` 上预留导航高度：

```tsx
<SidebarInset className="h-full overflow-hidden pb-[calc(4.75rem+env(safe-area-inset-bottom))]">
  <Outlet />
</SidebarInset>
```

`SchedulePage` 根节点是 `h-full`。百分比高度按父元素的 `height` 计算，不按 content-box 计算，所以子页面高度仍然等于整个 `SidebarInset`，会穿过 `padding-bottom`，继续伸到导航栏下面。

### 3. 用 `calc(100dvh - 导航高度)` 会和 `body` 安全区重复计算

后续又尝试直接缩短内容区：

```css
height: calc(100dvh - 4rem - env(safe-area-inset-bottom));
```

但 `body` 已经有：

```css
padding-top: env(safe-area-inset-top);
padding-bottom: env(safe-area-inset-bottom);
```

`100dvh` 是完整动态视口高度。页面根节点再按 `100dvh` 铺满时，顶部安全区会把整页往下顶，底部又被 `fixed` 导航盖住，课表仍然少一截。

`SidebarProvider` 默认还有 `min-h-svh`，也会把容器撑回整屏，抵消高度裁减。

## 无效方案

下面这些改法都在真机上验证过，不能稳定解决：

- 只给课表页加 `pb-3` / `pb-5`
- 只给 `SidebarInset` 加 `pb-[4rem]` 或 `pb-[4.75rem]`
- 给 `SidebarInset` 写死 `height: calc(100dvh - 导航高度)`
- 继续保留 `fixed` 底部栏，只调数字

它们都没有改变这件事：底部栏不占位，课表仍按整屏高度渲染。

## 有效方案

让底部导航重新进入文档流，和课表上下排列，由 flex 分配剩余高度。

### 1. 视口锁在 `body` 内容区

`app/app.css`：

- `html, body` 使用 `height: 100dvh; overflow: hidden`
- `body` 只保留顶部和左右安全区，不再额外加 `padding-bottom`
- `.app-viewport` 改为 `height: 100%; max-height: 100%; min-height: 0 !important`

这样根布局填满 `body` 的内容盒，而不是再按完整 `100dvh` 计算一次。`min-height: 0 !important` 用来覆盖 `SidebarProvider` 自带的 `min-h-svh`。

### 2. 移动端改成纵向 flex

`AppLayout` 在移动端使用 `flex-col`：

- `SidebarInset`：`min-h-0 flex-1 overflow-hidden`，吃掉导航栏上方的剩余高度
- 桌面端仍是 `md:flex-row`，侧边栏布局不变

### 3. 底部导航改为相对定位并占位

`MobileBottomNav` 从：

```tsx
fixed inset-x-0 bottom-0
```

改为：

```tsx
relative z-40 w-full shrink-0 ... pb-[env(safe-area-inset-bottom)]
```

导航栏高度由内容自己决定（`h-16` + 底部安全区），不再估算。课表高度随之自动收缩。

### 4. 课表页只保留内容间距

`SchedulePage` 使用 `pb-3`，只负责表格和页面边缘的视觉间距，不再承担“给导航栏让位”。

## 涉及文件

- `app/app.css`
- `app/features/layout/AppLayout.tsx`
- `app/features/layout/MobileBottomNav.tsx`
- `app/features/schedule/SchedulePage.tsx`

## 验证

- 定向 ESLint、`pnpm typecheck` 通过
- 重新构建并安装 Android Debug APK
- 真机打开课程表，第 12 节完整可见，底部与导航栏有间距

## 后续注意

以后如果再给移动端加固定底栏、顶栏或安全区，优先让它们进入文档流占位；不要只给 `h-full` 子页面加 `padding` 去躲固定层。桌面端侧边栏布局不要被移动端的 `flex-col` 影响，继续用 `md:flex-row` 隔离。
