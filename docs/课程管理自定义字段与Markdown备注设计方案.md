# 课程管理自定义字段与 Markdown 备注设计方案

## 1. 文档目的

本文档用于规划“课程管理页面支持用户自定义字段和 Markdown 备注”的完整实现方案。

本次需求中的截图仅作为课程详情卡片的视觉参考，具体要求以用户提出的交互和数据需求为准。

目标是让用户可以在每门课程的展开详情区域中：

1. 查看现有课程基础字段。
2. 编辑字段的标签和字段内容。
3. 新增任意数量的自定义字段。
4. 删除允许删除的自定义字段。
5. 保留“上课教师”“课程号”和“备注”三个固定字段，固定字段不可删除。
6. 在“备注”字段中使用 Markdown 编辑器。
7. 预留 Markdown 图片上传能力，当前只打印 `console.log`，不调用真实接口。
8. 让所有数据按当前学期独立保存，并继续支持现有导入导出备份能力。

## 2. 当前代码结构

当前课程管理页面的主要结构如下：

- `app/features/course-management/CourseManagementPage.tsx`
  - 课程管理页面入口。
- `app/features/course-management/hooks/useCourseManagement.ts`
  - 从当前学期的 `classes` 中按课程分组，并生成 `CourseInfo`。
- `app/features/course-management/components/CourseCard.tsx`
  - 单门课程卡片以及展开/收起状态。
- `app/features/course-management/components/CourseCardContent.tsx`
  - 展开后的课程详情区域。
- `app/features/course-management/components/CourseDetailItem.tsx`
  - 当前用于显示“上课教师”和“课程号”的详情字段。
- `app/store/slices/dataSlice.ts`
  - Zustand 数据状态和课程/学期相关 action。
- `app/store/migrations.ts`
  - localStorage 数据迁移和导入数据标准化。
- `app/features/data-management/hooks/useDataExportImport.ts`
  - 备份导出和数据恢复。

当前 `Class` 类型是教务系统解析后的课程排课数据，包含教师、课程号、教室和排课信息，但没有课程管理页面专属的自定义字段和 Markdown 备注。

## 3. 需求范围

### 3.1 本次实现范围

- 课程详情区域支持字段网格布局。
- 每个字段由“标签”和“字段内容”组成。
- 固定字段和用户字段统一使用同一种字段卡片样式。
- 字段卡片支持进入编辑状态。
- 用户字段支持删除。
- 增加“新增字段”卡片。
- 固定备注字段使用 Milkdown Markdown 编辑器。
- 保存字段和备注到当前学期。
- 旧数据自动补全三个固定字段。
- 数据导出和导入包含课程自定义字段。
- 为 Markdown 图片上传预留接口适配层。

### 3.2 暂不实现的内容

- 不修改教务系统原始解析逻辑。
- 不把用户编辑后的教师、课程号反写回原始 `Class` 排课数据。
- 不实现真实图片上传接口。
- 不实现图片管理、图片删除和云端资源清理。
- 不增加课程新增、课程删除或课程合并功能。
- 不增加字段拖拽排序；本次先采用新增顺序。
- 不增加复杂 Markdown 协同编辑或版本历史。

## 4. 数据模型设计

### 4.1 课程字段类型

新增课程管理字段类型：

```ts
export type CourseFieldContentType = 'text' | 'markdown'

export interface CourseField {
  id: string
  label: string
  content: string
  contentType: CourseFieldContentType
  canDelete: boolean
}
```

字段含义：

- `id`
  - 字段在当前课程中的稳定标识。
  - 固定字段使用固定 ID。
  - 用户新增字段使用生成的唯一 ID。
- `label`
  - 字段标签，例如“上课教师”“课程号”“备注”“考试地点”。
- `content`
  - 字段内容。
  - `text` 类型保存普通字符串。
  - `markdown` 类型保存 Markdown 原文。
- `contentType`
  - 控制字段内容编辑器。
- `canDelete`
  - 是否显示删除按钮。
  - 固定字段为 `false`。
  - 用户新增字段为 `true`。

固定字段 ID：

```ts
const BUILTIN_COURSE_FIELD_IDS = {
  teacher: 'builtin-teacher',
  courseId: 'builtin-course-id',
  note: 'builtin-note',
} as const
```

固定字段初始值：

