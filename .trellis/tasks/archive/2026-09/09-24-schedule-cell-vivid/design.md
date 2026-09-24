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

### 信息自适应（实测降级，落实 PRD R5）——**已按实测重写，原容器查询方案作废**

显隐优先级（从高到低）：课名 > `@教室`（硬要求，永不丢弃）> 单双周/「非本周」标签 > 教师 > 备注。**只整行隐藏，绝不裁半截**。

原设计用 CSS 容器查询（`[@container(min-height:…)]:`）按格子高度切阈值。**实测证明不可行**：Tailwind v4 不为高度条件任意变体生成 `@container` 规则（生成的 CSS 里 `@container` 命中数为 0，`[container-type:size]` 白挂），后果是桌面端干净加载（tier=compact、无缩放控件）时教师与备注**永不出现**；且同一高度下 20 字课名占 7 行、3 字课名占 1 行，阈值本身也区分不出来。

实际实现（`ScheduleCourseCell.tsx`）：`useLayoutEffect` 里实测内容高度并按优先级逐级丢弃。

1. 先把可选三行（单双周/「非本周」标签、教师、备注）置为 `display: block`；
2. `content.scrollHeight > content.clientHeight + 1` 时，按 **备注 → 教师 → 单双周标签** 顺序整行隐藏，丢一行重判一次，直到放得下；
3. 丢完仍放不下（只有一节的矮格 + 超长课名）进入兜底：课名与 `@教室` 的字号连同行高一起收小（最多两档，手机 10→8px、桌面 14→12px）。

实现约定：直接写 `style.display` / `style.fontSize`（不 setState，避免测量与渲染互相触发）；每轮 apply 先清内联覆盖（否则 `md:hidden` 被压住，单双周标签会在桌面端冒出来）；`ResizeObserver` 观察**外层格子按钮**以在缩放/旋屏/窗口变化后重测；单双周标签只在手机端参与丢弃序列。

配套改动：`showTeacher` / `showNote` 两个「full 档强制显示」props 撤销（降级是唯一权威，不再有强制档），`ScheduleTable` 的 `[container-type:size]` 一并移除；行高下限 `2.75rem → 4rem`（格子适度加长，见下）。

**验证结果**（412×915 / 360×480 / 768×1024 / 1280×800 四档，seed 18 门课）：全部格子 `clip ≤ 1px`；1x 手机二连节格子（126px）18 格全部显示教师；注入「单节 62px 高 × 40px 宽 + 12 字课名」的极端格，裁切从 6px 降到 1px（字号收到 8px/行高 8.4px，教室 7px）。

### 出勤态（showAttendanceStatus=true 时）

- 已上：右下角 `CheckCircle2` 白图标（`text-white/90`，带轻微 `drop-shadow` 保证在亮黄底上可见）。
- 未上：卡片整体 `opacity-60 saturate-50`（淡化但仍能看出本色，与灰色非本周卡区分），右下角 `CircleAlert` 白图标。
- 两层开关（并入 master 的「出勤统计」后）：痕迹要同时满足能力层 `attendanceEnabled`（`useAttendanceStore().enabled`，默认关）与显示层 `showAttendanceStatus`（默认开），且只作用于本周课；个人中心的「课表显示」卡在能力层关闭时**只隐藏出勤那一行**，「淡化显示非本周课程」始终可用。
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
