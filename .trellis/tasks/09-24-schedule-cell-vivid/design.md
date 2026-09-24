# Design — 课表课程格子改版：彩色实底白字风格

## 改动边界

| 文件 | 改动 |
| --- | --- |
| `app/features/schedule/constants.ts` | `courseColors` 换成 8 组鲜亮实色类名 |
| `app/features/schedule/ScheduleCourseCell.tsx` | 卡片结构/样式重写；出勤表达改为图标+淡化；新增「非本周」淡化态 |
| `app/features/schedule/ScheduleTable.tsx` | 课程格子容器加圆角间隙；渲染列表从 `Class[]` 变为带 `isOutOfWeek` 标记的视图模型 |
| `app/features/schedule/SchedulePage.tsx` | 用新纯函数计算可见课程（受开关控制） |
| `app/features/schedule/utils.ts` | 新增 `getVisibleCourses()` 纯函数 |
| `app/features/schedule/utils.test.ts` | `getVisibleCourses` 单测 |
| `app/store/scheduleDisplayStore.ts`（新增） | 持久化两个开关 |
| `app/features/profile/ScheduleDisplaySettings.tsx`（新增） | 「课表显示」设置卡片（两个 Switch） |
| `app/features/profile/ProfilePage.tsx` | 挂载新设置卡片 |

明确**不改**：`useScheduleZoom` 手势/缩放实现、网格行列定义、节次列、表头、桌面小组件、数据模型与迁移。

## 视图模型与数据流

```
SchedulePage
  classes（全学期） + currentWeek + showOutOfWeek(store)
    └─ getVisibleCourses(classes, currentWeek, showOutOfWeek)
         → VisibleCourse[] = { course: Class; isOutOfWeek: boolean }[]
  ScheduleTable weekClasses→visibleCourses
    └─ ScheduleCourseCell 收到 course + isOutOfWeek + showAttendanceStatus(store)
```

### getVisibleCourses（utils.ts，纯函数，可测）

```ts
export type VisibleCourse = { course: Class; isOutOfWeek: boolean }

export function getVisibleCourses(classes: Class[], currentWeek: number, showOutOfWeek: boolean): VisibleCourse[]
```

- `showOutOfWeek=false`：行为与现状完全一致（仅 `weeks.includes(currentWeek)`），`isOutOfWeek=false`。
- `showOutOfWeek=true`：本周课在前（`isOutOfWeek=false`），非本周课在后（`isOutOfWeek=true`，保持输入顺序）。
- 冲突消解（在函数内完成）：
  1. 先按本周课占用格子集合（`day-section` 每节一格）；
  2. 非本周课若任一占用格与本周课重叠 → 丢弃；
  3. 非本周课之间互相重叠 → 保留先出现者，丢弃后来者，并把丢弃者的占用格视为已占用（稳定顺序 = 输入 `classes` 顺序）。
- ScheduleTable 的 `occupiedCells` 改由返回列表统一计算（本周+被保留的非本周），空格描边逻辑不变。

## 样式契约

### 调色板（constants.ts）

8 组，每组含渐变底 + 白色文字，例如：

```ts
'bg-gradient-to-b from-emerald-400 to-emerald-500 text-white',
'bg-gradient-to-b from-sky-400 to-blue-500 text-white',
'bg-gradient-to-b from-rose-400 to-pink-500 text-white',
'bg-gradient-to-b from-orange-300 to-orange-400 text-white',
'bg-gradient-to-b from-violet-400 to-purple-500 text-white',
'bg-gradient-to-b from-amber-300 to-amber-400 text-white',
'bg-gradient-to-b from-teal-400 to-cyan-500 text-white',
'bg-gradient-to-b from-lime-400 to-green-500 text-white',
```

`getCourseColor` 哈希逻辑不动（颜色稳定）。实现时对照参考图微调色相。

### 卡片（ScheduleCourseCell）

- 按钮：`rounded-md`（桌面端可 `md:rounded-lg`）+ `ring-1 ring-inset ring-white/25`（参考图的浅色细边）+ `shadow-xs`；移除外层包裹的红/绿出勤 ring 与左侧色条。
- 间隙：ScheduleTable 的课程格子容器加 `p-px`（约 1–2px 内边距）制造卡片间距；容器不再画 `border-r/border-b`（有课程的格子不再贴网格线，空格仍有线）。容器的 `overflow-hidden` 保留。
- 文字层级（白字）：
  - 课名：`text-white font-semibold`；**任何端都不截断**（桌面端一并去掉 `md:line-clamp-2`），自然换行
  - 教室：`@{classroom}`，`text-white/85`；教室为空字符串时不渲染该行
  - 教师：`text-white/80`；单双周/备注：`text-white/70`
- 手机端字号收紧以保「显示全」：课名 10px、教室/教师 9px（现为 11/10px）；桌面端课名 `md:text-sm`、其余 `md:text-xs`。
- 「非本周」标记：复用 `data-course-parity` 位置，文案 `非本周`（非本周课时优先于单双周标签显示）。