| 字段 ID | 默认标签 | 内容来源 | 内容类型 | 是否允许删除 |
| --- | --- | --- | --- | --- |
| `builtin-teacher` | 上课教师 | 当前课程第一条排课数据的 `teacher` | `text` | 否 |
| `builtin-course-id` | 课程号 | 当前课程第一条排课数据的 `courseId` | `text` | 否 |
| `builtin-note` | 备注 | 空字符串 | `markdown` | 否 |

固定字段的标签和内容允许用户编辑，但固定字段本身不能删除。

编辑固定字段只影响课程管理页面的显示值，不修改教务系统导入的原始 `Class.teacher`、`Class.courseId` 等字段。这样可以避免用户的展示编辑破坏课表、统计和后续导入逻辑。

### 4.2 课程元数据类型

在课程数据中增加课程管理元数据：

```ts
export interface CourseMetadata {
  fields: CourseField[]
}

export type CourseMetadataMap = Record<string, CourseMetadata>
```

`CourseMetadataMap` 使用课程稳定 key 作为索引：

```ts
courseMetadata: CourseMetadataMap
```

这部分数据必须放入 `Semester`，因为不同学期的课程字段和备注应该互相独立。

同时保留当前学期快照：

```ts
export interface AppData {
  // 现有字段
  courseMetadata: CourseMetadataMap
}

export interface Semester {
  // 现有字段
  courseMetadata: CourseMetadataMap
}
```

这样可以延续当前项目“`Semester` 保存真实多学期数据，顶层字段保存当前学期快照”的设计。

### 4.3 课程稳定 key

目前课程 key 包含教师名称：

```ts
[courseId, name, teacher].join('-')
```

如果用户编辑课程管理页面中的教师展示值，不应导致自定义字段丢失。因此需要把课程管理元数据的 key 与展示字段解耦。

新的课程 key 规则：

1. 优先使用课程号、课程名称和该课程包含的排课实例 ID。
2. 排课实例 ID 统一排序后参与 key 计算。
3. 不使用课程管理页面中用户可编辑的字段值。
4. 对当前解析器生成的课程数据，排课实例 ID 来自教务系统教学班、星期和节次，跨页面和重复导入时具有稳定性。
5. 如果未来接入的解析器无法提供稳定 ID，需要在对应解析器适配层补充稳定 ID 生成规则。

建议使用独立工具函数：

```ts
export function getCourseKey(classes: Class[]): string
```

课程分组规则可以继续保持现有行为，但课程元数据索引必须使用不依赖用户编辑值的 key。

## 5. 数据迁移与兼容

### 5.1 Schema 版本

由于 `Semester` 和 `AppData` 会新增 `courseMetadata`，需要将：

```ts
CLASS_TRACK_SCHEMA_VERSION
```

从 `2` 升级为 `3`。

迁移逻辑必须兼容：

1. 旧版单学期数据。
2. 已有多学期数据但没有 `courseMetadata`。
3. 新版包含课程字段的数据。
4. 旧版备份 JSON 导入。

### 5.2 旧数据默认字段

对于没有课程元数据的旧课程，在 `useCourseManagement` 或迁移阶段生成默认字段：

```ts
[
  {
    id: 'builtin-teacher',
    label: '上课教师',
    content: firstClass.teacher || '未记录教师',
    contentType: 'text',
    canDelete: false,
  },
  {
    id: 'builtin-course-id',
    label: '课程号',
    content: firstClass.courseId || '未记录课程号',
    contentType: 'text',
    canDelete: false,
  },
  {
    id: 'builtin-note',
    label: '备注',
    content: '',
    contentType: 'markdown',
    canDelete: false,
  },
]
```

生成默认字段时不应该立刻为所有课程写入 localStorage，避免仅打开页面就产生大量持久化写入。只有用户编辑、添加或删除字段时，才将元数据保存到当前学期。

### 5.3 重新导入课程

重新导入课程时：

- 保留当前学期的 `courseMetadata`。
- 不因为导入课程数组变化而清空用户字段。
- 对仍然存在的课程继续使用原有 metadata。
- 对新出现的课程使用三个固定字段的默认值。
- 暂时不自动删除已经不存在的课程 metadata，避免误删用户信息；这些孤立数据仍可随备份导出。

## 6. Store action 设计

