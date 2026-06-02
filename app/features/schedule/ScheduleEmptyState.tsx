import { GraduationCap, Loader2, School, Upload } from 'lucide-react'
import ImportDialog from '~/components/dialog/ImportDialog'
import { Button } from '~/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty'
import { useClassStore } from '~/store'
import type { School as SchoolType } from '~/lib/types'

type ScheduleEmptyStateProps = {
  school: SchoolType | null
  hasClasses: boolean
}

export default function ScheduleEmptyState({ school, hasClasses }: ScheduleEmptyStateProps) {
  const { setShowImportDialog } = useClassStore()

  const state = !school ? 'school' : !hasClasses ? 'classes' : 'loading'

  const emptyState = {
    school: {
      icon: <School className="size-5" />,
      title: '先选择你的学校',
      description: '选择学校后，系统会自动匹配对应的课程表解析器，帮助你更快完成课程导入。',
      action: '选择学校',
      onAction: () => setShowImportDialog(true),
    },
    classes: {
      icon: <Upload className="size-5" />,
      title: '还没有课程数据',
      description: `${school?.name || '当前学校'} 已选择，请导入课程表 JSON 文件，开始管理你的上课记录。`,
      action: '导入课程表',
      onAction: () => setShowImportDialog(true),
    },
    loading: {
      icon: <Loader2 className="size-5 animate-spin" />,
      title: '正在加载课程表',
      description: '正在读取本地课程数据，请稍候。',
      action: null,
      onAction: null,
    },
  }[state]

  return (
    <div className="flex h-full items-center justify-center bg-background px-6 py-8">
      <Empty className="max-w-xl border border-border bg-card px-8 py-10 shadow-xs">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="size-12 rounded-md bg-primary/10 text-primary [&_svg:not([class*='size-'])]:size-5">
            {emptyState.icon}
          </EmptyMedia>
          <EmptyTitle className="text-lg font-semibold text-foreground">{emptyState.title}</EmptyTitle>
          <EmptyDescription className="max-w-md text-sm text-muted-foreground">{emptyState.description}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {emptyState.action && emptyState.onAction && (
            <Button onClick={emptyState.onAction}>
              <GraduationCap className="size-4" />
              {emptyState.action}
            </Button>
          )}
        </EmptyContent>
      </Empty>
      <ImportDialog />
    </div>
  )
}
