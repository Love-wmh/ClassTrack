# Implement — 课表课程格子改版：彩色实底白字风格

## 执行清单

### 1. Store + 设置卡片

- [ ] 新建 `app/store/scheduleDisplayStore.ts`：`showAttendanceStatus`(默认 true) / `showOutOfWeekCourses`(默认 false)，persist key `class-track-schedule-display`，跟随 `mobileNavigationStore.ts` 模式
- [ ] 新建 `app/features/profile/ScheduleDisplaySettings.tsx`：Card + 两个 Switch（参考 `AppUpdateSettings.tsx` 的 Switch 用法）
- [ ] `ProfilePage.tsx` 挂载 `<ScheduleDisplaySettings />`（放在 `<MobileNavigationSettings />` 前）

### 2. 可见课程纯函数 + 单测

- [ ] `utils.ts` 新增 `VisibleCourse` 类型与 `getVisibleCourses(classes, currentWeek, showOutOfWeek)`，含冲突消解（见 design.md）
- [ ] `utils.test.ts` 补单测：开关关闭行为同现状 / 开关开启含非本周课 / 本周课优先 / 非本周互相重叠取先者
- [ ] `SchedulePage.tsx` 改用 `getVisibleCourses`（从 store 读 `showOutOfWeekCourses`）

### 3. 格子新视觉

- [ ] `constants.ts`：`courseColors` 换 8 组鲜亮渐变白字类名，对照参考图调色
- [ ] 信息自适应：课名/教室恒显且不截断（去掉 `md:line-clamp-2`，手机字号收紧到 10/9px）；教师 `[@container(min-height:6.5rem)]` 或 full 档才 `block`；备注阈值 9rem；单双周标签 `[@container(max-height:4rem)]:hidden`；Tailwind 语法不生效则在 `app.css` 写原生 `@container` 回退
- [ ] `ScheduleCourseCell.tsx` 重写样式：圆角卡片 + 白色文字层级 + `@教室` 前缀；出勤改为右下白色图标 + 未上 `opacity-60 saturate-50`（受 `showAttendanceStatus` 控制）；移除红/绿 ring 与左侧色条；新增 `isOutOfWeek` 灰色态 + 「非本周」标记 + `data-course-out-of-week`
- [ ] `ScheduleTable.tsx`：props 改为 `visibleCourses: VisibleCourse[]`；`occupiedCells` 由其计算；课程格子容器加 `p-px` + `[container-type:size]`、去掉占用格的 `border-r/border-b`；透传 `isOutOfWeek`
- [ ] 保留全部既有 `data-*` 挂钩

### 4. 验证

- [ ] `pnpm lint && pnpm typecheck && pnpm test`
- [ ] agent-browser 种子数据目检：AC1/2/3/4/5（含 1x/1.5x/2x 缩放、两个开关）
- [ ] 深色模式（`.dark`）目检 AC7

## 验证命令

```bash
pnpm test -- app/features/schedule app/store
pnpm lint
pnpm typecheck
# 目检（agent-browser 流程见 .trellis/spec/frontend/mobile-schedule-layout.md）
export XDG_RUNTIME_DIR=/tmp/claude/ab-runtime && mkdir -p "$XDG_RUNTIME_DIR" /tmp/claude
pnpm dev &
agent-browser open http://localhost:5173/
```

## Review Gates

- Gate 1（步骤 2 后）：纯函数单测全绿，冲突规则符合 design.md
- Gate 2（步骤 3 后）：截图对照参考图，色相较亮但不过曝；未上淡化与灰色非本周卡肉眼可区分

## 回滚点

- 每个 Gate 失败即 `git checkout -- app/` 回滚对应步骤；store 新 key 无副作用