在 `app/store/slices/dataSlice.ts` 中增加以下 action：

```ts
updateCourseField: (
  courseKey: string,
  fieldId: string,
  patch: Partial<Pick<CourseField, 'label' | 'content'>>
) => void

addCourseField: (courseKey: string) => string

deleteCourseField: (courseKey: string, fieldId: string) => void
```

### 6.1 `updateCourseField`

行为：

1. 获取当前学期对应课程的 metadata。
2. 如果 metadata 不存在，先按课程数据创建三个固定字段。
3. 找到对应字段后更新 `label` 或 `content`。
4. 强制保留字段的 `contentType` 和 `canDelete`，防止 UI 意外修改固定字段属性。
5. 同步更新当前学期对象和顶层当前学期快照。
6. 更新 `updatedAt`。

### 6.2 `addCourseField`

行为：

1. 为课程创建一个新的自定义字段。
2. 默认字段内容：

```ts
{
  id: createCourseFieldId(),
  label: '新字段',
  content: '',
  contentType: 'text',
  canDelete: true,
}
```

3. 将新字段追加到字段数组末尾。
4. 返回新字段 ID，供页面自动进入该字段的编辑状态。

### 6.3 `deleteCourseField`

行为：

1. 只能删除 `canDelete === true` 的字段。
2. 尝试删除固定字段时直接忽略。
3. 删除成功后同步当前学期和顶层快照。
4. 如果删除后没有用户字段，字段区域仍然保留三个固定字段和新增卡片。

### 6.4 当前学期切换

现有 `setCurrentSemester` 需要同步：

```ts
state.courseMetadata = semester.courseMetadata
```

创建学期、删除学期、最后一个学期被删除时，也要同步维护 `courseMetadata`：

- 创建空学期：`courseMetadata = {}`
- 切换到其他学期：加载目标学期 metadata
- 删除最后一个学期：`courseMetadata = {}`

## 7. Hook 封装设计

### 7.1 `useCourseManagement`

继续负责：

- 当前学期课程分组。
- 课程排序。
- 课程总数和排课实例数。
- 计算稳定的 `course.key`。

返回的 `CourseInfo` 增加：

```ts
type CourseInfo = {
  // 现有字段
  fields: CourseField[]
}
```

`fields` 来源：

1. 当前学期 metadata 中已有字段。
2. metadata 不存在时，根据当前课程数据派生三个固定字段。
3. 派生过程不得改变原始 `Class` 数据。

### 7.2 `useCourseFieldEditor`

新增：

```ts
app/features/course-management/hooks/useCourseFieldEditor.ts
```

职责：

- 管理单个课程字段的编辑状态。
- 管理标签草稿和值草稿。
- 处理进入编辑、取消编辑、失焦保存、Enter 保存。
- 调用 `updateCourseField`。
- 调用 `deleteCourseField`。
- 处理删除后焦点和编辑状态清理。

建议 API：

```ts
type UseCourseFieldEditorOptions = {
  courseKey: string
  field: CourseField
}

type UseCourseFieldEditorResult = {
  isEditing: boolean
  label: string
  content: string
  startEditing: () => void
  setLabel: (value: string) => void
  setContent: (value: string) => void
  save: () => void
  cancel: () => void
  remove: () => void
}
```

字段编辑使用本地草稿，避免用户尚未完成输入时每次按键都触发全局状态更新。失焦或按 Enter 后保存。

### 7.3 `useCourseNoteEditor`

新增：

```ts
app/features/course-management/hooks/useCourseNoteEditor.ts
```

职责：

- 获取当前课程的 Markdown 备注字段。
- 连接 Milkdown 的 Markdown 输出监听。
- 将 Markdown 内容写回课程字段。
- 提供图片上传占位回调。
- 管理编辑器生命周期相关的 ref 和回调。

建议 API：

```ts
type UseCourseNoteEditorOptions = {
  courseKey: string
  field: CourseField
}

type UseCourseNoteEditorResult = {
  defaultValue: string
  onMarkdownChange: (markdown: string) => void
  onImageUpload: (files: File[]) => Promise<string[]>
}
```

备注保存策略：

- Milkdown 编辑器内容变化后使用轻量 debounce 保存，例如 200 至 300 毫秒。
- 组件卸载前确保最后一次内容已经写入。
- 空备注保存为空字符串。
- 图片上传接口未接入前，`onImageUpload` 只执行：