### 信息自适应（容器查询，落实 PRD R5）

显隐优先级（从高到低）：课名 > `@教室` > 教师 > 单双周/「非本周」标签 > 备注。**只整行隐藏，绝不裁半截**。

- 课程格子容器（ScheduleTable 里 grid 定位的那个 div）加 `[container-type:size]`：它的高度来自 gridRow 跨节，是确定值，size containment 不会塌陷。
- 教师行：`hidden`，手机端 `[@container(min-height:7.5rem)]:block`、桌面端 `md:[@container(min-height:6.5rem)]:block`；缩放 full 档（2x）时无条件 `block`（保留旧契约里 2x 必见教师的语义，作为容器查询之外的强制开关）。**实现偏差**：手机端阈值从 6.5rem 上调到 7.5rem——实测 412px 宽手机 2 节格子约 7.1rem，20 字最长课名（7 行）+ `@教室`（2 行）刚好占满，6.5rem 会让教师行挤掉教室最后一行（裁半截）；桌面端列宽、字号更大，6.5rem 足够故保留原阈值。
- 备注行：`hidden`，`[@container(min-height:9rem)]:block`；桌面端 full 档同理强制显示。
- 单双周/「非本周」标签：默认显示，`[@container(max-height:4rem)]:hidden`（极矮格子先牺牲它保住课名+教室）。
- Tailwind v4 任意容器查询变体若不支持 `min-height` 条件，回退方案：在 `app/app.css` 写三条原生 `@container` 规则（`.course-cell-teacher` / `.course-cell-note` / `.course-cell-parity`），实现时先写 Tailwind 语法并用 agent-browser 实测，不生效再回退。
- 缩放 tier 逻辑（`useScheduleZoom` / `data-zoom-tier`）保留，但**不再驱动内容显隐**——只留 full 档对教师/备注的强制显示；`showClassroom/showTeacher/showNote` 三个派生布尔随新规则重定义（教室恒 true）。

### 出勤态（showAttendanceStatus=true 时）

- 已上：右下角 `CheckCircle2` 白图标（`text-white/90`，带轻微 `drop-shadow` 保证在亮黄底上可见）。
- 未上：卡片整体 `opacity-60 saturate-50`（淡化但仍能看出本色，与灰色非本周卡区分），右下角 `CircleAlert` 白图标。
- `showAttendanceStatus=false`：不渲染图标、不加淡化，也不读取 mark 状态做样式分支。
- title 文案保持「已上/未上」语义（出勤开启时）。

### 非本周态（isOutOfWeek=true）

- 固定灰色：`bg-gradient-to-b from-slate-300 to-slate-400 text-white/90` + `opacity-75`，不用课程哈希色。
- 与「未上淡化」可叠加时非本周优先（非本周课一般无当周 mark，淡化只看出勤开启与否；实现上 `isOutOfWeek` 分支优先，不再叠加未上淡化）。
- 新增 `data-course-out-of-week` 属性供测试定位。

## Store（scheduleDisplayStore.ts）

跟随 `mobileNavigationStore.ts` 模式（独立 persist store，不混入 class-track-storage）：

```ts
type ScheduleDisplayStore = {
  showAttendanceStatus: boolean   // 默认 true
  showOutOfWeekCourses: boolean   // 默认 false
  setShowAttendanceStatus: (value: boolean) => void
  setShowOutOfWeekCourses: (value: boolean) => void
}
// persist key: 'class-track-schedule-display'
```

- partialize 只存两个布尔；merge 用默认值兜底（未来加字段不致 undefined）。
- 默认值测试：`scheduleDisplayStore.test.ts` 或直接覆盖在 utils 测试中——按现有 `store/utils.test.ts` 模式，单独小测试文件。

## 设置卡片（ScheduleDisplaySettings.tsx）

跟随 `MobileNavigationSettings` / `AppUpdateSettings` 模式：`Card` + `Switch`（`~/components/ui/switch`），id=`card-schedule-display`，挂在 `ProfilePage` 的 `<MobileNavigationSettings />` 之前。两行：

1. 「显示出勤状态」/ 副文案「已上课程打勾，未上课程淡化显示。」
2. 「淡化显示非本周课程」/ 副文案「本周没有的课程以灰色卡片显示，方便查看整周安排。」

## 兼容与回滚

- 纯前端样式 + 本地设置，无数据迁移；localStorage 新 key 删除即恢复默认。
- 回滚 = revert 提交；`class-track-schedule-display` key 残留无副作用。

## 验证

- 单测：`getVisibleCourses`（过滤、排序、三类冲突）、store 默认值。
- 手动/agent-browser：种子数据 → AC1/2/3/4/5/7 逐项；深色模式切 `.dark` class 目检。
- 模拟器回归（可选）：沿用 spec 里 CDP 流程验证缩放手势未被破坏。
