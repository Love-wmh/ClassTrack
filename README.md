# ClassTrack

ClassTrack 是一个面向学生的课程管理 Web 应用，用于从高校教务系统导入课程表，并围绕课程出勤、备注和统计分析提供本地化管理能力。

## 功能特性

- **课程表查看**：按周展示课程，支持切换周次、查看课程时间、教室、教师等信息。
- **出勤标记**：支持标记单节课程是否上课，也支持批量标记本周课程。
- **课程备注**：可为课程在指定周次添加备注，便于记录请假、调课或其他事项。
- **数据看板**：展示课程完成度、缺勤率、周趋势、课程排名、课程分布和风险课程分析。
- **数据导入导出**：支持导出 ClassTrack 备份 JSON，也支持重新导入备份数据。
- **教务系统导入**：支持通过书签脚本从已适配学校的教务系统导出课程表 JSON，并使用解析器导入。
- **本地持久化**：应用数据保存在浏览器本地 `localStorage` 中，无需后端服务。

## 已支持学校

当前已配置课程解析器和书签脚本导出器的学校：

- 天津理工大学
- 天津工业大学

## 技术栈

- React 19
- React Router 7
- TypeScript
- Vite
- Tailwind CSS 4
- shadcn/ui + Radix UI
- Zustand + Immer
- Recharts
- Sonner
- date-fns

## 项目结构

```text
app/
├── components/          # 通用组件、UI 组件、导入流程组件、步骤条组件
├── features/            # 业务页面模块
│   ├── dashboard/       # 数据看板
│   ├── data-management/ # 数据管理
│   ├── layout/          # 应用布局
│   ├── profile/         # 个人中心
│   └── schedule/        # 课程表
├── lib/                 # 课程解析器、书签脚本适配器、工具函数和类型
├── routes/              # React Router 页面路由
├── store/               # Zustand 状态管理
├── app.css              # 全局样式
├── root.tsx             # 应用根组件
└── routes.ts            # 路由配置

docs/                    # 解析器与书签脚本导入系统设计文档
public/                  # 静态资源
```

## 快速开始

### 环境要求

- Node.js 20+
- pnpm

### 安装依赖

```bash
pnpm install
```

### 启动开发服务

```bash
pnpm dev
```

启动后根据终端提示访问本地开发地址。

### 类型检查

```bash
pnpm typecheck
```

### 代码检查

```bash
pnpm lint
```

### 格式化

```bash
pnpm format
```

### 构建生产版本

```bash
pnpm build
```

### 启动生产服务

```bash
pnpm start
```

## 使用说明

### 导入课程数据

1. 打开应用后选择学校。
2. 选择导入方式：
   - 使用书签脚本从教务系统导出课程表 JSON。
   - 或导入已有的 ClassTrack 备份 JSON。
3. 如果使用书签脚本导入：
   - 确认学年学期代码。
   - 将“数据导出器”拖拽到浏览器书签栏/收藏栏，或复制脚本代码手动创建书签。
   - 打开学校教务系统课程表页面。
   - 点击书签栏中的“数据导出器”导出 JSON 文件。
   - 回到 ClassTrack 上传导出的 JSON 文件。

### 管理课程

- 在课程表页面切换周次查看不同周的课程。
- 对课程进行上课/缺勤标记。
- 为课程添加备注。
- 在数据看板查看出勤趋势、风险课程和课程分布。

### 数据备份

在“数据管理”页面可以导出当前数据备份。备份文件可在后续重新导入，用于迁移或恢复本地数据。

## 数据存储

ClassTrack 使用浏览器 `localStorage` 保存数据，存储键为 `class-track-storage`。数据不会自动上传到服务器。更换浏览器、清理浏览器数据或更换设备前，建议先在“数据管理”页面导出备份。

## 扩展学校适配

项目支持扩展新的学校课程解析器和书签脚本适配器：

- 课程解析器位于 `app/lib/parsers/`
- 书签脚本适配器位于 `app/lib/bookmarklets/`
- 相关设计文档位于 `docs/`

新增学校适配后，需要在对应的 `index.ts` 注册解析器、学校信息和书签脚本适配器。

## Docker

项目包含 `Dockerfile`，可用于构建并运行生产版本。

```bash
docker build -t classtrack .
docker run --rm -p 3000:3000 classtrack
```