```ts
console.log('[CourseNoteEditor] image upload placeholder', files)
```

并返回空数组，不插入虚假的图片 URL。

## 8. 组件设计

### 8.1 字段卡片组件

将现有：

```text
app/features/course-management/components/CourseDetailItem.tsx
```

改造成可编辑的通用字段组件，或保留原组件作为静态显示组件并新增：

```text
app/features/course-management/components/CourseFieldItem.tsx
```

建议新增独立组件，避免把普通文本字段和 Markdown 字段的逻辑全部堆在现有组件中。

组件职责：

- 展示字段标签和值。
- 点击字段后切换到编辑状态。
- 编辑标签输入框。
- 编辑普通内容输入框。
- 在字段卡片最右侧显示删除按钮。
- 只有 `canDelete === true` 时显示删除按钮。
- 阻止删除按钮点击冒泡到卡片编辑逻辑。

静态状态：

```text
┌─────────────────────────────────────────┐
│ 标签    字段内容                    [删除] │
└─────────────────────────────────────────┘
```

编辑状态：

```text
┌─────────────────────────────────────────┐
│ [标签输入框] [内容输入框]           [删除] │
└─────────────────────────────────────────┘
```

要求：

- 保持当前 `rounded-md bg-muted` 字段卡片视觉风格。
- 标签区域固定最小宽度，内容区域可伸缩。
- 长文本使用省略显示，编辑时允许完整输入。
- 移动端改为可换行布局，避免输入框和删除按钮重叠。
- 删除按钮使用 `Trash2` 图标，提供 `aria-label` 和 `title`。
- 不为固定字段显示删除按钮。

### 8.2 新增字段卡片

新增：

```text
app/features/course-management/components/AddCourseFieldItem.tsx
```

样式与字段卡片一致，但内部只显示加号图标：

```text
┌─────────────────────────────────────────┐
│                    [ + ]                │
└─────────────────────────────────────────┘
```

行为：

1. 点击新增卡片。
2. 调用 `addCourseField(courseKey)`。
3. 使用返回的字段 ID 自动让新字段进入编辑状态。
4. 默认聚焦标签输入框。
5. 用户可以立即修改标签和内容。

按钮使用 `Plus` 图标，并提供：

```text
aria-label="新增课程字段"
title="新增课程字段"
```

### 8.3 Markdown 备注组件

新增：

```text
app/features/course-management/components/CourseMarkdownField.tsx
```

职责：

- 显示固定备注字段的标签区域。
- 挂载 Milkdown 编辑器。
- 接收当前 Markdown 字符串。
- 输出 Markdown 字符串。
- 接入图片上传占位回调。
- 处理编辑器最小高度、边框、焦点和滚动。

组件结构：

```text
<CourseFieldShell>
  <FieldLabelEditor />
  <MarkdownEditor />
</CourseFieldShell>
```

备注字段的删除按钮永远不显示，因为备注是固定字段。

## 9. Milkdown 接入方案

参考页面：

- [Milkdown Playground](https://milkdown.dev/playground)

实现时优先使用 Milkdown 官方 React 集成和 Commonmark preset。具体包名和 API 以安装时的当前版本文档为准，并将 Milkdown 相关代码限制在 `CourseMarkdownField` 与 `useCourseNoteEditor` 内。

建议依赖方向：

- `@milkdown/react`
- `@milkdown/kit` 或官方当前推荐的 Commonmark preset 包
- 官方 listener 插件
- 官方 upload 插件（如果当前版本提供并适合该场景）

编辑器要求：

1. 使用 Markdown 字符串作为初始值。
2. 监听编辑器变更并获取 Markdown 原文。
3. 支持常用 Markdown：标题、粗体、斜体、列表、链接、代码块和引用。
4. 备注内容存储原始 Markdown，不保存 HTML。
5. 初始化和外部值变化时避免重复销毁和重建编辑器。
6. 图片上传使用适配器隔离：

```ts
export type CourseImageUploader = (files: File[]) => Promise<string[]>
```

当前默认实现只打印文件信息：

```ts
export const placeholderCourseImageUploader: CourseImageUploader = async (files) => {
  console.log('[CourseNoteEditor] image upload placeholder', files)
  return []
}
```

未来接入后只替换该适配器，不修改课程字段、store 和页面组件。

## 10. 课程详情页面改造

### 10.1 `CourseCardContent`

当前内容：

```tsx
<CourseDetailItem label="上课教师" value={course.teacher} />
<CourseDetailItem label="课程号" value={course.courseId} />
```

改为：

```tsx
<CourseFieldList course={course} />
```

新增：

```text
app/features/course-management/components/CourseFieldList.tsx
```

职责：

- 遍历 `course.fields`。
- 根据 `contentType` 渲染普通字段或 Markdown 备注。
- 在末尾渲染新增字段卡片。
- 维护当前正在编辑的字段 ID。
- 将字段 action 和课程 key 传给子组件。

### 10.2 字段排列

普通字段和 Markdown 字段都在同一详情区域中：

- 普通字段使用响应式两列布局。
- Markdown 备注默认占满一整行，便于编辑较长内容。
- 新增字段卡片作为最后一个网格项。
- 移动端全部变为单列。

建议布局：

```tsx
<div className="grid gap-3 sm:grid-cols-2">
  {textFields}
  <div className="sm:col-span-2">{noteField}</div>
  <AddCourseFieldItem />
</div>
```

## 11. 持久化与导入导出

### 11.1 localStorage

`app/store/index.ts` 的 `partialize` 需要增加：

```ts
courseMetadata: state.courseMetadata
```

`useDataExportImport` 导出的 `AppData` 需要包含：

```ts
courseMetadata: state.courseMetadata
```

导入时恢复：

```ts
courseMetadata: data.courseMetadata
```

### 11.2 备份兼容

旧备份没有 `courseMetadata` 时，迁移逻辑返回空对象：

```ts
courseMetadata: {}
```

导入旧备份后，课程页面依靠固定字段派生逻辑正常显示，不要求用户重新导入课程。

### 11.3 数据完整性

- 字段删除只删除当前课程的当前字段。
- 不删除原始课程排课数据。
- 不影响考勤标记。
- 不影响课程表和数据看板统计。
- 不影响学期切换。
- 不影响全量备份恢复。

## 12. 边界情况

需要明确处理：

1. 没有课程时不渲染字段编辑区域。
2. 课程没有教师或课程号时使用“未记录教师”“未记录课程号”。
3. 用户新增字段后未填写标签，保存时保留默认标签“新字段”，避免出现没有可识别标签的字段。
4. 用户新增字段后未填写内容，允许保存为空。
5. 用户删除字段时不需要二次确认，因为字段删除范围小且可以通过全量备份恢复；如果实现中发现误操作风险较高，可再增加轻量确认。
6. 固定字段删除操作不可用，不仅依赖 UI 隐藏按钮，store action 也必须再次校验 `canDelete`。
7. Markdown 内容为空时仍显示备注编辑区域。
8. Markdown 编辑器初始化失败时显示可编辑的普通文本降级输入框，并记录错误日志。
9. 图片上传返回空数组时不能插入无效图片节点。
10. 快速连续编辑多个字段时，不能用旧的草稿覆盖新内容。
11. 删除当前学期或切换学期后，课程字段必须跟随当前学期刷新。
12. 重新导入同一学期课程后，已有自定义字段和备注不能丢失。
13. 课程稳定 key 变化时，需要保留旧 metadata，不做自动清理。

## 13. 文件改造清单

### 13.1 类型和数据层

- `app/lib/types.ts`
  - 新增 `CourseFieldContentType`。
  - 新增 `CourseField`。
  - 新增 `CourseMetadata` 和 `CourseMetadataMap`。
  - 扩展 `AppData`、`Semester`。
- `app/store/migrations.ts`
  - Schema 版本升级到 3。
  - 标准化 `courseMetadata`。
  - 兼容旧版数据和旧版备份。
- `app/store/slices/dataSlice.ts`
  - 增加课程字段相关 action。
  - 增加当前学期 metadata 同步逻辑。
- `app/store/index.ts`
  - 将 `courseMetadata` 加入持久化字段。
- `app/features/data-management/hooks/useDataExportImport.ts`
  - 备份导出和导入增加 `courseMetadata`。

### 13.2 课程管理逻辑

- `app/features/course-management/hooks/useCourseManagement.ts`
  - 生成稳定课程 key。
  - 组合固定字段、用户字段和备注字段。
- `app/features/course-management/hooks/useCourseFieldEditor.ts`
  - 普通字段编辑 hook。
- `app/features/course-management/hooks/useCourseNoteEditor.ts`
  - Markdown 备注和图片上传适配 hook。

### 13.3 课程管理组件

- `app/features/course-management/components/CourseCardContent.tsx`
  - 改为渲染动态字段列表。
- `app/features/course-management/components/CourseDetailItem.tsx`
  - 改造为可编辑字段，或迁移为新字段组件内部实现。
- `app/features/course-management/components/CourseFieldList.tsx`
  - 字段列表和新增字段入口。
- `app/features/course-management/components/CourseFieldItem.tsx`
  - 普通字段卡片。
- `app/features/course-management/components/CourseMarkdownField.tsx`
  - Markdown 备注字段。
- `app/features/course-management/components/AddCourseFieldItem.tsx`
  - 新增字段卡片。

## 14. 实施顺序

### 阶段一：数据模型

1. 扩展字段和课程 metadata 类型。
2. 升级 schema 版本。
3. 完成旧数据标准化。
4. 完成当前学期 metadata 快照同步。

### 阶段二：Store action

1. 实现默认固定字段生成。
2. 实现新增字段。
3. 实现字段编辑。
4. 实现字段删除保护。
5. 实现学期切换、创建和删除时的 metadata 同步。

### 阶段三：普通字段 UI

1. 封装普通字段卡片。
2. 加入标签和内容编辑状态。
3. 加入删除按钮。
4. 加入新增字段卡片。
5. 加入响应式布局和焦点处理。

### 阶段四：Markdown 备注

1. 安装并配置 Milkdown 依赖。
2. 封装 React 编辑器组件。
3. 封装 Markdown 变更 hook。
4. 接入备注字段。
5. 接入图片上传占位日志。
6. 增加编辑器失败降级处理。

### 阶段五：导入导出和验证

1. 更新数据导出。
2. 更新数据导入。
3. 验证旧版 localStorage 数据迁移。
4. 验证多学期隔离。
5. 验证重新导入课程后的字段保留。
6. 运行类型检查、Lint、格式检查和生产构建。

## 15. 验收标准

### 固定字段

- 每门课程展开后默认显示“上课教师”“课程号”“备注”。
- 三个固定字段都带有 `canDelete: false`。
- 页面上不显示固定字段删除按钮。
- 标签和内容点击后可以编辑。
- 固定字段编辑不会破坏课表和统计数据。

### 自定义字段

- 点击新增卡片可以增加字段。
- 新字段默认可删除。
- 新字段包含标签输入和内容输入。
- 新字段保存后刷新页面仍然存在。
- 点击删除图标后字段消失。
- 删除一个自定义字段不会影响其他字段。

### Markdown 备注

- 备注字段使用 Milkdown 编辑器。
- Markdown 原文可以保存、刷新和恢复。
- 常用 Markdown 语法可以正常编辑。
- 图片操作当前只打印上传日志，不请求后端接口。
- 未来替换上传 adapter 后不需要修改字段数据模型。

### 多学期

- 学期 A 的自定义字段不会出现在学期 B。
- 切换回学期 A 后字段和备注恢复。
- 删除或重建课程数据不会误删现有 metadata。

### 兼容和质量

- 旧版数据可以正常打开。
- 旧版备份可以正常导入。
- 新版备份包含课程自定义字段和 Markdown 备注。
- `pnpm typecheck` 通过。
- `pnpm lint` 通过。
- `pnpm format:check` 通过。
- `pnpm build` 通过。
- 在桌面端和窄屏视口下字段、输入框和删除按钮不重叠。

## 16. 后续图片上传接口接入点

真实接口到位后，只需要替换：

```ts
app/features/course-management/hooks/useCourseNoteEditor.ts
```

中的图片上传 adapter：

```ts
type CourseImageUploader = (files: File[]) => Promise<string[]>
```

接口接入需要补充：

1. 文件类型和大小校验。
2. 上传进度状态。
3. 上传失败提示。
4. 服务端图片 URL 转换。
5. Markdown 图片节点插入。
6. 图片删除或资源回收策略。

课程字段数据结构、普通字段组件和页面调用方式保持不变。
